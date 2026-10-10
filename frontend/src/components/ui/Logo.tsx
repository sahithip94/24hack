import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded-lg"
      aria-label="MediVault home"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <span
        className={`text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}
      >
        Medi<span className="text-teal-600">Vault</span>
      </span>
    </Link>
  );
}
