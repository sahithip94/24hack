import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckSquare, FileText, Info, Sparkles, Square, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import type { PatientRecord, SummaryHistoryEntry, SummaryResponse } from '../types';
import { DeleteSummaryDialog } from '../components/summaries/DeleteSummaryDialog';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { categoryInfo } from '../lib/categories';
import { formatDate, timeAgo } from '../lib/format';
import { isLocalFallback } from '../lib/llm';

export function AiSummary() {
  const { user } = useAuth();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [history, setHistory] = useState<SummaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SummaryHistoryEntry | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PatientRecord[]>('/records'),
      apiFetch<SummaryHistoryEntry[]>('/summary/history'),
    ])
      .then(([recordList, historyList]) => {
        if (cancelled) return;
        setRecords(recordList);
        setHistory(historyList);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load summary data.',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((r) => r.record_id)));
    }
  };

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();
    setGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      // record_ids is optional: the backend summarizes all records
      // when none are selected.
      const body = await apiFetch<SummaryResponse>('/summary/generate', {
        method: 'POST',
        body: JSON.stringify({
          record_ids: selected.size > 0 ? [...selected] : undefined,
        }),
      });
      setResult(body);
      // Keep the history list in sync with the new summary.
      setHistory((prev) => [body, ...prev]);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : 'Could not generate a summary.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSummaryDeleted = (summaryId: number) => {
    setHistory((prev) => prev.filter((entry) => entry.summary_id !== summaryId));
    // If the deleted summary is the one currently on screen, clear it.
    setResult((prev) => (prev && prev.summary_id === summaryId ? null : prev));
    setDeleteTarget(null);
  };

  if (loading) return <Spinner label="Loading summary tool…" />;

  if (error) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        title="Could not load the summary tool"
        description={error}
        action={<Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  const usingLocalFallback = isLocalFallback(result?.model_used);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          AI summary
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.name} · a plain-language overview of your records
        </p>
      </div>

      <Card>
        <CardHeader
          title="Choose what to summarize"
          subtitle={
            selected.size > 0
              ? `${selected.size} of ${records.length} records selected`
              : `All ${records.length} records will be summarized`
          }
          action={
            records.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {selected.size === records.length ? 'Clear selection' : 'Select all'}
              </Button>
            ) : undefined
          }
        />

        {records.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            title="No records to summarize"
            description="Upload some medical documents first, then generate a summary."
            action={<Button variant="outline" size="sm" onClick={() => (window.location.href = '/upload')}>Upload a record</Button>}
          />
        ) : (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {records.map((record) => {
                const info = categoryInfo(record.category);
                const isSelected = selected.has(record.record_id);
                return (
                  <button
                    key={record.record_id}
                    type="button"
                    onClick={() => toggle(record.record_id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/60'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="text-teal-700" aria-hidden="true">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </span>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${info.color}`}
                      aria-hidden="true"
                    >
                      <info.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {record.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {record.event_date ? formatDate(record.event_date) : 'no date'}
                        {' · '}
                        {info.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Button
              type="submit"
              loading={generating}
              icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            >
              {generating
                ? 'Generating summary…'
                : selected.size > 0
                  ? `Summarize ${selected.size} record${selected.size === 1 ? '' : 's'}`
                  : 'Summarize all my records'}
            </Button>
          </form>
        )}
      </Card>

      {generateError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {generateError}
        </p>
      )}

      {result && (
        <Card>
          <CardHeader
            title="Generated summary"
            subtitle={`Summary #${result.summary_id} · created ${timeAgo(result.created_at)}`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(result)}
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                className="text-slate-400 hover:text-red-600"
                title="Delete this summary"
              >
                Delete
              </Button>
            }
          />

          {usingLocalFallback ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="text-sm text-amber-900">
                <strong className="font-semibold">
                  {result.model_used === 'local-fallback-llm-error'
                    ? 'The AI provider could not be reached.'
                    : 'Demo summary - no AI provider is configured.'}
                </strong>{' '}
                The backend produced this overview with a local,
                rule-based fallback (model used:{' '}
                <code className="rounded bg-amber-100 px-1 text-xs">
                  {result.model_used}
                </code>
                ).{' '}
                {result.model_used === 'local-fallback-llm-error'
                  ? 'This is usually a temporary outage or a rate limit - try again shortly. It is not medical advice.'
                  : 'It rearranges your record titles and dates - it is not medical advice and does not use a large language model. Connect an LLM provider in the backend to get real AI summaries.'}
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="text-sm text-emerald-900">
                <strong className="font-semibold">
                  AI provider summary
                </strong>{' '}
                (model used:{' '}
                <code className="rounded bg-emerald-100 px-1 text-xs">
                  {result.model_used}
                </code>
                ). Summaries can contain errors - always confirm with
                your care provider.
              </div>
            </div>
          )}

          <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {result.summary_text}
          </p>

          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Source records ({result.source_record_ids.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {result.source_record_ids.map((id) => {
                const record = records.find((r) => r.record_id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    title={record ? record.title : `Record ${id}`}
                  >
                    {record ? record.title : `Record #${id}`}
                  </span>
                );
              })}
              {result.source_record_ids.length === 0 && (
                <span className="text-xs text-slate-400">
                  No specific records were selected.
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader title="Previous summaries" subtitle="Generated during this demo" />
          <ul className="divide-y divide-slate-100">
            {history.map((entry) => {
              const expanded = expandedId === entry.summary_id;
              return (
                <li key={entry.summary_id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        Summary #{entry.summary_id}
                      </p>
                      <Badge tone={isLocalFallback(entry.model_used) ? 'amber' : 'green'}>
                        {isLocalFallback(entry.model_used)
                          ? 'local fallback'
                          : entry.model_used}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {timeAgo(entry.created_at)} · {entry.source_record_ids.length} record
                        {entry.source_record_ids.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : entry.summary_id)}
                      aria-expanded={expanded}
                      className={`mt-1 block w-full rounded text-left text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                        expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                      }`}
                      title={expanded ? 'Show less' : 'Show full summary'}
                    >
                      {entry.summary_text}
                    </button>
                    {expanded && entry.source_record_ids.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.source_record_ids.map((id) => {
                          const record = records.find((r) => r.record_id === id);
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                              title={record ? record.title : `Record #${id}`}
                            >
                              {record ? record.title : `Record #${id}`}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(entry)}
                    icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                    className="shrink-0 text-slate-400 hover:text-red-600"
                    aria-label={`Delete summary ${entry.summary_id}`}
                    title="Delete summary"
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <DeleteSummaryDialog
        summary={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleSummaryDeleted}
      />
    </div>
  );
}
