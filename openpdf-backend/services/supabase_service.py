import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "pdf-storage"

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_URL != "your_supabase_url":
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("WARNING: Supabase URL is placeholder or missing. 'supabase' service client not initialized.")

def download_file(file_id: str, destination_path: str):
    file_path = f"{file_id}.pdf"
    # Use a timeout if supported by the client, or just wrap in try/except
    try:
        res = supabase.storage.from_(BUCKET_NAME).download(file_path)
        with open(destination_path, "wb") as f:
            f.write(res)
    except Exception as e:
        print(f"[Supabase] Error downloading {file_id}: {e}")
        raise e
    return destination_path

def upload_file(file_id: str, file_path: str, custom_path: str = None):
    """Uploads a file to Supabase storage, overwriting if exists."""
    storage_path = custom_path if custom_path else f"{file_id}.pdf"
    with open(file_path, "rb") as f:
        supabase.storage.from_(BUCKET_NAME).upload(
            storage_path, 
            f, 
            file_options={"upsert": "true"}
        )
    return storage_path

def update_ocr_status(file_id: str, status: bool = True):
    """Updates the is_ocr_done flag in the files table."""
    supabase.table("files").update({"is_ocr_done": status}).eq("id", file_id).execute()

import fitz

def log_download(user_id: str, name: str, format: str, storage_path: str, file_size: int = 0, page_count: int = 0):
    """Logs a new download to the downloads table."""
    data = {
        "user_id": user_id,
        "name": name,
        "format": format,
        "storage_path": storage_path,
        "file_size": file_size,
        "page_count": page_count
    }
    return supabase.table("downloads").insert(data).execute()

def upload_and_log_download(user_id: str, file_path: str, filename: str, format: str):
    """Uploads a processed file and logs the download."""
    unique_id = str(uuid.uuid4())
    storage_path = f"downloads/{user_id}/{unique_id}.{format}"
    
    file_size = os.path.getsize(file_path)
    page_count = 0
    if format.lower() == "pdf":
        try:
            doc = fitz.open(file_path)
            page_count = len(doc)
            doc.close()
        except:
            pass
            
    upload_file(unique_id, file_path, custom_path=storage_path)
    log_download(user_id, filename, format, storage_path, file_size, page_count)
    return storage_path

def get_user_downloads(user_id: str):
    """Fetches download history for a specific user."""
    return supabase.table("downloads").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

def get_signed_download_url(storage_path: str):
    """Generates a signed URL for a file in storage."""
    # storage_path is something like 'downloads/user_id/uuid.pdf'
    # Actually, if we use the same bucket, we need to make sure the path is correct.
    res = supabase.storage.from_(BUCKET_NAME).create_signed_url(storage_path, expires_in=3600)
    return res.get("signedURL")
