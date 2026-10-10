# Lost in Transit — Backend MVP

A patient-controlled medical-record organizer for a hackathon prototype. It supports patient authentication, upload and extraction of documents, verified structured records, a medical timeline, source-linked summaries, basic repeat-lab-title flags, and PIN-protected guest sharing links that can expire or be revoked.

**Use synthetic demo data only. This is not a clinical system and is not ready for real patient data or production deployment.**

## 1. What is implemented

- Patient registration/login with password hashing and signed bearer tokens. Accounts are usable immediately; no email verification is required.
- Patient-specific authorization checks on private document and record routes.
- Uploads for PDF, TXT, PNG, JPG/JPEG, WEBP, BMP, TIFF, and GIF with a configurable file-size limit.
- Text extraction from TXT, text-based PDFs, and **scanned PDFs** (pages are rasterised and OCR'd); image OCR via Tesseract. Scanned-PDF OCR needs the Tesseract application (and the bundled `PyMuPDF` package).
- A standalone OCR endpoint (`POST /documents/extract-text`) that extracts text from an uploaded image **or PDF** in memory (nothing is saved) and returns it for review.
- Optional, separate AI summarization of extracted text (`POST /summary/from-text`); OCR extraction and AI summarization are independent operations.
- Candidate fields marked for patient review; records are saved as verified only after the patient confirms them.
- Structured records, timeline sorting/filtering, record correction, and basic possible-repeat-lab detection.
- Summary generation from verified records. If `OPENAI_API_KEY` is configured, an LLM is used; otherwise a clearly labelled local fallback is returned.
- Guest sharing of selected verified records. The recipient needs the share URL and a separate six-digit PIN, then gets a short-lived guest access token. Share links expire after 1–168 hours and can be revoked.
- Audit log entries for important actions and `/docs` interactive API documentation.

## 2. What is not fully implemented yet

- Automatic medical field extraction is only a basic candidate suggestion. It does **not** reliably extract every medicine, dosage, test value, or diagnosis. The patient must review the source and confirm each record.
- Scanned-PDF OCR is now built in (pages are rasterised with PyMuPDF and OCR'd); it still needs the Tesseract application installed. OCR accuracy on poor scans is limited, so the patient must review the result.
- Sending the guest PIN by email/SMS is not implemented. The API returns the PIN once, so share it through a separate channel.
- `/auth/logout` tells the client to delete its token; immediate server-side token invalidation needs a session store or token denylist.
- Alerts use a simple exact-title/date rule and are not clinical advice.
- No frontend is included in this folder. The share URL assumes a frontend route at `/guest?token=...`; configure `FRONTEND_BASE_URL` for your frontend.

## 3. Setup on Windows (PowerShell)

Open a terminal in this `lost_in_transit_backend` folder.

1. Create a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install dependencies:

   ```powershell
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env`. Replace `SECRET_KEY` with a long random value. (If you do not set it, a temporary random development key is generated at startup, which invalidates tokens after a restart.) For example, generate one in a separate Python prompt with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and paste the output into `.env`.

5. Start the backend:

   ```powershell
   uvicorn app.main:app --reload
   ```

6. Open `http://127.0.0.1:8000/docs`. The SQLite database and `storage` directory are created locally as needed.

If PowerShell blocks virtual-environment activation, you can run `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload` without activating it.

## 4. Optional OCR setup

Image OCR requires the **Tesseract application** to be installed separately; installing the Python `pytesseract` package alone is not enough. On Windows, if Tesseract is not on PATH, set `TESSERACT_CMD` in `.env` to the full path to `tesseract.exe`. Restart the server after changing `.env`. Full instructions (Windows, Linux, macOS, deployment and troubleshooting) are in [`OCR_SETUP.md`](./OCR_SETUP.md).

Text-based PDFs and `.txt` files do not need Tesseract. Scanned/image-only PDFs are rasterised with `PyMuPDF` and OCR'd page-by-page, so they now yield text too; if Tesseract is missing they return a `needs_ocr_setup` status instead of silently pretending OCR succeeded.

The standalone `POST /documents/extract-text` endpoint accepts a PNG/JPG/WEBP/BMP/TIFF/GIF image **or a PDF** (multipart field `file`), requires a signed-in patient, processes the file in memory, and returns:

```json
{
  "text": "…recognised text…",
  "character_count": 128,
  "line_count": 6,
  "language": "eng",
  "engine": "tesseract",
  "filename": "scan.png",
  "notice": "OCR output is unverified. Review and correct the text before using it."
}
```

It never writes the image to disk. Error responses are explicit: `400` empty upload, `413` over `MAX_UPLOAD_MB`, `415` unsupported extension, `422` unreadable image or no text found, `503` Tesseract not installed. The extracted text can optionally be sent to `POST /summary/from-text` (`{"text": "...", "title": "..."}`), which reuses the existing summarizer without saving anything.

## 5. Optional LLM setup

Set `OPENAI_API_KEY` in `.env` and optionally change `OPENAI_MODEL`. Restart the backend. Without the key, `/summary/generate` returns a local fallback labelled `local-fallback-no-llm`; do not present that fallback as an LLM result.

An external LLM provider receives the verified record details sent to it. Use synthetic data for the hackathon and review the provider's data-handling terms before using any sensitive information.

## 6. End-to-end test with `/docs`

1. Call `POST /auth/register` with a name, email, and password of at least 10 characters, then `POST /auth/login` to get an `access_token`.
2. Click **Authorize** near the top of `/docs` and enter the token as a Bearer token. Alternatively, set `Authorization: Bearer <access_token>` in your API client.
3. Call `POST /documents/upload`, select `sample_data/sample_prescription.txt`, and submit.
4. Note the returned `document_id`. Call `GET /documents/{document_id}/extraction` to see the candidate data and extracted text.
5. Call `POST /documents/{document_id}/verify` with reviewed details. Example request body:

   ```json
   {
     "records": [
       {
         "category": "medication",
         "title": "Sample medicine A",
         "event_date": "2026-08-12",
         "details": "Synthetic demonstration entry. The source file must be reviewed by the user."
       }
     ]
   }
   ```

6. Call `GET /timeline` and `POST /summary/generate`.
7. Call `POST /sharing/create` with this body, replacing `1` with the returned record ID:

   ```json
   { "record_ids": [1], "expires_in_hours": 24 }
   ```

8. Copy the returned `share_token` and `access_pin`. Call `POST /sharing/access/{token}/verify-pin` with `{"pin":"123456"}` using the actual PIN returned by the creation endpoint. Copy `guest_access_token` from the response.
9. Call `GET /sharing/access/{token}/records` with the guest token as a Bearer token. It must return only the selected record(s).
10. As the patient, call `POST /sharing/{share_id}/revoke`, then try the guest request again. It should be rejected.
11. (Optional) Call `POST /documents/extract-text` with an image or PDF file in the multipart field `file` to run OCR without saving the file. Scanned PDFs are rasterised and OCR'd automatically. If Tesseract is not installed you will get a `503` with setup guidance and the rest of the API is unaffected. The returned text can be passed to `POST /summary/from-text`.

The exact record IDs are assigned by your database; never assume the example ID `1` will be returned.

## 7. Main API groups

- Auth: `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`
- Documents and extraction: `/documents/upload`, `/documents/extract-text`, `/documents`, `/documents/{id}`, `/documents/{id}/status`, `/documents/{id}/extraction`, `/documents/{id}/file`, `/documents/{id}/verify`
- Records and timeline: `/records`, `/records/{id}`, `/timeline`, `/records/alerts`
- Summaries: `/summary/generate`, `/summary/from-text`, `/summary`, `/summary/history`, `/summary/{id}`
- Guest sharing: `/sharing/create`, `/sharing/my-links`, `/sharing/access/{token}/verify-pin`, `/sharing/access/{token}/records`, `/sharing/{share_id}/revoke`
- Audit and health: `/audit-logs`, `/health`

The live `/docs` page is the source of truth for request and response schemas.

## 8. Suggested folder structure

```text
lost_in_transit_backend/
├── app/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── security.py
│   └── services/
│       ├── document_processing.py
│       ├── ocr_service.py
│       └── summary_service.py
├── sample_data/
├── tests/
├── requirements.txt
├── .env.example
└── README.md
```

## 9. Before demo/submission

- Run through upload → verify → timeline → summary → guest-share → revoke.
- Demonstrate both successful access and blocked access after revocation.
- Explain which extraction is heuristic and which summary actually used the LLM.
- Keep `.env`, database files, `storage/`, API keys, and actual patient records out of GitHub.
- Add screenshots or a short API demo to the main project README.
