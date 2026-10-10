# OCR setup (image / scanned PDF → text)

MediVault extracts text from images with **Tesseract** through the Python
[`pytesseract`](https://pypi.org/project/pytesseract/) package and
[Pillow](https://pypi.org/project/Pillow/), and from **scanned PDFs** by
rasterising the pages with [PyMuPDF](https://pypi.org/project/PyMuPDF/) and
running the same OCR on each page. The Python packages are already in
`requirements.txt`; the part people usually miss is that **Tesseract is a system
application that has to be installed separately**.

Text-based PDFs are read straight from their embedded text layer and do **not**
need Tesseract.

The feature lives in `app/services/ocr_service.py` and is exposed by:

- `POST /documents/extract-text` — authenticated, in-memory OCR for an image **or PDF** (nothing is saved).
- `POST /summary/from-text` — optional, separate AI summary of arbitrary text.
- `POST /documents/upload` — stores the file and extracts text, including from scanned PDFs.

## 1. Install the Tesseract application

### Windows

Option A — winget (Windows 10/11):

```powershell
winget install UB-Mannheim.TesseractOCR
```

Option B — Chocolatey:

```powershell
choco install tesseract
```

Option C — installer: download the UB-Mannheim build from
<https://github.com/UB-Mannheim/tesseract/wiki> and run it. The default install
location is `C:\Program Files\Tesseract-OCR\tesseract.exe`.

After installing, verify it is reachable:

```powershell
tesseract --version
```

If `tesseract` is not recognised, add `C:\Program Files\Tesseract-OCR` to `PATH`
**or** set `TESSERACT_CMD` in `backend/.env` to the full path:

```dotenv
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

### Linux

```bash
sudo apt-get update && sudo apt-get install -y tesseract-ocr
```

### macOS

```bash
brew install tesseract
```

## 2. Configure the backend

In `backend/.env` (copied from `.env.example`):

```dotenv
# Only needed when tesseract.exe is not on PATH:
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

# Optional. Default language is eng. Combine with '+', e.g. eng+hin.
OCR_LANG=eng
```

`.env` is read at startup, so **restart the backend** after changing it.

## 3. Extra languages (optional)

The `eng` data file is bundled by default. To OCR other languages, install the
matching Tesseract language data (for example the `hin` and `eng` options in the
Windows installer, or `tesseract-ocr-hin` on Debian/Ubuntu) and set
`OCR_LANG=eng+hin`.

## 4. Deployment notes

- Install Tesseract in the container/image, for example Debian-based:

  ```dockerfile
  RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
      && rm -rf /var/lib/apt/lists/*
  ```

- Keep `tesseract` on `PATH`, or bake the exact path into `TESSERACT_CMD`.
- If Tesseract is missing the API responds with **HTTP 503** and a clear message;
  the rest of the app keeps working. `GET /health` is unaffected.
- OCR runs on the request thread. It is fine for a prototype; for higher volume,
  move extraction to a background worker and/or cap image dimensions.
- Uploaded images are **not** stored by `/documents/extract-text`. Only the
  existing `POST /documents/upload` flow writes files to `STORAGE_DIR`.

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `503` "OCR engine is not available" | Tesseract is not installed or not on `PATH`; install it and/or set `TESSERACT_CMD`, then restart the backend. |
| `503` "Scanned-PDF OCR requires the PyMuPDF package" | Run `pip install -r requirements.txt` (the `PyMuPDF` package is bundled). |
| `422` "No readable text was detected" | The image/PDF may be blurry/dark or contain no text. Try a sharper, higher-resolution file. |
| `422` "could not be read as an image" | The file is corrupt, truncated, or not really an image. |
| `415` "Unsupported file type" | Use PNG, JPG/JPEG, WEBP, BMP, TIFF, GIF, or PDF. |
| Wrong language output | Install the language data and set `OCR_LANG`. |
