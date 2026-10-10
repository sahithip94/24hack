import { useEffect, useState } from 'react';
import { FileQuestion } from 'lucide-react';
import { openPatientDocument } from '../../lib/documents';

interface DocumentPreviewProps {
  documentId: number;
  contentType?: string;
  filename?: string;
}

/**
 * Render an uploaded document inline so it can be viewed without leaving the
 * app. The file is fetched with the bearer token as a blob URL (plain
 * <img>/<iframe> requests cannot carry the auth header) and rendered by type:
 * images inline, PDFs and text in an embedded viewer.
 */
export function DocumentPreview({
  documentId,
  contentType,
  filename,
}: DocumentPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    openPatientDocument(documentId)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the file.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Release the object URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const type = contentType ?? '';

  if (error) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {error}
      </p>
    );
  }

  if (!url) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
        Loading preview…
      </div>
    );
  }

  if (type.startsWith('image/')) {
    return (
      <img
        src={url}
        alt={filename ?? 'Document preview'}
        className="mx-auto max-h-[60vh] w-auto rounded-lg border border-slate-200 object-contain"
      />
    );
  }

  if (type === 'application/pdf' || type === 'application/x-pdf') {
    return (
      <iframe
        src={url}
        title={filename ?? 'PDF preview'}
        className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white"
      />
    );
  }

  if (type.startsWith('text/')) {
    return (
      <iframe
        src={url}
        title={filename ?? 'Text preview'}
        className="h-[50vh] w-full rounded-lg border border-slate-200 bg-white"
      />
    );
  }

  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
      <FileQuestion className="h-6 w-6 text-slate-400" aria-hidden="true" />
      Preview is not available for this file type. Use Open or Download.
    </div>
  );
}
