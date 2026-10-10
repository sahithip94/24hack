import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Download, ExternalLink, Trash2 } from 'lucide-react';
import type { PatientRecord } from '../../types';
import { categoryInfo } from '../../lib/categories';
import { formatBytes, formatDate } from '../../lib/format';
import {
  openPatientDocument,
  openPatientDocumentInNewTab,
  downloadPatientDocument,
} from '../../lib/documents';
import { Badge } from '../ui/Badge';

interface RecordCardProps {
  record: PatientRecord;
  /** Original filename, resolved from the document list when available. */
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  /** Open the full-details view for this record (tapping the card). */
  onOpen?: (record: PatientRecord) => void;
  /** Open the source file in the in-app viewer (the ↗ button). */
  onOpenFile?: (record: PatientRecord) => void;
  onDelete?: (record: PatientRecord) => void;
}

export function RecordCard({
  record,
  fileName,
  contentType,
  fileSize,
  onOpen,
  onOpenFile,
  onDelete,
}: RecordCardProps) {
  const info = categoryInfo(record.category);
  const Icon = info.icon;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Load a small thumbnail for image documents (authenticated blob).
  useEffect(() => {
    let revoked = false;
    if (record.document_id && contentType && contentType.startsWith('image/')) {
      openPatientDocument(record.document_id)
        .then((url) => {
          if (!revoked) setThumbUrl(url);
        })
        .catch(() => undefined);
    }
    return () => {
      revoked = true;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.document_id, contentType]);

  const handleOpen = async (event: MouseEvent) => {
    event.stopPropagation();
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

  const handleDownload = async (event: MouseEvent) => {
    event.stopPropagation();
    if (record.document_id == null) return;
    setError(null);
    try {
      await downloadPatientDocument(record.document_id, fileName ?? `${record.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the file.');
    }
  };

  const handleOpenFile = (event: MouseEvent) => {
    event.stopPropagation();
    if (onOpenFile) {
      onOpenFile(record);
      return;
    }
    void handleOpen(event);
  };

  const handleTitleClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (onOpen) {
      onOpen(record);
    } else {
      void handleOpen(event);
    }
  };

  return (
    <div className="group rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        className={`flex items-center gap-4 p-4 ${onOpen ? 'cursor-pointer' : ''}`}
        onClick={onOpen ? () => onOpen(record) : undefined}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${info.color}`}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={handleTitleClick}
            disabled={!onOpen && (record.document_id == null || opening)}
            className="block truncate text-sm font-semibold text-slate-900 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded disabled:cursor-not-allowed disabled:text-slate-400"
            title={onOpen ? `View ${record.title}` : 'Open source document'}
          >
            {record.title}
          </button>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {fileName ? `${fileName} · ` : ''}
            {fileSize != null ? `${formatBytes(fileSize)} · ` : ''}
            {record.event_date ? formatDate(record.event_date) : 'No date documented'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="teal">{info.label}</Badge>
            {record.verified && <Badge tone="green">Verified</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {record.document_id != null && (
            <>
              <button
                type="button"
                onClick={(event) => handleOpenFile(event)}
                disabled={opening}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
                aria-label={`Open ${record.title}`}
                title="View file in app"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(event) => void handleDownload(event)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                aria-label={`Download ${record.title}`}
                title="Download source file"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(record);
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              aria-label={`Delete ${record.title}`}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="px-4 pb-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
