'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError(error.message);
            } else {
                router.refresh();
                router.push('/');
            }
        } catch (err) {
            setError('An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#121212] flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md bg-[#1a1a1a] rounded-2xl border border-[#333] p-8 shadow-xl">
                <div className="flex flex-col items-center mb-8">
                    <div className="p-3 bg-zinc-800 rounded-xl mb-4">
                        <FileText className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-semibold text-white">Welcome Back</h1>
                    <p className="text-zinc-400 mt-2">Sign in to Open PDF Studio</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-500 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[#121212] border border-[#333] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#121212] border border-[#333] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            placeholder="••••••••"
                            required
                        />
                        <div className="flex justify-end mt-1">
                            <Link
                                href="/forgot-password"
                                className="text-sm text-zinc-400 hover:text-white transition-colors"
                            >
                                Forgot password?
                            </Link>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-white text-black hover:bg-zinc-200 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center mt-6"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                    </button>
                </form>

                <p className="text-center text-zinc-400 text-sm mt-8">
                    Don't have an account?{' '}
                    <Link href="/signup" className="text-white hover:underline transition-all">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}
