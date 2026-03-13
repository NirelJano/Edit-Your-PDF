import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key || !url.startsWith('http')) {
        return {} as any // Return dummy object to avoid crash, though this may cause errors downstream if used
    }

    return createBrowserClient(url, key)
}
