import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { AuthProvider, useAuth } from './lib/auth';
import { PublicLayout } from './components/layout/PublicLayout';
import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui/Spinner';
import { Button } from './components/ui/Button';
import { Home } from 'lucide-react';
import { Landing } from './pages/Landing';
import { Signup } from './pages/Signup';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Records } from './pages/Records';
import { Upload } from './pages/Upload';
import { Timeline } from './pages/Timeline';
import { AiSummary } from './pages/AiSummary';
import { ScanImage } from './pages/ScanImage';
import { SharedAccess } from './pages/SharedAccess';
import { Profile } from './pages/Profile';
import { GuestVerify } from './pages/GuestVerify';
import { GuestViewer } from './pages/GuestViewer';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Guard for patient pages: requires a signed-in session. */
function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Checking your session…" />
      </div>
    );
  }
  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }
  return <Outlet />;
}

/** Redirects already-authenticated users away from login/signup. */
function RedirectIfAuthenticated() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (user) {
    return <Navigate to={next ?? '/dashboard'} replace />;
  }
  return <Outlet />;
}

/** The backend generates share URLs as {FRONTEND_BASE_URL}/guest?token=... */
function GuestRedirect() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (!token) {
    return (
      <Navigate to="/" replace />
    );
  }
  return <Navigate to={`/share/${token}`} replace />;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-6xl font-bold text-slate-900">404</h1>
      <p className="mt-3 text-lg text-slate-600">Page not found</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button className="mt-6" onClick={() => (window.location.href = '/')} icon={<Home className="h-4 w-4" aria-hidden="true" />}>
        Back to home
      </Button>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        {/* Public pages */}
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
        </Route>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Guest share pages (public, PIN-protected data server-side) */}
        <Route path="/guest" element={<GuestRedirect />} />
        <Route path="/share/:token" element={<GuestVerify />} />
        <Route path="/share/:token/records" element={<GuestViewer />} />

        {/* Protected patient pages */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/records" element={<Records />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/scan-image" element={<ScanImage />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/ai-summary" element={<AiSummary />} />
            <Route path="/shared-access" element={<SharedAccess />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
