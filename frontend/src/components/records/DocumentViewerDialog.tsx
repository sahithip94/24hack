import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import type { PatientRecord } from '../../types';
import {
  downloadPatientDocument,
  openPatientDocumentInNewTab,
} from '../../lib/documents';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { DocumentPreview } from './DocumentPreview';

interface DocumentViewerDialogProps {
  record: PatientRecord | null;
  fileName?: string;
  contentType?: string;
  onClose: () => void;
}

/**
 * Full-screen in-app viewer for an uploaded document. Built on the Modal, so
 * it has a top-right close button and the browser Back gesture dismisses it
 * (instead of leaving the page). Viewing happens in-app; "Open in new tab"
 * and "Download" remain available as secondary actions.
 */
export function DocumentViewerDialog({
  record,
  fileName,
  contentType,
  onClose,
}: DocumentViewerDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!record || record.document_id == null) return null;
  const documentId = record.document_id;

  const handleNewTab = async () => {
    setBusy(true);
    setError(null);
    try {
      await openPatientDocumentInNewTab(documentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadPatientDocument(documentId, fileName ?? record.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={fileName ?? 'Document'} width="max-w-5xl">
      <DocumentPreview
        documentId={documentId}
        contentType={contentType}
        filename={fileName}
      />

      {error && (
        <p
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          onClick={() => void handleNewTab()}
          icon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}
        >
          Open in new tab
        </Button>
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          onClick={() => void handleDownload()}
          icon={<Download className="h-4 w-4" aria-hidden="true" />}
        >
          Download
        </Button>
      </div>
    </Modal>
  );
}
