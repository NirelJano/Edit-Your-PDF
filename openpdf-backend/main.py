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
    # Performance Optimization: Limit OpenMP threads for Tesseract/PyMuPDF
    import os
    os.environ["OMP_THREAD_LIMIT"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    
    # Startup: Start the cleanup task
    print(f"--- [Backend] Starting {app.title} v{app.version} ---")
    print(f"[Backend] Worker processes will be limited to prevent OOM/CPU starvation")
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
    "https://edit-your-pdf-nireljanos-projects.vercel.app",
    "https://edit-your-pdf-git-main-nireljanos-projects.vercel.app",
    "https://edit-your-g18z6a2n6-nireljanos-projects.vercel.app"
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

async def background_upload_tasks(file_id: str, file_path: str, filename: str, user_id: str):
    """Heavy tasks to run after upload returns."""
    try:
        # 1. Pre-generate all thumbnails
        output_dir = os.path.join(PROCESSED_DIR, file_id)
        os.makedirs(output_dir, exist_ok=True)
        print(f"[Backend] Pre-generating thumbnails for {file_id}...")
        await run_in_threadpool(split_pdf_to_images, file_path, output_dir)
        
        # 2. Upload to Supabase Storage
        from services.supabase_service import supabase as sb_client
        storage_path = f"{file_id}.pdf"
        print(f"[Backend] Uploading {file_id}.pdf to Supabase Storage...")
        with open(file_path, "rb") as f:
            sb_client.storage.from_("pdf-storage").upload(storage_path, f)
        
        # 3. Ensure record in DB and set status to active
        public_url = sb_client.storage.from_("pdf-storage").get_public_url(storage_path)
        
        # Check if record exists
        res = sb_client.table("files").select("id").eq("id", file_id).execute()
        if not res.data:
            from lib.colors import get_next_color # If color utility existed in backend, but it's frontend
            sb_client.table("files").insert({
                "id": file_id,
                "name": filename,
                "storage_url": public_url,
                "status": "ready",
                "user_id": user_id,
                "color_id": "#3b82f6" # Default
            }).execute()
        else:
            sb_client.table("files").update({"status": "ready"}).eq("id", file_id).execute()
        
        print(f"[Backend] Background processing complete for {file_id}")
    except Exception as e:
        print(f"[Backend] ERROR in background upload tasks for {file_id}: {e}")

@app.post("/api/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
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
    
    # Async file save
    def save_file():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return fitz.open(file_path)

    doc = await run_in_threadpool(save_file)
    page_count = len(doc)
    doc.close()

    # Trigger heavy tasks in background
    background_tasks.add_task(background_upload_tasks, file_id, file_path, file.filename, user.id)
    
    upload_end_time = time.time()
    print(f"[Backend] /api/upload returned page_count={page_count} in {upload_end_time - upload_start_time:.2f}s")
    
    return JSONResponse({
        "fileId": file_id,
        "name": file.filename,
        "pageCount": page_count
    })

# In-memory byte cache for thumbnails (RAM cache)
# Key: (file_id, page_num), Value: (bytes, media_type, timestamp)
THUMBNAIL_RAM_CACHE = {}
MAX_RAM_CACHE_SIZE = 200 # Pages

def _clear_expired_ram_cache():
    if len(THUMBNAIL_RAM_CACHE) > MAX_RAM_CACHE_SIZE:
        sorted_cache = sorted(THUMBNAIL_RAM_CACHE.items(), key=lambda x: x[1][2])
        for i in range(min(50, len(sorted_cache))):
            del THUMBNAIL_RAM_CACHE[sorted_cache[i][0]]

@app.get("/api/page-image/{file_id}/{page_num}")
async def get_page_image_endpoint(file_id: str, page_num: int):
    cache_key = (file_id, page_num)
    
    # 1. Check RAM Cache (Fastest)
    if cache_key in THUMBNAIL_RAM_CACHE:
        img_bytes, media_type, _ = THUMBNAIL_RAM_CACHE[cache_key]
        THUMBNAIL_RAM_CACHE[cache_key] = (img_bytes, media_type, time.time())
        from fastapi import Response
        return Response(content=img_bytes, media_type=media_type, headers={
            "Cache-Control": "public, max-age=3600"
        })

    pdf_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    output_dir = os.path.join(PROCESSED_DIR, file_id)
    img_path = os.path.join(output_dir, f"page_{page_num}.png")

    def get_or_generate():
        if not os.path.exists(img_path):
            if not os.path.exists(pdf_path): return None
            return get_page_image(pdf_path, page_num, output_dir)
        return img_path

    path = await run_in_threadpool(get_or_generate)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image not found")

    # 2. Read into RAM Cache
    with open(path, "rb") as f:
        img_bytes = f.read()
    
    _clear_expired_ram_cache()
    THUMBNAIL_RAM_CACHE[cache_key] = (img_bytes, "image/png", time.time())
    
    from fastapi import Response
    return Response(content=img_bytes, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600"
    })

# In-memory save jobs dictionary
SAVE_JOBS = {}

async def process_save_job(job_id: str, req: SaveRequest, user_id: str):
    import traceback
    import time
    save_start_time = time.time()
    print(f"[Backend] Starting background save job {job_id} for {req.filename} (format: {req.format}, pages: {len(req.pages)})")
    
    try:
        if not req.pages:
            raise ValueError("No pages provided for the final document")
            
        output_name = req.filename if req.filename else "OpenPDF_Document"
        tmp_pdf_path = os.path.join(PROCESSED_DIR, f"{uuid.uuid4()}_temp.pdf")
        
        # Build the combined PDF optionally applying OCR - Offload to threadpool
        print(f"[Backend] Building final PDF for job {job_id}...")
        build_start = time.time()
        await run_in_threadpool(
            build_final_pdf, 
            [p.model_dump() for p in req.pages], 
            tmp_pdf_path, 
            UPLOAD_DIR, 
            PROCESSED_DIR
        )
        print(f"[Backend] PDF building finished in {time.time() - build_start:.2f}s")
        
        if req.format.lower() == "docx":
            output_docx = os.path.join(PROCESSED_DIR, f"{output_name}_{job_id}.docx")
            
            # Check page count before conversion for debugging
            try:
                temp_doc = fitz.open(tmp_pdf_path)
                actual_pages = len(temp_doc)
                temp_doc.close()
            except Exception as e:
                actual_pages = 0
            
            print(f"[Backend] Starting DOCX conversion for {actual_pages} pages...")
            conv_start = time.time()
            await run_in_threadpool(convert_to_docx, tmp_pdf_path, output_docx)
            print(f"[Backend] DOCX conversion finished in {time.time() - conv_start:.2f}s")
            
            try:
                # Store the original PDF as a preview version for the History page
                preview_id = str(uuid.uuid4())
                preview_storage_path = f"previews/{user_id}/{preview_id}.pdf"
                
                # Upload the preview PDF - Offload
                print(f"[Backend] Uploading preview and DOCX to Supabase...")
                def upload_assets():
                    with open(tmp_pdf_path, "rb") as f:
                        supabase.storage.from_("pdf-storage").upload(preview_storage_path, f)
                    
                    # Record in downloads table
                    unique_id = str(uuid.uuid4())
                    storage_path = f"downloads/{user_id}/{unique_id}.docx"
                    file_size = os.path.exists(output_docx) and os.path.getsize(output_docx) or 0
                    
                    # Upload the DOCX
                    if os.path.exists(output_docx):
                        with open(output_docx, "rb") as f:
                            supabase.storage.from_("pdf-storage").upload(storage_path, f)
                    return storage_path, file_size
                
                storage_path, file_size = await run_in_threadpool(upload_assets)
                
                print(f"[Backend] Recording DOCX in database...")
                def record_db():
                    data = {
                        "user_id": user_id,
                        "name": output_name,
                        "format": "docx",
                        "storage_path": storage_path,
                        "file_size": file_size,
                        "page_count": actual_pages,
                        "preview_path": preview_storage_path
                    }
                    return supabase.table("downloads").insert(data).execute()
                
                await run_in_threadpool(record_db)
            except Exception as e:
                print(f"Failed to log DOCX download or preview: {e}")
                traceback.print_exc()

            print(f"[Backend] Save job {job_id} (DOCX) total time: {time.time() - save_start_time:.2f}s")
            SAVE_JOBS[job_id] = {
                "status": "completed",
                "file_path": output_docx,
                "filename": f"{output_name}.docx",
                "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            }
        else:
            output_pdf = os.path.join(PROCESSED_DIR, f"{output_name}_{job_id}.pdf")
            shutil.move(tmp_pdf_path, output_pdf)
            
            print(f"[Backend] Uploading PDF to Supabase...")
            try:
                await run_in_threadpool(upload_and_log_download, user_id, output_pdf, output_name, "pdf")
            except Exception as e:
                print(f"Failed to log download: {e}")

            print(f"[Backend] Save job {job_id} (PDF) total time: {time.time() - save_start_time:.2f}s")
            SAVE_JOBS[job_id] = {
                "status": "completed",
                "file_path": output_pdf,
                "filename": f"{output_name}.pdf",
                "media_type": "application/pdf"
            }
    except Exception as e:
        print(f"[Backend] ERROR in background save job {job_id}: {str(e)}")
        SAVE_JOBS[job_id] = {
            "status": "failed",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

@app.post("/api/save")
async def save_document(req: SaveRequest, background_tasks: BackgroundTasks, user = Depends(get_current_user)):
    job_id = str(uuid.uuid4())
    SAVE_JOBS[job_id] = {"status": "processing"}
    background_tasks.add_task(process_save_job, job_id, req, user.id)
    return JSONResponse({"jobId": job_id})

@app.get("/api/save/status/{job_id}")
async def get_save_status(job_id: str):
    job = SAVE_JOBS.get(job_id)
    if not job:
        return JSONResponse({"status": "failed", "error": "Job not found or expired"}, status_code=404)
    
    if job["status"] == "completed":
        return JSONResponse({"status": "completed"})
    elif job["status"] == "failed":
        return JSONResponse({"status": "failed", "error": job.get("error")}, status_code=500)
    else:
        return JSONResponse({"status": "processing"})

@app.get("/api/save/download/{job_id}")
async def download_save_job(job_id: str):
    job = SAVE_JOBS.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=404, detail="Job not ready or not found")
        
    return FileResponse(
        job["file_path"], 
        filename=job["filename"], 
        media_type=job["media_type"]
    )


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

class BulkDeleteRequest(BaseModel):
    ids: List[str]

@app.post("/api/downloads/bulk-delete")
async def bulk_delete_downloads(req: BulkDeleteRequest, user = Depends(get_current_user)):
    try:
        # Fetch records to verify ownership and get storage paths
        res = supabase.table("downloads").select("id, user_id, storage_path, preview_path").in_("id", req.ids).execute()
        valid_ids = []
        paths_to_delete = []
        
        for record in res.data:
            if record.get("user_id") == user.id:
                valid_ids.append(record["id"])
                if record.get("storage_path"):
                    paths_to_delete.append(record["storage_path"])
                if record.get("preview_path"):
                    paths_to_delete.append(record["preview_path"])
        
        if not valid_ids:
            return {"deleted_count": 0, "message": "No valid records found for deletion"}
            
        # 1. Delete from storage
        from services.supabase_service import supabase as sb_client
        if paths_to_delete:
            try:
                sb_client.storage.from_("pdf-storage").remove(paths_to_delete)
            except Exception as e:
                print(f"[Backend] Storage cleanup failed during bulk delete: {e}")
                
        # 2. Delete from DB
        supabase.table("downloads").delete().in_("id", valid_ids).execute()
        
        # 3. Clear RAM cache
        ids_set = set(valid_ids)
        keys_to_remove = [k for k in THUMBNAIL_RAM_CACHE.keys() if any(vid in k[0] for vid in ids_set)]
        for k in keys_to_remove:
            del THUMBNAIL_RAM_CACHE[k]
            
        print(f"[Backend] Bulk deleted {len(valid_ids)} history items for user {user.id}")
        return {"deleted_count": len(valid_ids)}
    except Exception as e:
        print(f"[Backend] ERROR in bulk delete: {e}")
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
    cache_key = (f"download_{download_id}", page_num)
    
    # 1. Check RAM Cache (Fastest)
    if cache_key in THUMBNAIL_RAM_CACHE:
        img_bytes, media_type, _ = THUMBNAIL_RAM_CACHE[cache_key]
        THUMBNAIL_RAM_CACHE[cache_key] = (img_bytes, media_type, time.time())
        from fastapi import Response
        return Response(content=img_bytes, media_type=media_type, headers={
            "Cache-Control": "public, max-age=3600"
        })

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
        
        def provide_image():
            if not os.path.exists(img_path):
                from services.pdf_service import get_page_image
                return get_page_image(local_path, page_num, output_dir)
            return img_path
            
        path = await run_in_threadpool(provide_image)
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Image not found")

        # 2. Read into RAM Cache
        with open(path, "rb") as f:
            img_bytes = f.read()
        
        _clear_expired_ram_cache()
        THUMBNAIL_RAM_CACHE[cache_key] = (img_bytes, "image/png", time.time())
        
        from fastapi import Response
        return Response(content=img_bytes, media_type="image/png", headers={
            "Cache-Control": "public, max-age=3600"
        })
    except Exception as e:
        print(f"Error serving history page: {e}")
        raise HTTPException(status_code=500, detail=str(e))
