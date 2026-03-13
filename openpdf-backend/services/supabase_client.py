import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

supabase: Client | None = None
if url and url != "your_supabase_url":
    supabase = create_client(url, key)
else:
    print("WARNING: Supabase URL is placeholder or missing. 'supabase' client not initialized.")
