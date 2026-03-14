"""
Advanced OCR Service — High-quality OCR with image preprocessing + text layer embedding.

Pipeline:
  1. Render each PDF page as a high-res image (400 DPI) with PyMuPDF
  2. Apply advanced CV preprocessing: adaptive thresholding, denoising, sharpening
  3. Run Tesseract OCR with HOCR output to get text + bounding boxes
  4. Embed an invisible text layer into the original PDF using PyMuPDF render mode 3
  5. Output: The original visual PDF + a perfectly placed searchable text layer

This approach achieves quality comparable to commercial OCR tools like pdf24.org
by preprocessing images before OCR (unlike ocrmypdf which has limited preprocessing).
"""

import fitz  # PyMuPDF
import cv2
import numpy as np
import pytesseract
import os
import logging
import traceback
import tempfile
import re
from PIL import Image
from io import BytesIO
from xml.etree import ElementTree

logger = logging.getLogger(__name__)


def _render_page_to_image(page: fitz.Page, dpi: int = 400) -> np.ndarray:
    """Render a single PDF page to a numpy array (BGR) at the given DPI."""
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    img_data = pix.tobytes("png")
    
    # Convert to numpy array via PIL
    pil_img = Image.open(BytesIO(img_data))
    return np.array(pil_img)


def _preprocess_image(img: np.ndarray, turbo: bool = False) -> np.ndarray:
    """
    Advanced image preprocessing for optimal OCR quality.
    
    Steps:
      1. Convert to grayscale
      2. Upscale if too small (< 2000px width)
      3. Denoise with Fast Blur (lighter than Non-local Means)
      4. Adaptive thresholding (Gaussian)
      5. Morphological operations to clean up noise
    """
    # 1. Grayscale
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    else:
        gray = img.copy()
    
    # 2. Upscale small images
    height, width = gray.shape
    if width < 2000:
        scale = 2000 / width
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    
    if turbo:
        # In turbo mode, just do basic thresholding
        return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)

    # 3. Light Denoising (Gaussian Blur is much faster than fastNlMeansDenoising)
    denoised = cv2.GaussianBlur(gray, (3, 3), 0)
    
    # 4. Adaptive thresholding (Gaussian)
    thresh = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )
    
    # 5. Morphological opening — removes small noise dots
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
    
    return cleaned


def _parse_hocr(hocr_html: str) -> list:
    """
    Parse HOCR output from Tesseract to extract text blocks with bounding boxes.
    
    Returns list of dicts: {'text': str, 'bbox': (x0, y0, x1, y1), 'confidence': float}
    """
    results = []
    
    # Parse HOCR line by line with regex for robustness
    # Match ocr_line or ocrx_word elements with bbox info
    word_pattern = re.compile(
        r"class='ocrx_word'[^>]*title='bbox (\d+) (\d+) (\d+) (\d+); x_wconf (\d+)'[^>]*>([^<]+)<"
    )
    line_pattern = re.compile(
        r"class='ocr_line'[^>]*title='bbox (\d+) (\d+) (\d+) (\d+)"
    )
    
    # Extract words with positions  
    for match in word_pattern.finditer(hocr_html):
        x0, y0, x1, y1 = int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4))
        confidence = int(match.group(5))
        text = match.group(6).strip()
        
        if text and confidence > 30:  # Filter low-confidence garbage
            results.append({
                'text': text,
                'bbox': (x0, y0, x1, y1),
                'confidence': confidence
            })
    
    return results


def _parse_hocr_lines(hocr_html: str) -> list:
    """
    Parse HOCR output to extract full text *lines* with their bounding boxes.
    This groups words into lines for better text flow and selection.
    
    Returns list of dicts: {'text': str, 'bbox': (x0, y0, x1, y1)}
    """
    results = []
    
    # Parse with ElementTree for more reliable line extraction
    try:
        # Wrap in root element and fix common HOCR issues
        hocr_clean = hocr_html
        if not hocr_clean.strip().startswith('<?xml'):
            hocr_clean = '<?xml version="1.0" encoding="UTF-8"?>' + hocr_clean
        
        # Use regex-based extraction as fallback (more robust with malformed HTML)
        # Find each span class="ocr_line" ... </span> block
        line_blocks = re.findall(
            r'<span[^>]*class=[\'"]ocr_line[\'"][^>]*title=[\'"]bbox (\d+) (\d+) (\d+) (\d+)[^"\']*[\'"][^>]*>(.*?)</span>',
            hocr_html,
            re.DOTALL
        )
        
        for match in line_blocks:
            x0, y0, x1, y1 = int(match[0]), int(match[1]), int(match[2]), int(match[3])
            # Extract all words from this line
            words_html = match[4]
            words = re.findall(r'>([^<]+)<', words_html)
            line_text = ' '.join(w.strip() for w in words if w.strip())
            
            if line_text:
                results.append({
                    'text': line_text,
                    'bbox': (x0, y0, x1, y1)
                })
        
        # If line-level parsing failed, fall back to word-level
        if not results:
            word_results = _parse_hocr(hocr_html)
            # Group words into lines by Y position (words within 10px vertically are same line)
            if word_results:
                word_results.sort(key=lambda w: (w['bbox'][1], w['bbox'][0]))
                current_line = [word_results[0]]
                for w in word_results[1:]:
                    if abs(w['bbox'][1] - current_line[0]['bbox'][1]) < 15:
                        current_line.append(w)
                    else:
                        x0 = min(ww['bbox'][0] for ww in current_line)
                        y0 = min(ww['bbox'][1] for ww in current_line)
                        x1 = max(ww['bbox'][2] for ww in current_line)
                        y1 = max(ww['bbox'][3] for ww in current_line)
                        text = ' '.join(ww['text'] for ww in current_line)
                        results.append({'text': text, 'bbox': (x0, y0, x1, y1)})
                        current_line = [w]
                # Don't forget last line
                if current_line:
                    x0 = min(ww['bbox'][0] for ww in current_line)
                    y0 = min(ww['bbox'][1] for ww in current_line)
                    x1 = max(ww['bbox'][2] for ww in current_line)
                    y1 = max(ww['bbox'][3] for ww in current_line)
                    text = ' '.join(ww['text'] for ww in current_line)
                    results.append({'text': text, 'bbox': (x0, y0, x1, y1)})
    
    except Exception as e:
        logger.warning(f"HOCR line parsing failed: {e}, falling back to word-level")
        return _parse_hocr(hocr_html)
    
    return results


