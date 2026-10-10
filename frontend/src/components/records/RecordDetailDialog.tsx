import { useState } from 'react';
import { Download, ExternalLink, Trash2 } from 'lucide-react';
import type { PatientRecord } from '../../types';
import { categoryInfo } from '../../lib/categories';
import { formatBytes, formatDate, timeAgo } from '../../lib/format';
import { openPatientDocumentInNewTab, downloadPatientDocument } from '../../lib/documents';
import { DocumentPreview } from './DocumentPreview';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface RecordDetailDialogProps {
  record: PatientRecord | null;
  /** Original filename, resolved from the document list when available. */
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  onClose: () => void;
  /** Ask the parent to open the full-screen in-app viewer for this record. */
  onRequestView?: (record: PatientRecord) => void;
  /** Ask the parent to open its delete confirmation for this record. */
  onRequestDelete: (record: PatientRecord) => void;
}

/**
 * Full-details view for a single record, opened by tapping the record card.
 * Shows everything stored for the record plus the source file actions.
 */
export function RecordDetailDialog({
  record,
  fileName,
  contentType,
  fileSize,
  onClose,
  onRequestView,
  onRequestDelete,
}: RecordDetailDialogProps) {
  const [opening, setOpening] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!record) return null;

  const info = categoryInfo(record.category);
  const Icon = info.icon;
  const hasDocument = record.document_id != null;

  const handleOpen = async () => {
    if (record.document_id == null) return;
    setOpening(true);
    setError(null);
    try {
      await openPatientDocumentInNewTab(record.document_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file.');
    } finally {
      setOpening(false);
    }
  };

  const handleDownload = async () => {
    if (record.document_id == null) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadPatientDocument(record.document_id, fileName ?? record.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the file.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Record details" width="max-w-3xl">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${info.color}`}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900">
            {record.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="teal">{info.label}</Badge>
            {record.verified && <Badge tone="green">Verified</Badge>}
            <span className="text-xs text-slate-400">
              added {timeAgo(record.created_at)}
            </span>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Event date
          </dt>
          <dd className="mt-0.5 text-slate-800">
            {record.event_date ? formatDate(record.event_date) : 'Not documented'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Category
          </dt>
          <dd className="mt-0.5 text-slate-800">{info.label}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Details
        </p>
        <p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          {record.details?.trim() ? record.details : 'No details were recorded.'}
        </p>
      </div>

      {hasDocument && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Preview
          </p>
          <div className="mt-1">
            <DocumentPreview
              documentId={record.document_id as number}
              contentType={contentType}
              filename={fileName}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Source file
          </p>
          <p className="truncate text-sm text-slate-800">
            {hasDocument ? fileName ?? `Document #${record.document_id}` : 'No file attached'}
          </p>
          {hasDocument && (fileSize != null || contentType) && (
            <p className="text-xs text-slate-500">
              {contentType ?? 'file'}
              {fileSize != null ? ` · ${formatBytes(fileSize)}` : ''}
            </p>
          )}
        </div>
        {hasDocument && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onRequestView ? onRequestView(record) : void handleOpen()
              }
              loading={opening}
              icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDownload()}
              loading={downloading}
              icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Download
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => onRequestDelete(record)}
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          className="text-slate-400 hover:text-red-600"
        >
          Delete
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
