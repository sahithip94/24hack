import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { formatDate } from '../lib/format';

export function Profile() {
  const { user, updateProfile, logOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(name.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logOut();
      window.location.href = '/';
    } finally {
      setLoggingOut(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Profile
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account details and security settings
        </p>
      </div>

      <Card>
        <CardHeader title="Account" subtitle="Identity" />
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-lg font-bold text-white">
            {user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div>
            <p className="text-lg font-semibold text-slate-900">
              {user.name}
            </p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Edit profile" subtitle="Update the name on your account" />
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <div className="max-w-sm">
            <Input
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error ?? undefined}
              autoComplete="name"
              hint="This name appears on your dashboard and shared summaries."
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving} icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
              Save changes
            </Button>
            {saved && (
              <span className="text-sm text-emerald-700" role="status">
                Profile updated.
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Security" subtitle="Session and sign-out" />
        <dl className="max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-slate-800">
              {formatDate(user.created_at)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Account ID</dt>
            <dd className="font-mono text-slate-800">#{user.id}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Button
            variant="danger"
            onClick={() => void handleLogout()}
            loading={loggingOut}
            icon={<LogOut className="h-4 w-4" aria-hidden="true" />}
          >
            Log out
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Logging out deletes the session token stored in this
            browser. Your records stay safely on the server.
          </p>
        </div>
      </Card>
    </div>
  );
}