def _process_single_page(page_idx: int, input_pdf_path: str, render_dpi: int, turbo: bool = True):
    """Worker function to process a single page for parallel execution."""
    import fitz
    import pytesseract
    try:
        src_doc = fitz.open(input_pdf_path)
        page = src_doc[page_idx]
        page_rect = page.rect
        page_width = page_rect.width
        page_height = page_rect.height

        # Step 1: Render at high DPI
        img = _render_page_to_image(page, dpi=render_dpi)
        src_doc.close()

        # Step 2: Advanced preprocessing
        preprocessed = _preprocess_image(img, turbo=turbo)
        preproc_height, preproc_width = preprocessed.shape[:2]

        # Step 3: Run Tesseract with HOCR for positioned text
        custom_config = r'-l heb+eng --oem 3 --psm 3 -c preserve_interword_spaces=1'
        hocr_output = pytesseract.image_to_pdf_or_hocr(
            preprocessed,
            extension='hocr',
            config=custom_config
        )
        hocr_text = hocr_output.decode('utf-8')

        # Step 4: Parse HOCR to get text + positions
        text_lines = _parse_hocr_lines(hocr_text)
        
        return {
            "page_idx": page_idx,
            "text_lines": text_lines,
            "preproc_width": preproc_width,
            "preproc_height": preproc_height,
            "page_width": page_width,
            "page_height": page_height
        }
    except Exception as e:
        logger.error(f"Error in worker processing page {page_idx}: {e}")
        return {"page_idx": page_idx, "error": str(e)}


def run_advanced_ocr(input_pdf_path: str, output_pdf_path: str, turbo: bool = True) -> str:
    """
    Runs high-quality OCR with advanced image preprocessing in parallel.
    """
    from concurrent.futures import ProcessPoolExecutor
    import os

    try:
        src_doc = fitz.open(input_pdf_path)
        num_pages = len(src_doc)
        src_doc.close()

        logger.info(f"Advanced OCR (Parallel): Processing {num_pages} pages from {input_pdf_path}")

        render_dpi = 200 # Reduced from 300/400 for speed and memory safety
        results = []

        if num_pages == 1:
            # Skip ProcessPool for single page to avoid overhead and nested pool issues
            logger.info("  Processing single page sequentially...")
            res = _process_single_page(0, input_pdf_path, render_dpi, turbo)
            results.append(res)
        else:
            # Use a reasonable number of workers, capping at 2 on small servers to avoid OOM
            max_workers = min(os.cpu_count() or 4, 2, num_pages)
            logger.info(f"  Spawning ProcessPool with {max_workers} workers...")
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                # Map page indices to worker function
                futures = [
                    executor.submit(_process_single_page, i, input_pdf_path, render_dpi, turbo)
                    for i in range(num_pages)
                ]
                for future in futures:
                    results.append(future.result())

        # Sort results by page index to ensure order
        results.sort(key=lambda x: x["page_idx"])

        # Step 5: Reconstruct the PDF with the text layer
        out_doc = fitz.open(input_pdf_path)
        
        for res in results:
            page_idx = res["page_idx"]
            if "error" in res:
                logger.warning(f"  Page {page_idx + 1}: Skipping due to error: {res['error']}")
                continue
            
            text_lines = res["text_lines"]
            if not text_lines:
                logger.info(f"  Page {page_idx + 1}: No text detected")
                continue

            out_page = out_doc[page_idx]
            preproc_width = res["preproc_width"]
            preproc_height = res["preproc_height"]
            page_width = res["page_width"]
            page_height = res["page_height"]

            # Scale factors: preprocessed image coords → PDF coords
            scale_x = page_width / preproc_width
            scale_y = page_height / preproc_height

            text_count = 0
            for line in text_lines:
                text = line['text']
                x0, y0, x1, y1 = line['bbox']

                # Convert to PDF coordinates
                pdf_x0 = x0 * scale_x
                pdf_y0 = y0 * scale_y
                pdf_x1 = x1 * scale_x
                pdf_y1 = y1 * scale_y

                rect = fitz.Rect(pdf_x0, pdf_y0, pdf_x1, pdf_y1)
                rect_height = pdf_y1 - pdf_y0

                # Font size ≈ 85% of rect height for good fit
                font_size = max(4.0, min(rect_height * 0.85, 72.0))

                try:
                    out_page.insert_textbox(
                        rect,
                        text,
                        fontsize=font_size,
                        fontname="helv",
                        color=None,
                        overlay=True,
                        render_mode=3,
                    )
                    text_count += 1
                except Exception as text_err:
                    continue

            logger.info(f"  Page {page_idx + 1}: Embedded {text_count} text lines")

        # Save output
        out_doc.save(output_pdf_path, garbage=4, deflate=True)
        out_doc.close()

        logger.info(f"Advanced OCR: Done → {output_pdf_path}")
        return output_pdf_path

    except Exception as e:
        error_msg = f"Advanced OCR Error: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        with open("ocr_error.log", "a") as f:
            f.write(error_msg + "\n" + "=" * 40 + "\n")
        raise e
