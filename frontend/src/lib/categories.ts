import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  FileText,
  HeartPulse,
  Pill,
  Stethoscope,
  Zap,
} from 'lucide-react';

/**
 * The category set used by the FastAPI backend
 * (RecordInput normalization in app/schemas.py).
 */
export interface CategoryInfo {
  name: string; // backend value (snake_case)
  label: string; // display label
  icon: LucideIcon;
  color: string; // tailwind classes for the icon chip
}

export const CATEGORIES: CategoryInfo[] = [
  { name: 'medication', label: 'Medication', icon: Pill, color: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  { name: 'lab_result', label: 'Lab Result', icon: Activity, color: 'bg-violet-50 text-violet-600 ring-violet-200' },
  { name: 'diagnosis', label: 'Diagnosis', icon: Stethoscope, color: 'bg-amber-50 text-amber-600 ring-amber-200' },
  { name: 'visit', label: 'Visit Note', icon: FileText, color: 'bg-sky-50 text-sky-600 ring-sky-200' },
  { name: 'allergy', label: 'Allergy', icon: AlertTriangle, color: 'bg-rose-50 text-rose-600 ring-rose-200' },
  { name: 'procedure', label: 'Procedure', icon: Zap, color: 'bg-indigo-50 text-indigo-600 ring-indigo-200' },
  { name: 'medical_document', label: 'Medical Document', icon: FileText, color: 'bg-slate-100 text-slate-600 ring-slate-200' },
  { name: 'other', label: 'Other', icon: HeartPulse, color: 'bg-teal-50 text-teal-600 ring-teal-200' },
];

export function categoryInfo(name: string | null | undefined): CategoryInfo {
  return (
    CATEGORIES.find((c) => c.name === name) ??
    CATEGORIES.find((c) => c.name === 'other')!
  );
}

export function categoryLabel(name: string | null | undefined): string {
  return categoryInfo(name).label;
}

export function isImageRecord(contentType: string | null | undefined): boolean {
  return contentType === 'image/png' || contentType === 'image/jpeg';
}

export function isPdfRecord(contentType: string | null | undefined): boolean {
  return contentType === 'application/pdf';
}
