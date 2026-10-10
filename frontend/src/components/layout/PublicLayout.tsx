import { NavLink, Outlet, useNavigate } from 'react-router';
import { LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { Logo } from '../ui/Logo';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
    isActive
      ? 'bg-teal-50 text-teal-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function PublicLayout() {
  const { user, logOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {user ? (
              <>
                <NavLink to="/dashboard" className={navLinkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/records" className={navLinkClass}>
                  My Records
                </NavLink>
                <NavLink to="/shared-access" className={navLinkClass}>
                  Shared Access
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Log in
                </NavLink>
                <NavLink to="/signup" className={navLinkClass}>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
                    Get started
                  </span>
                </NavLink>
              </>
            )}
          </nav>
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-slate-200 bg-white px-4 py-3 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {user ? (
                <>
                  <NavLink to="/dashboard" className={navLinkClass} onClick={() => setMenuOpen(false)}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/records" className={navLinkClass} onClick={() => setMenuOpen(false)}>
                    My Records
                  </NavLink>
                  <NavLink to="/shared-access" className={navLinkClass} onClick={() => setMenuOpen(false)}>
                    Shared Access
                  </NavLink>
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      await handleLogout();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={navLinkClass} onClick={() => setMenuOpen(false)}>
                    Log in
                  </NavLink>
                  <NavLink to="/signup" className={navLinkClass} onClick={() => setMenuOpen(false)}>
                    Sign up
                  </NavLink>
                </>
              )}
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-600" aria-hidden="true" />
            <span>© {new Date().getFullYear()} MediVault. Your records stay yours.</span>
          </div>
          <p>Built for the HealthTech hackathon · Demo build</p>
        </div>
      </footer>
    </div>
  );
}
