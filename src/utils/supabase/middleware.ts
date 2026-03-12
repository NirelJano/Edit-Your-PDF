import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith('http')) {
        console.warn('WARNING: Supabase URL or Key is missing or invalid. Skipping auth middleware.')
        return supabaseResponse
    }

    let supabase;
    try {
        supabase = createServerClient(
            supabaseUrl,
            supabaseKey,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                        supabaseResponse = NextResponse.next({
                            request,
                        })
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, options)
                        )
                    },
                },
            }
        )
    } catch (e) {
        console.error('Failed to initialize Supabase client:', e)
        return supabaseResponse
    }

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protect the dashboard (/) if not logged in
    if (!user && request.nextUrl.pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Redirect to dashboard if logged in and trying to access login/signup
    if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
