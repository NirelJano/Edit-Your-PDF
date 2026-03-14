'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { FileText, Download, ArrowLeft, Loader2, Calendar, FileType, Eye, ChevronLeft, ChevronRight, X as CloseIcon } from 'lucide-react';

interface DownloadRecord {
    id: string;
    created_at: string;
    name: string;
    format: string;
    storage_path: string;
    file_size?: number;
    page_count?: number;
}

interface PreviewState {
    downloadId: string;
    currentPage: number;
    pageCount: number;
    fileName: string;
}

function HistoryPreviewModal({ state, onClose }: { state: PreviewState | null, onClose: () => void }) {
    const [pageImg, setPageImg] = useState<{ url: string, page: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);

    const supabase = createClient();

    // Cleanup object URLs to prevent memory leaks
    useEffect(() => {
        return () => {
            if (pageImg?.url) URL.revokeObjectURL(pageImg.url);
        };
    }, [pageImg]);

    useEffect(() => {
        if (state) {
            setCurrentPage(0);
        }
    }, [state]);

    useEffect(() => {
        if (!state) return;

        const fetchPage = async () => {
            setLoading(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/downloads/page/${state.downloadId}/${currentPage + 1}`, {
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`
                    }
                });
                if (!res.ok) throw new Error('Failed to fetch page');
                const blob = await res.blob();
                const newUrl = URL.createObjectURL(blob);

                setPageImg(prev => {
                    if (prev?.url) URL.revokeObjectURL(prev.url);
                    return { url: newUrl, page: currentPage };
                });
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchPage();
    }, [state, currentPage, supabase.auth]);

    if (!state) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
            <div className="relative w-full max-w-4xl h-full flex flex-col items-center justify-center gap-6" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-0 right-0 p-2 text-white/50 hover:text-white transition-colors">
                    <CloseIcon className="w-8 h-8" />
                </button>

                <div className="relative group bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl border border-white/5 aspect-[1/1.4] max-h-[85vh] flex items-center justify-center">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        </div>
                    )}
                    {pageImg && pageImg.page === currentPage ? (
                        <img src={pageImg.url} alt={`Page ${currentPage + 1}`} className="w-full h-full object-contain" />
                    ) : (
                        <div className="flex flex-col items-center text-zinc-500">
                            <FileText className="w-12 h-12 mb-2 opacity-20" />
                            <span>טוען תצוגה...</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-6 px-6 py-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="p-2 text-white hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>

                    <div className="flex items-center gap-3 font-medium">
                        <span className="text-white text-lg">{currentPage + 1}</span>
                        <span className="text-white/40">/</span>
                        <span className="text-white/40">{state.pageCount}</span>
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(state.pageCount - 1, p + 1))}
                        disabled={currentPage === state.pageCount - 1}
                        className="p-2 text-white hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>

                <div className="text-white/60 text-sm font-medium tracking-wide bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                    {state.fileName}
                </div>
            </div>
        </div>
    );
}

