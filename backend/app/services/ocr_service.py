"""Dedicated OCR service for extracting text from uploaded images and PDFs.

Design goals
------------
* Keep all OCR concerns (format checks, Tesseract wiring, error mapping) out of
  ``main.py`` so the request handlers stay thin.
* Never persist the image/PDF: the caller passes raw bytes and receives text. The
  document-upload endpoints are the only place that stores files.
* Fail with clear, typed errors instead of leaking raw exceptions, and never log
  the image contents or the recognised text (which may be private medical data).
* Handle two file shapes: plain images (OCR directly) and PDFs. A text-based PDF
  uses its embedded text layer; a scanned/image-only PDF (no usable text layer)
  is rasterised page-by-page and OCR'd, so scanned records still get a summary.

The heavy dependencies (``pytesseract``, ``Pillow``, ``pypdf``, ``PyMuPDF``) are
imported lazily where possible so the rest of the API keeps working even if they
are missing.
"""
from __future__ import annotations

import io
import logging
import os

logger = logging.getLogger(__name__)

# Image formats Pillow can open and that we accept for OCR. Kept separate from
# the document-upload allow-list, which also accepts text/PDF.
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"}

# Image MIME prefixes accepted as a secondary signal alongside the extension.
ALLOWED_IMAGE_CONTENT_TYPES = ("image/",)

# Hard cap on returned text so a pathological file cannot produce a huge body.
MAX_OCR_CHARACTERS = 50_000

# PDF support: a scanned (image-only) PDF has no usable text layer, so its pages
# are rasterised with PyMuPDF and each page image is run through Tesseract.
ALLOWED_PDF_EXTENSIONS = {".pdf"}

# Safety caps so a pathological PDF cannot exhaust memory or the request budget.
MAX_PDF_PAGES = 30
PDF_RENDER_DPI = 200

# A PDF text layer with fewer characters than this is treated as unusable (for
# example a scanned file that only carries a stray header), so OCR is used.
MIN_EMBEDDED_PDF_CHARS = 20

DEFAULT_LANGUAGE = "eng"


class OcrError(Exception):
    """Base class for OCR failures that map to a specific HTTP status."""

    status_code = 500

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class OcrUnsupportedFormat(OcrError):
    """The uploaded file is not an image we accept."""

    status_code = 415


class OcrInvalidImage(OcrError):
    """The bytes are not a readable image (corrupt, truncated, or empty)."""

    status_code = 422


class OcrEngineUnavailable(OcrError):
    """The Tesseract executable is not installed or not reachable."""

    status_code = 503


class OcrNoText(OcrError):
    """Tesseract ran but found no readable text in the image."""

    status_code = 422


def is_supported_image(filename: str | None) -> bool:
    """True when ``filename`` has an accepted image extension."""
    if not filename:
        return False
    suffix = os.path.splitext(filename)[1].lower()
    return suffix in ALLOWED_IMAGE_EXTENSIONS


def is_supported_pdf(filename: str | None) -> bool:
    """True when ``filename`` has an accepted PDF extension."""
    if not filename:
        return False
    suffix = os.path.splitext(filename)[1].lower()
    return suffix in ALLOWED_PDF_EXTENSIONS


def _configure_engine() -> None:
    """Point pytesseract at the configured executable, if one is set."""
    import pytesseract

    command = (os.getenv("TESSERACT_CMD") or "").strip()
    if command:
        pytesseract.pytesseract.tesseract_cmd = command


def _engine_available() -> bool:
    """Best-effort probe for a runnable Tesseract executable.

    Split out (and uncached) so it can be monkeypatched in tests and so a change
    to ``TESSERACT_CMD`` takes effect without a restart.
    """
    import pytesseract

    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:  # noqa: BLE001 - any failure means "not usable"
        return False


def _run_tesseract(image, language: str) -> str:
    """Run OCR on a decoded Pillow image. Isolated for easy testing."""
    import pytesseract

    return pytesseract.image_to_string(image, lang=language) or ""


def _decode_image(image_bytes: bytes):
    """Decode bytes into a Pillow image, raising ``OcrInvalidImage`` if unreadable."""
    from PIL import Image, UnidentifiedImageError

    if not image_bytes:
        raise OcrInvalidImage("The uploaded file is empty.", status_code=400)
    try:
        # First pass verifies integrity (detects truncated/corrupt files).
        with Image.open(io.BytesIO(image_bytes)) as probe:
            probe.verify()
        # ``verify`` leaves the image unusable, so reopen to actually decode it.
        with Image.open(io.BytesIO(image_bytes)) as source:
            image = source.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise OcrInvalidImage(
            "That file could not be read as an image. It may be corrupt, "
            "truncated, or in an unsupported format."
        ) from exc
    except OcrError:
        raise
    except Exception as exc:  # noqa: BLE001 - Pillow can raise several types
        raise OcrInvalidImage(
            "That file could not be read as an image. It may be corrupt or in "
            "an unsupported format."
        ) from exc
    return image


