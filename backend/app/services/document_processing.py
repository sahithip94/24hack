import re
from datetime import datetime
from pathlib import Path

DATE_PATTERNS = [
    (re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b"), "%Y-%m-%d"),
    (re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b"), None),
]

def _first_date(text: str) -> str | None:
    for pattern, fmt in DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        raw = match.group(1)
        try:
            if fmt:
                return datetime.strptime(raw, fmt).date().isoformat()
            separator = "/" if "/" in raw else "-"
            day, month, year = raw.split(separator)
            return datetime(int(year), int(month), int(day)).date().isoformat()
        except ValueError:
            continue
    return None

def _guess_category(text: str, filename: str) -> str:
    combined = (text + " " + filename).lower()
    if any(word in combined for word in ("prescription", "tablet", "capsule", "dosage", "take daily", "medicine", "medication")):
        return "medication"
    if any(word in combined for word in ("lab report", "laboratory", "blood test", "hemoglobin", "haemoglobin", "glucose", "reference range", "test result")):
        return "lab_result"
    if any(word in combined for word in ("discharge summary", "hospital visit", "follow-up", "consultation")):
        return "visit"
    if "allergy" in combined or "allergic" in combined:
        return "allergy"
    return "medical_document"

def process_document(file_path: str, original_filename: str) -> dict:
    """Extract basic text. Image OCR requires the Tesseract system application."""
    path = Path(file_path)
    suffix = path.suffix.lower()
    text = ""
    note = None
    status = "processed"
    try:
        if suffix == ".txt":
            text = path.read_text(encoding="utf-8", errors="replace")
        elif suffix == ".pdf":
            from .ocr_service import (
                OcrEngineUnavailable, OcrError, OcrInvalidImage, OcrNoText,
                extract_text_from_pdf,
            )
            try:
                # Uses the embedded text layer when present; otherwise rasterises
                # and OCRs the pages so scanned PDFs still yield a summary.
                result = extract_text_from_pdf(path.read_bytes(), filename=original_filename)
                text = result["text"]
            except OcrEngineUnavailable:
                status = "needs_ocr_setup"
                note = ("This PDF appears to be scanned. Install the Tesseract application "
                        "(and PyMuPDF) to enable scanned-PDF OCR, or use a text-based PDF.")
            except OcrNoText:
                status = "needs_review"
                note = "No readable text was detected in this PDF."
            except OcrInvalidImage:
                status = "failed"
                note = "The PDF could not be read. It may be corrupt or password-protected."
            except OcrError:
                status = "failed"
                note = "The OCR engine could not process this PDF. Check the file and try again."
        elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"}:
            from .ocr_service import (
                OcrEngineUnavailable, OcrError, OcrInvalidImage, OcrNoText,
                extract_text,
            )
            try:
                result = extract_text(path.read_bytes(), filename=original_filename)
                text = result["text"]
            except OcrEngineUnavailable:
                status = "needs_ocr_setup"
                note = "Image saved, but OCR could not run. Install the Tesseract application and check TESSERACT_CMD."
            except OcrNoText:
                status = "needs_review"
                note = "No readable text was detected in this image."
            except OcrInvalidImage:
                status = "failed"
                note = "The image could not be read. It may be corrupt or in an unsupported format."
            except OcrError:
                status = "failed"
                note = "The OCR engine could not process this image. Check the file and try again."
        else:
            status = "failed"
            note = "Unsupported file type."
    except Exception as exc:
        status = "failed"
        note = f"Document processing failed ({type(exc).__name__}). Check the file and try again."

    cleaned = text.strip()
    title = Path(original_filename).stem[:255] or "Medical document"
    candidate = {
        "candidate_category": _guess_category(cleaned, original_filename),
        "candidate_title": title,
        "candidate_event_date": _first_date(cleaned),
        "text_preview": cleaned[:2500],
        "text_character_count": len(cleaned),
        "requires_patient_verification": True,
    }
    return {"text": cleaned, "candidate": candidate, "status": status, "note": note}
