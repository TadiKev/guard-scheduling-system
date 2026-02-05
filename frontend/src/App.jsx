// frontend/src/App.jsx
import React, { useContext } from "react";
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate } from "react-router-dom";
import AuthContext from "./AuthContext";

/*
  Pages & components. Keep these file paths consistent with your project structure.
*/
import Login from "./pages/Login";
import Allocation from "./pages/Allocation";
import Attendance from "./pages/Attendance";
import Patrol from "./pages/Patrol";
import ScanGuardPage from "./pages/ScanGuard";
import PatrolTracker from "./components/PatrolTracker";
import ScanQR from "./components/ScanQR";
import PatrolMap from "./components/PatrolMap";
import DashboardAnalytics from "./pages/DashboardAnalytics";
import AssignmentNotifier from "./components/AssignmentNotifier";

/* Guard dashboard (guard-only) */
import GuardDashboard from "./pages/GuardDashboard";

/* Admin dashboard (admin-only) */
import Dashboard from "./pages/Dashboard";

/* --- Small UI helpers --- */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-emerald-400 border-slate-200 mb-4 shadow" />
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    </div>
  );
}

/* Tiny presentational icon helper (purely decorative). */
function Icon({ name, className = "h-4 w-4 inline-block mr-2" }) {
  // Simple inline SVGs so we don't need extra deps — decorative only.
  const common = { className, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "allocation":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 7h16M4 12h8M4 17h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "attendance":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 7h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="7" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "patrol":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2l3 6 6 .5-4.5 3.5L19 20l-7-4-7 4 2.5-7L3 8.5 9 8 12 2z" stroke="currentColor" strokeWidth="0.8" fill="none" />
        </svg>
      );
    case "map":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2v20M2 7l7-3 7 3 7-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M7 14v4M12 10v8M17 6v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "guard":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2l7 4v6c0 5-3.5 9.8-7 10-3.5-.2-7-5-7-10V6l7-4z" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "tracker":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    default:
      return null;
  }
}

