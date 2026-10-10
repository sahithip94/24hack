import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CheckCircle2,
  Globe2,
  ListFilter,
  Share2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import type { CreatedShare, PatientRecord, ShareLinkInfo } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { RecordPicker } from '../components/sharing/RecordPicker';
import { ShareListItem } from '../components/sharing/ShareListItem';
import { formatDateTime } from '../lib/format';

/**
 * The backend returns each share URL exactly once, at creation
 * time (it stores only the token's hash). To let patients copy
 * the link again later, we cache it client-side by share ID.
 */
const SHARE_URL_CACHE_KEY = 'medivault_share_urls';

function loadUrlCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHARE_URL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveUrlCache(cache: Record<string, string>): void {
  localStorage.setItem(SHARE_URL_CACHE_KEY, JSON.stringify(cache));
}

type AccessMode = 'full' | 'selected';

const EXPIRY_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 24, label: '24 hours' },
  { value: 168, label: '7 days' },
] as const;

export function SharedAccess() {
  const { user } = useAuth();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [shares, setShares] = useState<ShareLinkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<AccessMode>('selected');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedShare | null>(null);
  const [copied, setCopied] = useState(false);
  const [urlCache, setUrlCache] = useState<Record<string, string>>(() =>
    loadUrlCache(),
  );
  const [deleteTarget, setDeleteTarget] = useState<ShareLinkInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PatientRecord[]>('/records'),
      apiFetch<ShareLinkInfo[]>('/sharing/my-links'),
    ])
      .then(([recordList, shareList]) => {
        if (cancelled) return;
        setRecords(recordList);
        setShares(shareList);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load sharing data.',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recordTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const record of records) map.set(record.record_id, record.title);
    return map;
  }, [records]);

  const fullAccessRecordIds = useMemo(
    () => records.map((r) => r.record_id),
    [records],
  );

  // Revoked links are removed from the list automatically - once a link is
  // revoked it should disappear, not linger as a "Revoked" row.
  const visibleShares = useMemo(
    () => shares.filter((s) => s.status !== 'revoked'),
    [shares],
  );

  const effectiveRecordIds =
    mode === 'full' ? fullAccessRecordIds : [...selected];

  const toggleRecord = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.share_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCreateError(
        'Could not copy automatically - select the link text and copy it manually.',
      );
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    if (mode === 'selected' && selected.size === 0) {
      setCreateError(
        'Select at least one record to share, or choose Full Access.',
      );
      return;
    }
    if (mode === 'full' && fullAccessRecordIds.length === 0) {
      setCreateError(
        'You have no records to share yet. Upload a record first.',
      );
      return;
    }
    setCreating(true);
    try {
      const created = await apiFetch<CreatedShare>('/sharing/create', {
        method: 'POST',
        body: JSON.stringify({
          record_ids: effectiveRecordIds,
          expires_in_hours: expiresInHours,
        }),
      });
      setResult(created);
      setCopied(false);
      // Cache the URL so the link can be copied again from
      // "Your share links" below (the backend returns it once).
      setUrlCache((prev) => {
        const next = { ...prev, [created.share_id]: created.share_url };
        saveUrlCache(next);
        return next;
      });
      setShares((prev) => [
        {
          share_id: created.share_id,
          record_ids: created.record_ids,
          created_at: new Date().toISOString(),
          expires_at: created.expires_at,
          revoked_at: null,
          status: 'active',
        },
        ...prev,
      ]);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Could not create the share.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSharesChanged = () => {
    void apiFetch<ShareLinkInfo[]>('/sharing/my-links').then((list) => {
      setShares(list);
    });
  };

  const openDelete = (share: ShareLinkInfo) => {
    setDeleteError(null);
    setDeleteTarget(share);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const removedId = deleteTarget.share_id;
    try {
      await apiFetch(`/sharing/${removedId}`, { method: 'DELETE' });
      setShares((prev) => prev.filter((s) => s.share_id !== removedId));
      setUrlCache((prev) => {
        const next = { ...prev };
        delete next[String(removedId)];
        saveUrlCache(next);
        return next;
      });
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete the share.',
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Spinner label="Loading sharing…" />;

  if (error) {
    return (
      <EmptyState
        icon={<Share2 className="h-6 w-6" aria-hidden="true" />}
        title="Could not load sharing"
        description={error}
        action={<Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Shared access
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.name} · create secure, PIN-protected links for family
          members or new providers - no account needed on their side
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
          <div className="text-sm text-teal-900">
            <strong className="font-semibold">How sharing works:</strong>{' '}
            you choose which records a link includes, set an expiry, and
            get a private URL plus a 6-digit PIN. The backend verifies the
            PIN, enforces the expiry, and revokes access on demand. Nothing
            is sent by email - share the link and PIN through a channel you
            trust.
          </div>
        </div>
      </div>

      <form onSubmit={handleCreate} className="space-y-6">
        <Card>
          <CardHeader
            title="Create a secure share"
            subtitle="Two ways to share - pick the access level"
          />

          {/* Access mode selection */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">
              Access level
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              <label
                className={`cursor-pointer rounded-xl border-2 p-4 transition-colors ${
                  mode === 'full'
                    ? 'border-teal-600 bg-teal-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Globe2
                    className={`h-5 w-5 ${mode === 'full' ? 'text-teal-700' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-slate-900">
                    Full Access
                  </span>
                  <input
                    type="radio"
                    name="access-mode"
                    value="full"
                    checked={mode === 'full'}
                    onChange={() => setMode('full')}
                    className="sr-only"
                  />
                </span>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  The guest can view <strong>all sections the backend
                  authorizes for a share</strong>: every one of your{' '}
                  {records.length} current medical records, plus the
                  timeline built from those records. Use this when a
                  provider or family member needs the complete picture.
                </p>
                <div className="mt-3">
                  <Badge tone="teal">
                    {records.length} record{records.length === 1 ? '' : 's'}
                  </Badge>
                </div>
              </label>

              <label
                className={`cursor-pointer rounded-xl border-2 p-4 transition-colors ${
                  mode === 'selected'
                    ? 'border-teal-600 bg-teal-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <ListFilter
                    className={`h-5 w-5 ${mode === 'selected' ? 'text-teal-700' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-slate-900">
                    Selected Access
                  </span>
                  <input
                    type="radio"
                    name="access-mode"
                    value="selected"
                    checked={mode === 'selected'}
                    onChange={() => setMode('selected')}
                    className="sr-only"
                  />
                </span>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  You choose <strong>exactly which records</strong> the
                  guest can open - for example, just the lab results from
                  this month, or only the documents a new provider
                  asked for. Everything else stays private.
                </p>
                <div className="mt-3">
                  <Badge tone={selected.size > 0 ? 'teal' : 'slate'}>
                    {selected.size} selected
                  </Badge>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Record picker for Selected Access */}
          {mode === 'selected' && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-slate-700">
                Records to share
              </h3>
              <RecordPicker
                records={records}
                selected={selected}
                onToggle={toggleRecord}
              />
            </div>
          )}

          {/* Expiry */}
          <div className="mt-5 max-w-xs">
            <Select
              label="Link expires after"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Summaries limitation notice */}
          <p className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              <strong className="font-medium">Note on summaries:</strong>{' '}
              the backend currently authorizes records (and a timeline
              derived from them) for guest links. AI summaries are not yet
              shareable - there is no guest summary endpoint - so they are
              intentionally not offered here rather than faked.
            </span>
          </p>

          {createError && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </p>
          )}

          <div className="mt-5">
            <Button
              type="submit"
              loading={creating}
              icon={<Share2 className="h-4 w-4" aria-hidden="true" />}
            >
              {creating
                ? 'Creating secure link…'
                : mode === 'full'
                  ? 'Create Full Access link'
                  : `Create link for ${selected.size} record${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </Card>
      </form>

      {/* Result modal */}
      <Modal
        open={result != null}
        onClose={() => setResult(null)}
        title="Secure share created"
        width="max-w-lg"
      >
        {result && (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              Your link is ready. Access expires on{' '}
              <strong className="font-semibold text-slate-800">
                {formatDateTime(result.expires_at)}
              </strong>
              , after which the link stops working automatically.
            </p>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Share link
              </p>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={result.share_url}
                  onFocus={(e) => e.target.select()}
                  aria-label="Share link"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <Button variant="outline" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Access PIN (shown only once)
              </p>
              <p className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="font-mono text-2xl font-bold tracking-[0.35em] text-amber-900">
                  {result.access_pin}
                </span>
                <span className="text-xs text-amber-800">
                  Save this PIN somewhere safe - you will need it to let
                  the guest in, and it is not shown again.
                </span>
              </p>
            </div>

            <p className="text-xs text-slate-500">
              Includes {result.record_ids.length} record
              {result.record_ids.length === 1 ? '' : 's'}. The guest
              verifies the PIN, then sees a read-only view with the
              records and their timeline. Revoke the link any time from
              the list below.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-600">
                <strong className="font-semibold">
                  Important:{' '}
                </strong>
                {result.important}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget != null}
        onClose={closeDelete}
        title="Delete share link"
        width="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Delete{' '}
              <strong className="font-semibold text-slate-900">
                Share #{deleteTarget.share_id}
              </strong>{' '}
              permanently? This removes it from your list and immediately stops
              anyone from using it - even with the correct PIN.
            </p>
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                The link URL and PIN will no longer work. This cannot be undone.
                To share again later, create a new link.
              </span>
            </p>
            {deleteError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDelete} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDelete()}
                loading={deleting}
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              >
                Delete link
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Existing links */}
      <Card>
        <CardHeader
          title="Your share links"
          subtitle="Active and expired shares"
        />
        {visibleShares.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-6 w-6" aria-hidden="true" />}
            title="No shares yet"
            description="Create a secure link above to give a family member or provider read-only access to your records."
          />
        ) : (
          <div className="space-y-3">
            {visibleShares.map((share) => (
              <ShareListItem
                key={share.share_id}
                share={share}
                recordTitles={share.record_ids
                  .map((id) => recordTitles.get(id) ?? '')
                  .filter(Boolean)}
                cachedUrl={urlCache[String(share.share_id)] ?? null}
                onChanged={handleSharesChanged}
                onRequestDelete={() => openDelete(share)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
