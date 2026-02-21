import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthContext from "../AuthContext";

export default function Login() {
  const { loginWithCredentials } = useContext(AuthContext);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await loginWithCredentials(username.trim(), password);
      nav("/");
    } catch (error) {
      const msg =
        error?.response?.data?.detail ||
        error?.message ||
        "Login failed";
      setErr(Array.isArray(msg) ? msg.join(" ") : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-4">
      <div className="w-full max-w-md">
        <div className="backdrop-blur-xl bg-white/20 border border-white/30 shadow-2xl rounded-2xl p-8 transition-all duration-500 hover:scale-[1.01]">

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Welcome Back
            </h2>
            <p className="text-sm text-white/80 mt-2">
              Sign in to access your Smart Guards dashboard
            </p>
          </div>

          {/* Error */}
          {err && (
            <div className="text-sm text-red-100 bg-red-500/30 border border-red-300/40 backdrop-blur rounded-lg p-3 mb-4">
              {err}
            </div>
          )}

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-5">

            {/* Username */}
            <div className="relative">
              <label className="block text-sm text-white/80 mb-1">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Enter your username"
                className="w-full px-4 py-3 rounded-xl bg-white/30 text-white placeholder-white/60 border border-white/40 focus:outline-none focus:ring-2 focus:ring-white/60 focus:bg-white/40 transition-all duration-300"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <label className="block text-sm text-white/80 mb-1">
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                placeholder="Enter your password"
                className="w-full px-4 py-3 rounded-xl bg-white/30 text-white placeholder-white/60 border border-white/40 focus:outline-none focus:ring-2 focus:ring-white/60 focus:bg-white/40 transition-all duration-300"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                disabled={busy}
                className="relative inline-flex items-center justify-center px-6 py-3 font-semibold text-emerald-700 bg-white rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>

              <a
                href="#"
                className="text-sm text-white/80 hover:text-white transition"
              >
                Forgot password?
              </a>
            </div>

          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/70 mt-6">
          © {new Date().getFullYear()} Smart Guards. All rights reserved.
        </p>
      </div>
    </div>
  );
}