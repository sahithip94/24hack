# MediVault — Frontend

Patient-facing web app for the "Lost in Transit" HealthTech
hackathon problem: fragmented medical records and repeated care
across providers. MediVault lets patients upload documents,
build a verified record timeline, spot possible repeated tests,
generate summaries, and share records securely with guests via
PIN-protected, expiring links.

## Stack

- Vite 6 + React 18 + TypeScript
- React Router v7 (data routes + guards)
- Tailwind CSS v4 (teal/white healthcare theme)
- Lucide icons

## Backend contract

This frontend talks to the FastAPI backend in `../backend`
(bearer-token auth, root-level routes). The API base URL is
configurable:

```bash
cp .env.example .env        # optional; default is http://localhost:8000
```

`VITE_API_BASE_URL` defaults to `http://localhost:8000`. The
backend's CORS already permits `http://localhost:5173` with the
`Authorization` header, so no proxy is needed in development.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Backend (separate, in `../backend`):

```bash
cd ../backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload   # http://localhost:8000
```

Production build:

```bash
npm run build      # tsc --noEmit && vite build -> dist/
```

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | public | Landing page |
| `/signup` | public | Create account (usable immediately, no verification step) |
| `/login` | public | Sign in |
| `/dashboard` | patient | Greeting, stats, repeat-test alerts, recent records, active shares |
| `/records` | patient | Full record library: search, filter, sort, open, download, delete |
| `/upload` | patient | Two-step upload: upload document → review extracted fields → confirm |
| `/timeline` | patient | Records grouped by date with category/date-range filters |
| `/ai-summary` | patient | Generate a summary of all or selected records |
| `/shared-access` | patient | Create Full Access or Selected Access shares; manage/revoke links |
| `/profile` | patient | View/update name, log out |
| `/guest?token=…` | guest | Entry point the backend generates; redirects to `/share/:token` |
| `/share/:token` | guest | PIN verification for a share |
| `/share/:token/records` | guest | Read-only guest view (records + timeline sections) |

## Secure sharing — the two access options

On **Shared access** (`/shared-access`) the patient picks:

- **Full Access** — the share includes *every current record*.
  The guest can view all sections the backend authorizes for a
  share: the medical records and the timeline built from them.
- **Selected Access** — the patient picks exactly which records
  the guest may open (searchable checkbox picker).

Both options let the patient set an expiry (1 hour / 24 hours /
7 days → `expires_in_hours` 1/24/168). Creating a share calls
`POST /sharing/create` and returns the link (shown once, together
with a 6-digit PIN) plus the expiry. The link is cached
client-side by share ID so it can be copied again from
"Your share links" — the backend only returns each URL once.

Guests open the link, enter the PIN (`POST
/sharing/access/{token}/verify-pin`), and receive a 15-minute
guest access token scoped to that one share. The guest view
(`/share/:token/records`) is strictly read-only: records and a
timeline derived from the shared records, with original-file
opening via `GET /sharing/access/{token}/documents/{document_id}/file`.
The backend re-validates share status (active, unexpired,
unrevoked) on every request; revocation or expiry immediately
cuts off access (HTTP 410). Wrong PINs are rate-limited (5
attempts, then a 15-minute lockout, HTTP 429).

## Honest demo limitations (documented, not faked)

- **AI summaries**: with no LLM key configured, the backend
  uses a local rule-based fallback. The summary page labels this
  clearly (`model_used: local-fallback-no-llm`) instead of
  claiming AI generated it. With `OPENAI_API_KEY` set in the
  backend, real LLM summaries are used automatically.
- **Guest summaries**: the backend authorizes *records* for
  guest links, so the guest view shows Records and Timeline
  sections and an explicit "summaries cannot be shared yet"
  notice (a `GET /sharing/access/{token}/summary` endpoint would
  be required). No summary data is fabricated for guests.
- **OCR**: scanned PDFs/images need Tesseract on the server.
  Without it, the backend still accepts uploads and returns
  `needs_ocr_setup`; the upload page then asks the patient to
  type the record details by hand.
- **Share metadata**: the backend's `GET /sharing/my-links` does
  not return the share URL/token (only IDs and status), and
  shares have no recipient-label column or per-section
  permissions. The frontend compensates by caching URLs at
  creation time and scoping shares by record selection.

## Security notes

- Patient tokens live in `localStorage`; guest access tokens in
  `sessionStorage` (they die with the tab).
- All authorization is enforced server-side. The frontend never
  decides what a guest may see.
- Document files cannot be opened via plain links (bearer tokens
  don't ride navigation requests), so the frontend fetches them
  as authenticated blobs and opens temporary object URLs.
- Passwords must be at least 10 characters (backend rule).
