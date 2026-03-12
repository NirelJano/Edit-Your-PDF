import { create } from 'zustand';

interface OcrState {
    isOCREnabled: boolean;
    setIsOCREnabled: (enabled: boolean) => void;
    isProcessing: boolean;
    setIsProcessing: (processing: boolean) => void;
}

export const useOcrStore = create<OcrState>((set) => ({
    isOCREnabled: false,
    setIsOCREnabled: (enabled) => set({ isOCREnabled: enabled }),
    isProcessing: false,
    setIsProcessing: (processing) => set({ isProcessing: processing }),
}));
