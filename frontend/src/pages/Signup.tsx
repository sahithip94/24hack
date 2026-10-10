import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Logo } from '../components/ui/Logo';
import { isValidEmail, passwordProblems } from '../lib/format';

type Phase = 'form' | 'success';

export function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) {
      next.name = 'Enter your full name.';
    }
    if (!isValidEmail(email)) {
      next.email = 'Enter a valid email address.';
    }
    // The backend requires at least 10 characters.
    const problems = passwordProblems(password);
    if (password.length === 0) {
      next.password = 'Create a password.';
    } else if (problems.length > 0) {
      next.password = `Your password needs ${problems.join(', ')}.`;
    }
    if (confirmPassword !== password) {
      next.confirmPassword = 'Passwords do not match.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await signUp(name, email, password);
      setSuccessMessage(result.message);
      setPhase('success');
    } catch (err) {
      const apiErr = err as { status?: number; message?: string };
      setSubmitError(apiErr.message ?? 'Could not create your account.');
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
        {phase === 'success' ? (
          <Card className="w-full max-w-md" padding="lg">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              Account created
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Your account for{' '}
              <strong className="font-semibold text-slate-900">{email}</strong>{' '}
              is ready. You can log in right away and start organizing your
              medical records.
            </p>

            {successMessage && (
              <p
                role="status"
                className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              >
                {successMessage}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => navigate('/login')}>
                Continue to log in
              </Button>
              <Button variant="ghost" onClick={() => setPhase('form')}>
                Use a different email
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="w-full max-w-md" padding="lg">
            <h1 className="text-2xl font-bold text-slate-900">
              Create your MediVault account
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your records are private. Create an account to get started.
            </p>
            {submitError && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {submitError}
              </p>
            )}
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              <Input
                label="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                autoComplete="name"
                placeholder="Jordan Rivera"
                required
              />
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
                hint={
                  passwordProblems(password).length > 0
                    ? `Needs ${passwordProblems(password).join(', ')}`
                    : 'At least 10 characters'
                }
                password
                autoComplete="new-password"
                required
              />
              <Input
                label="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                password
                autoComplete="new-password"
                required
              />
              <Button type="submit" loading={loading} className="w-full" size="lg">
                Create account
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-teal-700 hover:text-teal-800">
                Log in
              </Link>
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}
