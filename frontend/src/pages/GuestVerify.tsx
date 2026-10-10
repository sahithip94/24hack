import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LockKeyhole, ShieldCheck, ShieldX } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { apiFetch, getGuestToken, setGuestToken } from '../lib/api';
import type { VerifyPinResponse } from '../types';

type Failure =
  | { kind: 'wrong-pin' }
  | { kind: 'locked' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export function GuestVerify() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [checking, setChecking] = useState(true);

  // If this browser already holds a guest access token for
  // this share, skip straight to the read-only view.
  useEffect(() => {
    const existing = getGuestToken(token);
    if (existing) {
      navigate(`/share/${token}/records`, { replace: true });
      return;
    }
    setChecking(false);
  }, [token, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    if (pin.length < 4) {
      setFailure({
        kind: 'error',
        message: 'Enter the 6-digit PIN you were given.',
      });
      return;
    }
    setVerifying(true);
    try {
      const body = await apiFetch<VerifyPinResponse>(
        `/sharing/access/${token}/verify-pin`,
        {
          method: 'POST',
          body: JSON.stringify({ pin }),
        },
      );
      // The guest access token is short-lived (15 minutes)
      // and scoped to this share only.
      setGuestToken(token, body.guest_access_token);
      navigate(`/share/${token}/records`, { replace: true });
    } catch (err) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401) {
        setFailure({ kind: 'wrong-pin' });
      } else if (apiErr.status === 429) {
        setFailure({ kind: 'locked' });
      } else if (apiErr.status === 404) {
        setFailure({ kind: 'invalid' });
      } else if (apiErr.status === 410) {
        setFailure({ kind: 'unavailable' });
      } else {
        setFailure({
          kind: 'error',
          message:
            apiErr.message ??
            'Could not verify the PIN. Please try again.',
        });
      }
    } finally {
      setVerifying(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Opening secure share…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Logo />
          <span className="ml-3 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
            Guest view
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md" padding="lg">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Protected medical records
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Someone shared a secure link with you. Enter the
            6-digit PIN they gave you to view the records. The
            PIN is checked by the server - it is never stored in
            this browser.
          </p>

          {failure?.kind === 'wrong-pin' && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              That PIN is incorrect. Please try again - after
              several failed attempts the link locks for 15
              minutes.
            </p>
          )}
          {failure?.kind === 'locked' && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Too many incorrect attempts. This link is locked
              for 15 minutes. Ask the person who shared it to
              confirm the PIN, or try again later.
            </p>
          )}
          {failure?.kind === 'invalid' && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-3">
              <p className="flex items-start gap-2 text-sm text-red-700">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                This link is not valid. It may have been typed
                incorrectly or truncated. Ask the sender to
                double-check the URL.
              </p>
            </div>
          )}
          {failure?.kind === 'unavailable' && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-3">
              <p className="flex items-start gap-2 text-sm text-red-700">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                This share has expired or was revoked by the
                patient. Ask them to create a new secure link.
              </p>
            </div>
          )}
          {failure?.kind === 'error' && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {failure.message}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <Input
              label="Access PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              password
              inputMode="numeric"
              placeholder="••••••"
              autoComplete="off"
              hint="The 6-digit PIN shared with you."
            />
            <Button type="submit" loading={verifying} className="w-full" size="lg">
              View shared records
            </Button>
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              Records are read-only and stay private: the server
              only shows what the patient chose to share, for a
              limited time. Nothing is downloaded to this device
              unless you open a file.
            </span>
          </div>

          <p className="mt-5 text-center text-sm text-slate-600">
            Are you the patient?{' '}
            <Link to="/login" className="font-medium text-teal-700 hover:text-teal-800">
              Log in to manage shares
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}