/* NavBar built here so routes and header remain consistent project-wide */
function NavBar() {
  const { token, user, logout } = useContext(AuthContext);

  const linkClass = ({ isActive }) =>
    `group flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-transform transform hover:-translate-y-0.5 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
      isActive
        ? "bg-gradient-to-r from-emerald-50 to-cyan-50 text-slate-900 font-semibold shadow-sm ring-1 ring-emerald-100"
        : "text-slate-600 hover:text-slate-900"
    }`;

  // Minimal header when not authenticated
  if (!token) {
    return (
      <header className="sticky top-0 z-40">
        {/* decorative gradient band */}
        <div className="relative">
          <div className="absolute inset-0 pointer-events-none">
            <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8">
              <div className="h-1 bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-500 rounded-b-md opacity-80" />
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm border-b border-slate-100 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <Link to="/" className="flex items-center gap-3">
                  <div className="rounded-md p-1 bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-lg transform-gpu animate-[float_6s_ease-in-out_infinite]">
                    <div className="px-3 py-1 text-white font-extrabold tracking-tight text-sm">SG</div>
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-slate-800 leading-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
                      Smart Guards
                    </div>
                    <div className="text-xs text-slate-400">Allocation & Shift Management</div>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  <Link to="/login" className="ml-2 px-3 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium shadow hover:scale-[1.03] transition transform">
                    Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }

  const isAdmin = Boolean(user?.is_admin);
  const isGuard = Boolean(user?.is_guard);

  return (
    <header className="sticky top-0 z-40">
      <div className="relative">
        {/* subtle animated background glow */} 
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-[1200px] h-36 rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-indigo-300 opacity-10 blur-3xl pointer-events-none" />

        <div className="bg-white/75 backdrop-blur-md border-b border-slate-100 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Left: Brand + role badge */}
              <div className="flex items-center gap-3">
                <Link to="/" className="flex items-center gap-3">
                  <div className="rounded-md p-1 bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-xl transform-gpu">
                    <div className="px-3 py-1 text-white font-extrabold tracking-tight text-sm flex items-center gap-2">
                      <span className="animate-spin-slow inline-block">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2v4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 22v-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="1.2" opacity="0.9" />
                        </svg>
                      </span>
                      SG
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-slate-800 leading-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
                      Smart Guards
                    </div>
                    <div className="text-xs text-slate-400">Allocation & Shift Management</div>
                  </div>
                </Link>
                <div className="ml-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      isAdmin ? "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-50" : isGuard ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-50" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {isAdmin ? "Admin" : isGuard ? "Guard" : "User"}
                  </span>
                </div>
              </div>

              {/* Right: Nav links + Notifier + Auth */}
              <div className="flex items-center gap-4">
                <nav className="flex items-center gap-2" aria-label="Primary navigation">
                  {/* Admin-only Dashboard */}
                  {isAdmin && (
                    <NavLink to="/dashboard" className={linkClass}>
                      <Icon name="dashboard" />
                      <span className="relative">
                        Dashboard
                        <span className="block absolute left-0 -bottom-1 w-0 group-hover:w-full group-active:w-full transition-all h-[2px] bg-emerald-400 rounded"></span>
                      </span>
                    </NavLink>
                  )}

                  {/* Admin-only management */}
                  {isAdmin && (
                    <>
                      <NavLink to="/allocation" className={linkClass}>
                        <Icon name="allocation" />
                        <span>Allocation</span>
                      </NavLink>
                      <NavLink to="/attendance" className={linkClass}>
                        <Icon name="attendance" />
                        <span>Attendance</span>
                      </NavLink>
                      <NavLink to="/patrol" className={linkClass}>
                        <Icon name="patrol" />
                        <span>Patrols</span>
                      </NavLink>
                      <NavLink to="/map" className={linkClass}>
                        <Icon name="map" />
                        <span>Map</span>
                      </NavLink>
                      <NavLink to="/analytics" className={linkClass}>
                        <Icon name="analytics" />
                        <span>Analytics</span>
                      </NavLink>
                    </>
                  )}

                  {/* Guard-only tools */}
                  {isGuard && (
                    <>
                      <NavLink to="/guard" className={linkClass}>
                        <Icon name="guard" />
                        <span>Guard View</span>
                      </NavLink>
                      <NavLink to="/scan" className={linkClass}>
                        <Icon name="scan" />
                        <span>Scan QR</span>
                      </NavLink>
                      {/* NEW: Scan Guard (auto-allocate) */}
                      <NavLink to="/scan-guard" className={linkClass}>
                        <Icon name="scan" />
                        <span>Scan Guard</span>
                      </NavLink>
                      <NavLink to="/patrol-tracker" className={linkClass}>
                        <Icon name="tracker" />
                        <span>Patrol Tracker</span>
                      </NavLink>
                    </>
                  )}

                  {/* Fallback minimal link for other authenticated users */}
                  {!isAdmin && !isGuard && (
                    <NavLink to="/scan" className={linkClass}>
                      <Icon name="scan" />
                      <span>Scan QR</span>
                    </NavLink>
                  )}
                </nav>

                {/* Assignment notifier shown to admins & guards */}
                <div className="flex items-center">
                  {(isAdmin || isGuard) && (
                    <div className="relative">
                      {/* small stylish container around notifier */}
                      <div className="p-1 rounded-md bg-white/60 backdrop-blur-sm shadow-inner">
                        <AssignmentNotifier />
                      </div>
                      {/* decorative notification pulse */}
                      <span className="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                    </div>
                  )}
                </div>

                {/* Auth controls */}
                <div className="flex items-center gap-3 ml-2">
                  <div className="text-sm text-slate-700 hidden sm:block">
                    Hi{user?.username ? `, ${user.username}` : ""}
                  </div>
                  <button
                    onClick={logout}
                    className="px-3 py-2 rounded-full bg-rose-600 text-white text-sm font-medium hover:scale-[1.03] transform transition shadow-lg hover:shadow-xl ring-1 ring-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-300"
                    title="Logout"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* bottom decorative gradient border */}
          <div className="h-1 bg-gradient-to-r from-emerald-200 via-cyan-200 to-indigo-200 opacity-50" />
        </div>
      </div>
    </header>
  );
}

