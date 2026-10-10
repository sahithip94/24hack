import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, Filter } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import type { PatientRecord } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { categoryInfo, categoryLabel, CATEGORIES } from '../lib/categories';
import { formatDate } from '../lib/format';
import { openPatientDocument } from '../lib/documents';

interface TimelineResponse {
  count: number;
  records: PatientRecord[];
}

interface DayGroup {
  label: string;
  dateKey: string | null;
  records: PatientRecord[];
}

export function Timeline() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applied, setApplied] = useState({ category: '', start: '', end: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (applied.category) params.set('category', applied.category);
    if (applied.start) params.set('start_date', applied.start);
    if (applied.end) params.set('end_date', applied.end);
    const query = params.toString();
    try {
      const body = await apiFetch<TimelineResponse>(
        `/timeline${query ? `?${query}` : ''}`,
      );
      setRecords(body.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the timeline.');
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

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
      dateKey,
      records: byDate.get(dateKey) ?? [],
    }));
    if (undated.length > 0) {
      result.push({ label: 'Undated', dateKey: null, records: undated });
    }
    return result;
  }, [records]);

  const openRecord = async (record: PatientRecord) => {
    if (record.document_id == null) return;
    try {
      const url = await openPatientDocument(record.document_id);
      window.open(url, '_blank', 'noopener');
    } catch {
      // File may have been removed; the record stays on the timeline.
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Health timeline
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.name} · every record in date order, filtered to what matters
          today
        </p>
      </div>

      <Card>
        <CardHeader
          title="Filters"
          subtitle="Narrow the timeline by category and date range"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryFilter('');
                setStartDate('');
                setEndDate('');
                setApplied({ category: '', start: '', end: '' });
              }}
            >
              Clear
            </Button>
          }
        />
        <form
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({
              category: categoryFilter,
              start: startDate,
              end: endDate,
            });
          }}
        >
          <Select
            label="Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input
            label="From"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <Button type="submit" icon={<Filter className="h-4 w-4" aria-hidden="true" />}>
            Apply filters
          </Button>
        </form>
      </Card>

      {loading ? (
        <Spinner label="Loading your timeline…" />
      ) : error ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden="true" />}
          title="Could not load the timeline"
          description={error}
          action={<Button variant="outline" onClick={() => void load()}>Retry</Button>}
        />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
          title="Nothing on this timeline yet"
          description={
            applied.category || applied.start || applied.end
              ? 'No records match the current filters.'
              : 'Upload your first medical document to start your timeline.'
          }
          action={
            <Button variant="outline" size="sm" onClick={() => navigate('/upload')}>
              Upload a record
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label} aria-label={`Records on ${group.label}`}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  {group.label}
                </h2>
                <span className="text-xs text-slate-400">
                  {group.records.length} record{group.records.length === 1 ? '' : 's'}
                </span>
                <div className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              </div>
              <ul className="space-y-3">
                {group.records.map((record) => {
                  const info = categoryInfo(record.category);
                  return (
                    <li
                      key={record.record_id}
                      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
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
                          onClick={() => void openRecord(record)}
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
                          {record.verified && <Badge tone="green">Verified</Badge>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
