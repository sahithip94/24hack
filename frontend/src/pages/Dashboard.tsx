import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileText,
  FolderOpen,
  Share2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { openPatientDocument } from '../lib/documents';
import type {
  PatientRecord,
  RepeatTestAlertsResponse,
  ShareLinkInfo,
} from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { categoryInfo, categoryLabel } from '../lib/categories';
import {
  firstName,
  formatDate,
  greetingForHour,
  timeAgo,
} from '../lib/format';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [shares, setShares] = useState<ShareLinkInfo[]>([]);
  const [alerts, setAlerts] = useState<RepeatTestAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PatientRecord[]>('/records'),
      apiFetch<ShareLinkInfo[]>('/sharing/my-links'),
      apiFetch<RepeatTestAlertsResponse>('/records/alerts'),
    ])
      .then(([recordList, shareList, alertBody]) => {
        if (cancelled) return;
        setRecords(recordList);
        setShares(shareList);
        setAlerts(alertBody);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load your dashboard.',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openRecord = async (record: PatientRecord) => {
    if (record.document_id == null) return;
    try {
      // Fetches the original file as an authenticated blob and
      // opens it in a new tab (bearer tokens cannot be attached
      // to plain navigation requests).
      const url = await openPatientDocument(record.document_id);
      window.open(url, '_blank', 'noopener');
    } catch {
      // The document file may have been removed; the record
      // itself remains viewable in the records list.
    }
  };

  if (loading) return <Spinner label="Loading your dashboard…" />;

  if (error) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        title="Could not load your dashboard"
        description={error}
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      />
    );
  }

  const categories = new Set(records.map((r) => r.category));
  const activeShares = shares.filter((s) => s.status === 'active').length;
  const recentRecords = [...records]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const latestEventDate = records
    .map((r) => r.event_date)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {greetingForHour()}, {firstName(user?.name ?? '')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here is what is happening with your medical records.
        </p>
      </div>

      {/* Repeat-test alerts */}
      {alerts && alerts.count > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-amber-900">
                Possible repeated {alerts.count === 1 ? 'test' : 'tests'} detected
              </h2>
              <ul className="mt-1.5 space-y-1">
                {alerts.alerts.map((alert) => (
                  <li
                    key={alert.title + alert.dates.join(',')}
                    className="text-sm text-amber-800"
                  >
                    <strong className="font-medium">{alert.title}</strong> appears
                    on {alert.dates.length} date
                    {alert.dates.length === 1 ? '' : 's'} ({alert.dates.map((d) => formatDate(d)).join(', ')}).
                    Ask your provider whether this test is still needed.
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate('/timeline')}
                icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Review on timeline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {records.length}
              </p>
              <p className="text-xs text-slate-500">Total records</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {categories.size}
              </p>
              <p className="text-xs text-slate-500">Categories</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Share2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeShares}</p>
              <p className="text-xs text-slate-500">Active shares</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {latestEventDate ? formatDate(latestEventDate) : '—'}
              </p>
              <p className="text-xs text-slate-500">Latest record date</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader title="Quick actions" subtitle="Common tasks, one click away" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Button
            variant="secondary"
            size="lg"
            className="h-auto w-full flex-col gap-1.5 py-4"
            onClick={() => navigate('/upload')}
            icon={<Upload className="h-5 w-5 text-teal-600" aria-hidden="true" />}
          >
            <span className="text-sm font-semibold text-slate-800">
              Upload a record
            </span>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="h-auto w-full flex-col gap-1.5 py-4"
            onClick={() => navigate('/records')}
            icon={<FileText className="h-5 w-5 text-teal-600" aria-hidden="true" />}
          >
            <span className="text-sm font-semibold text-slate-800">
              View my records
            </span>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="h-auto w-full flex-col gap-1.5 py-4"
            onClick={() => navigate('/shared-access')}
            icon={<Share2 className="h-5 w-5 text-teal-600" aria-hidden="true" />}
          >
            <span className="text-sm font-semibold text-slate-800">
              Share records
            </span>
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent records */}
        <Card>
          <CardHeader
            title="Recent records"
            subtitle={records.length > 0 ? 'Your most recent uploads' : undefined}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/records')}
                icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                View all
              </Button>
            }
          />
          {recentRecords.length === 0 ? (
            <EmptyState
              icon={<Upload className="h-6 w-6" aria-hidden="true" />}
              title="No records yet"
              description="Upload your first medical record - a lab result, prescription, or scan - to get started."
              action={
                <Button variant="outline" size="sm" onClick={() => navigate('/upload')}>
                  Upload a record
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentRecords.map((record) => {
                const info = categoryInfo(record.category);
                return (
                  <li key={record.record_id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${info.color}`}
                    >
                      <info.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void openRecord(record)}
                        disabled={record.document_id == null}
                        className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-teal-700 disabled:cursor-default disabled:text-slate-500"
                        title={
                          record.document_id != null
                            ? `Open ${record.title}`
                            : 'No source document attached'
                        }
                      >
                        {record.title}
                      </button>
                      <p className="text-xs text-slate-500">
                        {categoryLabel(record.category)} ·{' '}
                        {record.event_date ? formatDate(record.event_date) : 'no date'} ·{' '}
                        added {timeAgo(record.created_at)}
                      </p>
                    </div>
                    <Badge tone="teal">{info.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Active shares */}
        <Card>
          <CardHeader
            title="Your shares"
            subtitle="Secure links you have created"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/shared-access')}
                icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Manage
              </Button>
            }
          />
          {shares.length === 0 ? (
            <EmptyState
              icon={<Share2 className="h-6 w-6" aria-hidden="true" />}
              title="No shares yet"
              description="Create a secure link to let a family member or new provider view selected records - no account required."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/shared-access')}
                >
                  Share records
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {shares.slice(0, 5).map((share) => (
                <li
                  key={share.share_id}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      Share #{share.share_id} · {share.record_ids.length} record
                      {share.record_ids.length === 1 ? '' : 's'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Created {timeAgo(share.created_at)} · expires{' '}
                      {formatDate(share.expires_at)}
                    </p>
                  </div>
                  <Badge tone={share.status === 'active' ? 'green' : share.status === 'expired' ? 'amber' : 'red'}>
                    {share.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
