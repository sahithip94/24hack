import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanText,
  Share2,
  Sparkles,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import { Logo } from '../ui/Logo';
import { Button } from '../ui/Button';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/records', label: 'My Records', icon: FileText },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/timeline', label: 'Timeline', icon: CalendarClock },
  { to: '/scan-image', label: 'Scan Image', icon: ScanText },
  { to: '/ai-summary', label: 'AI Summary', icon: Sparkles },
  { to: '/shared-access', label: 'Shared Access', icon: Share2 },
  { to: '/profile', label: 'Profile', icon: UserIcon },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
    isActive
      ? 'bg-teal-50 text-teal-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function AppLayout() {
  const { user, logOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Patient navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={navLinkClass}
            onClick={() => setSidebarOpen(false)}
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white" aria-hidden="true">
            {user ? initials(user.name) : '?'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {user?.name ?? '…'}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email ?? ''}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout} icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
          Log out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* The desktop sidebar is `fixed`, so it is out of normal flow and
          contributes no width to this row. `lg:pl-64` matches the sidebar's
          `w-64` (16rem = 256px) so the content column starts to the right of
          it instead of sliding underneath. Below `lg` the sidebar is hidden
          (drawer + bottom nav are used), so no offset is applied. */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
        </header>
        {/* Desktop greeting bar */}
        <div className="hidden lg:block" />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
        {/* Mobile bottom nav */}
        <nav
          className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white lg:hidden"
          aria-label="Mobile patient navigation"
        >
          <div className="grid grid-cols-4">
            {navItems.slice(0, 4).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                    isActive ? 'text-teal-700' : 'text-slate-500'
                  }`
                }
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="h-16 lg:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
