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
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-emerald-500 border-slate-200 mb-4" />
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    </div>
  );
}

/* NavBar built here so routes and header remain consistent project-wide */
function NavBar() {
  const { token, user, logout } = useContext(AuthContext);

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm ${isActive ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-600 hover:text-slate-900"}`;

  // Minimal header when not authenticated
  if (!token) {
    return (
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="rounded p-1 bg-gradient-to-r from-emerald-500 to-cyan-400">
                <div className="px-2 py-1 text-white font-bold text-sm">SG</div>
              </div>
              <div>
                <div className="text-lg font-bold text-slate-800">Smart Guards</div>
                <div className="text-xs text-slate-400">Allocation & Shift Management</div>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/login" className="ml-2 px-3 py-2 rounded bg-emerald-600 text-white text-sm">Login</Link>
            </div>
          </div>
        </div>
      </header>
    );
  }

  const isAdmin = Boolean(user?.is_admin);
  const isGuard = Boolean(user?.is_guard);

  return (
    <header className="bg-white shadow sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand + role badge */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="rounded-md p-1 bg-gradient-to-r from-emerald-500 to-cyan-400 shadow">
                <div className="px-2 py-1 text-white font-bold text-sm">SG</div>
              </div>
              <div>
                <div className="text-lg font-bold text-slate-800">Smart Guards</div>
                <div className="text-xs text-slate-400">Allocation & Shift Management</div>
              </div>
            </Link>
            <div className="ml-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isAdmin ? "bg-indigo-100 text-indigo-800" : isGuard ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}`}>
                {isAdmin ? "Admin" : isGuard ? "Guard" : "User"}
              </span>
            </div>
          </div>

          {/* Right: Nav links + Notifier + Auth */}
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2">
              {/* Admin-only Dashboard */}
              {isAdmin && <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>}

              {/* Admin-only management */}
              {isAdmin && (
                <>
                  <NavLink to="/allocation" className={linkClass}>Allocation</NavLink>
                  <NavLink to="/attendance" className={linkClass}>Attendance</NavLink>
                  <NavLink to="/patrol" className={linkClass}>Patrols</NavLink>
                  <NavLink to="/map" className={linkClass}>Map</NavLink>
                  <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>
                </>
              )}

              {/* Guard-only tools */}
              {isGuard && (
                <>
                  <NavLink to="/guard" className={linkClass}>Guard View</NavLink>
                  <NavLink to="/scan" className={linkClass}>Scan QR</NavLink>
                  <NavLink to="/patrol-tracker" className={linkClass}>Patrol Tracker</NavLink>
                </>
              )}

              {/* Fallback minimal link for other authenticated users */}
              {!isAdmin && !isGuard && <NavLink to="/scan" className={linkClass}>Scan QR</NavLink>}
            </nav>

            {/* Assignment notifier shown to admins & guards */}
            <div className="flex items-center">
              {(isAdmin || isGuard) && <AssignmentNotifier />}
            </div>

            {/* Auth controls */}
            <div className="flex items-center gap-3 ml-2">
              <div className="text-sm text-slate-700 hidden sm:block">
                Hi{user?.username ? `, ${user.username}` : ""}
              </div>
              <button
                onClick={logout}
                className="px-3 py-2 rounded-md bg-rose-600 text-white text-sm hover:bg-rose-500 transition"
                title="Logout"
              >
                Logout
              </button>
            </div>
          </div>
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
