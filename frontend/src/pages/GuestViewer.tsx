import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  FileQuestion,
  LogOut,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { apiFetch, getGuestToken, setGuestToken } from '../lib/api';
import type { GuestRecordsResponse, PatientRecord } from '../types';
import { categoryInfo, categoryLabel } from '../lib/categories';
import { formatDate } from '../lib/format';
import { fetchFileAsObjectUrl } from '../lib/api';

type View = 'records' | 'timeline' | 'summary';

interface DayGroup {
  label: string;
  records: PatientRecord[];
}

export function GuestViewer() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<GuestRecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('records');

  const guestToken = getGuestToken(token);

  useEffect(() => {
    if (!guestToken) {
      // No PIN verification for this share in this browser.
      navigate(`/share/${token}`, { replace: true });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // The backend re-checks the share (active, unexpired,
    // unrevoked) and the token's scope on every request.
    // Guest requests authenticate with the share-scoped
    // guest access token, not the patient token.
    apiFetch<GuestRecordsResponse>(
      `/sharing/access/${token}/records`,
      {
        headers: { Authorization: `Bearer ${guestToken}` },
      },
    )
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLoading(false);
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          // The short-lived guest access token expired. Clear the stale
          // token so the PIN screen is not immediately skipped again.
          setGuestToken(token, null);
          setData(null);
          navigate(`/share/${token}`, { replace: true });
          return;
        }
        if (err.status === 410) {
          setError(
            'This share has expired or was revoked by the patient. Ask them to create a new secure link.',
          );
        } else {
          setError(err.message ?? 'Could not load the shared records.');
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // guestToken presence gates the request; the fetch itself
    // is authorized by the stored token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const records = useMemo(() => data?.records ?? [], [data]);

  const groups = useMemo<DayGroup[]>(() => {
    const byDate = new Map<string, PatientRecord[]>();
    const undated: PatientRecord[] = [];
    for (const record of records) {
      if (record.event_date) {
        const list = byDate.get(record.event_date) ?? [];
        list.push(record);
        byDate.set(record.event_date, list);
      } else {
        undated.push(record);
      }
    }
    const sortedDates = [...byDate.keys()].sort().reverse();
    const result: DayGroup[] = sortedDates.map((dateKey) => ({
      label: formatDate(dateKey),
      records: byDate.get(dateKey) ?? [],
    }));
    if (undated.length > 0) {
      result.push({ label: 'Undated', records: undated });
    }
    return result;
  }, [records]);

  const openGuestFile = async (record: PatientRecord) => {
    if (record.document_id == null) return;
    try {
      // Guest file access is authorized by the share; the
      // backend verifies membership before serving the file.
      const url = await fetchFileAsObjectUrl(
        `/sharing/access/${token}/documents/${record.document_id}/file`,
        guestToken!,
      );
      window.open(url, '_blank', 'noopener');
    } catch {
      // The patient may have deleted the source document.
    }
  };

  // Clear the stored guest token before leaving the read-only view so the
  // PIN screen does not silently redirect straight back here.
  const switchPin = () => {
    setGuestToken(token, null);
    navigate(`/share/${token}`);
  };

  const exitGuestView = () => {
    setGuestToken(token, null);
    navigate('/');
  };

  const tabs: Array<{ id: View; label: string; icon: typeof FileText }> = [
    { id: 'records', label: 'Records', icon: FileText },
    { id: 'timeline', label: 'Timeline', icon: CalendarDays },
    { id: 'summary', label: 'Summary', icon: Sparkles },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Logo />
          <span className="ml-3 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
            Guest view
          </span>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={switchPin}
              icon={<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">Enter a different PIN</span>
              <span className="sm:hidden">Different PIN</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exitGuestView}
              icon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Exit
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {loading ? (
          <Spinner label="Loading shared records…" />
        ) : error ? (
          <EmptyState
            icon={<FileQuestion className="h-6 w-6" aria-hidden="true" />}
            title="This share is unavailable"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Try again
              </Button>
            }
          />
        ) : data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Shared with you
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {records.length} record{records.length === 1 ? '' : 's'}
                  {' · '}read-only access until{' '}
                  {formatDate(data.expires_at)}
                </p>
              </div>
              <Badge tone="green">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Secured by the patient
              </Badge>
            </div>

            {/* Tab bar */}
            <nav className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200" aria-label="Shared sections">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setView(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {/* Records section */}
            {view === 'records' && (
              <div className="space-y-3">
                {records.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="h-6 w-6" aria-hidden="true" />}
                    title="No records in this share"
                    description="The patient did not include any records in this share."
                  />
                ) : (
                  records.map((record) => {
                    const info = categoryInfo(record.category);
                    return (
                      <div
                        key={record.record_id}
                        className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${info.color}`}
                          aria-hidden="true"
                        >
                          <info.icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => void openGuestFile(record)}
                            disabled={record.document_id == null}
                            className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-teal-700 disabled:cursor-default disabled:text-slate-500"
                            title={
                              record.document_id != null
                                ? `Open ${record.title}`
                                : 'No source document attached'
                            }
                          >
                            {record.title}
                          </button>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                            {record.details}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge tone="teal">{categoryLabel(record.category)}</Badge>
                            {record.event_date && (
                              <span className="text-xs text-slate-400">
                                {formatDate(record.event_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Timeline section (derived from the shared records) */}
            {view === 'timeline' && (
              <div className="space-y-6">
                {groups.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
                    title="Nothing to show"
                    description="No dated records were included in this share."
                  />
                ) : (
                  groups.map((group) => (
                    <section key={group.label} aria-label={`Records on ${group.label}`}>
                      <div className="mb-3 flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-slate-700">
                          {group.label}
                        </h2>
                        <span className="text-xs text-slate-400">
                          {group.records.length} record
                          {group.records.length === 1 ? '' : 's'}
                        </span>
                        <div className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                      </div>
                      <ul className="space-y-3">
                        {group.records.map((record) => {
                          const info = categoryInfo(record.category);
                          return (
                            <li
                              key={record.record_id}
                              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${info.color}`}
                                aria-hidden="true"
                              >
                                <info.icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => void openGuestFile(record)}
                                  disabled={record.document_id == null}
                                  className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-teal-700 disabled:cursor-default disabled:text-slate-500"
                                  title={
                                    record.document_id != null
                                      ? `Open ${record.title}`
                                      : 'No source document attached'
                                  }
                                >
                                  {record.title}
                                </button>
                                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                                  {record.details}
                                </p>
                              </div>
                              <Badge tone="teal">{categoryLabel(record.category)}</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            )}

            {/* Summary section - honestly unavailable */}
            {view === 'summary' && (
              <Card>
                <CardHeader
                  title="AI summary"
                  subtitle="Not available in shared view"
                />
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="text-sm text-slate-600">
                    <p>
                      <strong className="font-semibold text-slate-800">
                        Summaries cannot be shared yet.
                      </strong>
                    </p>
                    <p className="mt-1">
                      The backend currently authorizes individual
                      records for guest links - it has no
                      endpoint for sharing an AI summary with a
                      guest (a{' '}
                      <code className="rounded bg-slate-200 px-1 text-xs">
                        GET /sharing/access/&#123;token&#125;/summary
                      </code>{' '}
                      endpoint would be needed). Rather than
                      generating a summary from records the
                      patient may not have intended to share, we
                      show this notice instead.
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      The records and timeline above contain
                      exactly what the patient chose to share
                      with you.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
              {data.notice}
            </p>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6">
          <p className="text-xs text-slate-400">
            MediVault guest view - read-only, time-limited,
            server-enforced. Access ends automatically when the
            share expires.
          </p>
        </div>
      </footer>
    </div>
  );
}
