from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from pydantic import BaseModel
import os
import shutil
import uuid
import tempfile
import fitz

from services.pdf_service import split_pdf_to_images, get_page_image, build_final_pdf, convert_to_docx
from services.ocr_pipeline import run_high_quality_ocr
from services.supabase_service import (
    download_file, upload_file, update_ocr_status,
    upload_and_log_download, get_user_downloads, get_signed_download_url
)
from services.supabase_client import supabase, load_dotenv
from services.auth_service import get_current_user

load_dotenv()

import time
import asyncio
from contextlib import asynccontextmanager

def cleanup_old_files():
    """Deletes files older than 24 hours in UPLOAD_DIR and PROCESSED_DIR."""
    now = time.time()
    cutoff = now - (24 * 3600)
    
    for folder in [UPLOAD_DIR, PROCESSED_DIR]:
        if not os.path.exists(folder):
            continue
        for filename in os.listdir(folder):
            # Skip hidden files
            if filename.startswith('.'):
                continue
            file_path = os.path.join(folder, filename)
            try:
                if os.path.getmtime(file_path) < cutoff:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                    print(f"Cleaned up old file/dir: {file_path}")
            except Exception as e:
                print(f"Error cleaning up {file_path}: {e}")

async def cleanup_loop():
    while True:
        cleanup_old_files()
        await asyncio.sleep(3600) # Run every hour

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the cleanup task
    print(f"--- [Backend] Starting {app.title} v{app.version} ---")
    task = asyncio.create_task(cleanup_loop())
    yield
    # Shutdown: Clean up task if needed
    task.cancel()

app = FastAPI(title="OpenPDF Studio Backend", version="1.0.0", lifespan=lifespan)

# Configure CORS
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://edit-your-pdf.vercel.app",
    "https://edit-your-pdf-nireljanos-projects.vercel.app"
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url and frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return "API is running"

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "healthy"}

UPLOAD_DIR = "uploads"
PROCESSED_DIR = "processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

class PageSpec(BaseModel):
    fileId: Optional[str] = None
    originalPageNum: Optional[int] = None
    applyOcr: Optional[bool] = False
    rotation: Optional[int] = 0
    is_blank: Optional[bool] = False

class SaveRequest(BaseModel):
    filename: str
    format: str
    pages: List[PageSpec]

from starlette.concurrency import run_in_threadpool

# In-memory cache for page images to speed up thumbnails
# Key: (file_id, page_num), Value: (img_path, timestamp)
THUMBNAIL_CACHE = {}
MAX_CACHE_SIZE = 500

def _clear_expired_cache():
    if len(THUMBNAIL_CACHE) > MAX_CACHE_SIZE:
        # Simple LRU-like clearing: remove oldest 100 items
        sorted_cache = sorted(THUMBNAIL_CACHE.items(), key=lambda x: x[1][1])
        for i in range(min(100, len(sorted_cache))):
            del THUMBNAIL_CACHE[sorted_cache[i][0]]

@app.post("/api/upload")
async def upload_pdf(
    file: UploadFile = File(...), 
    fileId: Optional[str] = Form(None),
    user = Depends(get_current_user)
):
    upload_start_time = time.time()
    print(f"[Backend] Received upload request for {file.filename}")
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
    file_id = fileId if fileId else str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    
    # Async file write
    def save_file():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return fitz.open(file_path)

    doc = await run_in_threadpool(save_file)
    page_count = len(doc)
    doc.close()

    if fileId:
        def update_supabase():
            file_data = supabase.table("files").select("user_id").eq("id", file_id).execute()
            if not file_data.data or file_data.data[0].get("user_id") != user.id:
                raise HTTPException(status_code=403, detail="Not authorized to modify this file")
            supabase.table("files").update({"status": "processing"}).eq("id", file_id).execute()
        
        await run_in_threadpool(update_supabase)
    
    upload_end_time = time.time()
    print(f"[Backend] /api/upload finished in {upload_end_time - upload_start_time:.2f}s for {file.filename} ({page_count} pages)")
    
    return JSONResponse({
        "fileId": file_id,
        "name": file.filename,
        "pageCount": page_count
    })

