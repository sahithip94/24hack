# MediVault (hack24)

Patient-controlled medical record organizer — hackathon project.
Strictly separated into a frontend and a Python FastAPI backend.

## Project structure

```text
hack24/
├── frontend/            # Frontend ONLY (Vite + React + TypeScript)
│   ├── src/             # UI components, pages, styles
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/             # Python FastAPI backend ONLY
│   ├── app/
│   │   ├── main.py          # FastAPI app, routes, CORS, upload limits
│   │   ├── database.py      # SQLAlchemy engine/session (SQLite by default)
│   │   ├── models.py        # DB models (users, documents, records, shares, ...)
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── security.py      # Tokens, password hashing, auth dependencies
│   │   └── services/        # document_processing, summary_service
│   ├── tests/
│   │   └── test_api.py
│   ├── sample_data/
│   │   └── sample_prescription.txt
│   ├── requirements.txt
│   ├── .env.example         # Copy to .env and fill in real values
│   ├── .gitignore           # Ignores .env, .venv/, storage/, *.db, ...
│   └── README.md            # Backend-specific docs
│
├── backup_ts_backend/   # Previous TypeScript backend (preserved, do not delete)
│   └── ...                # Includes its own src/, tests/, node_modules/, e2e.mjs
│
└── README.md            # This file
```

## Setup & run

### Backend (from `hack24/backend/`)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env     # then edit .env: set a real SECRET_KEY
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API docs: http://127.0.0.1:8000/docs
- Tests: `pytest`
- OCR (`pytesseract`) needs the Tesseract binary on PATH (or set `TESSERACT_CMD` in `.env`).
- Defaults: SQLite at `./lost_in_transit.db`, uploads in `./storage`, CORS for
  `http://localhost:5173` (the frontend's Vite dev server).

### Frontend (from `hack24/frontend/`)

Frontend files are managed separately — see `frontend/package.json` for its scripts.
This README does not change or wire the frontend; do not move files between
`frontend/` and `backend/`.

## Important rules

- **Never commit `.env`** — it holds secrets (SECRET_KEY, optional OPENAI_API_KEY).
  It is already listed in `backend/.gitignore`.
- Keep Python code in `backend/`, frontend code in `frontend/`.
- `backup_ts_backend/` is the preserved TypeScript backend (port 8787, JSON store
  `data/medivault.json`). It is kept for reference only and is not part of the
  running app.
