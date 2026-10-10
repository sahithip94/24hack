import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Logo } from '../components/ui/Logo';
import { isValidEmail } from '../lib/format';

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const nextErrors: Record<string, string> = {};
    if (!isValidEmail(email)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (password.length === 0) {
      nextErrors.password = 'Enter your password.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await signIn(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      const apiErr = err as { status?: number; message?: string };
      setError(apiErr.message ?? 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md" padding="lg">
          <h1 className="text-2xl font-bold text-slate-900">
            Log in to MediVault
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your email and password to access your records.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              password
              autoComplete="current-password"
              required
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Log in
            </Button>
          </form>

          <div className="mt-5 text-center text-sm">
            <Link
              to="/signup"
              className="font-medium text-teal-700 hover:text-teal-800"
            >
              Create an account
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
