"""End-to-end smoke tests. Run from the backend folder with `pytest -q`.

Email verification was removed from the application, so registration
creates a usable account immediately and login succeeds without any
verification step. The suite never contacts an email provider.
"""
import os
import uuid

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_lost_in_transit.db")
os.environ.setdefault("STORAGE_DIR", "./test_storage")
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-change-this")
os.environ.setdefault("NODE_ENV", "test")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _offline_llm(monkeypatch):
    """Keep the suite offline by forcing the deterministic local summary fallback."""
    for variable in (
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "OPENAI_BASE_URL",
        "LLM_API_KEY",
        "LLM_MODEL",
    ):
        monkeypatch.delenv(variable, raising=False)


def _register(
    email: str, password: str = "this-is-a-demo-password", name: str = "Demo Patient"
):
    return client.post(
        "/auth/register", json={"name": name, "email": email, "password": password}
    )


def _login(email: str, password: str = "this-is-a-demo-password"):
    return client.post("/auth/login", json={"email": email, "password": password})


def _register_and_login(suffix: str) -> tuple[str, dict]:
    """Register a new patient and log in immediately (no email verification)."""
    email = f"demo-{suffix}@example.com"
    registration = _register(email)
    assert registration.status_code == 201, registration.text
    # Registration does NOT issue an access token; login does.
    assert "access_token" not in registration.json()

    # Login works right away: no email verification is required.
    login = _login(email)
    assert login.status_code == 200, login.text
    return login.json()["access_token"], login.json()["user"]


