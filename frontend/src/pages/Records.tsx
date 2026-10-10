import { useEffect, useMemo, useState } from 'react';
import { FileText, Search, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import type { DocumentInfo, PatientRecord } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Select } from '../components/ui/Select';
import { RecordCard } from '../components/records/RecordCard';
import { RecordDetailDialog } from '../components/records/RecordDetailDialog';
import { DocumentViewerDialog } from '../components/records/DocumentViewerDialog';
import { DeleteRecordDialog } from '../components/records/DeleteRecordDialog';
import { categoryLabel, CATEGORIES } from '../lib/categories';

type SortKey = 'event_date' | 'title' | 'created_at';

export function Records() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('event_date');
  const [detailTarget, setDetailTarget] = useState<PatientRecord | null>(null);
  const [viewerTarget, setViewerTarget] = useState<PatientRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PatientRecord[]>('/records'),
      apiFetch<DocumentInfo[]>('/documents'),
    ])
      .then(([recordList, documentList]) => {
        if (cancelled) return;
        setRecords(recordList);
        setDocuments(documentList);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load records.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const documentById = useMemo(() => {
    const map = new Map<number, DocumentInfo>();
    for (const doc of documents) map.set(doc.document_id, doc);
    return map;
  }, [documents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (categoryFilter && record.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        record.title.toLowerCase().includes(q) ||
        categoryLabel(record.category).toLowerCase().includes(q) ||
        (record.details ?? '').toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      if (sortKey === 'created_at') return b.created_at.localeCompare(a.created_at);
      const ad = a.event_date ?? '';
      const bd = b.event_date ?? '';
      if (ad === bd) return b.created_at.localeCompare(a.created_at);
      return ad < bd ? -1 : 1;
    });
    return sorted;
  }, [records, query, categoryFilter, sortKey]);

  const handleDeleted = () => {
    setDeleteTarget(null);
    setDetailTarget((current) =>
      current && current.record_id === deleteTarget?.record_id ? null : current,
    );
    setRecords((prev) =>
      prev.filter((r) => r.record_id !== deleteTarget?.record_id),
    );
  };

  if (loading) return <Spinner label="Loading your records…" />;

  if (error) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        title="Could not load records"
        description={error}
        action={<Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            My records
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {user?.name} · {records.length} record
            {records.length === 1 ? '' : 's'} across{' '}
            {new Set(records.map((r) => r.category)).size} categories
          </p>
        </div>
        <Button onClick={() => navigate('/upload')} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
          Upload a record
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Filters"
          subtitle="Search, filter, and sort your library"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, categories, or details…"
              aria-label="Search records"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <Select
            label=""
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select
            label=""
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort records"
          >
            <option value="event_date">Sort: event date</option>
            <option value="created_at">Sort: recently added</option>
            <option value="title">Sort: title</option>
          </Select>
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden="true" />}
          title={records.length === 0 ? 'No records yet' : 'No matches'}
          description={
            records.length === 0
              ? 'Upload your first medical document to start building your timeline.'
              : 'Try a different search term or clear the filters.'
          }
          action={
            records.length === 0 ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/upload')}>
                Upload a record
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setCategoryFilter('');
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((record) => {
            const doc = record.document_id != null ? documentById.get(record.document_id) : undefined;
            return (
              <li key={record.record_id}>
                <RecordCard
                  record={record}
                  fileName={doc?.filename}
                  contentType={doc?.content_type}
                  onOpen={() => setDetailTarget(record)}
                  onOpenFile={() => setViewerTarget(record)}
                  onDelete={() => setDeleteTarget(record)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {detailTarget && (
        <RecordDetailDialog
          record={detailTarget}
          fileName={
            detailTarget.document_id != null
              ? documentById.get(detailTarget.document_id)?.filename
              : undefined
          }
          contentType={
            detailTarget.document_id != null
              ? documentById.get(detailTarget.document_id)?.content_type
              : undefined
          }
          onClose={() => setDetailTarget(null)}
          onRequestView={(record) => {
            setDetailTarget(null);
            setViewerTarget(record);
          }}
          onRequestDelete={(record) => {
            setDetailTarget(null);
            setDeleteTarget(record);
          }}
        />
      )}

      {viewerTarget && (
        <DocumentViewerDialog
          record={viewerTarget}
          fileName={
            viewerTarget.document_id != null
              ? documentById.get(viewerTarget.document_id)?.filename
              : undefined
          }
          contentType={
            viewerTarget.document_id != null
              ? documentById.get(viewerTarget.document_id)?.content_type
              : undefined
          }
          onClose={() => setViewerTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteRecordDialog
          record={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
