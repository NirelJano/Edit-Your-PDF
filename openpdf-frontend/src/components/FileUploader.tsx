'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { PDFFile, PDFPage } from '@/types';
import { getNextColor } from '@/lib/colors';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@/utils/supabase/client';
import { useOcrStore } from '@/store/useOcrStore';

interface FileUploaderProps {
    onFilesAdded: (files: PDFFile[]) => void;
}

export default function FileUploader({ onFilesAdded }: FileUploaderProps) {
    const supabase = createClient();

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
            console.error("User not authenticated");
            return;
        }

        console.log(`[Frontend] Processing ${acceptedFiles.length} files...`);
        const startTime = performance.now();

        // Process all files in parallel for maximum speed
        const results = await Promise.all(acceptedFiles.map(async (file) => {
            const fileId = uuidv4();
            const color = getNextColor();
            
            try {
                // 1. Single Upload to Backend
                const formData = new FormData();
                formData.append('file', file);
                formData.append('fileId', fileId);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });

                if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
                const data = await res.json();
                
                // 2. Trigger OCR if enabled (Fire and forget, backend handles it)
                const { isOCREnabled, setIsProcessing } = useOcrStore.getState();
                if (isOCREnabled) {
                    setIsProcessing(true);
                    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/ocr/${fileId}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(e => console.error('OCR trigger failed:', e))
                      .finally(() => setIsProcessing(false));
                }

                const pages: PDFPage[] = Array.from({ length: data.pageCount }).map((_, i) => ({
                    id: uuidv4(),
                    fileId: fileId,
                    originalPageNum: i + 1,
                    color: color,
                    imageUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/page-image/${fileId}/${i + 1}`
                }));

                return {
                    id: fileId,
                    name: file.name,
                    color: color,
                    file: file,
                    pages: pages
                } as PDFFile;
            } catch (err) {
                console.error('Error processing file:', file.name, err);
                alert(`שגיאה בהעלאת הקובץ ${file.name}: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}`);
                return null;
            }
        }));

        const newPdfFiles = results.filter((f): f is PDFFile => f !== null);
        if (newPdfFiles.length > 0) {
            onFilesAdded(newPdfFiles);
        }
        
        console.log(`[Frontend] All files processed in ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
    }, [onFilesAdded, supabase]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf']
        },
        // Allows uploading the same file multiple times
        multiple: true
    });

    return (
        <div
            {...getRootProps({
                // Pass onClick into getRootProps so react-dropzone merges it
                // with its own click handler (which opens the file picker).
                // Overriding onClick outside would silently disable file selection.
                onClick: (e) => {
                    const inputElement = e.currentTarget.querySelector('input');
                    if (inputElement) {
                        inputElement.value = '';
                    }
                }
            })}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${isDragActive
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-[#444444] hover:border-[#666666] bg-[#1a1a1a]'
                }`}
        >
            <input {...getInputProps()} />
            <UploadCloud className="w-12 h-12 mx-auto mb-4 text-zinc-400" />
            <h3 className="text-xl font-medium mb-2 text-white">
                {isDragActive ? 'Drop PDFs here' : 'Drag & Drop PDFs'}
            </h3>
            <p className="text-zinc-400">
                or click to select files from your computer
            </p>
        </div>
    );
}
