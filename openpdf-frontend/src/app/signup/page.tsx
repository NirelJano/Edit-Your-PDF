'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Loader2, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${location.origin}/auth/callback`,
                },
            });

            if (error) {
                setError(error.message);
            } else {
                setSuccess(true);
                router.refresh();
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
                    <h1 className="text-2xl font-semibold text-white">Create Account</h1>
                    <p className="text-zinc-400 mt-2">Join Open PDF Studio</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-500 text-center">
                        {error}
                    </div>
                )}

                {success ? (
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <CheckCircle2 className="w-12 h-12 text-green-500" />
                        </div>
                        <h2 className="text-xl font-medium text-white mb-2">Check your email</h2>
                        <p className="text-zinc-400 mb-6">
                            If it's necessary, we sent you a confirmation link. Otherwise, you can log in now.
                        </p>
                        <Link href="/login" className="inline-block w-full bg-white text-black hover:bg-zinc-200 font-medium py-2.5 rounded-lg transition-colors">
                            Go to Login
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSignup} className="space-y-4">
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
                                minLength={6}
                            />
                            <p className="text-xs text-zinc-500 mt-2">Must be at least 6 characters.</p>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 text-white hover:bg-blue-700 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center mt-6"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign Up'}
                        </button>
                    </form>
                )}

                {!success && (
                    <p className="text-center text-zinc-400 text-sm mt-8">
                        Already have an account?{' '}
                        <Link href="/login" className="text-white hover:underline transition-all">
                            Sign in
                        </Link>
                    </p>
                )}
            </div>
        </div>
    );
}
