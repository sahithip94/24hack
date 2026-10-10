"""Unit tests for the OCR service (no Tesseract binary required).

A real Tesseract executable may not be installed on the machine running the
tests, so the engine probe and the Tesseract call are monkeypatched. Pillow is
used for real, which exercises the actual image-decoding path.
"""
import io

import pytest
from PIL import Image

from app.services import ocr_service


def _png_bytes(size=(60, 30)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (255, 255, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


def _force_engine(monkeypatch) -> None:
    monkeypatch.setattr(ocr_service, "_engine_available", lambda: True)


def test_extract_text_returns_recognised_text(monkeypatch):
    _force_engine(monkeypatch)
    monkeypatch.setattr(
        ocr_service, "_run_tesseract",
        lambda image, language: "Patient: Jane Doe\nBP 120/80\n",
    )
    result = ocr_service.extract_text(_png_bytes(), filename="scan.png")
    assert result["text"] == "Patient: Jane Doe\nBP 120/80"
    assert result["character_count"] == len(result["text"])
    assert result["line_count"] == 2
    assert result["engine"] == "tesseract"
    assert result["language"] == "eng"


def test_extract_text_rejects_unreadable_image():
    with pytest.raises(ocr_service.OcrInvalidImage) as excinfo:
        ocr_service.extract_text(b"this is definitely not an image", filename="scan.png")
    assert excinfo.value.status_code == 422


def test_extract_text_rejects_empty_bytes():
    with pytest.raises(ocr_service.OcrInvalidImage) as excinfo:
        ocr_service.extract_text(b"", filename="scan.png")
    assert excinfo.value.status_code == 400


def test_extract_text_flags_blank_image(monkeypatch):
    _force_engine(monkeypatch)
    monkeypatch.setattr(ocr_service, "_run_tesseract", lambda image, language: "  \n   ")
    with pytest.raises(ocr_service.OcrNoText) as excinfo:
        ocr_service.extract_text(_png_bytes(), filename="scan.png")
    assert excinfo.value.status_code == 422


def test_extract_text_reports_missing_engine(monkeypatch):
    monkeypatch.setattr(ocr_service, "_engine_available", lambda: False)
    with pytest.raises(ocr_service.OcrEngineUnavailable) as excinfo:
        ocr_service.extract_text(_png_bytes(), filename="scan.png")
    assert excinfo.value.status_code == 503


def test_extract_text_wraps_engine_errors(monkeypatch):
    _force_engine(monkeypatch)

    def boom(image, language):
        raise RuntimeError("tesseract exploded")

    monkeypatch.setattr(ocr_service, "_run_tesseract", boom)
    with pytest.raises(ocr_service.OcrError) as excinfo:
        ocr_service.extract_text(_png_bytes(), filename="scan.png")
    assert excinfo.value.status_code == 502


def test_unsupported_extension_is_rejected():
    assert ocr_service.is_supported_image("notes.txt") is False
    assert ocr_service.is_supported_image("photo.jpeg") is True
    assert ocr_service.is_supported_image(None) is False
    with pytest.raises(ocr_service.OcrUnsupportedFormat) as excinfo:
        ocr_service.extract_text(_png_bytes(), filename="notes.pdf")
    assert excinfo.value.status_code == 415


# -------------------- SCANNED PDF OCR --------------------

def _force_scanned_pdf(monkeypatch, page_text="Scanned lab sheet\nHemoglobin 13.5 g/dL"):
    """Make a PDF look scanned (no text layer) and stub rendering + OCR."""
    _force_engine(monkeypatch)
    monkeypatch.setattr(ocr_service, "_pdf_text_layer", lambda b: "")
    monkeypatch.setattr(ocr_service, "_render_pdf_pages", lambda b, m: [object(), object()])
    monkeypatch.setattr(ocr_service, "_run_tesseract", lambda image, language: page_text)


def test_is_supported_pdf():
    assert ocr_service.is_supported_pdf("report.pdf") is True
    assert ocr_service.is_supported_pdf("report.PDF") is True
    assert ocr_service.is_supported_pdf("scan.png") is False
    assert ocr_service.is_supported_pdf(None) is False


def test_extract_text_from_pdf_ocrs_scanned_pages(monkeypatch):
    _force_scanned_pdf(monkeypatch)
    result = ocr_service.extract_text_from_pdf(b"%PDF-1.4 fake", filename="scan.pdf")
    assert result["engine"] == "tesseract"
    assert result["page_count"] == 2
    # Two pages of identical text are joined with a blank line.
    assert result["text"].count("Hemoglobin 13.5 g/dL") == 2
    assert result["character_count"] == len(result["text"])


def test_extract_text_from_pdf_prefers_embedded_text_layer(monkeypatch):
    monkeypatch.setattr(
        ocr_service, "_pdf_text_layer",
        lambda b: "Discharge summary 2026-08-01: synthetic text layer content.",
    )

    def _should_not_render(*_args, **_kwargs):
        raise AssertionError("rendering should not run when a text layer exists")

    monkeypatch.setattr(ocr_service, "_render_pdf_pages", _should_not_render)
    result = ocr_service.extract_text_from_pdf(b"%PDF-1.4 fake", filename="report.pdf")
    assert result["engine"] == "pypdf"
    assert "Discharge summary" in result["text"]


def test_extract_text_from_pdf_reports_missing_engine(monkeypatch):
    monkeypatch.setattr(ocr_service, "_pdf_text_layer", lambda b: "")
    monkeypatch.setattr(ocr_service, "_engine_available", lambda: False)
    with pytest.raises(ocr_service.OcrEngineUnavailable) as excinfo:
        ocr_service.extract_text_from_pdf(b"%PDF-1.4 fake", filename="scan.pdf")
    assert excinfo.value.status_code == 503


def test_extract_text_from_pdf_flags_no_text(monkeypatch):
    _force_scanned_pdf(monkeypatch, page_text="   \n  ")
    with pytest.raises(ocr_service.OcrNoText) as excinfo:
        ocr_service.extract_text_from_pdf(b"%PDF-1.4 fake", filename="scan.pdf")
    assert excinfo.value.status_code == 422


def test_extract_text_from_pdf_rejects_non_pdf_extension():
    with pytest.raises(ocr_service.OcrUnsupportedFormat) as excinfo:
        ocr_service.extract_text_from_pdf(b"%PDF-1.4 fake", filename="scan.png")
    assert excinfo.value.status_code == 415


def test_extract_text_from_pdf_rejects_empty_bytes():
    with pytest.raises(ocr_service.OcrInvalidImage) as excinfo:
        ocr_service.extract_text_from_pdf(b"", filename="scan.pdf")
    assert excinfo.value.status_code == 400


def test_extract_text_from_pdf_rejects_corrupt_bytes():
    with pytest.raises(ocr_service.OcrInvalidImage) as excinfo:
        ocr_service.extract_text_from_pdf(b"this is not a pdf at all", filename="scan.pdf")
    assert excinfo.value.status_code == 422


def test_render_pdf_pages_reads_a_real_pdf():
    """Real rendering (skipped when PyMuPDF is unavailable)."""
    pymupdf = pytest.importorskip("pymupdf")
    document = pymupdf.open()
    page = document.new_page(width=200, height=120)
    page.draw_rect(pymupdf.Rect(10, 10, 190, 110), color=(0, 0, 0))
    pdf_bytes = document.tobytes()
    document.close()

    images = ocr_service._render_pdf_pages(pdf_bytes, 5)
    assert len(images) == 1
    assert images[0].size[0] > 0 and images[0].size[1] > 0


def test_extract_text_from_pdf_uses_real_text_layer():
    """A real text-based PDF is read from its embedded text layer."""
    pymupdf = pytest.importorskip("pymupdf")
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "Hemoglobin 13.5 g/dL recorded on 2026-08-01.")
    pdf_bytes = document.tobytes()
    document.close()

    result = ocr_service.extract_text_from_pdf(pdf_bytes, filename="report.pdf")
    assert result["engine"] == "pypdf"
    assert "Hemoglobin 13.5" in result["text"]
