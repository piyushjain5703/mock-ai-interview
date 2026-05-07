import { LayoutDashboard, History, Sparkles, UserCircle, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/interview/new", label: "New Interview", icon: Sparkles },
  { to: "/history", label: "History", icon: History },
  { to: "/profile", label: "Profile", icon: UserCircle },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initial = (user?.full_name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-sky">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/60 border-b border-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg hover:bg-white/60"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-ink-900 text-white grid place-items-center font-bold">M</div>
              <span className="font-bold text-ink-900 hidden sm:inline">MockAI</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-ink-500">
              {user?.picture_url ? (
                <img src={user.picture_url} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-500 text-white grid place-items-center text-sm font-semibold">
                  {initial}
                </div>
              )}
              <span className="hidden md:inline text-ink-900 font-medium">
                {user?.full_name || user?.email}
              </span>
            </div>
            <button type="button" className="btn-ghost" onClick={handleLogout}>
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid md:grid-cols-[220px_1fr] gap-6">
        <aside
          className={`md:sticky md:top-20 md:self-start ${
            open ? "block" : "hidden"
          } md:block`}
        >
          <nav className="surface-card p-2 flex md:flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : ""} flex-1 md:flex-none`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
