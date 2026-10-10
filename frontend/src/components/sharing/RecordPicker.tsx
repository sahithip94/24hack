import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PatientRecord } from '../../types';
import { Checkbox } from '../ui/Checkbox';
import { categoryInfo } from '../../lib/categories';
import { formatDate } from '../../lib/format';

interface RecordPickerProps {
  records: PatientRecord[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}

export function RecordPicker({ records, selected, onToggle }: RecordPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.details ?? '').toLowerCase().includes(q),
    );
  }, [records, query]);

  if (records.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        You have no verified records yet. Upload a document and
        confirm its details first, then share it from here.
      </p>
    );
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your records…"
          aria-label="Search records to share"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1" role="group" aria-label="Records to share">
        {filtered.map((record) => {
          const info = categoryInfo(record.category);
          return (
            <Checkbox
              key={record.record_id}
              checked={selected.has(record.record_id)}
              onChange={() => onToggle(record.record_id)}
              label={record.title}
              description={`${info.label} · ${record.event_date ? formatDate(record.event_date) : 'no date'}`}
              icon={<info.icon className="h-4 w-4" aria-hidden="true" />}
            />
          );
        })}
        {filtered.length === 0 && (
          <p className="px-1 py-3 text-sm text-slate-500">
            No records match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
