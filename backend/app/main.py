import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload

load_dotenv()

from .database import Base, engine, ensure_schema, get_db
from .models import AuditLog, Document, MedicalRecord, ShareLink, Summary, User
from .schemas import (
    CreateRecordRequest, LoginRequest, RecordInput, RecordUpdate,
    RegisterRequest, ShareCreateRequest,
    SummaryFromTextRequest, SummaryGenerateRequest, TokenResponse,
    UpdateMeRequest, UserResponse, VerifyDocumentRequest,
    VerifyPinRequest, RegisterResponse,
)
from .security import (
    create_signed_token, decode_signed_token, get_current_user,
    get_guest_claims, hash_secret, hash_share_token,
    verify_secret,
)
from .services import ocr_service
from .services.document_processing import process_document
from .services.email_service import get_frontend_url
from .services.summary_service import generate_summary

Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(
    title="Lost in Transit API",
    description=(
        "Patient-controlled medical record organizer with document extraction, timeline, "
        "source-grounded summaries and restricted Guest Access. Hackathon prototype; use synthetic data."
    ),
    version="0.1.0",
)

origins = [
    x.strip()
    for x in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174"
    ).split(",")
    if x.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"}
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage")).resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
ACCESS_TOKEN_SECONDS = max(5, int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))) * 60


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def audit(db: Session, patient_id: int, action: str, resource_type: str,
          resource_id: int | str | None = None, actor_user_id: int | None = None,
          details: str | None = None) -> None:
    db.add(AuditLog(
        patient_id=patient_id, actor_user_id=actor_user_id,
        action=action, resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details, timestamp=utcnow(),
    ))