export default function LatestDownloads() {
    const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState<number | null>(null); // days back
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    const [previewState, setPreviewState] = useState<PreviewState | null>(null);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const fetchDownloads = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    router.push('/login');
                    return;
                }

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/downloads`, {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (!res.ok) throw new Error('Failed to fetch downloads');
                const data = await res.json();
                setDownloads(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchDownloads();
    }, [router, supabase.auth]);

    const handleDownload = async (record: DownloadRecord) => {
        try {
            setDownloadingId(record.id);
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/downloads/url/${record.id}`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });

            if (!res.ok) throw new Error('Failed to get download URL');
            const { url } = await res.json();

            // Fetch the file to a blob to force download behavior
            const fileRes = await fetch(url);
            if (!fileRes.ok) throw new Error('Failed to fetch file content');
            const blob = await fileRes.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${record.name}.${record.format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download error:', err);
            alert('Failed to download file');
        } finally {
            setDownloadingId(null);
        }
    };

    const handlePreview = async (record: DownloadRecord) => {
        try {
            setDownloadingId(record.id);
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/downloads/info/${record.id}`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });

            if (!res.ok) throw new Error('Failed to get download info');
            const info = await res.json();
            setPreviewState({
                downloadId: record.id,
                currentPage: 0,
                pageCount: info.pageCount,
                fileName: record.name
            });
        } catch (err) {
            console.error('Preview error:', err);
            alert('Failed to preview file');
        } finally {
            setDownloadingId(null);
        }
    };

    const filteredDownloads = downloads.filter(d => {
        const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!dateFilter) return matchesSearch;

        const recordDate = new Date(d.created_at).getTime();
        const now = new Date().getTime();
        const diffDays = (now - recordDate) / (1000 * 3600 * 24);
        return matchesSearch && diffDays <= dateFilter;
    });

    const paginatedDownloads = filteredDownloads.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    const totalPages = Math.ceil(filteredDownloads.length / itemsPerPage);

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const filterOptions = [
        { label: 'היום', value: 1 },
        { label: '3 ימים', value: 3 },
        { label: 'שבוע', value: 7 },
        { label: 'חודש', value: 30 },
        { label: '3 חודשים', value: 90 },
        { label: 'חצי שנה', value: 180 },
        { label: 'שנה', value: 365 },
    ];

    return (
        <main className="min-h-screen bg-[#121212] pt-24 pb-12 px-6">
            <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/')}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-[#1a1a1a] rounded-lg transition-colors border border-[#333]"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">History & Downloads</h1>
                            <p className="text-zinc-400">Manage and filter your processed files</p>
                        </div>
                    </div>
                </div>

                <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#333] mb-8 space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-400 mr-2">חיפוש לפי שם</label>
                            <input
                                type="text"
                                placeholder="חפש קובץ..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#121212] border border-[#333] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-400 mr-2">סינון לפי זמן</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setDateFilter(null)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!dateFilter ? 'bg-blue-600 text-white' : 'bg-[#252525] text-zinc-400 hover:text-white'}`}
                                >
                                    הכל
                                </button>
                                {filterOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setDateFilter(opt.value)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilter === opt.value ? 'bg-blue-600 text-white' : 'bg-[#252525] text-zinc-400 hover:text-white'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                        <p className="text-zinc-500">Loading your history...</p>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500">
                        {error}
                    </div>
                ) : filteredDownloads.length === 0 ? (
                    <div className="text-center py-20 bg-[#1a1a1a] rounded-2xl border border-[#333] border-dashed">
                        <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                        <h3 className="text-xl font-medium text-zinc-300">לא נמצאו קבצים</h3>
                        <p className="text-zinc-500 mt-2">נסה לשנות את הסינון או לעבד קבצים חדשים</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid gap-4">
                            {paginatedDownloads.map((record) => (
                                <div
                                    key={record.id}
                                    className="group flex items-center justify-between p-5 bg-[#1a1a1a] border border-[#333] rounded-2xl hover:border-[#444] transition-all duration-300 hover:shadow-xl hover:shadow-black/20"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="p-3 bg-[#252525] rounded-xl group-hover:bg-[#2a2a2a] transition-colors">
                                            <FileText className="w-8 h-8 text-blue-500" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                                                {record.name}
                                            </h3>
                                            <div className="flex items-center gap-4 text-sm text-zinc-500">
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(record.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="flex items-center gap-1.5 uppercase font-bold text-xs tracking-wider bg-[#252525] px-2 py-0.5 rounded text-zinc-400">
                                                    <FileType className="w-3 h-3" />
                                                    {record.format}
                                                </span>
                                                {record.page_count && record.page_count > 0 && (
                                                    <span className="flex items-center gap-1.5 font-bold text-xs tracking-wider bg-[#252525] px-2 py-0.5 rounded text-zinc-400">
                                                        {record.page_count} דפים
                                                    </span>
                                                )}
                                                {record.file_size && record.file_size > 0 && (
                                                    <span className="text-xs text-zinc-600">
                                                        {formatSize(record.file_size)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handlePreview(record)}
                                            disabled={!!downloadingId}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] text-zinc-300 rounded-xl transition-all duration-300 border border-[#333] hover:bg-[#252525] hover:text-white hover:border-[#444] disabled:opacity-50"
                                            title="צצה בקובץ"
                                        >
                                            <Eye className="w-4 h-4" />
                                            <span className="font-medium hidden sm:inline">הצצה</span>
                                        </button>
                                        <button
                                            onClick={() => handleDownload(record)}
                                            disabled={!!downloadingId}
                                            className={`flex items-center gap-2 px-5 py-2.5 bg-[#252525] text-white rounded-xl transition-all duration-300 border border-[#333] group/btn ${downloadingId === record.id
                                                ? 'opacity-100 border-blue-500 bg-blue-600/20'
                                                : 'hover:bg-blue-600 hover:border-blue-500'
                                                } disabled:cursor-not-allowed`}
                                        >
                                            {downloadingId === record.id ? (
                                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                            ) : (
                                                <Download className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                            )}
                                            <span className="font-medium">
                                                {downloadingId === record.id ? 'עובד...' : 'הורד קובץ'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 pt-4">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2 bg-[#1a1a1a] border border-[#333] rounded-xl text-zinc-400 hover:text-white hover:bg-[#252525] disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="flex items-center gap-2">
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setPage(i + 1)}
                                            className={`w-10 h-10 rounded-xl font-medium transition-all ${page === i + 1
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                                : 'bg-[#1a1a1a] border border-[#333] text-zinc-400 hover:text-white hover:bg-[#252525]'
                                                }`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-2 bg-[#1a1a1a] border border-[#333] rounded-xl text-zinc-400 hover:text-white hover:bg-[#252525] disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <HistoryPreviewModal
                state={previewState}
                onClose={() => setPreviewState(null)}
            />
        </main>
    );
}
