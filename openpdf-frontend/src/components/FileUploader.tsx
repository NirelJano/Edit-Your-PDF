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
        const newPdfFiles: PDFFile[] = [];

        for (const file of acceptedFiles) {
            const fileId = uuidv4();
            // Sanitize filename: remove non-ASCII characters and replace spaces with underscores
            const sanitizedName = file.name.replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, "_") || "document.pdf";
            const filePath = `uploads/${fileId}-${sanitizedName}`;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id;
                const token = session?.access_token;

                if (!userId || !token) throw new Error("User must be logged in to upload files");
                // 1. Upload to Supabase Storage
                console.log(`[Frontend] Starting Supabase upload for ${file.name}...`);
                const uploadStartTime = performance.now();
                const { error: uploadError } = await supabase.storage
                    .from('pdf-storage')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;
                console.log(`[Frontend] Supabase upload finished in ${((performance.now() - uploadStartTime) / 1000).toFixed(2)}s`);

                const { data: { publicUrl } } = supabase.storage
                    .from('pdf-storage')
                    .getPublicUrl(filePath);

                // 2. Save metadata to Supabase DB
                const color = getNextColor();
                const { error: dbError } = await supabase
                    .from('files')
                    .insert({
                        id: fileId,
                        name: file.name,
                        storage_url: publicUrl,
                        color_id: color,
                        status: 'pending',
                        user_id: userId
                    });

                if (dbError) throw dbError;

                // 3. Notify backend to process (get page count/images)
                console.log(`[Frontend] Sending ${file.name} to backend/api/upload...`);
                const backendStartTime = performance.now();
                const formData = new FormData();
                formData.append('file', file);
                formData.append('fileId', fileId);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData,
                });

                if (!res.ok) throw new Error('Backend upload/processing failed');
                console.log(`[Frontend] Backend processing finished in ${((performance.now() - backendStartTime) / 1000).toFixed(2)}s`);

                // 4. Trigger OCR if enabled
                const { isOCREnabled, setIsProcessing } = useOcrStore.getState();
                if (isOCREnabled) {
                    console.log(`[Frontend] Triggering background OCR for ${file.name}...`);
                    setIsProcessing(true);
                    try {
                        const ocrStartTime = performance.now();
                        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/ocr/${fileId}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        console.log(`[Frontend] Background OCR request sent in ${((performance.now() - ocrStartTime) / 1000).toFixed(2)}s`);
                        // OCR is a background task, so we don't necessarily wait for it to finish 
                        // to show the pages, but we set the status.
                    } catch (ocrErr) {
                        console.error('Failed to trigger OCR:', ocrErr);
                    } finally {
                        setIsProcessing(false);
                    }
                }

                const data = await res.json();
                const pageCount = data.pageCount;

                const pages: PDFPage[] = Array.from({ length: pageCount }).map((_, i) => ({
                    id: uuidv4(),
                    fileId: fileId,
                    originalPageNum: i + 1,
                    color: color,
                    imageUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/page-image/${fileId}/${i + 1}`
                }));

                newPdfFiles.push({
                    id: fileId,
                    name: file.name,
                    color: color,
                    file: file,
                    pages: pages
                });
            } catch (err) {
                console.error('Error uploading file:', file.name, err);
            }
        }

        if (newPdfFiles.length > 0) {
            onFilesAdded(newPdfFiles);
        }
    }, [onFilesAdded]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf']
        }
    });

    return (
        <div
            {...getRootProps()}
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
