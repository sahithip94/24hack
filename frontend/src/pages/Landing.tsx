import { Link } from 'react-router';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Lock,
  ShieldCheck,
  Share2,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { useAuth } from '../lib/auth';

const features = [
  {
    icon: Upload,
    title: 'One organized place',
    description:
      'Upload PDFs and scans of lab results, prescriptions, imaging, and visit notes. Search and filter everything instantly.',
  },
  {
    icon: Share2,
    title: 'Share only what you choose',
    description:
      'Pick the exact records, set an expiry (1 hour, 24 hours, or 7 days), and protect the link with a PIN you share separately.',
  },
  {
    icon: CalendarClock,
    title: 'A timeline of your care',
    description:
      'See your medical history chronologically, with category and date filters, so repeated tests and visits are easy to spot.',
  },
  {
    icon: Sparkles,
    title: 'AI summary',
    description:
      'Get an at-a-glance overview of your records, written by a connected language model when one is configured, with a clearly labelled local fallback otherwise.',
  },
];

const howItWorks = [
  {
    step: '1',
    title: 'Create your account',
    description:
      'Sign up with your name, email, and a password. Your account is ready to use right away.',
  },
  {
    step: '2',
    title: 'Upload your records',
    description:
      'Add PDF, PNG, or JPEG files with a title, category, and date. Everything is stored privately under your account.',
  },
  {
    step: '3',
    title: 'Share securely when needed',
    description:
      'Create a guest link for selected records. Your recipient opens it without an account and enters the PIN you sent them.',
  },
];

const privacyPoints = [
  'Medical files are stored privately and only your account can open them.',
  'Guest links never contain record names or medical data - only a random token.',
  'Recipients verify a 6-digit PIN before seeing anything; failed attempts are rate-limited and logged.',
  'Revoking a link stops access immediately, even for someone who already opened the page.',
  'Share links expire automatically after the duration you choose.',
];

export function Landing() {
  const { user } = useAuth();

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-teal-50"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            HealthTech Hackathon Project
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            Your medical records, finally in one place
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Lost in Transit: fragmented records and repeated care across
            providers. MediVault keeps your documents organized and lets you
            share exactly the right records with family or caregivers -
            securely, and only for as long as you choose.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => {
                const el = document.getElementById('how-it-works');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              How it works
            </Button>
            {user ? (
              <Button size="lg" variant="outline" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                <Link to="/dashboard" className="flex items-center gap-2">
                  Go to your dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                  <Link to="/signup">Get started free</Link>
                </Button>
                <Button size="lg" variant="outline">
                  <Link to="/login">Log in</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Guest links are PIN-protected · No account needed to view a shared link
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                The problem: records lost in transit
              </h2>
              <p className="mt-4 text-slate-600">
                Every specialist visit, lab, and hospital generates its own
                paperwork. Patients end up with scattered PDFs, printed scans,
                and repeated tests because the next provider cannot see what
                came before.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Results arrive by fax, email, or portal - in five different places.',
                  'New providers repeat tests you already had.',
                  'Family caregivers have no safe way to help from a distance.',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <FileText className="h-6 w-6 text-teal-600" aria-hidden="true" />
                <p className="mt-3 text-3xl font-bold text-slate-900">1</p>
                <p className="mt-1 text-sm text-slate-500">place for all your records</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Users className="h-6 w-6 text-teal-600" aria-hidden="true" />
                <p className="mt-3 text-3xl font-bold text-slate-900">0</p>
                <p className="mt-1 text-sm text-slate-500">accounts needed by recipients</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Lock className="h-6 w-6 text-teal-600" aria-hidden="true" />
                <p className="mt-3 text-3xl font-bold text-slate-900">PIN</p>
                <p className="mt-1 text-sm text-slate-500">protected guest links</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <CalendarClock className="h-6 w-6 text-teal-600" aria-hidden="true" />
                <p className="mt-3 text-3xl font-bold text-slate-900">7d</p>
                <p className="mt-1 text-sm text-slate-500">maximum link lifetime</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Built around patients, not providers
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          MediVault is a personal health record app. There are no separate
          doctor portals - caregivers get time-limited, record-specific access
          through a link you control.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {howItWorks.map((step) => (
              <div key={step.step} className="relative">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">
                  {step.step}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Button size="lg" icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
              {user ? (
                <Link to="/upload">Upload your first record</Link>
              ) : (
                <Link to="/signup">Start organizing now</Link>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid items-start gap-10 md:grid-cols-2">
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
              Privacy and security, honestly described
            </h2>
            <p className="mt-3 text-slate-600">
              This is a hackathon build. The security model below is
              implemented in the running application today - it is not a
              roadmap promise:
            </p>
          </div>
          <ul className="space-y-3">
            {privacyPoints.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-teal-600">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <Logo dark />
          <h2 className="mx-auto mt-6 max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Ready to take control of your medical records?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-teal-100">
            Free to use for the hackathon. Set up takes under a minute.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {user ? (
              <Button size="lg" variant="secondary">
                <Link to="/dashboard">Open your dashboard</Link>
              </Button>
            ) : (
              <>
                <Button size="lg" variant="secondary">
                  <Link to="/signup">Create your account</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-teal-300 bg-transparent text-white hover:bg-teal-700"
                >
                  <Link to="/login">Log in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
