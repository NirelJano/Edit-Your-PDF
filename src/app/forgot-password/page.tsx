'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { FileText, Loader2, Mail, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const supabase = createClient();

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
            });

            if (error) {
                setError(error.message);
            } else {
                setMessage('Check your email for a password reset link.');
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
                    <h1 className="text-2xl font-semibold text-white">Reset Password</h1>
                    <p className="text-zinc-400 mt-2 text-center">Enter your email to receive a password reset link</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-500 text-center">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-sm text-green-500 text-center">
                        {message}
                    </div>
                )}

                <form onSubmit={handleReset} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-[#121212] border border-[#333] rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="you@example.com"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !!message}
                        className="w-full bg-white text-black hover:bg-zinc-200 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <Link
                        href="/login"
                        className="inline-flex items-center text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
