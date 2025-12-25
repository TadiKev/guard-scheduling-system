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
      const msg = error?.response?.data?.detail || error?.message || "Login failed";
      setErr(Array.isArray(msg) ? msg.join(" ") : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-2">Welcome back</h2>
        <p className="text-sm text-slate-500 mb-6">Login to access the Smart Guards dashboard</p>

        {err && <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">{err}</div>}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required className="mt-1 w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-slate-700">Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required className="mt-1 w-full px-3 py-2 border rounded" />
          </div>

          <div className="flex items-center justify-between">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-emerald-600 text-white rounded shadow">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <a href="#" className="text-sm text-slate-500">Forgot password?</a>
          </div>
        </form>
      </div>
    </div>
  );
}
