import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Extra width class, e.g. 'max-w-lg' */
  width?: string;
}

export function Modal({ open, onClose, title, children, width = 'max-w-md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect (callers usually
  // pass an inline arrow that changes on every render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Focus the dialog for keyboard users.
    dialogRef.current?.focus();
    document.body.style.overflow = 'hidden';

    // Give the dialog a history entry so the browser/system Back gesture
    // dismisses it instead of navigating away from the page.
    if (window.history.state?.modal !== true) {
      window.history.pushState(
        { ...(window.history.state ?? {}), modal: true },
        document.title,
      );
    }
    const handlePopState = () => onCloseRef.current();
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100vh-2rem)] w-full ${width} flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none`}
      >
        {/* Sticky header keeps the close button reachable on tall dialogs. */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
