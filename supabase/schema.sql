-- 1. Create the 'files' table
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    color_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Storage Bucket Instructions
-- In the Supabase dashboard:
-- 1. Go to "Storage"
-- 2. Create a new bucket named 'pdf-storage'
-- 3. Set it to 'Public' (or configure RLS policies for authenticated access)
