'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) {
                setError(error.message);
            } else {
                router.refresh();
                router.push('/login?message=Password updated successfully');
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
                    <h1 className="text-2xl font-semibold text-white">New Password</h1>
                    <p className="text-zinc-400 mt-2">Enter your new secure password</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-500 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">New Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#121212] border border-[#333] rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm New Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-[#121212] border border-[#333] rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-white text-black hover:bg-zinc-200 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center mt-6"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
