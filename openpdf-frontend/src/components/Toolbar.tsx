import { FileDown, FilePlus, Copy, LayoutGrid, LogOut, Scissors, MousePointer2, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import OCRToggle from './OCRToggle';

interface ToolbarProps {
    viewMode: 'files' | 'pages' | 'split' | 'extract';
    setViewMode: (mode: 'files' | 'pages' | 'split' | 'extract') => void;
    onAddFile: () => void;
    onDone: () => void;
    splitEvery: number;
    setSplitEvery: (val: number) => void;
}

export default function Toolbar({ viewMode, setViewMode, onAddFile, onDone, splitEvery, setSplitEvery }: ToolbarProps) {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                setUserEmail(session.user.email);
            }
        };
        fetchUser();
    }, [supabase.auth]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
        router.push('/login');
    };

    return (
        <div className="fixed top-0 left-0 right-0 h-16 bg-[#1A1A1A] border-b border-[#333333] flex items-center justify-between px-6 z-50">
            <div className="flex gap-2 bg-[#121212] p-1 rounded-lg border border-[#333]">
                <button
                    onClick={() => setViewMode('files')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'files'
                        ? 'bg-[#333] text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    <Copy className="w-3.5 h-3.5" />
                    Files
                </button>
                <button
                    onClick={() => setViewMode('pages')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'pages'
                        ? 'bg-[#333] text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Organize
                </button>
                <button
                    onClick={() => setViewMode('split')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'split'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    <Scissors className="w-3.5 h-3.5" />
                    Split
                </button>
                <button
                    onClick={() => setViewMode('extract')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'extract'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    <MousePointer2 className="w-3.5 h-3.5" />
                    Extract
                </button>
            </div>

            <div className="flex items-center gap-4">
                {viewMode === 'split' && (
                    <div className="flex items-center gap-3 mr-4 bg-[#252525] px-3 py-1.5 rounded-lg border border-[#333] animate-in fade-in slide-in-from-right-4">
                        <label className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={splitEvery > 0}
                                onChange={(e) => setSplitEvery(e.target.checked ? 1 : 0)}
                                className="rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-600/20"
                            />
                            Split every
                        </label>
                        <div className="flex items-center gap-1.5 ml-1">
                            <button
                                onClick={() => setSplitEvery(Math.max(1, splitEvery - 1))}
                                className="w-6 h-6 flex items-center justify-center bg-[#333] hover:bg-[#444] rounded text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={splitEvery <= 1}
                            >
                                -
                            </button>
                            <input
                                type="number"
                                value={splitEvery || 1}
                                onChange={(e) => setSplitEvery(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-10 bg-transparent text-center text-xs font-bold text-white focus:outline-none"
                            />
                            <button
                                onClick={() => setSplitEvery(splitEvery + 1)}
                                className="w-6 h-6 flex items-center justify-center bg-[#333] hover:bg-[#444] rounded text-white"
                            >
                                +
                            </button>
                            <span className="text-xs text-zinc-500 ml-1">pages</span>
                        </div>
                    </div>
                )}

                <OCRToggle />

                <button
                    onClick={() => router.push('/latest-downloads')}
                    className="flex items-center gap-2 p-2 text-zinc-400 hover:text-white hover:bg-[#333] rounded-md transition-all"
                    title="Latest Downloads"
                >
                    <History className="w-5 h-5" />
                    <span className="hidden lg:inline text-xs font-medium">History</span>
                </button>

                <div className="h-6 w-px bg-[#333333] hidden sm:block"></div>

                {userEmail && (
                    <div className="hidden sm:flex flex-col items-end mr-2">
                        <span className="text-xs text-zinc-500">Logged in as</span>
                        <span className="text-sm text-zinc-300 font-medium">{userEmail}</span>
                    </div>
                )}

                <button
                    onClick={onAddFile}
                    className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] text-white rounded-md hover:bg-[#333333] transition-colors border border-[#444444]"
                >
                    <FilePlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add File</span>
                </button>
                <button
                    onClick={onDone}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors"
                >
                    <FileDown className="w-4 h-4" />
                    <span className="hidden sm:inline">Done</span>
                </button>

                <button
                    onClick={handleLogout}
                    className="flex items-center justify-center p-2 text-red-400 hover:text-white hover:bg-red-500 rounded-md transition-colors ml-2"
                    title="Logout"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
