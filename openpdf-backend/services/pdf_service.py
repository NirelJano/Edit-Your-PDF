import fitz
import os
import threading
from .ocr_pipeline import run_high_quality_ocr

# Global lock to prevent concurrent downloads of the same file
_download_lock = threading.Lock()
_local_files_cache = set()

def split_pdf_to_images(pdf_path: str, output_dir: str) -> list:
    """
    Splits a PDF into high-res images, returns list of image paths.
    """
    doc = fitz.open(pdf_path)
    image_paths = []
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        # Use a high-resolution matrix (equivalent to 300 DPI)
        zoom = 2.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        output_path = os.path.join(output_dir, f"page_{page_num + 1}.png")
        pix.save(output_path)
        image_paths.append(output_path)
        
    doc.close()
    return image_paths

def get_page_image(pdf_path: str, page_num: int, output_dir: str) -> str:
    """
    Extracts a single page as an image. page_num is 1-indexed.
    """
    doc = fitz.open(pdf_path)
    page = doc.load_page(page_num - 1)
    
    zoom = 2.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    
    output_path = os.path.join(output_dir, f"page_{page_num}.png")
    pix.save(output_path)
    doc.close()
    
    return output_path

def _process_page_for_final(spec: dict, uploads_dir: str, processed_dir: str):
    """Worker function to process a single page for the final PDF."""
    import fitz
    import uuid
    import os
    from .ocr_pipeline import run_high_quality_ocr # Moved here for worker function scope
    
    is_blank = spec.get('is_blank', False)
    rotation = spec.get('rotation', 0)
    file_id = spec.get('fileId')
    page_num = spec.get('originalPageNum')
    apply_ocr = spec.get('applyOcr', False)
    
    # Create a temporary one-page PDF for this spec
    temp_page_pdf = os.path.join(processed_dir, f"tmp_{uuid.uuid4()}.pdf")
    temp_doc = fitz.open()

    if is_blank:
        temp_doc.new_page(width=595, height=842)
        if rotation != 0:
            temp_doc[-1].set_rotation(rotation)
        temp_doc.save(temp_page_pdf)
        temp_doc.close()
        return temp_page_pdf

    # Ensure source PDF exists locally
    pdf_path = os.path.join(uploads_dir, f"{file_id}.pdf")
    
    with _download_lock:
        if not os.path.exists(pdf_path):
            from .supabase_service import download_file
            try:
                print(f"[Backend] Worker: {file_id}.pdf missing locally, downloading from Supabase...")
                download_file(file_id, pdf_path)
                print(f"[Backend] Worker: {file_id}.pdf downloaded successfully")
            except Exception as e:
                print(f"[Backend] Worker: Failed to download {file_id}.pdf: {e}")
                raise FileNotFoundError(f"Source file {file_id}.pdf not found")

    if apply_ocr:
        file_processed_dir = os.path.join(processed_dir, file_id)
        os.makedirs(file_processed_dir, exist_ok=True)
        
        single_page_raw = os.path.join(file_processed_dir, f"page_{page_num}_raw_{uuid.uuid4()}.pdf")
        src_doc = fitz.open(pdf_path)
        single_doc = fitz.open()
        single_doc.insert_pdf(src_doc, from_page=page_num - 1, to_page=page_num - 1)
        single_doc.save(single_page_raw)
        single_doc.close()
        src_doc.close()

        ocr_pdf_path = os.path.join(file_processed_dir, f"page_{page_num}_ocr_{uuid.uuid4()}.pdf")
        run_high_quality_ocr(single_page_raw, ocr_pdf_path)
        
        # Cleanup raw temp file
        if os.path.exists(single_page_raw):
            os.remove(single_page_raw)
            
        # The OCR result IS our temp page
        if rotation != 0:
            d = fitz.open(ocr_pdf_path)
            d[0].set_rotation(rotation)
            d.save(temp_page_pdf)
            d.close()
            os.remove(ocr_pdf_path)
        else:
            os.rename(ocr_pdf_path, temp_page_pdf)
    else:
        src_doc = fitz.open(pdf_path)
        temp_doc.insert_pdf(src_doc, from_page=page_num - 1, to_page=page_num - 1)
        if rotation != 0:
            temp_doc[0].set_rotation(rotation)
        temp_doc.save(temp_page_pdf)
        temp_doc.close()
        src_doc.close()
        
    return temp_page_pdf

def build_final_pdf(pages_spec: list, output_path: str, uploads_dir: str, processed_dir: str):
    """
    Builds the final PDF by processing pages in parallel.
    """
    from concurrent.futures import ThreadPoolExecutor
    import fitz
    import os

    # Process all pages in parallel - Limit to 2 workers to avoid memory spikes
    temp_files = []
    with ThreadPoolExecutor(max_workers=min(os.cpu_count() or 4, 2)) as executor:
        futures = [
            executor.submit(_process_page_for_final, spec, uploads_dir, processed_dir)
            for spec in pages_spec
        ]
        total = len(futures)
        for i, future in enumerate(futures):
            temp_files.append(future.result())
            if (i + 1) % 5 == 0 or i + 1 == total:
                print(f"[Backend] Build Progress: {i + 1}/{total} pages processed")

    # Build the final document from ordered temp files
    print(f"[Backend] Merging {len(temp_files)} pages into final PDF...")
    final_doc = fitz.open()
    for temp_file in temp_files:
        if os.path.exists(temp_file):
            src_doc = fitz.open(temp_file)
            final_doc.insert_pdf(src_doc)
            src_doc.close()
            # Cleanup temp file
            os.remove(temp_file)

    final_doc.save(output_path, garbage=4, deflate=True)
    final_doc.close()
    return output_path

def convert_to_docx(pdf_path: str, docx_path: str):
    from pdf2docx import Converter
    print(f"DEBUG: convert_to_docx called for {pdf_path}")
    # Convert PDF to docx
    cv = Converter(pdf_path)
    print(f"DEBUG: Converter initialized. Starting cv.convert with end=None")
    cv.convert(docx_path, start=0, end=None)
    print(f"DEBUG: cv.convert finished. Closing converter.")
    cv.close()
    return docx_path
