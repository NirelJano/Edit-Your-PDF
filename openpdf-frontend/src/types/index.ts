export interface PDFPage {
    id: string;
    fileId: string;
    originalPageNum: number;
    imageUrl?: string;
    color: string;
    selected?: boolean;
    rotation?: number; // 0, 90, 180, 270
}

export interface PDFFile {
    id: string;
    name: string;
    color: string;
    pages: PDFPage[];
    file: File;
}
