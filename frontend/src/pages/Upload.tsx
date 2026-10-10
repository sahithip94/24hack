import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  ScanText,
  UploadCloud,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  ApiRequestError,
  apiFetch,
  uploadDocumentWithProgress,
} from '../lib/api';
import type {
  DocumentUploadResponse,
  ExtractionResponse,
} from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { CATEGORIES } from '../lib/categories';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.txt,.webp';
const MAX_MB = 10;

type Phase =
  | { name: 'select' }
  | { name: 'uploading'; percent: number }
  | { name: 'review'; extraction: ExtractionResponse; previewUrl: string | null }
  | { name: 'done'; createdCount: number }
  | { name: 'error'; message: string };

interface Draft {
  category: string;
  title: string;
  eventDate: string;
  details: string;
}

export function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'select' });
  const [file, setFile] = useState<File | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    category: 'medical_document',
    title: '',
    eventDate: '',
    details: '',
  });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Revoke the local preview URL when leaving the review phase.
    return () => {
      if (
        phase.name === 'review' &&
        phase.previewUrl
      ) {
        URL.revokeObjectURL(phase.previewUrl);
      }
    };
  }, [phase]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    setPickError(null);
    if (!chosen) return;
    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'webp'];
    const ext = chosen.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowed.includes(ext)) {
      setPickError(
        'Unsupported file type. Please upload a PDF, PNG, JPG, JPEG, TXT, or WEBP file.',
      );
      return;
    }
    if (chosen.size > MAX_MB * 1024 * 1024) {
      setPickError(`File is larger than ${MAX_MB} MB. Choose a smaller file.`);
      return;
    }
    setFile(chosen);
  };

  const startUpload = async () => {
    if (!file) return;
    setPickError(null);
    const abort = new AbortController();
    const form = new FormData();
    form.append('file', file);

    setPhase({ name: 'uploading', percent: 0 });
    try {
      const xhr = await uploadDocumentWithProgress(
        '/documents/upload',
        form,
        (percent) => setPhase({ name: 'uploading', percent }),
        abort.signal,
      );
      if (xhr.status !== 200 && xhr.status !== 201) {
        let detail = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string };
          if (typeof body.detail === 'string') detail = body.detail;
        } catch {
          // keep generic message
        }
        throw new ApiRequestError(detail, xhr.status);
      }
      const uploaded = JSON.parse(xhr.responseText) as DocumentUploadResponse;

      // Failed extraction (e.g. unreadable scan) still returns 200
      // with status 'failed' or 'needs_ocr_setup'.
      const extraction = await apiFetch<ExtractionResponse>(
        `/documents/${uploaded.document_id}/extraction`,
      );
      const candidate = extraction.candidate_fields;
      setDraft({
        category: candidate.candidate_category || 'medical_document',
        title: candidate.candidate_title || file.name.replace(/\.[^.]+$/, ''),
        eventDate: candidate.candidate_event_date ?? '',
        details: extraction.extracted_text || candidate.text_preview || '',
      });
      const previewUrl =
        file.type.startsWith('image/') || file.type === 'application/pdf'
          ? URL.createObjectURL(file)
          : null;
      setPhase({ name: 'review', extraction, previewUrl });
    } catch (err) {
      setPhase({
        name: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (phase.name !== 'review') return;
    setSaving(true);
    try {
      const body = await apiFetch<{
        created_records: Array<{ record_id: number }>;
        message: string;
      }>(`/documents/${phase.extraction.document_id}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          records: [
            {
              category: draft.category,
              title: draft.title.trim(),
              event_date: draft.eventDate || null,
              details: draft.details,
            },
          ],
        }),
      });
      setPhase({
        name: 'done',
        createdCount: body.created_records.length,
      });
    } catch (err) {
      setPhase({
        name: 'error',
        message: err instanceof Error ? err.message : 'Could not save the record.',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPickError(null);
    setDraft({
      category: 'medical_document',
      title: '',
      eventDate: '',
      details: '',
    });
    setPhase({ name: 'select' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const statusNote = (extraction: ExtractionResponse): { tone: 'amber' | 'red' | 'green'; text: string } | null => {
    switch (extraction.status) {
      case 'needs_ocr_setup':
        return {
          tone: 'amber',
          text: 'No text could be read from this file (it looks like a scanned image, and OCR is not installed on the server). Enter the record details by hand below.',
        };
      case 'needs_review':
        return {
          tone: 'amber',
          text: 'The file was uploaded but no meaningful text was detected. Please confirm the details below.',
        };
      case 'failed':
        return {
          tone: 'red',
          text: 'The server could not process this file. You can still enter the record details manually below.',
        };
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Upload a record
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.name} · PDF, PNG, JPG, JPEG, TXT, or WEBP up to {MAX_MB} MB.
          Text is extracted automatically; you always confirm the details before
          anything is saved to your timeline.
        </p>
      </div>

      {phase.name === 'select' && (
        <Card>
          <CardHeader
            title="Choose a file"
            subtitle="Lab results, prescriptions, discharge summaries, scans"
          />
          <label
            htmlFor="file-input"
            className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition-colors hover:border-teal-400 hover:bg-teal-50/40"
          >
            <UploadCloud className="h-10 w-10 text-teal-600" aria-hidden="true" />
            <span className="mt-3 text-sm font-semibold text-slate-800">
              Click to browse, or drop a file here
            </span>
            <span className="mt-1 text-xs text-slate-500">
              PDF · PNG · JPG · JPEG · TXT · WEBP (max {MAX_MB} MB)
            </span>
            <input
              id="file-input"
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <FileText className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {file.type || 'unknown type'} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset} icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Choose another
                </Button>
                <Button size="sm" onClick={() => void startUpload()}>
                  Upload
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {phase.name === 'uploading' && (
        <Card>
          <CardHeader title="Uploading…" subtitle={file?.name} />
          <div className="mt-2">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={phase.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="h-full rounded-full bg-teal-600 transition-all"
                style={{ width: `${phase.percent}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {phase.percent}% — extracting text and detecting record
              fields…
            </p>
          </div>
        </Card>
      )}

      {phase.name === 'review' && (
        <form onSubmit={handleVerify} noValidate className="space-y-6">
          <Card>
            <CardHeader
              title="Review extracted details"
              subtitle="Verify everything before it joins your timeline"
            />
            <div className="grid gap-4 md:grid-cols-2">
              {phase.previewUrl && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {file?.type === 'application/pdf' ? (
                    <iframe
                      title={`Preview of ${file?.name ?? 'document'}`}
                      src={phase.previewUrl}
                      className="h-72 w-full"
                    />
                  ) : (
                    <img
                      src={phase.previewUrl}
                      alt={`Preview of ${file?.name ?? 'uploaded document'}`}
                      className="mx-auto max-h-72 object-contain"
                    />
                  )}
                </div>
              )}
              <div className="space-y-4">
                <Input
                  label="Record title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  required
                />
                <Select
                  label="Category"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Event date"
                  type="date"
                  value={draft.eventDate}
                  onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })}
                  hint="The date these records relate to (optional)."
                />
                <div>
                  <label
                    htmlFor="details"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Record details <span aria-hidden="true" className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="details"
                    value={draft.details}
                    onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                    required
                    rows={7}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
            </div>

            {statusNote(phase.extraction) && (
              <p
                role={statusNote(phase.extraction)?.tone === 'red' ? 'alert' : 'status'}
                className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                  statusNote(phase.extraction)?.tone === 'red'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {statusNote(phase.extraction)?.text}
              </p>
            )}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
                Extracted text ({phase.extraction.candidate_fields.text_character_count} characters)
              </p>
              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                {phase.extraction.extracted_text ||
                  '(no text could be extracted from this file)'}
              </p>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving} icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
              Save to my records
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              Discard
            </Button>
          </div>
        </form>
      )}

      {phase.name === 'done' && (
        <Card>
          <div className="py-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              Record saved
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
              {phase.createdCount} record added to your timeline and is now
              available to share via secure links.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={() => navigate('/records')}>View my records</Button>
              <Button variant="outline" onClick={reset}>
                Upload another
              </Button>
            </div>
          </div>
        </Card>
      )}

      {phase.name === 'error' && (
        <Card>
          <div className="py-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <RotateCcw className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              Upload failed
            </h2>
            <p role="alert" className="mx-auto mt-2 max-w-sm text-sm text-red-700">
              {phase.message}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={reset}>Try again</Button>
              <Button variant="outline" onClick={() => navigate('/records')}>
                Back to records
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
