import { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { ShareLinkInfo } from '../../types';
import { apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ShareListItemProps {
  share: ShareLinkInfo;
  /** Record titles resolved client-side from the patient's record list. */
  recordTitles: string[];
  /** Share URL cached at creation time (the backend only returns it once). */
  cachedUrl: string | null;
  onChanged: () => void;
  /** Opens the parent's delete confirmation for this share. */
  onRequestDelete?: () => void;
}

const statusTone: Record<string, 'green' | 'amber' | 'red'> = {
  active: 'green',
  expired: 'amber',
  revoked: 'red',
};

const statusLabel: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

export function ShareListItem({ share, recordTitles, cachedUrl, onChanged, onRequestDelete }: ShareListItemProps) {
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);

  const copyLink = async () => {
    if (!cachedUrl) return;
    try {
      await navigator.clipboard.writeText(cachedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the link. Select it manually in the field below.');
    }
  };

  const revoke = async () => {
    setWorking(true);
    setError(null);
    try {
      await apiFetch(`/sharing/${share.share_id}/revoke`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke the share.');
    } finally {
      setWorking(false);
    }
  };

  const previewAsGuest = () => {
    if (cachedUrl) {
      window.open(cachedUrl, '_blank', 'noopener');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Share #{share.share_id}
            </p>
            <Badge tone={statusTone[share.status]}>{statusLabel[share.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {share.record_ids.length} record{share.record_ids.length === 1 ? '' : 's'} ·
            created {formatDateTime(share.created_at)} · expires{' '}
            {formatDateTime(share.expires_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {recordTitles.slice(0, 4).map((title) => (
              <span
                key={title}
                className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {title}
              </span>
            ))}
            {recordTitles.length > 4 && (
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                +{recordTitles.length - 4} more
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {share.status === 'active' && cachedUrl && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                icon={
                  copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )
                }
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={previewAsGuest}
                icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Open
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={revoke}
                loading={working}
                icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Revoke
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowActivity((v) => !v)}
            icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            aria-expanded={showActivity}
          >
            Activity
          </Button>
          {onRequestDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRequestDelete}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {cachedUrl ? (
        <div className="mt-3">
          <label htmlFor={`link-${share.share_id}`} className="sr-only">
            Share link #{share.share_id}
          </label>
          <input
            id={`link-${share.share_id}`}
            readOnly
            value={cachedUrl}
            onFocus={(e) => e.target.select()}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The link for this share is not available on this device. The backend
          returns each share URL only at creation time, so recreate the share to
          get a new link.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {showActivity && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Access activity
          </h3>
          <p className="text-sm text-slate-500">
            The backend records audit entries for share creation, guest PIN
            verification, record access, and revocation. To view them, fetch{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">GET /audit-logs</code>{' '}
            with your patient token — guest-level per-share activity is not
            returned by the current API.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Share ID {share.share_id} · status {share.status}
          </p>
        </div>
      )}
    </div>
  );
}