def test_patient_document_summary_and_guest_revocation_flow():
    suffix = uuid.uuid4().hex[:10]
    patient_token, user = _register_and_login(suffix)
    patient_headers = {"Authorization": f"Bearer {patient_token}"}

    me = client.get("/auth/me", headers=patient_headers)
    assert me.status_code == 200, me.text
    assert me.json()["email"] == f"demo-{suffix}@example.com"

    # Profile name update.
    patched = client.patch("/auth/me", headers=patient_headers, json={"name": "Renamed Patient"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Renamed Patient"
    client.patch("/auth/me", headers=patient_headers, json={"name": "Demo Patient"})

    upload = client.post(
        "/documents/upload", headers=patient_headers,
        files={"file": ("synthetic_prescription.txt", b"Synthetic prescription\nDate: 2026-08-12\nMedicine: Demo medicine", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    document_id = upload.json()["document_id"]

    extraction = client.get(f"/documents/{document_id}/extraction", headers=patient_headers)
    assert extraction.status_code == 200
    assert extraction.json()["candidate_fields"]["candidate_event_date"] == "2026-08-12"

    verify = client.post(f"/documents/{document_id}/verify", headers=patient_headers, json={"records": [{
        "category": "medication", "title": "Demo medicine", "event_date": "2026-08-12",
        "details": "Synthetic demo entry only."
    }]})
    assert verify.status_code == 201, verify.text
    record_id = verify.json()["created_records"][0]["record_id"]

    timeline = client.get("/timeline", headers=patient_headers)
    assert timeline.status_code == 200
    assert any(r["record_id"] == record_id for r in timeline.json()["records"])
    alerts = client.get("/records/alerts", headers=patient_headers)
    assert alerts.status_code == 200, alerts.text

    summary = client.post("/summary/generate", headers=patient_headers, json={})
    assert summary.status_code == 201, summary.text
    assert summary.json()["model_used"] == "local-fallback-no-llm"
    assert record_id in summary.json()["source_record_ids"]

    share = client.post("/sharing/create", headers=patient_headers, json={
        "record_ids": [record_id], "expires_in_hours": 24
    })
    assert share.status_code == 201, share.text
    shared = share.json()
    token = shared["share_token"]

    pin_check = client.post(f"/sharing/access/{token}/verify-pin", json={"pin": shared["access_pin"]})
    assert pin_check.status_code == 200, pin_check.text
    guest_headers = {"Authorization": f"Bearer {pin_check.json()['guest_access_token']}"}
    guest_records = client.get(f"/sharing/access/{token}/records", headers=guest_headers)
    assert guest_records.status_code == 200, guest_records.text
    assert [r["record_id"] for r in guest_records.json()["records"]] == [record_id]

    # Guests can open the original file for a shared record.
    guest_file = client.get(
        f"/sharing/access/{token}/documents/{document_id}/file", headers=guest_headers
    )
    assert guest_file.status_code == 200, guest_file.text

    # Guests cannot open a file that is not part of the share.
    guest_file_denied = client.get(
        f"/sharing/access/{token}/documents/999999/file", headers=guest_headers
    )
    assert guest_file_denied.status_code == 404, guest_file_denied.text

    revoke = client.post(f"/sharing/{shared['share_id']}/revoke", headers=patient_headers)
    assert revoke.status_code == 200
    denied = client.get("/sharing/access/{}/records".format(token), headers=guest_headers)
    assert denied.status_code == 410

    # Record deletion removes the record.
    deleted = client.delete(f"/records/{record_id}", headers=patient_headers)
    assert deleted.status_code == 200, deleted.text
    after = client.get("/timeline", headers=patient_headers)
    assert all(r["record_id"] != record_id for r in after.json()["records"])

    # Document deletion removes the document and its stored file.
    deleted_doc = client.delete(f"/documents/{document_id}", headers=patient_headers)
    assert deleted_doc.status_code == 200, deleted_doc.text
    doc_file = client.get(f"/documents/{document_id}/file", headers=patient_headers)
    assert doc_file.status_code == 404, doc_file.text


def test_summary_can_be_deleted_by_its_owner_only():
    suffix = uuid.uuid4().hex[:10]
    patient_token, _ = _register_and_login(suffix)
    headers = {"Authorization": f"Bearer {patient_token}"}

    upload = client.post(
        "/documents/upload", headers=headers,
        files={"file": (f"summary-{suffix}.txt", b"Visit note\nDate: 2026-08-01\nFollow-up planned", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    document_id = upload.json()["document_id"]
    verify = client.post(f"/documents/{document_id}/verify", headers=headers, json={"records": [{
        "category": "visit", "title": "Follow-up visit", "event_date": "2026-08-01",
        "details": "Synthetic visit note."
    }]})
    assert verify.status_code == 201, verify.text

    created = client.post("/summary/generate", headers=headers, json={})
    assert created.status_code == 201, created.text
    summary_id = created.json()["summary_id"]

    history = client.get("/summary/history", headers=headers)
    assert history.status_code == 200, history.text
    assert any(entry["summary_id"] == summary_id for entry in history.json())

    # A different patient cannot delete another patient's summary.
    other_token, _ = _register_and_login(uuid.uuid4().hex[:10])
    other_headers = {"Authorization": f"Bearer {other_token}"}
    forbidden = client.delete(f"/summary/{summary_id}", headers=other_headers)
    assert forbidden.status_code == 404, forbidden.text

    # The owner can delete it, and it disappears from their history.
    deleted = client.delete(f"/summary/{summary_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["summary_id"] == summary_id

    after = client.get("/summary/history", headers=headers)
    assert all(entry["summary_id"] != summary_id for entry in after.json())

    # Deleting it again is a clean 404.
    again = client.delete(f"/summary/{summary_id}", headers=headers)
    assert again.status_code == 404, again.text


def test_share_link_can_be_deleted_by_its_owner_only():
    suffix = uuid.uuid4().hex[:10]
    patient_token, _ = _register_and_login(suffix)
    headers = {"Authorization": f"Bearer {patient_token}"}
    upload = client.post(
        "/documents/upload", headers=headers,
        files={"file": (f"share-{suffix}.txt", b"Lab result\nDate: 2026-08-02\nCholesterol within range", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    document_id = upload.json()["document_id"]
    verify = client.post(f"/documents/{document_id}/verify", headers=headers, json={"records": [{
        "category": "lab_result", "title": "Lab result", "event_date": "2026-08-02",
        "details": "Synthetic lab entry only."
    }]})
    assert verify.status_code == 201, verify.text
    record_id = verify.json()["created_records"][0]["record_id"]

    share = client.post("/sharing/create", headers=headers, json={
        "record_ids": [record_id], "expires_in_hours": 24
    })
    assert share.status_code == 201, share.text
    shared = share.json()
    share_id = shared["share_id"]
    token = shared["share_token"]

    # Another patient cannot delete this share.
    other_token, _ = _register_and_login(uuid.uuid4().hex[:10])
    forbidden = client.delete(
        f"/sharing/{share_id}", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert forbidden.status_code == 404, forbidden.text

    # It is present in the owner's list before deletion.
    before = client.get("/sharing/my-links", headers=headers)
    assert before.status_code == 200, before.text
    assert any(s["share_id"] == share_id for s in before.json())

    # The owner deletes it.
    deleted = client.delete(f"/sharing/{share_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["share_id"] == share_id

    # It is gone from the list, and the guest link no longer resolves.
    after = client.get("/sharing/my-links", headers=headers)
    assert all(s["share_id"] != share_id for s in after.json())
    gone = client.post(f"/sharing/access/{token}/verify-pin", json={"pin": shared["access_pin"]})
    assert gone.status_code == 404, gone.text

    # Deleting it again is a clean 404.
    again = client.delete(f"/sharing/{share_id}", headers=headers)
    assert again.status_code == 404, again.text


def test_wrong_pin_is_rejected_and_rate_limited():
    suffix = uuid.uuid4().hex[:10]
    patient_token, _ = _register_and_login(suffix)
    patient_headers = {"Authorization": f"Bearer {patient_token}"}
    upload = client.post(
        "/documents/upload", headers=patient_headers,
        files={"file": (f"note-{suffix}.txt", b"Visit note\nDate: 2026-08-01\nFollow-up planned", "text/plain")},
    )
    document_id = upload.json()["document_id"]
    client.post(f"/documents/{document_id}/verify", headers=patient_headers, json={"records": [{
        "category": "visit", "title": "Follow-up visit", "event_date": "2026-08-01",
        "details": "Synthetic visit note."
    }]})
    records = client.get("/records", headers=patient_headers).json()
    record_id = records[0]["record_id"]
    share = client.post("/sharing/create", headers=patient_headers, json={
        "record_ids": [record_id], "expires_in_hours": 1
    })
    token = share.json()["share_token"]

    for _ in range(5):
        wrong = client.post(f"/sharing/access/{token}/verify-pin", json={"pin": "000000"})
        assert wrong.status_code == 401, wrong.text
    # Sixth attempt is rate-limited for 15 minutes.
    locked = client.post(f"/sharing/access/{token}/verify-pin", json={"pin": "000000"})
    assert locked.status_code == 429, locked.text


# -------------------- REGISTRATION / LOGIN --------------------

def test_registration_creates_usable_account_immediately():
    email = f"fresh-{uuid.uuid4().hex[:10]}@example.com"
    response = _register(email)
    assert response.status_code == 201, response.text
    body = response.json()
    # No verification fields or dev links are returned any more.
    assert "verification_email_sent" not in body
    assert "dev_verification_url" not in body
    assert body["message"]

    # A brand-new account can log in without any verification step.
    login = _login(email)
    assert login.status_code == 200, login.text
    assert login.json()["access_token"]


def test_duplicate_registration_is_rejected():
    email = f"dup-{uuid.uuid4().hex[:10]}@example.com"
    assert _register(email).status_code == 201
    duplicate = _register(email)
    assert duplicate.status_code == 409, duplicate.text


def test_wrong_password_is_rejected():
    email = f"pw-{uuid.uuid4().hex[:10]}@example.com"
    assert _register(email, password="the-original-password").status_code == 201
    wrong = _login(email, password="the-wrong-password")
    assert wrong.status_code == 401, wrong.text


def test_removed_verification_endpoints_are_gone():
    suffix = uuid.uuid4().hex[:10]
    registration = _register(f"gone-{suffix}@example.com")
    assert registration.status_code == 201, registration.text
    assert "dev_verification_url" not in registration.json()

    # The verification endpoints no longer exist at all.
    verify = client.get("/auth/verify-email", params={"token": "anything"})
    assert verify.status_code == 404, verify.text
    resend = client.post("/auth/resend-verification", json={"email": f"gone-{suffix}@example.com"})
    assert resend.status_code == 404, resend.text


def test_protected_endpoints_still_require_authentication():
    # Without a token these routes must reject as before.
    for path in ("/auth/me", "/records", "/timeline", "/documents", "/audit-logs"):
        response = client.get(path)
        assert response.status_code == 401, (path, response.status_code)

    # Garbage tokens are still rejected.
    bogus = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert bogus.status_code == 401, bogus.status_code


def test_existing_accounts_can_log_in_without_verification():
    """Accounts already stored in the database keep working with no verification."""
    import sqlite3

    from app.database import DATABASE_URL

    db_path = DATABASE_URL.split("///")[-1]
    email = f"legacy-{uuid.uuid4().hex[:10]}@example.com"
    password = "this-is-a-demo-password"

    # Insert a row directly, simulating an account that predates this change.
    from app.security import hash_secret

    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            "INSERT INTO users (name, email, password_hash, created_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            ("Legacy Patient", email, hash_secret(password)),
        )
        connection.commit()
    finally:
        connection.close()

    login = _login(email, password)
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == email


def test_verification_columns_are_removed_from_the_schema():
    """The obsolete email-verification columns must no longer exist."""
    import sqlite3

    from app.database import DATABASE_URL

    db_path = DATABASE_URL.split("///")[-1]
    connection = sqlite3.connect(db_path)
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    finally:
        connection.close()
    legacy = {
        "email_verified",
        "email_verification_token",
        "email_verification_token_expires_at",
        "verification_email_sent_at",
    }
    assert not (legacy & columns), f"verification columns still present: {legacy & columns}"


# -------------------- OCR IMAGE TEXT EXTRACTION --------------------

def _png_bytes(size=(60, 30)) -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, (255, 255, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


def _ocr_success(monkeypatch, text="Blood test result\nHemoglobin 13.5\nDate 2026-08-01"):
    from app.services import ocr_service

    monkeypatch.setattr(ocr_service, "_engine_available", lambda: True)
    monkeypatch.setattr(ocr_service, "_run_tesseract", lambda image, language: text)


def test_extract_text_requires_authentication():
    response = client.post(
        "/documents/extract-text",
        files={"file": ("scan.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 401, response.text


def test_extract_text_success_and_optional_summary(monkeypatch):
    _ocr_success(monkeypatch)
    token, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("scan.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "Hemoglobin 13.5" in body["text"]
    assert body["engine"] == "tesseract"
    assert body["character_count"] > 0
    assert body["filename"] == "scan.png"

    # OCR is stateless: no document was stored for this patient.
    documents = client.get("/documents", headers=headers)
    assert all(d["filename"] != "scan.png" for d in documents.json())

    # The extracted text can be summarized through the separate endpoint.
    summary = client.post(
        "/summary/from-text", headers=headers,
        json={"text": body["text"], "title": "Scan"},
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["summary_text"]
    assert summary.json()["model_used"] == "local-fallback-no-llm"


def test_extract_text_rejects_bad_uploads(monkeypatch):
    token, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers = {"Authorization": f"Bearer {token}"}

    unsupported = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert unsupported.status_code == 415, unsupported.text

    empty = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("scan.png", b"", "image/png")},
    )
    assert empty.status_code == 400, empty.text

    unreadable = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("scan.png", b"not-an-image", "image/png")},
    )
    assert unreadable.status_code == 422, unreadable.text

    import app.main as main

    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 10)
    oversized = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("scan.png", _png_bytes(), "image/png")},
    )
    assert oversized.status_code == 413, oversized.text


def test_extract_text_reports_missing_engine(monkeypatch):
    from app.services import ocr_service

    monkeypatch.setattr(ocr_service, "_engine_available", lambda: False)
    token, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("scan.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 503, response.text


def _scanned_pdf_ocr(monkeypatch, text="Scanned report: Hemoglobin 13.5 g/dL Date 2026-08-01"):
    """Make any PDF look scanned and stub rendering + OCR (no Tesseract needed)."""
    from app.services import ocr_service

    monkeypatch.setattr(ocr_service, "_pdf_text_layer", lambda b: "")
    monkeypatch.setattr(ocr_service, "_render_pdf_pages", lambda b, m: [object()])
    monkeypatch.setattr(ocr_service, "_engine_available", lambda: True)
    monkeypatch.setattr(ocr_service, "_run_tesseract", lambda image, language: text)


def test_extract_text_from_scanned_pdf(monkeypatch):
    _scanned_pdf_ocr(monkeypatch)
    token, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/documents/extract-text", headers=headers,
        files={"file": ("scan.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["engine"] == "tesseract"
    assert body["page_count"] == 1
    assert "Hemoglobin 13.5" in body["text"]

    # Still stateless: nothing was saved.
    documents = client.get("/documents", headers=headers)
    assert all(d["filename"] != "scan.pdf" for d in documents.json())


def test_upload_scanned_pdf_extracts_text_for_summary(monkeypatch):
    """A scanned PDF upload must yield text so its summary is not sparse."""
    _scanned_pdf_ocr(monkeypatch)
    token, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers = {"Authorization": f"Bearer {token}"}

    upload = client.post(
        "/documents/upload", headers=headers,
        files={"file": ("scanned-report.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["status"] == "processed", upload.json()
    document_id = upload.json()["document_id"]

    extraction = client.get(f"/documents/{document_id}/extraction", headers=headers)
    assert extraction.status_code == 200, extraction.text
    assert "Hemoglobin 13.5" in extraction.json()["extracted_text"]

    verify = client.post(f"/documents/{document_id}/verify", headers=headers, json={"records": [{
        "category": "lab_result", "title": "Scanned blood test", "event_date": "2026-08-01",
        "details": extraction.json()["extracted_text"],
    }]})
    assert verify.status_code == 201, verify.text

    summary = client.post("/summary/generate", headers=headers, json={})
    assert summary.status_code == 201, summary.text
    assert "Hemoglobin 13.5" in summary.json()["summary_text"]


def test_upload_accepts_previously_missing_image_formats(monkeypatch):
    """bmp/tif/tiff/gif are now accepted by the upload allow-list."""
    from app.services import ocr_service

    monkeypatch.setattr(ocr_service, "_engine_available", lambda: True)
    monkeypatch.setattr(ocr_service, "_run_tesseract", lambda image, language: "Blood pressure 120/80")
    token, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/documents/upload", headers=headers,
        files={"file": ("scan.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "processed"


def test_patient_cannot_read_another_patients_document():
    token_a, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers_a = {"Authorization": f"Bearer {token_a}"}
    upload = client.post(
        "/documents/upload", headers=headers_a,
        files={"file": ("private-note.txt", b"Private synthetic note", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    document_id = upload.json()["document_id"]

    token_b, _ = _register_and_login(uuid.uuid4().hex[:10])
    headers_b = {"Authorization": f"Bearer {token_b}"}
    assert client.get(f"/documents/{document_id}/extraction", headers=headers_b).status_code == 404
    assert client.get(f"/documents/{document_id}/file", headers=headers_b).status_code == 404
