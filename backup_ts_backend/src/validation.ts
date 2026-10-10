const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface FieldErrors {
  fields?: Record<string, string>;
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidFullName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

/** Returns a list of human-readable password problems (empty = valid). */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('at least 8 characters');
  if (!/[a-zA-Z]/.test(password)) problems.push('one letter');
  if (!/[0-9]/.test(password)) problems.push('one number');
  return problems;
}

export const RECORD_CATEGORIES = [
  'Lab Result',
  'Prescription',
  'Imaging',
  'Visit Note',
  'Vaccination',
  'Insurance',
  'Other',
] as const;

export type RecordCategory = (typeof RECORD_CATEGORIES)[number];

export function isRecordCategory(value: string): value is RecordCategory {
  return (RECORD_CATEGORIES as readonly string[]).includes(value);
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'] as const;

export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export function isAllowedFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).some((ext) =>
    lower.endsWith(ext),
  );
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  return !Number.isNaN(d.getTime());
}

export function isPastIsoDate(iso: string, now: Date = new Date()): boolean {
  return new Date(iso).getTime() <= now.getTime();
}
