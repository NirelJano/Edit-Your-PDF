'use client';

import { useState } from 'react';
import Toolbar from '@/components/Toolbar';
import FileUploader from '@/components/FileUploader';
import PageGrid from '@/components/PageGrid';
import SaveModal from '@/components/SaveModal';
import { PDFFile, PDFPage } from '@/types';
import { FileText, Trash2, Loader2 } from 'lucide-react';
import { useOcrStore } from '@/store/useOcrStore';
import { createClient } from '@/utils/supabase/client';

export default function Home() {
  const [viewMode, setViewMode] = useState<'files' | 'pages' | 'split' | 'extract'>('files');
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [pages, setPages] = useState<PDFPage[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [splitPoints, setSplitPoints] = useState<Set<number>>(new Set());
  const [splitEvery, setSplitEvery] = useState<number>(0);
  const { isOCREnabled, isProcessing } = useOcrStore();

  const handleFilesAdded = (newFiles: PDFFile[]) => {
    setFiles(prev => [...prev, ...newFiles]);
    const newPages = newFiles.flatMap(f => f.pages);
    setPages(prev => [...prev, ...newPages]);
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setPages(prev => prev.filter(p => p.fileId !== fileId));
  };

  const handleSave = async (filename: string, format: 'pdf' | 'docx', pagesToSave: PDFPage[] = pages) => {
    console.log(`[Frontend] handleSave triggered: ${filename}.${format}, pages: ${pagesToSave.length}`);
    try {
      setIsSaving(true);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const payload = {
        filename,
        format,
        pages: pagesToSave.map(p => ({
          fileId: p.fileId === 'blank' ? null : p.fileId,
          originalPageNum: p.originalPageNum,
          applyOcr: isOCREnabled,
          rotation: p.rotation || 0,
          is_blank: p.fileId === 'blank'
        }))
      };

      console.log(`[Frontend] Sending save request to backend...`);
      const saveStartTime = performance.now();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const duration = ((performance.now() - saveStartTime) / 1000).toFixed(2);
      console.log(`[Frontend] /api/save response received in ${duration}s, status: ${res.status}`);

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(`Save failed: ${data.error || 'Unknown error'}`);
        }
        
        if (data.jobId) {
          console.log(`[Frontend] Save job started: ${data.jobId}. Polling...`);
          let completed = false;
          while (!completed) {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/save/status/${data.jobId}`);
            
            if (!statusRes.ok) {
              const errData = await statusRes.json().catch(() => ({}));
              throw new Error(`Save job failed: ${errData.error || statusRes.statusText}`);
            }
            
            const statusData = await statusRes.json();
            if (statusData.status === 'completed') {
              completed = true;
              console.log('[Frontend] Save job completed. Downloading...');
              const fileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/save/download/${data.jobId}`);
              if (!fileRes.ok) throw new Error("Failed to download file");
              
              const pBlob = await fileRes.blob();
              const pUrl = window.URL.createObjectURL(pBlob);
              const pA = document.createElement('a');
              pA.href = pUrl;
              pA.download = `${filename}.${format}`;
              document.body.appendChild(pA);
              pA.click();
              window.URL.revokeObjectURL(pUrl);
              document.body.removeChild(pA);
            } else if (statusData.status === 'failed') {
              throw new Error(statusData.error || 'Server processing failed');
            }
          }
        }
      } else {
        if (!res.ok) {
          throw new Error(`Save failed with status ${res.status}`);
        }
        console.log('[Frontend] Starting blob download (direct fallback)...');
        const blob = await res.blob();
        console.log(`[Frontend] Blob received, size: ${(blob.size / 1024).toFixed(2)} KB`);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      setIsSaveModalOpen(false);
    } catch (err) {
      console.error('Error saving document:', err);
      setIsSaveModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSplit = async () => {
    const groups: PDFPage[][] = [];
    let currentGroup: PDFPage[] = [];

    pages.forEach((page, index) => {
      const isSplitPoint = splitEvery > 0 ? (index > 0 && index % splitEvery === 0) : splitPoints.has(index);
      if (isSplitPoint && index > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(page);
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Dowload each group
    for (let i = 0; i < groups.length; i++) {
      await handleSave(`Document_Part_${i + 1}`, 'pdf', groups[i]);
    }
  };

  const handleExtract = async () => {
    const selectedPages = pages.filter(p => p.selected);
    if (selectedPages.length === 0) return;
    await handleSave('Extracted_Pages', 'pdf', selectedPages);
  };

  return (
    <main className="min-h-screen bg-[#121212] pt-16 flex flex-col">
      <Toolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        onAddFile={() => { setViewMode('files'); }}
        onDone={() => setIsSaveModalOpen(true)}
        splitEvery={splitEvery}
        setSplitEvery={setSplitEvery}
      />

      {isSaving && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-blue-600/20 border-t-blue-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-pulse" />
            </div>
          </div>
          <h2 className="mt-8 text-2xl font-bold text-white tracking-tight animate-pulse">Processing Your PDF...</h2>
          <p className="mt-2 text-zinc-400 font-medium">This won't take long. Hang tight!</p>
          <div className="mt-6 flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed top-20 right-8 z-[60] bg-amber-500/10 border border-amber-500/50 backdrop-blur-md px-4 py-2 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
          <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-amber-500">OCR Processing</p>
            <p className="text-xs text-amber-500/70">Adding searchable text layer...</p>
          </div>
        </div>
      )}

      <div className="flex-1 p-6 md:p-8 overflow-y-auto">
        {viewMode === 'files' ? (
          <div className="max-w-4xl mx-auto space-y-8">
            <FileUploader onFilesAdded={handleFilesAdded} />

            {files.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-medium text-white mb-4">Uploaded Files</h3>
                <div className="grid gap-4">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-[#333] shadow-sm relative overflow-hidden group"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: file.color }} />
                      <div className="flex items-center gap-4 pl-3">
                        <div className="p-2 bg-[#2a2a2a] rounded-lg">
                          <FileText className="w-6 h-6" style={{ color: file.color }} />
                        </div>
                        <div>
                          <p className="font-medium text-white">{file.name}</p>
                          <p className="text-sm text-zinc-400">{file.pages.length} pages</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove File"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <PageGrid
            pages={pages}
            setPages={setPages}
            viewMode={viewMode}
            splitPoints={splitPoints}
            setSplitPoints={setSplitPoints}
            splitEvery={splitEvery}
            onSplit={handleSplit}
            onExtract={handleExtract}
          />
        )}
      </div>

      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={(filename, format) => handleSave(filename, format)}
      />
    </main>
  );
}
