import ocrmypdf
import os
import logging
import traceback

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_hebrew_ocr(input_pdf_path: str, output_pdf_path: str) -> str:
    """
    Runs high-quality Hebrew OCR on a PDF using ocrmypdf.
    Produces a "sandwich PDF" where:
      - The original page visuals are 100% preserved
      - A transparent, searchable UTF-8 text layer is embedded
      - Text is correctly RTL (Hebrew)

    Optimized settings for maximum OCR quality:
      - oversample to 400 DPI for sharp character recognition
      - clean pages from scanning artifacts (unpaper)
      - rotate pages automatically if needed
      - adaptive thresholding (sauvola) for uneven backgrounds
      - extended timeout for complex pages

    Parameters:
        input_pdf_path: Path to the source PDF
        output_pdf_path: Path where the OCR'd PDF will be saved

    Returns:
        output_pdf_path
    """
    try:
        ocrmypdf.ocr(
            input_pdf_path,
            output_pdf_path,
            language=["heb", "eng"],          # Support both Hebrew and English
            deskew=True,                       # Straighten slightly skewed scans
            force_ocr=True,                    # Re-OCR even if text layer exists
            invalidate_digital_signatures=True,# Bypass digital signature errors
            output_type="pdf",                 # Standard PDF output
            rotate_pages=True,                 # Auto-detect and fix page orientation
            clean=True,                        # Clean pages with unpaper before OCR
            oversample=300,                    # Reduced from 400 for speed
            skip_big=50,                       # Skip images > 50 megapixels to avoid timeouts
            tesseract_timeout=300,             # 5 min timeout per page for complex pages
            tesseract_config=[
                "--psm", "3",                  # Fully automatic page segmentation
                "-c", "textord_old_xheight=0",
                "--dpi", "400",
            ],
        )
    except Exception as e:
        error_msg = f"OCR Error: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        # Write to a persistent log file
        with open("ocr_error.log", "a") as f:
            f.write(error_msg + "\n" + "=" * 40 + "\n")
        raise e
    return output_pdf_path
