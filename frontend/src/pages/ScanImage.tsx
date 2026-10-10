import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Check,
  Copy,
  Image as ImageIcon,
  RotateCcw,
  ScanText,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiRequestError, apiFetch } from '../lib/api';
import type { OcrExtractResponse, SummaryFromTextResponse } from '../types';
import { isLocalFallback } from '../lib/llm';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.gif,.pdf';
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'tif',
  'tiff',
  'gif',
]);
const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, 'pdf']);
const MAX_MB = 10;

/**
 * Authenticated OCR: upload an image, extract its text in memory
 * (the backend never saves the image), review/edit the result, and
 * optionally send it to the existing AI summarizer as a separate step.
 */
export function ScanImage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [requestError, setRequestError] = useState<{ message: string; status: number } | null>(null);
  const [result, setResult] = useState<OcrExtractResponse | null>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const [summarizing, setSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<SummaryFromTextResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    setPickError(null);
    if (!chosen) return;
    const ext = chosen.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setPickError(
        'Unsupported file type. Please upload a PNG, JPG, JPEG, WEBP, BMP, TIFF, GIF image, or a PDF.',
      );
      return;
    }
    if (chosen.size > MAX_MB * 1024 * 1024) {
      setPickError(`File is larger than ${MAX_MB} MB. Choose a smaller file.`);
      return;
    }
    // Only images can be previewed in an <img>; a PDF falls back to an icon.
    setPreviewUrl(IMAGE_EXTENSIONS.has(ext) ? URL.createObjectURL(chosen) : null);
    setFile(chosen);
    setRequestError(null);
    setResult(null);
    setText('');
    setAiSummary(null);
    setAiError(null);
  };

  const extractText = async () => {
    if (!file) return;
    setExtracting(true);
    setRequestError(null);
    setResult(null);
    setText('');
    setAiSummary(null);
    setAiError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await apiFetch<OcrExtractResponse>('/documents/extract-text', {
        method: 'POST',
        body: form,
      });
      setResult(response);
      setText(response.text);
    } catch (err) {
      setRequestError(
        err instanceof ApiRequestError
          ? { message: err.message, status: err.status }
          : { message: err instanceof Error ? err.message : 'Extraction failed.', status: 0 },
      );
    } finally {
      setExtracting(false);
    }
  };

  const copyText = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by permissions; the textarea remains editable.
    }
  };

  const summarizeText = async () => {
    if (text.trim().length < 20) {
      setAiError('Add at least 20 characters of text before summarizing.');
      return;
    }
    setSummarizing(true);
    setAiError(null);
    try {
      const response = await apiFetch<SummaryFromTextResponse>('/summary/from-text', {
        method: 'POST',
        body: JSON.stringify({
          text,
          title: file?.name.replace(/\.[^.]+$/, '').slice(0, 255) || 'Scanned document',
        }),
      });
      setAiSummary(response);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Summarization failed.');
    } finally {
      setSummarizing(false);
    }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setRequestError(null);
    setResult(null);
    setText('');
    setAiSummary(null);
    setAiError(null);
    setPickError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Extract text from an image or PDF
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.name} · Upload a photo, scan, or PDF (including scanned PDFs) and
          the server reads the text with OCR. Nothing is stored — you review and
          copy the result.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Choose an image or PDF"
          subtitle="Prescriptions, lab sheets, reports — any image or PDF with text"
        />
        <label
          htmlFor="scan-image-input"
          className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition-colors hover:border-teal-400 hover:bg-teal-50/40"
        >
          <ScanText className="h-10 w-10 text-teal-600" aria-hidden="true" />
          <span className="mt-3 text-sm font-semibold text-slate-800">
            Click to browse, or drop an image or PDF here
          </span>
          <span className="mt-1 text-xs text-slate-500">
            PNG · JPG · JPEG · WEBP · BMP · TIFF · GIF · PDF (max {MAX_MB} MB)
          </span>
          <input
            id="scan-image-input"
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={chooseFile}
            className="sr-only"
          />
        </label>

        {pickError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {pickError}
          </p>
        )}

        {file && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Preview of ${file.name}`}
                className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">
                {file.type || 'file'} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Choose another
              </Button>
              <Button size="sm" onClick={() => void extractText()} loading={extracting}>
                {extracting ? 'Extracting…' : 'Extract text'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {extracting && (
        <Card>
          <CardHeader title="Reading the file…" subtitle={file?.name} />
          <Spinner label="Running OCR — this can take a few seconds" />
        </Card>
      )}

      {requestError && (
        <Card>
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {requestError.message}
          </p>
          {requestError.status === 503 && (
            <p className="mt-2 text-xs text-slate-500">
              The server does not have the Tesseract OCR engine installed. See{' '}
              <code className="rounded bg-slate-100 px-1">backend/OCR_SETUP.md</code> for setup steps.
            </p>
          )}
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader
            title="Extracted text"
            subtitle={`${result.character_count} characters · ${result.line_count} lines · ${result.language} · OCR is unverified — review before using it`}
            action={
              <Button variant="outline" size="sm" onClick={() => void copyText()} icon={copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            }
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            aria-label="Extracted text (editable)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={reset} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
              Start over
            </Button>
            <Button onClick={() => void summarizeText()} loading={summarizing} icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
              {summarizing ? 'Summarizing…' : 'Summarize with AI'}
            </Button>
          </div>
          {aiError && (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {aiError}
            </p>
          )}
        </Card>
      )}

      {aiSummary && (
        <Card>
          <CardHeader
            title="AI summary of this text"
            subtitle="A separate AI step — generated from the extracted text, nothing was saved"
            action={
              <Badge tone={isLocalFallback(aiSummary.model_used) ? 'amber' : 'green'}>
                {isLocalFallback(aiSummary.model_used)
                  ? aiSummary.model_used === 'local-fallback-llm-error'
                    ? 'AI unavailable · local fallback'
                    : 'local fallback'
                  : aiSummary.model_used}
              </Badge>
            }
          />
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800">
            {aiSummary.summary_text}
          </p>
          <p className="mt-2 text-xs text-slate-500">{aiSummary.notice}</p>
        </Card>
      )}
    </div>
  );
}