/* Protected wrapper: shows loading while auth bootstraps, redirects to /login if not authenticated */
function ProtectedRoute({ children }) {
  const { token, loading } = useContext(AuthContext);
  if (loading) return <LoadingScreen />;
  return token ? children : <Navigate to="/login" replace />;
}

/* GuardProtectedRoute: requires authenticated user AND user.is_guard === true */
function GuardProtectedRoute({ children }) {
  const { token, user, loading } = useContext(AuthContext);

  if (loading) return <LoadingScreen />;
  if (!token) return <Navigate to="/login" replace />;
  if (!user || user.is_guard !== true) return <Navigate to="/" replace />;

  return children;
}

/* AdminProtectedRoute: requires authenticated user AND user.is_admin === true */
function AdminProtectedRoute({ children }) {
  const { token, user, loading } = useContext(AuthContext);

  if (loading) return <LoadingScreen />;
  if (!token) return <Navigate to="/login" replace />;
  if (!user || user.is_admin !== true) return <Navigate to="/" replace />;

  return children;
}

/* Home redirect: land users to the correct primary page */
function HomeRedirect() {
  const { token, user, loading } = useContext(AuthContext);
  if (loading) return <LoadingScreen />;
  if (!token) return <Navigate to="/login" replace />;
  if (user?.is_admin) return <Navigate to="/dashboard" replace />;
  if (user?.is_guard) return <Navigate to="/guard" replace />;
  return <Navigate to="/dashboard" replace />; // default for other authenticated users
}

/* Final App with BrowserRouter */
export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <NavBar />

        <main className="max-w-7xl mx-auto p-6">
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Admin-only Dashboard */}
            <Route
              path="/dashboard"
              element={
                <AdminProtectedRoute>
                  <Dashboard />
                </AdminProtectedRoute>
              }
            />

            {/* Admin-only pages */}
            <Route
              path="/allocation"
              element={
                <AdminProtectedRoute>
                  <Allocation />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/attendance"
              element={
                <AdminProtectedRoute>
                  <Attendance />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/patrol"
              element={
                <AdminProtectedRoute>
                  <Patrol />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/map"
              element={
                <AdminProtectedRoute>
                  <PatrolMap />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <AdminProtectedRoute>
                  <DashboardAnalytics />
                </AdminProtectedRoute>
              }
            />

            {/* Guard view - protected AND role-checked */}
            <Route
              path="/guard"
              element={
                <GuardProtectedRoute>
                  <GuardDashboard />
                </GuardProtectedRoute>
              }
            />

            {/* Guard-only Patrol Tracker */}
            <Route
              path="/patrol-tracker"
              element={
                <GuardProtectedRoute>
                  <PatrolTracker />
                </GuardProtectedRoute>
              }
            />

            {/* Scan QR - guard-only */}
            <Route
              path="/scan"
              element={
                <GuardProtectedRoute>
                  <ScanQR />
                </GuardProtectedRoute>
              }
            />
            <Route
             path="/scan-guard"
              element={
              <ProtectedRoute>
                <ScanGuardPage/>
              </ProtectedRoute>
            } 
            />


            {/* Root -> role-aware redirect */}
            <Route path="/" element={<HomeRedirect />} />

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

/* Extra tiny styles that rely on Tailwind being configured to allow arbitrary animations/classes:
   - animate-[float_6s_ease-in-out_infinite] used on brand (floating)
   - animate-spin-slow is referenced; if not present, add in your Tailwind config:
     module.exports = {
       theme: {
         extend: {
           animation: {
             'spin-slow': 'spin 6s linear infinite',
             'float': 'float 6s ease-in-out infinite',
           },
           keyframes: {
             float: {
               '0%,100%': { transform: 'translateY(0)' },
               '50%': { transform: 'translateY(-6px)' },
             },
           },
         },
       },
     };
   If you can't edit Tailwind config, those animations gracefully fall back to no-animation.
*/
