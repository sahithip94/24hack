import type { InputHTMLAttributes, ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  icon?: ReactNode;
}

export function Checkbox({ label, description, icon, id, className = '', ...rest }: CheckboxProps) {
  const checkboxId = id ?? `checkbox-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label
      htmlFor={checkboxId}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-teal-300 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50/40 focus-within:ring-2 focus-within:ring-teal-600 ${className}`}
    >
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-600"
        {...rest}
      />
      {icon && (
        <span className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && (
          <span className="block truncate text-xs text-slate-500">{description}</span>
        )}
      </span>
    </label>
  );
}
