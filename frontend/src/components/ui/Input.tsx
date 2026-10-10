import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md';
  leftIcon?: ReactNode;
  /** Renders a password visibility toggle when true. */
  password?: boolean;
}

export function Input({
  label,
  error,
  hint,
  size = 'md',
  leftIcon,
  password = false,
  type,
  id,
  className = '',
  ...rest
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id ?? `input-${label?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? Math.random().toString(36).slice(2)}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const inputType = password ? (showPassword ? 'text' : 'password') : type;

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${error ? errorId : ''} ${hint ? hintId : ''}`.trim() || undefined}
          className={`w-full rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
            leftIcon ? 'pl-10' : ''
          } ${password ? 'pr-11' : ''} ${
            error ? 'border-red-400' : 'border-slate-300'
          } ${size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-3.5 text-[15px]'} ${className}`}
          {...rest}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <Eye className="h-4.5 w-4.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={hintId} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
