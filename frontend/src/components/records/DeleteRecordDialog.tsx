import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PatientRecord } from '../../types';
import { apiFetch } from '../../lib/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface DeleteRecordDialogProps {
  record: PatientRecord | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteRecordDialog({ record, onClose, onDeleted }: DeleteRecordDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!record) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/records/${record.record_id}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the record.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Delete record?" width="max-w-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm text-slate-700">
            Are you sure you want to delete{' '}
            <strong className="font-semibold">{record.title}</strong>?
            This removes the record from your timeline and from any
            active share links that include it.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} loading={deleting}>
          Delete record
        </Button>
      </div>
    </Modal>
  );
}
