'use client';

import { useOcrStore } from '@/store/useOcrStore';
import { Sparkles, Loader2 } from 'lucide-react';

export default function OCRToggle() {
    const { isOCREnabled, setIsOCREnabled, isProcessing } = useOcrStore();

    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800/50 rounded-full border border-zinc-700/50 backdrop-blur-sm transition-all hover:bg-zinc-800">
            <div className="flex items-center gap-2">
                <Sparkles className={`w-4 h-4 ${isOCREnabled ? 'text-amber-400' : 'text-zinc-500'}`} />
                <span className="text-sm font-medium text-zinc-200">OCR (Hebrew)</span>
            </div>

            <button
                onClick={() => setIsOCREnabled(!isOCREnabled)}
                disabled={isProcessing}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${isOCREnabled ? 'bg-amber-500' : 'bg-zinc-600'
                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isOCREnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                />
            </button>

            {isProcessing && (
                <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Processing...</span>
                </div>
            )}
        </div>
    );
}