@app.get("/api/page-image/{file_id}/{page_num}")
async def get_page_image_endpoint(file_id: str, page_num: int):
    # Check cache first
    cache_key = (file_id, page_num)
    if cache_key in THUMBNAIL_CACHE:
        path, _ = THUMBNAIL_CACHE[cache_key]
        if os.path.exists(path):
            THUMBNAIL_CACHE[cache_key] = (path, time.time()) # Update access time
            return FileResponse(path)

    pdf_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    output_dir = os.path.join(PROCESSED_DIR, file_id)
    os.makedirs(output_dir, exist_ok=True)
    
    img_path = os.path.join(output_dir, f"page_{page_num}.png")
    
    def generate_image():
        if not os.path.exists(img_path):
            return get_page_image(pdf_path, page_num, output_dir)
        return img_path

    path = await run_in_threadpool(generate_image)
    
    # Update cache
    _clear_expired_cache()
    THUMBNAIL_CACHE[cache_key] = (path, time.time())
    
    return FileResponse(path)

@app.post("/api/save")
async def save_document(req: SaveRequest, user = Depends(get_current_user)):
    import traceback
    try:
        if not req.pages:
            raise HTTPException(status_code=400, detail="No pages provided for the final document")
            
        output_name = req.filename if req.filename else "OpenPDF_Document"
        tmp_pdf_path = os.path.join(PROCESSED_DIR, f"{uuid.uuid4()}_temp.pdf")
        
        # Build the combined PDF optionally applying OCR
        build_final_pdf([p.model_dump() for p in req.pages], tmp_pdf_path, UPLOAD_DIR, PROCESSED_DIR)
        
        if req.format.lower() == "docx":
            output_docx = os.path.join(PROCESSED_DIR, f"{output_name}.docx")
            
            # Check page count before conversion for debugging
            try:
                temp_doc = fitz.open(tmp_pdf_path)
                actual_pages = len(temp_doc)
                print(f"DEBUG: Starting conversion to DOCX. Source PDF has {actual_pages} pages.")
                temp_doc.close()
            except Exception as e:
                print(f"DEBUG Error opening PDF for count: {e}")
                actual_pages = 0
            
            convert_to_docx(tmp_pdf_path, output_docx)
            
            try:
                # Store the original PDF as a preview version for the History page
                preview_id = str(uuid.uuid4())
                preview_storage_path = f"previews/{user.id}/{preview_id}.pdf"
                
                # Upload the preview PDF
                with open(tmp_pdf_path, "rb") as f:
                    supabase.storage.from_("pdf-storage").upload(preview_storage_path, f)
                
                # Record in downloads table
                unique_id = str(uuid.uuid4())
                storage_path = f"downloads/{user.id}/{unique_id}.docx"
                file_size = os.path.exists(output_docx) and os.path.getsize(output_docx) or 0
                
                # Upload the DOCX
                if os.path.exists(output_docx):
                    with open(output_docx, "rb") as f:
                        supabase.storage.from_("pdf-storage").upload(storage_path, f)
                
                data = {
                    "user_id": user.id,
                    "name": output_name,
                    "format": "docx",
                    "storage_path": storage_path,
                    "file_size": file_size,
                    "page_count": actual_pages,
                    "preview_path": preview_storage_path
                }
                supabase.table("downloads").insert(data).execute()
                print(f"Logged DOCX download with preview: {storage_path}")
            except Exception as e:
                print(f"Failed to log DOCX download or preview: {e}")
                traceback.print_exc()

            return FileResponse(
                output_docx, 
                filename=f"{output_name}.docx", 
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
        else:
            output_pdf = os.path.join(PROCESSED_DIR, f"{output_name}.pdf")
            shutil.move(tmp_pdf_path, output_pdf)
            
            # Log the download in background or wait? Let's do it here for now to ensure reliability.
            # We use background tasks if we want it to be faster. 
            # But the user is waiting for the file anyway.
            try:
                upload_and_log_download(user.id, output_pdf, output_name, "pdf")
            except Exception as e:
                print(f"Failed to log download: {e}")

            return FileResponse(
                output_pdf,
                filename=f"{output_name}.pdf",
                media_type="application/pdf"
            )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@app.post("/api/process-ocr")
async def process_ocr(
    file: UploadFile = File(...),
    engine: Optional[str] = Form("surya"),
    turbo: Optional[bool] = Form(True),
    user = Depends(get_current_user)
):
    """
    Accepts a PDF file and returns a high-quality OCR sandwich PDF.
    The visual content is completely unchanged; a searchable UTF-8
    text layer is added invisibly beneath the page content.

    engine: "surya" (best quality, default) or "ocrmypdf" (fast fallback)
    """
    ocr_start_time = time.time()
    print(f"[Backend] Received direct OCR request for {file.filename} with engine={engine}")
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Save the uploaded file to a temp location
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, f"{uuid.uuid4()}_input.pdf")
        output_path = os.path.join(PROCESSED_DIR, f"{uuid.uuid4()}_ocr.pdf")

        with open(input_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        try:
            run_high_quality_ocr(input_path, output_path, engine=engine or "surya", turbo=turbo)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    # Derive a clean output filename
    base_name = os.path.splitext(file.filename)[0]
    download_name = f"{base_name}_ocr.pdf"

    try:
        upload_and_log_download(user.id, output_path, f"{base_name}_ocr", "pdf")
    except Exception as e:
        print(f"Failed to log OCR download: {e}")

    ocr_end_time = time.time()
    print(f"[Backend] /api/process-ocr finished in {ocr_end_time - ocr_start_time:.2f}s for {file.filename}")
    
    return FileResponse(
        output_path,
        filename=download_name,
        media_type="application/pdf"
    )

async def run_ocr_background(file_id: str):
    """Background task to handle download, OCR, upload, and DB update."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, f"{file_id}_input.pdf")
        output_path = os.path.join(tmpdir, f"{file_id}_ocr.pdf")
        
        try:
            # 1. Download from Supabase
            download_file(file_id, input_path)
            
            # 2. Run OCR with pipeline (Surya first, ocrmypdf fallback)
            run_high_quality_ocr(input_path, output_path, turbo=True)
            
            # 3. Upload back to Supabase
            upload_file(file_id, output_path)
            
            # 4. Update Database
            update_ocr_status(file_id, True)
            
        except Exception as e:
            # Log error - in a real app would update DB status to failed
            print(f"OCR Background Task failed for {file_id}: {str(e)}")

@app.post("/api/ocr/{file_id}")
async def trigger_ocr(file_id: str, background_tasks: BackgroundTasks, user = Depends(get_current_user)):
    """Endpoint to trigger OCR for a file already in Supabase storage."""
    file_data = supabase.table("files").select("user_id").eq("id", file_id).execute()
    if not file_data.data or file_data.data[0].get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to perform OCR on this file")
        
    background_tasks.add_task(run_ocr_background, file_id)
    return {"status": "processing", "fileId": file_id}

@app.get("/api/downloads")
async def fetch_downloads(user = Depends(get_current_user)):
    try:
        res = get_user_downloads(user.id)
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/downloads/url/{download_id}")
async def get_download_url(download_id: str, user = Depends(get_current_user)):
    try:
        # Fetch the download record to get storage path and verify ownership
        res = supabase.table("downloads").select("*").eq("id", download_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Download record not found")
        
        record = res.data[0]
        if record.get("user_id") != user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        url = get_signed_download_url(record.get("storage_path"))
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/api/downloads/info/{download_id}")
async def get_download_info(download_id: str, user = Depends(get_current_user)):
    try:
        # Fetch record and check ownership
        res = supabase.table("downloads").select("*").eq("id", download_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Download record not found")
        
        record = res.data[0]
        if record.get("user_id") != user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        storage_path = record.get("preview_path") or record.get("storage_path")
        local_path = os.path.join(PROCESSED_DIR, storage_path.replace("/", "_"))
        
        if not os.path.exists(local_path):
            # Download from Supabase storage
            from services.supabase_service import supabase as sb_client
            res_storage = sb_client.storage.from_("pdf-storage").download(storage_path)
            with open(local_path, "wb") as f:
                f.write(res_storage)
        
        doc = fitz.open(local_path)
        page_count = len(doc)
        doc.close()
        
        return {"id": download_id, "pageCount": page_count, "name": record.get("name")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/downloads/page/{download_id}/{page_num}")
async def get_download_page_image(download_id: str, page_num: int, user = Depends(get_current_user)):
    """Note: page_num is 1-indexed."""
    try:
        # Fetch record and check ownership
        res = supabase.table("downloads").select("*").eq("id", download_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Download record not found")
        
        record = res.data[0]
        if record.get("user_id") != user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        storage_path = record.get("preview_path") or record.get("storage_path")
        local_path = os.path.join(PROCESSED_DIR, storage_path.replace("/", "_"))
        
        if not os.path.exists(local_path):
            # Download from Supabase storage
            from services.supabase_service import supabase as sb_client
            res_storage = sb_client.storage.from_("pdf-storage").download(storage_path)
            with open(local_path, "wb") as f:
                f.write(res_storage)
        
        output_dir = os.path.join(PROCESSED_DIR, "previews", download_id)
        os.makedirs(output_dir, exist_ok=True)
        img_path = os.path.join(output_dir, f"page_{page_num}.png")
        
        if not os.path.exists(img_path):
            from services.pdf_service import get_page_image
            get_page_image(local_path, page_num, output_dir)
            
        return FileResponse(img_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
