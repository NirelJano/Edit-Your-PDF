import cv2
import pytesseract

def preprocess_for_hebrew(image_path: str) -> str:
    # Read the image
    img = cv2.imread(image_path)
    
    # 1. Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. Noise Reduction (Gaussian Blur)
    # Using a 5x5 kernel for high-res images
    filtered = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # 3. Binarization (Otsu's Thresholding)
    _, thresh = cv2.threshold(filtered, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Save the preprocessed image temporarily
    preprocessed_path = image_path.replace('.png', '_preprocessed.png').replace('.jpg', '_preprocessed.jpg')
    cv2.imwrite(preprocessed_path, thresh)
    
    return preprocessed_path

def perform_hebrew_ocr(image_path: str) -> str:
    """
    Performs OCR on an image specifically tuned for Hebrew text.
    Returns the extracted text.
    """
    preprocessed_path = preprocess_for_hebrew(image_path)
    
    # psm 6: Assume a single uniform block of text.
    # oem 3: Default, based on what is available.
    custom_config = r'-l heb --oem 3 --psm 6'
    
    text = pytesseract.image_to_string(preprocessed_path, config=custom_config)
    return text

def create_searchable_pdf(image_path: str, output_pdf_path: str):
    """
    Creates a searchable PDF from an image using Hebrew OCR.
    """
    preprocessed_path = preprocess_for_hebrew(image_path)
    custom_config = r'-l heb --oem 3 --psm 6'
    
    pdf_bytes = pytesseract.image_to_pdf_or_hocr(preprocessed_path, extension='pdf', config=custom_config)
    
    with open(output_pdf_path, 'wb') as f:
        f.write(pdf_bytes)
    
    return output_pdf_path
