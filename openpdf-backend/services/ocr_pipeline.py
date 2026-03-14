"""
OCR Pipeline — Orchestrator for multiple OCR engines.

Provides a single entry point: run_high_quality_ocr()
Supports:
  - "advanced" — Advanced preprocessing + Tesseract HOCR + invisible text layer (best quality)
  - "ocrmypdf" — ocrmypdf with optimized Tesseract settings (fast, reliable)

If the chosen engine fails, automatically falls back to the other engine.
"""

import logging
import traceback

logger = logging.getLogger(__name__)


def run_high_quality_ocr(
    input_pdf_path: str,
    output_pdf_path: str,
    engine: str = "advanced",
    turbo: bool = True,
) -> str:
    """
    Run high-quality OCR on a PDF file.

    Parameters:
        input_pdf_path: Path to the source PDF
        output_pdf_path: Path where the OCR'd PDF will be saved
        engine: OCR engine to use ("advanced" or "ocrmypdf")
        turbo: If True, use faster preprocessing (recommended)

    Returns:
        output_pdf_path on success

    Raises:
        Exception if both engines fail
    """
    import time
    start_time = time.time()

    # Normalize engine name (accept "surya" as alias for "advanced")
    if engine in ("surya", "advanced"):
        engine = "advanced"

    engines_order = _get_engine_order(engine)
    last_error = None

    for eng in engines_order:
        try:
            logger.info(f"OCR Pipeline: Trying engine '{eng}' on {input_pdf_path}")
            if eng == "advanced":
                from .surya_ocr_service import run_advanced_ocr
                result = run_advanced_ocr(input_pdf_path, output_pdf_path, turbo=turbo)
            elif eng == "ocrmypdf":
                from .ocrmypdf_service import run_hebrew_ocr
                result = run_hebrew_ocr(input_pdf_path, output_pdf_path)
            else:
                raise ValueError(f"Unknown OCR engine: {eng}")
            logger.info(f"OCR Pipeline: Completed successfully with '{eng}' in {time.time() - start_time:.2f}s")
            return result
        except Exception as e:
            last_error = e
            logger.warning(
                f"OCR Pipeline: Engine '{eng}' failed: {e}\n"
                f"{'Falling back to next engine...' if eng != engines_order[-1] else 'No more engines to try.'}"
            )
            continue

    # All engines failed
    error_msg = f"OCR Pipeline: All engines failed. Last error: {last_error}\n{traceback.format_exc()}"
    logger.error(error_msg)
    with open("ocr_error.log", "a") as f:
        f.write(error_msg + "\n" + "=" * 40 + "\n")
    raise last_error


def _get_engine_order(preferred: str) -> list:
    """Return engine execution order: preferred first, then fallback."""
    all_engines = ["advanced", "ocrmypdf"]
    if preferred not in all_engines:
        preferred = "advanced"
    return [preferred] + [e for e in all_engines if e != preferred]
