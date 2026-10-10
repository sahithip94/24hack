export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" aria-hidden="true" />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}
