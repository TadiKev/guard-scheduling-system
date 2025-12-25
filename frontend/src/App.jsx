// frontend/src/App.jsx
import React, { useContext } from "react";
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate } from "react-router-dom";
import AuthContext from "./AuthContext";

/*
  Pages & components. Keep these file paths consistent with your project structure.
*/
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
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

  return (
    <header className="bg-white shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="rounded p-1 bg-gradient-to-r from-emerald-500 to-cyan-400">
                <div className="px-2 py-1 text-white font-bold text-sm">SG</div>
              </div>
              <div>
                <div className="text-lg font-bold text-slate-800">Smart Guards</div>
                <div className="text-xs text-slate-400">Allocation & Shift Management</div>
              </div>
            </Link>
          </div>

          {/* Right: Nav links + Notifier + Auth */}
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2">
              <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
              <NavLink to="/allocation" className={linkClass}>Allocation</NavLink>
              <NavLink to="/attendance" className={linkClass}>Attendance</NavLink>
              <NavLink to="/patrol" className={linkClass}>Patrols</NavLink>
              <NavLink to="/patrol-tracker" className={linkClass}>Tracker</NavLink>
              <NavLink to="/map" className={linkClass}>Map</NavLink>
              <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>

              {/* Guard View link only visible to guard users */}
              {user?.is_guard === true && <NavLink to="/guard" className={linkClass}>Guard View</NavLink>}

              {/* Scan QR (public) */}
              <NavLink to="/scan" className={linkClass}>Scan QR</NavLink>
            </nav>

            {/* Assignment notifier placed next to user controls */}
            <div className="flex items-center">
              <AssignmentNotifier />
            </div>

            {/* Auth controls */}
            {token ? (
              <div className="flex items-center gap-3 ml-2">
                <div className="text-sm text-slate-700 hidden sm:block">
                  Hi{user?.username ? `, ${user.username}` : ""}
                </div>
                <button
                  onClick={logout}
                  className="px-3 py-2 rounded bg-rose-600 text-white text-sm hover:opacity-95"
                  title="Logout"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/login" className="ml-2 px-3 py-2 rounded bg-emerald-600 text-white text-sm">Login</Link>
            )}
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

  // not logged in -> go to login
  if (!token) return <Navigate to="/login" replace />;

  // logged in but not guard -> go to dashboard (or show unauthorized page if you prefer)
  if (!user || user.is_guard !== true) return <Navigate to="/dashboard" replace />;

  return children;
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

            {/* Protected pages */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/allocation"
              element={
                <ProtectedRoute>
                  <Allocation />
                </ProtectedRoute>
              }
            />

            <Route
              path="/attendance"
              element={
                <ProtectedRoute>
                  <Attendance />
                </ProtectedRoute>
              }
            />

            <Route
              path="/patrol"
              element={
                <ProtectedRoute>
                  <Patrol />
                </ProtectedRoute>
              }
            />

            <Route
              path="/patrol-tracker"
              element={
                <ProtectedRoute>
                  <PatrolTracker />
                </ProtectedRoute>
              }
            />

            <Route
              path="/map"
              element={
                <ProtectedRoute>
                  <PatrolMap />
                </ProtectedRoute>
              }
            />

            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <DashboardAnalytics />
                </ProtectedRoute>
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

            {/* Scan QR - kept public (change to ProtectedRoute if you want) */}
            <Route path="/scan" element={<ScanQR />} />

            {/* Root -> Dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