def owned_document(db: Session, patient_id: int, document_id: int) -> Document:
    doc = db.query(Document).filter(Document.id == document_id, Document.patient_id == patient_id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def owned_record(db: Session, patient_id: int, record_id: int) -> MedicalRecord:
    record = db.query(MedicalRecord).filter(MedicalRecord.id == record_id, MedicalRecord.patient_id == patient_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Medical record not found")
    return record


def active_share(db: Session, raw_token: str) -> ShareLink:
    token_hash = hash_share_token(raw_token)
    share = db.query(ShareLink).options(selectinload(ShareLink.records)).filter(ShareLink.token_hash == token_hash).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Sharing link not found or invalid")
    if share.revoked_at is not None:
        raise HTTPException(status_code=410, detail="This sharing link has been revoked")
    if share.expires_at <= utcnow():
        raise HTTPException(status_code=410, detail="This sharing link has expired")
    return share


@app.get("/")
def root():
    return {"name": "Lost in Transit API", "status": "running", "docs": "/docs", "note": "Use synthetic medical data for the prototype."}

@app.get("/health")
def health():
    return {"status": "ok"}


# -------------------- AUTHENTICATION --------------------


@app.post("/auth/register", response_model=RegisterResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_secret(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit(db, user.id, "patient_registered", "user", user.id, actor_user_id=user.id)

    # The account is usable immediately: no email verification is
    # required, so the user can log in right away.
    return RegisterResponse(
        user=user,
        message="Account created. You can now log in with your email and password.",
    )


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_secret(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    audit(db, user.id, "patient_login", "user", user.id, actor_user_id=user.id)
    db.commit()
    token = create_signed_token({"sub": str(user.id), "typ": "patient"}, ACCESS_TOKEN_SECONDS)
    return {"access_token": token, "token_type": "bearer", "expires_in_seconds": ACCESS_TOKEN_SECONDS, "user": user}


@app.get("/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


@app.patch("/auth/me", response_model=UserResponse)
def update_me(payload: UpdateMeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.name = payload.name.strip()
    audit(db, user.id, "profile_updated", "user", user.id, actor_user_id=user.id)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/logout")
def logout(user: User = Depends(get_current_user)):
    # Bearer tokens are stateless. The frontend must delete its token; server-side immediate
    # invalidation requires a token denylist or database-backed sessions.
    return {"message": "Logged out on this client. Delete the stored access token."}


# -------------------- DOCUMENTS / OCR --------------------
@app.post("/documents/upload", status_code=201)
def upload_document(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    original_name = Path(file.filename or "upload").name
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit")
    # A safe random storage name means the original filename is never used as a filesystem path.
    stored_name = uuid4().hex + suffix
    destination = STORAGE_DIR / stored_name
    try:
        destination.write_bytes(content)
        processed = process_document(str(destination), original_name)
        doc = Document(
            patient_id=user.id,
            original_filename=original_name[:255],
            stored_filename=stored_name,
            content_type=file.content_type or "application/octet-stream",
            storage_path=str(destination),
            status=processed["status"],
            extracted_text=processed["text"],
            extraction_result=processed["candidate"],
            processing_note=processed["note"],
        )
        db.add(doc)
        db.flush()
        audit(db, user.id, "document_uploaded", "document", doc.id, actor_user_id=user.id)
        db.commit()
        db.refresh(doc)
        return {
            "document_id": doc.id,
            "filename": doc.original_filename,
            "status": doc.status,
            "processing_note": doc.processing_note,
            "message": "Document saved. Review the extracted information before confirming it as a medical record.",
        }
    except HTTPException:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise
    except Exception as exc:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Upload failed ({type(exc).__name__})") from exc

@app.post("/documents/extract-text")
def extract_text_from_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run OCR on an uploaded image or PDF and return the text without saving anything.

    Stateless on purpose: the file is processed in memory and no document or
    record is created, so there is nothing that could expose another patient's
    files. The existing ``/documents/{id}`` routes keep their ownership checks.
    """
    original_name = Path(file.filename or "upload").name
    is_pdf = ocr_service.is_supported_pdf(original_name)
    if not (ocr_service.is_supported_image(original_name) or is_pdf):
        allowed = ", ".join(
            sorted(ocr_service.ALLOWED_IMAGE_EXTENSIONS | ocr_service.ALLOWED_PDF_EXTENSIONS)
        )
        raise HTTPException(status_code=415, detail=f"Unsupported file type. Allowed extensions: {allowed}")
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit")
    try:
        if is_pdf:
            result = ocr_service.extract_text_from_pdf(content, filename=original_name)
        else:
            result = ocr_service.extract_text(content, filename=original_name)
    except ocr_service.OcrError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    # Record only that an extraction happened and how large it was - never the text.
    audit(db, user.id, "image_text_extracted", "ocr", actor_user_id=user.id,
          details=f"character_count={result['character_count']}")
    db.commit()
    return {
        **result,
        "filename": original_name,
        "notice": "OCR output is unverified. Review and correct the text before using it.",
    }

@app.get("/documents")
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.patient_id == user.id).order_by(Document.uploaded_at.desc()).all()
    return [{"document_id": d.id, "filename": d.original_filename, "content_type": d.content_type,
             "uploaded_at": d.uploaded_at, "status": d.status, "processing_note": d.processing_note} for d in docs]

@app.get("/documents/{document_id}")
def get_document(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = owned_document(db, user.id, document_id)
    return {"document_id": d.id, "filename": d.original_filename, "content_type": d.content_type,
            "uploaded_at": d.uploaded_at, "status": d.status, "processing_note": d.processing_note,
            "has_extracted_text": bool(d.extracted_text)}

@app.get("/documents/{document_id}/status")
def document_status(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = owned_document(db, user.id, document_id)
    return {"document_id": d.id, "status": d.status, "processing_note": d.processing_note}

@app.get("/documents/{document_id}/extraction")
def get_extraction(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = owned_document(db, user.id, document_id)
    return {"document_id": d.id, "status": d.status, "candidate_fields": d.extraction_result,
            "extracted_text": d.extracted_text, "processing_note": d.processing_note,
            "instruction": "OCR output is unverified. Patient must review it before saving records."}

@app.get("/documents/{document_id}/file")
def download_original(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = owned_document(db, user.id, document_id)
    if not Path(d.storage_path).is_file():
        raise HTTPException(status_code=404, detail="Original file is unavailable")
    return FileResponse(d.storage_path, media_type=d.content_type, filename=d.original_filename)

@app.post("/documents/{document_id}/verify", status_code=201)
def verify_document(document_id: int, payload: VerifyDocumentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = owned_document(db, user.id, document_id)
    if db.query(MedicalRecord).filter(MedicalRecord.document_id == d.id).first():
        raise HTTPException(status_code=409, detail="This document already has records. Correct those records using PATCH /records/{record_id}.")
    created = []
    for entry in payload.records:
        record = MedicalRecord(
            patient_id=user.id, document_id=d.id, category=entry.category,
            title=entry.title.strip(), event_date=entry.event_date.isoformat() if entry.event_date else None,
            details=entry.details.strip(), verified=True,
        )
        db.add(record)
        db.flush()
        created.append({"record_id": record.id, "category": record.category, "title": record.title,
                        "event_date": record.event_date, "verified": record.verified})
    d.status = "verified"
    audit(db, user.id, "document_records_verified", "document", d.id, actor_user_id=user.id,
          details=f"created_record_count={len(created)}")
    db.commit()
    return {"document_id": d.id, "created_records": created, "message": "Verified records saved."}


# -------------------- MEDICAL RECORDS / TIMELINE --------------------
def record_dict(record: MedicalRecord) -> dict:
    return {"record_id": record.id, "document_id": record.document_id, "category": record.category,
            "title": record.title, "event_date": record.event_date, "details": record.details,
            "verified": record.verified, "created_at": record.created_at}

@app.post("/records", status_code=201)
def create_record(payload: CreateRecordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.document_id is not None:
        owned_document(db, user.id, payload.document_id)
    record = MedicalRecord(patient_id=user.id, document_id=payload.document_id,
                           category=payload.category, title=payload.title.strip(),
                           event_date=payload.event_date.isoformat() if payload.event_date else None,
                           details=payload.details.strip(), verified=True)
    db.add(record)
    db.flush()
    audit(db, user.id, "medical_record_created", "medical_record", record.id, actor_user_id=user.id)
    db.commit()
    db.refresh(record)
    return record_dict(record)

@app.get("/records")
def list_records(category: str | None = None, verified_only: bool = False,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(MedicalRecord).filter(MedicalRecord.patient_id == user.id)
    if category:
        query = query.filter(MedicalRecord.category == category.lower())
    if verified_only:
        query = query.filter(MedicalRecord.verified.is_(True))
    return [record_dict(r) for r in query.order_by(MedicalRecord.event_date.desc().nullslast(), MedicalRecord.id.desc()).all()]

@app.get("/records/alerts")
def record_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Demo rule only: exact same lab-result title within 30 days. Not a clinical judgement."""
    records = db.query(MedicalRecord).filter(
        MedicalRecord.patient_id == user.id,
        MedicalRecord.category == "lab_result",
        MedicalRecord.event_date.is_not(None),
    ).order_by(MedicalRecord.event_date.asc()).all()
    alerts = []
    for i, first in enumerate(records):
        try:
            first_date = datetime.strptime(first.event_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        for second in records[i + 1:]:
            if first.title.strip().casefold() != second.title.strip().casefold():
                continue
            try:
                second_date = datetime.strptime(second.event_date, "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue
            if 0 <= (second_date - first_date).days <= 30:
                alerts.append({"type": "possible_repeat_test", "record_ids": [first.id, second.id],
                               "title": first.title, "dates": [first.event_date, second.event_date],
                               "message": "These records have the same title within 30 days. Review the original documents; this does not prove the test was unnecessary."})
    return {"count": len(alerts), "alerts": alerts}



@app.get("/records/{record_id}")
def get_record(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return record_dict(owned_record(db, user.id, record_id))

@app.patch("/records/{record_id}")
def update_record(record_id: int, payload: RecordUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = owned_record(db, user.id, record_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")
    if "category" in changes and changes["category"] is not None:
        category = changes["category"].strip().lower()
        allowed = {"medication", "lab_result", "diagnosis", "visit", "allergy", "procedure", "medical_document", "other"}
        if category not in allowed:
            raise HTTPException(status_code=422, detail=f"category must be one of: {', '.join(sorted(allowed))}")
        record.category = category
    if "title" in changes and changes["title"] is not None:
        record.title = changes["title"].strip()
    if "event_date" in changes:
        record.event_date = changes["event_date"].isoformat() if changes["event_date"] else None
    if "details" in changes and changes["details"] is not None:
        record.details = changes["details"].strip()
    audit(db, user.id, "medical_record_updated", "medical_record", record.id, actor_user_id=user.id)
    db.commit()
    db.refresh(record)
    return record_dict(record)

@app.delete("/records/{record_id}")
def delete_record(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = owned_record(db, user.id, record_id)
    # Remove the record from any share links that reference it.
    for share in db.query(ShareLink).filter(ShareLink.records.any(id=record.id)).all():
        share.records = [r for r in share.records if r.id != record.id]
    db.delete(record)
    audit(db, user.id, "medical_record_deleted", "medical_record", record.id, actor_user_id=user.id)
    db.commit()
    return {"message": "Record deleted", "record_id": record_id}


@app.delete("/documents/{document_id}")
def delete_document(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = owned_document(db, user.id, document_id)
    # Deleting the document cascades to its records (and removes them from shares).
    for share in db.query(ShareLink).all():
        share.records = [r for r in share.records if r.document_id != doc.id]
    storage_path = Path(doc.storage_path)
    db.delete(doc)
    audit(db, user.id, "document_deleted", "document", doc.id, actor_user_id=user.id)
    db.commit()
    try:
        if storage_path.is_file():
            storage_path.unlink()
    except OSError:
        pass
    return {"message": "Document and its records deleted", "document_id": document_id}


@app.get("/timeline")
def timeline(category: str | None = None, start_date: str | None = None, end_date: str | None = None,
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(MedicalRecord).filter(MedicalRecord.patient_id == user.id)
    if category:
        query = query.filter(MedicalRecord.category == category.lower())
    if start_date:
        query = query.filter(MedicalRecord.event_date >= start_date)
    if end_date:
        query = query.filter(MedicalRecord.event_date <= end_date)
    records = query.order_by(MedicalRecord.event_date.desc().nullslast(), MedicalRecord.id.desc()).all()
    return {"count": len(records), "records": [record_dict(r) for r in records]}

# -------------------- SUMMARIES --------------------
@app.post("/summary/generate", status_code=201)
def create_summary(
    payload: SummaryGenerateRequest | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(MedicalRecord).filter(
        MedicalRecord.patient_id == user.id, MedicalRecord.verified.is_(True)
    )
    if payload is not None and payload.record_ids:
        requested = list(dict.fromkeys(payload.record_ids))
        query = query.filter(MedicalRecord.id.in_(requested))
    records = query.order_by(MedicalRecord.event_date.asc().nullslast()).all()
    if payload is not None and payload.record_ids and len(records) != len(dict.fromkeys(payload.record_ids)):
        raise HTTPException(status_code=400, detail="One or more record IDs are invalid, unverified, or not owned by you")
    if not records:
        raise HTTPException(status_code=400, detail="Verify or add at least one medical record before generating a summary")
    source = [{"id": r.id, "category": r.category, "title": r.title,
               "event_date": r.event_date, "details": r.details} for r in records]
    summary_text, model_used = generate_summary(source)
    summary = Summary(patient_id=user.id, summary_text=summary_text,
                      source_record_ids=[r.id for r in records], model_used=model_used)
    db.add(summary)
    db.flush()
    audit(db, user.id, "summary_generated", "summary", summary.id, actor_user_id=user.id,
          details=f"model={model_used}; source_count={len(records)}")
    db.commit()
    db.refresh(summary)
    return {"summary_id": summary.id, "summary_text": summary.summary_text,
            "source_record_ids": summary.source_record_ids, "model_used": summary.model_used,
            "created_at": summary.created_at,
            "notice": "Check each source record and original document. This is not medical advice."}

@app.post("/summary/from-text")
def summarize_text(payload: SummaryFromTextRequest, user: User = Depends(get_current_user)):
    """Summarize free text (for example OCR output) without saving anything.

    Deliberately separate from OCR: this only calls the existing summarizer and
    does not create a record or a stored summary. Nothing is persisted.
    """
    text = payload.text.strip()
    if len(text) < 20:
        raise HTTPException(status_code=400, detail="Provide at least 20 characters of text to summarize")
    title = (payload.title or "Scanned document").strip()[:255] or "Scanned document"
    source = [{"id": 0, "category": "medical_document", "title": title,
               "event_date": None, "details": text}]
    summary_text, model_used = generate_summary(source)
    return {
        "summary_text": summary_text,
        "model_used": model_used,
        "notice": "AI summary of unverified OCR text. Check the original image. This is not medical advice.",
    }

@app.get("/summary")
def latest_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    summary = db.query(Summary).filter(Summary.patient_id == user.id).order_by(Summary.created_at.desc()).first()
    if summary is None:
        raise HTTPException(status_code=404, detail="No summary exists yet")
    return {"summary_id": summary.id, "summary_text": summary.summary_text,
            "source_record_ids": summary.source_record_ids, "model_used": summary.model_used,
            "created_at": summary.created_at}

@app.get("/summary/history")
def summary_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    summaries = db.query(Summary).filter(Summary.patient_id == user.id).order_by(Summary.created_at.desc()).all()
    return [{"summary_id": s.id, "source_record_ids": s.source_record_ids,
             "model_used": s.model_used, "created_at": s.created_at,
             "summary_text": s.summary_text} for s in summaries]

@app.delete("/summary/{summary_id}")
def delete_summary(summary_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove one of the patient's own summaries. Summaries are derived data,
    so deleting one never touches the underlying medical records."""
    summary = db.query(Summary).filter(
        Summary.id == summary_id, Summary.patient_id == user.id
    ).first()
    if summary is None:
        raise HTTPException(status_code=404, detail="Summary not found")
    db.delete(summary)
    audit(db, user.id, "summary_deleted", "summary", summary.id, actor_user_id=user.id,
          details=f"model={summary.model_used}")
    db.commit()
    return {"message": "Summary deleted", "summary_id": summary_id}


# -------------------- GUEST SHARING --------------------
@app.post("/sharing/create", status_code=201)
def create_share(payload: ShareCreateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record_ids = list(dict.fromkeys(payload.record_ids))
    records = db.query(MedicalRecord).filter(
        MedicalRecord.patient_id == user.id, MedicalRecord.id.in_(record_ids), MedicalRecord.verified.is_(True)
    ).all()
    if len(records) != len(record_ids):
        raise HTTPException(status_code=400, detail="One or more record IDs are invalid, unverified, or not owned by you")
    raw_token = secrets.token_urlsafe(32)
    pin = f"{secrets.randbelow(1_000_000):06d}"
    share = ShareLink(patient_id=user.id, token_hash=hash_share_token(raw_token),
                      pin_hash=hash_secret(pin), expires_at=utcnow() + timedelta(hours=payload.expires_in_hours),
                      records=records)
    db.add(share)
    db.flush()
    audit(db, user.id, "share_link_created", "share_link", share.id, actor_user_id=user.id,
          details=f"record_count={len(records)}; expires_in_hours={payload.expires_in_hours}")
    db.commit()
    frontend = get_frontend_url()
    return {"share_id": share.id, "share_url": f"{frontend}/guest?token={raw_token}",
            "share_token": raw_token, "access_pin": pin,
            "expires_at": share.expires_at, "record_ids": [r.id for r in records],
            "important": "The access PIN is shown only once. Share the PIN separately from the link. Keep both private."}

@app.get("/sharing/my-links")
def my_share_links(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    shares = db.query(ShareLink).options(selectinload(ShareLink.records)).filter(
        ShareLink.patient_id == user.id).order_by(ShareLink.created_at.desc()).all()
    return [{"share_id": s.id, "record_ids": [r.id for r in s.records], "created_at": s.created_at,
             "expires_at": s.expires_at, "revoked_at": s.revoked_at,
             "status": "revoked" if s.revoked_at else ("expired" if s.expires_at <= utcnow() else "active")}
            for s in shares]

@app.post("/sharing/access/{token}/verify-pin")
def verify_share_pin(token: str, payload: VerifyPinRequest, db: Session = Depends(get_db)):
    share = active_share(db, token)
    now = utcnow()
    if share.pin_locked_until and share.pin_locked_until > now:
        raise HTTPException(status_code=429, detail="Too many incorrect PIN attempts. Try again later.")
    if share.pin_locked_until and share.pin_locked_until <= now:
        share.pin_failed_attempts = 0
        share.pin_locked_until = None
    if not verify_secret(payload.pin, share.pin_hash):
        share.pin_failed_attempts += 1
        if share.pin_failed_attempts >= 5:
            share.pin_locked_until = now + timedelta(minutes=15)
        db.commit()
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    share.pin_failed_attempts = 0
    share.pin_locked_until = None
    db.commit()
    guest_token = create_signed_token({"typ": "guest", "share_id": share.id}, 15 * 60)
    audit(db, share.patient_id, "guest_pin_verified", "share_link", share.id)
    db.commit()
    return {"guest_access_token": guest_token, "token_type": "bearer", "expires_in_seconds": 900,
            "message": "Guest access granted for this share only. The link can still be revoked by the patient."}

@app.get("/sharing/access/{token}/records")
def guest_shared_records(token: str, guest_claims: dict = Depends(get_guest_claims), db: Session = Depends(get_db)):
    share = active_share(db, token)
    if int(guest_claims.get("share_id", -1)) != share.id:
        raise HTTPException(status_code=403, detail="Guest token does not match this sharing link")
    records = sorted(share.records, key=lambda r: (r.event_date or "0000-00-00", r.id), reverse=True)
    audit(db, share.patient_id, "guest_records_accessed", "share_link", share.id)
    db.commit()
    return {"share_id": share.id, "expires_at": share.expires_at,
            "records": [record_dict(r) for r in records],
            "notice": "These records were shared by the patient. This view is not a medical diagnosis."}

@app.get("/sharing/access/{token}/documents/{document_id}/file")
def guest_document_file(
    token: str,
    document_id: int,
    guest_claims: dict = Depends(get_guest_claims),
    db: Session = Depends(get_db),
):
    share = active_share(db, token)
    if int(guest_claims.get("share_id", -1)) != share.id:
        raise HTTPException(status_code=403, detail="Guest token does not match this sharing link")
    # Defense in depth: the document must belong to a record in this share.
    allowed_ids = {r.document_id for r in share.records if r.document_id is not None}
    if document_id not in allowed_ids:
        raise HTTPException(status_code=404, detail="Document not found in this share")
    doc = db.query(Document).filter(Document.id == document_id, Document.patient_id == share.patient_id).first()
    if doc is None or not Path(doc.storage_path).is_file():
        raise HTTPException(status_code=404, detail="Original file is unavailable")
    audit(db, share.patient_id, "guest_document_opened", "document", doc.id)
    db.commit()
    return FileResponse(doc.storage_path, media_type=doc.content_type, filename=doc.original_filename)


@app.post("/sharing/{share_id}/revoke")
def revoke_share(share_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    share = db.query(ShareLink).filter(ShareLink.id == share_id, ShareLink.patient_id == user.id).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Sharing link not found")
    if share.revoked_at is None:
        share.revoked_at = utcnow()
        audit(db, user.id, "share_link_revoked", "share_link", share.id, actor_user_id=user.id)
        db.commit()
    return {"share_id": share.id, "revoked_at": share.revoked_at, "status": "revoked"}


@app.delete("/sharing/{share_id}")
def delete_share(share_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    share = db.query(ShareLink).filter(ShareLink.id == share_id, ShareLink.patient_id == user.id).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Sharing link not found")
    # Clear the association rows, then delete the share itself. The share URL
    # and PIN stop working immediately (the token no longer resolves).
    share.records = []
    db.delete(share)
    audit(db, user.id, "share_link_deleted", "share_link", share.id, actor_user_id=user.id)
    db.commit()
    return {"message": "Sharing link deleted", "share_id": share_id}


# -------------------- AUDIT LOGS --------------------
@app.get("/audit-logs")
def audit_logs(limit: int = 100, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    limit = max(1, min(limit, 500))
    entries = db.query(AuditLog).filter(AuditLog.patient_id == user.id).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [{"action": e.action, "resource_type": e.resource_type, "resource_id": e.resource_id,
             "details": e.details, "timestamp": e.timestamp} for e in entries]
