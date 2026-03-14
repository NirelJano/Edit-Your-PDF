import { PDFPage } from '@/types';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RotateCw, RotateCcw, Trash2, Copy, Plus, CheckCircle2, X, Eye, Scissors, MousePointer2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect } from 'react';

interface SortablePageProps {
    page: PDFPage;
    onToggleSelect: (id: string) => void;
    onRotate: (id: string, direction: 'cw' | 'ccw') => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onPreview: (page: PDFPage) => void;
    disabled?: boolean;
}

function SortablePage({ page, onToggleSelect, onRotate, onDelete, onDuplicate, onPreview, disabled }: SortablePageProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: page.id, disabled });

    const rotation = page.rotation || 0;

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.5 : 1,
        borderColor: page.selected ? '#3b82f6' : (page.color || '#333')
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`relative aspect-[1/1.4] bg-[#2a2a2a] rounded-md border-2 overflow-hidden flex flex-col cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-white/20 transition-all group ${page.selected ? 'ring-2 ring-blue-500' : ''}`}
        >
            {/* Selection Overlay */}
            <div
                className={`absolute top-2 left-2 z-20 p-1.5 rounded-full bg-black/60 backdrop-blur-md cursor-pointer transition-all ${page.selected ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(page.id);
                }}
                onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
            >
                <CheckCircle2 className={`w-4 h-4 ${page.selected ? 'text-blue-400 fill-blue-400/20' : 'text-white'}`} />
            </div>

            {/* Individual Actions Bar */}
            <div className="absolute top-2 right-2 z-20 flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => { e.stopPropagation(); onPreview(page); }}
                    className="p-1 bg-[#1a1a1a] bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded text-white transition-colors"
                    title="Preview Page"
                >
                    <Eye className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onRotate(page.id, 'ccw'); }}
                    className="p-1 bg-[#1a1a1a] bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded text-white transition-colors"
                    title="Rotate Left"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onRotate(page.id, 'cw'); }}
                    className="p-1 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded text-white transition-colors"
                    title="Rotate Right"
                >
                    <RotateCw className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(page.id); }}
                    className="p-1 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded text-white transition-colors"
                    title="Duplicate Page"
                >
                    <Copy className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
                    className="p-1 bg-red-500/20 hover:bg-red-500/40 backdrop-blur-sm rounded text-red-400 transition-colors"
                    title="Delete Page"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 py-8 pointer-events-none">
                <div style={{ transform: `rotate(${rotation}deg)` }} className="transition-transform duration-300 w-full h-full flex items-center justify-center">
                    {page.imageUrl ? (
                        <img src={page.imageUrl} alt={`Page ${page.originalPageNum}`} className="max-w-full max-h-full object-contain shadow-lg" />
                    ) : (
                        <div className="w-full h-full bg-[#1e1e1e] flex flex-col items-center justify-center rounded text-zinc-600">
                            <span className="text-4xl font-light">PDF</span>
                            <span className="text-sm mt-2">Preview Pending</span>
                        </div>
                    )}
                </div>
            </div>

            <div
                className="absolute bottom-0 left-0 right-0 py-1 px-2 flex justify-between items-center text-[10px] font-medium z-10 pointer-events-none"
                style={{ backgroundColor: page.color, color: '#fff' }}
            >
                <span className="truncate max-w-[80%] opacity-90">{page.fileId === 'blank' ? 'Blank Page' : 'Original File'}</span>
                <span className="bg-black/20 px-1.5 py-0.5 rounded leading-none">
                    {page.fileId === 'blank' ? '—' : page.originalPageNum}
                </span>
            </div>
        </div>
    );
}

interface BulkActionBarProps {
    selectedCount: number;
    onRotate: (direction: 'cw' | 'ccw') => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onDeselectAll: () => void;
}

function BulkActionBar({ selectedCount, onRotate, onDelete, onDuplicate, onDeselectAll }: BulkActionBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out flex-wrap md:flex-nowrap">
            <div className="flex items-center gap-3 pr-6 border-r border-white/10">
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs ring-4 ring-blue-500/20">
                    {selectedCount}
                </div>
                <span className="text-white font-semibold text-sm whitespace-nowrap">Pages Selected</span>
            </div>

            <div className="flex items-center gap-1.5">
                <button
                    onClick={() => onRotate('ccw')}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-xl text-zinc-300 hover:text-white transition-all group"
                    title="Rotate Selected CCW"
                >
                    <RotateCcw className="w-4 h-4 group-hover:rotate-[-15deg] transition-transform" />
                    <span className="text-xs font-medium">Rotate L</span>
                </button>
                <button
                    onClick={() => onRotate('cw')}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-xl text-zinc-300 hover:text-white transition-all group"
                    title="Rotate Selected CW"
                >
                    <RotateCw className="w-4 h-4 group-hover:rotate-[15deg] transition-transform" />
                    <span className="text-xs font-medium">Rotate R</span>
                </button>
                <button
                    onClick={onDuplicate}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-xl text-zinc-300 hover:text-white transition-all group"
                    title="Duplicate Selected"
                >
                    <Copy className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium">Duplicate</span>
                </button>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <button
                    onClick={onDelete}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 rounded-xl text-red-400 hover:text-red-300 transition-all group"
                    title="Delete Selected"
                >
                    <Trash2 className="w-4 h-4 group-hover:shake" />
                    <span className="text-xs font-medium">Delete</span>
                </button>
            </div>

            <button
                onClick={onDeselectAll}
                className="ml-2 p-1.5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                title="Cancel Selection"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

interface PreviewModalProps {
    page: PDFPage | null;
    onClose: () => void;
}

function PreviewModal({ page, onClose }: PreviewModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!page) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
                <X className="w-6 h-6" />
            </button>

            <div
                className="relative max-w-4xl max-h-full aspect-[1/1.4] bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ transform: `rotate(${page.rotation || 0}deg)` }} className="w-full h-full flex items-center justify-center p-4">
                    {page.imageUrl ? (
                        <img src={page.imageUrl} alt="Page Preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                        <div className="text-zinc-500 text-center">
                            <p className="text-2xl font-light">No Preview Available</p>
                        </div>
                    )}
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-3">
                    <span className="text-xs font-medium text-white/70">Original Page:</span>
                    <span className="text-sm font-bold text-white">{page.fileId === 'blank' ? 'Blank' : page.originalPageNum}</span>
                    <div className="w-px h-3 bg-white/20 mx-1" />
                    <span className="text-xs font-medium text-white/70">Rotation:</span>
                    <span className="text-sm font-bold text-white">{page.rotation || 0}°</span>
                </div>
            </div>
        </div>
    );
}

interface PageGridProps {
    pages: PDFPage[];
    setPages: (pages: PDFPage[]) => void;
    viewMode: 'pages' | 'split' | 'extract';
    splitPoints: Set<number>;
    setSplitPoints: (points: Set<number>) => void;
    splitEvery: number;
    onSplit: () => void;
    onExtract: () => void;
}

export default function PageGrid({ pages, setPages, viewMode, splitPoints, setSplitPoints, splitEvery, onSplit, onExtract }: PageGridProps) {
    const [previewPage, setPreviewPage] = useState<PDFPage | null>(null);
    const selectedCount = pages.filter(p => p.selected).length;

    const isSplitMode = viewMode === 'split';
    const isExtractMode = viewMode === 'extract';
    const isPagesMode = viewMode === 'pages';

    const splitCount = splitEvery > 0
        ? Math.ceil(pages.length / splitEvery)
        : splitPoints.size + 1;

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = pages.findIndex(p => p.id === active.id);
            const newIndex = pages.findIndex(p => p.id === over.id);
            setPages(arrayMove(pages, oldIndex, newIndex));
        }
    };

    const handleToggleSelect = (id: string) => {
        setPages(pages.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
    };

    const handleRotate = (id: string, direction: 'cw' | 'ccw') => {
        setPages(pages.map(p => {
            if (p.id === id) {
                const currentRotation = p.rotation || 0;
                const newRotation = direction === 'cw'
                    ? (currentRotation + 90) % 360
                    : (currentRotation - 90 + 360) % 360;
                return { ...p, rotation: newRotation };
            }
            return p;
        }));
    };

    const handleDelete = (id: string) => {
        setPages(pages.filter(p => p.id !== id));
    };

    const handleDuplicate = (id: string) => {
        const index = pages.findIndex(p => p.id === id);
        if (index === -1) return;
        const pageToDuplicate = pages[index];
        const newPage = { ...pageToDuplicate, id: uuidv4(), selected: false };
        const newPages = [...pages];
        newPages.splice(index + 1, 0, newPage);
        setPages(newPages);
    };

    // Bulk Actions
    const handleBulkRotate = (direction: 'cw' | 'ccw') => {
        setPages(pages.map(p => {
            if (p.selected) {
                const currentRotation = p.rotation || 0;
                const newRotation = direction === 'cw'
                    ? (currentRotation + 90) % 360
                    : (currentRotation - 90 + 360) % 360;
                return { ...p, rotation: newRotation };
            }
            return p;
        }));
    };

    const handleBulkDelete = () => {
        setPages(pages.filter(p => !p.selected));
    };

    const handleBulkDuplicate = () => {
        const newPages: PDFPage[] = [];
        pages.forEach(p => {
            newPages.push(p);
            if (p.selected) {
                newPages.push({ ...p, id: uuidv4(), selected: false });
            }
        });
        setPages(newPages);
    };

    const handleDeselectAll = () => {
        setPages(pages.map(p => ({ ...p, selected: false })));
    };

    const handleSelectAll = () => {
        setPages(pages.map(p => ({ ...p, selected: true })));
    };

    const handleAddBlank = () => {
        const newPage: PDFPage = {
            id: uuidv4(),
            fileId: 'blank',
            originalPageNum: 0,
            imageUrl: undefined,
            color: '#555',
            selected: false,
            rotation: 0
        };
        setPages([...pages, newPage]);
    };

    if (pages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl m-8 gap-4">
                <div className="p-4 bg-zinc-900 rounded-full">
                    <Plus className="w-8 h-8 text-zinc-700" />
                </div>
                <div className="text-center">
                    <p className="text-lg font-medium text-zinc-400">No pages selected</p>
                    <p className="text-sm">Upload some PDFs or add a blank page to start editing</p>
                </div>
                <button
                    onClick={handleAddBlank}
                    className="mt-4 px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full transition-all flex items-center gap-2 font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add Blank Page
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8 relative pb-32">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-semibold text-white tracking-tight">
                        {isSplitMode ? 'Split Document' : isExtractMode ? 'Extract Pages' : 'Visual Page Manager'}
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-full text-xs font-semibold">
                            {pages.length} Pages
                        </span>
                        {(selectedCount > 0 || isSplitMode) && (
                            <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-semibold animate-pulse">
                                {isSplitMode
                                    ? `Splitting into ${splitCount} PDFs`
                                    : `${selectedCount} Selected`}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!isSplitMode && (
                        <button
                            onClick={selectedCount === pages.length ? handleDeselectAll : handleSelectAll}
                            className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
                        >
                            {selectedCount === pages.length ? 'Deselect All' : 'Select All'}
                        </button>
                    )}
                    {isPagesMode && (
                        <button
                            onClick={handleAddBlank}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all flex items-center gap-2 font-medium shadow-lg shadow-blue-900/20 active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            Add Blank Page
                        </button>
                    )}
                    {(isSplitMode || isExtractMode) && (
                        <button
                            onClick={isSplitMode ? onSplit : onExtract}
                            disabled={(isExtractMode && selectedCount === 0) || (isSplitMode && pages.length === 0)}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all flex items-center gap-2 font-medium shadow-lg shadow-blue-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSplitMode ? <Scissors className="w-4 h-4" /> : <MousePointer2 className="w-4 h-4" />}
                            {isSplitMode ? `Split into ${splitCount} PDFs` : `Extract ${selectedCount} Pages`}
                        </button>
                    )}
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 outline-none">
                    <SortableContext
                        items={pages.map(p => p.id)}
                        strategy={rectSortingStrategy}
                    >
                        {pages.map((page, index) => {
                            const isSplitPoint = splitEvery > 0 ? (index > 0 && index % splitEvery === 0) : splitPoints.has(index);

                            return (
                                <div key={page.id} className="relative group/container">
                                    {isSplitMode && index > 0 && (
                                        <div
                                            className={`absolute left-[-12px] top-0 bottom-0 w-[4px] z-30 flex items-center justify-center cursor-pointer transition-all ${isSplitPoint ? 'opacity-100' : 'opacity-0 group-hover/container:opacity-100'}`}
                                            onClick={() => {
                                                const newPoints = new Set(splitPoints);
                                                if (newPoints.has(index)) newPoints.delete(index);
                                                else newPoints.add(index);
                                                setSplitPoints(newPoints);
                                            }}
                                        >
                                            <div className={`h-full w-[2px] ${isSplitPoint ? 'bg-blue-500' : 'bg-zinc-700/50'} group-hover/container:bg-blue-500/50 transition-colors`} />
                                            <div className={`absolute p-1 rounded-full ${isSplitPoint ? 'bg-blue-500 text-white' : 'bg-[#1a1a1a] border border-[#333] text-zinc-500'} scale-75 group-hover/container:scale-100 transition-transform shadow-lg`}>
                                                <Scissors className="w-3 h-3" />
                                            </div>
                                        </div>
                                    )}

                                    <SortablePage
                                        page={page}
                                        onToggleSelect={handleToggleSelect}
                                        onRotate={handleRotate}
                                        onDelete={handleDelete}
                                        onDuplicate={handleDuplicate}
                                        onPreview={setPreviewPage}
                                        disabled={false}
                                    />
                                </div>
                            );
                        })}
                    </SortableContext>

                    {/* Inline Add Blank Page Card */}
                    {isPagesMode && (
                        <button
                            onClick={handleAddBlank}
                            className="aspect-[1/1.4] rounded-md border-2 border-dashed border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/20 transition-all flex flex-col items-center justify-center gap-3 group"
                        >
                            <div className="p-3 bg-zinc-900 rounded-full group-hover:scale-110 transition-transform">
                                <Plus className="w-6 h-6 text-zinc-600 group-hover:text-zinc-400" />
                            </div>
                            <span className="text-sm font-medium text-zinc-600 group-hover:text-zinc-400">Add Blank Page</span>
                        </button>
                    )}
                </div>
            </DndContext>

            <BulkActionBar
                selectedCount={selectedCount}
                onRotate={handleBulkRotate}
                onDelete={handleBulkDelete}
                onDuplicate={handleBulkDuplicate}
                onDeselectAll={handleDeselectAll}
            />

            <PreviewModal
                page={previewPage}
                onClose={() => setPreviewPage(null)}
            />
        </div>
    );
}