def extract_text(image_bytes: bytes, *, filename: str = "", language: str | None = None) -> dict:
    """Extract text from an image supplied as raw bytes.

    Returns a dict with ``text``, ``character_count``, ``line_count``,
    ``language`` and ``engine``. Raises an :class:`OcrError` subclass on failure.
    Nothing is written to disk and the image/text are never logged.
    """
    if filename and not is_supported_image(filename):
        raise OcrUnsupportedFormat(
            "Unsupported image type. Allowed: "
            + ", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS))
        )

    lang = (language or os.getenv("OCR_LANG") or DEFAULT_LANGUAGE).strip() or DEFAULT_LANGUAGE

    image = _decode_image(image_bytes)

    _configure_engine()
    if not _engine_available():
        raise OcrEngineUnavailable(
            "The OCR engine is not available on the server. Install the Tesseract "
            "application and set TESSERACT_CMD if it is not on PATH."
        )

    try:
        raw_text = _run_tesseract(image, lang)
    except OcrError:
        raise
    except Exception as exc:  # noqa: BLE001 - map every engine failure to a clear error
        # Log only the error itself; never the image bytes or recognised text.
        logger.warning("OCR engine failed: %s", _brief(exc))
        raise OcrError("The OCR engine could not read this image.", status_code=502) from exc

    text = (raw_text or "").strip()
    if not text:
        raise OcrNoText(
            "No readable text was detected in this image. Try a sharper, "
            "better-lit photo or a higher-resolution scan."
        )

    if len(text) > MAX_OCR_CHARACTERS:
        text = text[:MAX_OCR_CHARACTERS]

    return {
        "text": text,
        "character_count": len(text),
        "line_count": len([line for line in text.splitlines() if line.strip()]),
        "language": lang,
        "engine": "tesseract",
    }


def _pdf_text_layer(pdf_bytes: bytes) -> str:
    """Return the PDF's embedded (selectable) text, or "" when there is none.

    Raises :class:`OcrInvalidImage` for a corrupt or password-protected file.
    """
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:  # noqa: BLE001 - any failure means "locked"
                raise OcrInvalidImage(
                    "This PDF is password-protected and cannot be read."
                ) from exc
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except OcrError:
        raise
    except Exception as exc:  # noqa: BLE001 - pypdf raises several types
        raise OcrInvalidImage(
            "That PDF could not be read. It may be corrupt, truncated, or damaged."
        ) from exc


def _render_pdf_pages(pdf_bytes: bytes, max_pages: int) -> list:
    """Rasterise up to ``max_pages`` PDF pages into Pillow images.

    Isolated so tests can stub rendering without PyMuPDF installed.
    """
    try:
        import pymupdf  # PyMuPDF >= 1.24 exposes this name
    except Exception:  # noqa: BLE001 - fall back to the legacy alias
        try:
            import fitz as pymupdf  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise OcrEngineUnavailable(
                "Scanned-PDF OCR requires the PyMuPDF package. Install it with "
                "'pip install PyMuPDF'."
            ) from exc

    from PIL import Image

    try:
        document = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise OcrInvalidImage(
            "That PDF could not be read. It may be corrupt or damaged."
        ) from exc

    images: list = []
    try:
        if getattr(document, "needs_pass", False):
            raise OcrInvalidImage("This PDF is password-protected and cannot be read.")
        for index, page in enumerate(document):
            if index >= max_pages:
                break
            pixmap = page.get_pixmap(dpi=PDF_RENDER_DPI)
            images.append(Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB"))
    finally:
        document.close()
    return images


def extract_text_from_pdf(
    pdf_bytes: bytes,
    *,
    filename: str = "",
    language: str | None = None,
    max_pages: int = MAX_PDF_PAGES,
) -> dict:
    """Extract text from a PDF supplied as raw bytes.

    Prefers the embedded text layer (fast, and works without Tesseract). When the
    PDF is scanned/image-only, its pages are rasterised and OCR'd instead. Returns
    the same shape as :func:`extract_text`; raises an :class:`OcrError` on failure.
    Nothing is written to disk and the PDF/text are never logged.
    """
    if filename and not is_supported_pdf(filename):
        raise OcrUnsupportedFormat(
            "Unsupported file type. Accepted PDF extension: "
            + ", ".join(sorted(ALLOWED_PDF_EXTENSIONS))
        )
    if not pdf_bytes:
        raise OcrInvalidImage("The uploaded file is empty.", status_code=400)

    lang = (language or os.getenv("OCR_LANG") or DEFAULT_LANGUAGE).strip() or DEFAULT_LANGUAGE

    embedded = _pdf_text_layer(pdf_bytes).strip()
    if len(embedded) >= MIN_EMBEDDED_PDF_CHARS:
        text = embedded[:MAX_OCR_CHARACTERS]
        return {
            "text": text,
            "character_count": len(text),
            "line_count": len([line for line in text.splitlines() if line.strip()]),
            "language": "text layer",
            "engine": "pypdf",
        }

    # No usable text layer: this is (at least partly) a scanned PDF. OCR it.
    _configure_engine()
    if not _engine_available():
        raise OcrEngineUnavailable(
            "This PDF appears to be scanned. Install the Tesseract application and "
            "set TESSERACT_CMD if it is not on PATH to enable scanned-PDF OCR."
        )

    images = _render_pdf_pages(pdf_bytes, max_pages)
    if not images:
        raise OcrNoText("This PDF has no pages with readable text.")

    page_texts: list[str] = []
    try:
        for image in images:
            page_text = (_run_tesseract(image, lang) or "").strip()
            if page_text:
                page_texts.append(page_text)
    except OcrError:
        raise
    except Exception as exc:  # noqa: BLE001 - map every engine failure to a clear error
        logger.warning("OCR engine failed on PDF: %s", _brief(exc))
        raise OcrError("The OCR engine could not read this PDF.", status_code=502) from exc

    text = "\n\n".join(page_texts).strip()
    if not text:
        raise OcrNoText(
            "No readable text was detected in this PDF. Try a clearer scan or a "
            "higher-resolution file."
        )
    if len(text) > MAX_OCR_CHARACTERS:
        text = text[:MAX_OCR_CHARACTERS]

    return {
        "text": text,
        "character_count": len(text),
        "line_count": len([line for line in text.splitlines() if line.strip()]),
        "language": lang,
        "engine": "tesseract",
        "page_count": len(images),
        "pages_with_text": len(page_texts),
    }


def _brief(exc: Exception) -> str:
    return " ".join(str(exc).split())[:160]
