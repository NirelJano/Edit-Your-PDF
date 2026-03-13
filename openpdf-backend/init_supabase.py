import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or "placeholder" in url:
    print("Error: Valid SUPABASE_URL not found in .env")
    exit(1)

supabase: Client = create_client(url, key)

def init_storage():
    print("Initializing storage...")
    try:
        # Check if bucket exists
        buckets = supabase.storage.list_buckets()
        exists = any(b.name == 'pdf-storage' for b in buckets)
        
        if not exists:
            print("Creating 'pdf-storage' bucket...")
            supabase.storage.create_bucket('pdf-storage', options={'public': True})
            print("Bucket created.")
        else:
            print("Bucket 'pdf-storage' already exists.")
    except Exception as e:
        print(f"Error initializing storage: {e}")

def init_db():
    print("Initializing database tables...")
    # SQL to create the table
    # We can't run raw SQL via the client easily without a stored procedure,
    # but we can try to insert a dummy row or just explain to the user.
    # Actually, Supabase Python client doesn't support 'rpc' for raw SQL unless it's a function.
    
    print("\nIMPORTANT: Please run the following SQL in your Supabase SQL Editor:")
    print("""
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    color_id TEXT,
    status TEXT DEFAULT 'pending',
    is_ocr_done BOOLEAN DEFAULT false,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS for files
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Files policies
CREATE POLICY "Users can view their own files" ON public.files
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own files" ON public.files
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own files" ON public.files
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own files" ON public.files
    FOR DELETE USING (auth.uid() = user_id);

-- Downloads table
CREATE TABLE IF NOT EXISTS public.downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT, -- size in bytes
    page_count INTEGER, -- number of pages
    preview_path TEXT -- path to PDF version for previewing non-PDF formats
);

-- Enable RLS for downloads
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;

-- Downloads policies
CREATE POLICY "Users can view their own downloads" ON public.downloads
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own downloads" ON public.downloads
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    """)

if __name__ == "__main__":
    init_storage()
    init_db()
