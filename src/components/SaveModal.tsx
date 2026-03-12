'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';

interface SaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (filename: string, format: 'pdf' | 'docx') => void;
}

export default function SaveModal({ isOpen, onClose, onSave }: SaveModalProps) {
    const [filename, setFilename] = useState('OpenPDF_Document');
    const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1a1a1a] border border-[#333333] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-4 border-b border-[#333333]">
                    <h2 className="text-lg font-medium text-white">Save Changes</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-[#333333]">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400 font-medium">Filename</label>
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                className="w-full bg-[#121212] border border-[#333333] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                                placeholder="Document Name"
                            />
                            <span className="absolute right-4 text-zinc-500 pointer-events-none">
                                .{format}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400 font-medium">Format</label>
                        <div className="flex gap-4">
                            <label className="flex-1">
                                <input
                                    type="radio"
                                    name="format"
                                    value="pdf"
                                    checked={format === 'pdf'}
                                    onChange={() => setFormat('pdf')}
                                    className="peer sr-only"
                                />
                                <div className="w-full text-center px-4 py-3 bg-[#121212] border border-[#333333] rounded-lg cursor-pointer peer-checked:border-blue-500 peer-checked:bg-blue-500/10 text-zinc-400 peer-checked:text-blue-500 font-medium transition-all">
                                    PDF
                                </div>
                            </label>
                            <label className="flex-1">
                                <input
                                    type="radio"
                                    name="format"
                                    value="docx"
                                    checked={format === 'docx'}
                                    onChange={() => setFormat('docx')}
                                    className="peer sr-only"
                                />
                                <div className="w-full text-center px-4 py-3 bg-[#121212] border border-[#333333] rounded-lg cursor-pointer peer-checked:border-blue-500 peer-checked:bg-blue-500/10 text-zinc-400 peer-checked:text-blue-500 font-medium transition-all">
                                    Word (.docx)
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-[#141414] border-t border-[#333333] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-[#252525] rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(filename, format)}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors font-medium shadow-lg shadow-blue-500/20"
                    >
                        <Save className="w-4 h-4" />
                        Process & Save
                    </button>
                </div>
            </div>
        </div>
    );
}
