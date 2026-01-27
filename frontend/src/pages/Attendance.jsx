// frontend/src/pages/AttendancePage.jsx  (replace existing file with this)
// Styling-only upgrade: prettier UI, micro-animations, icons, improved table and summary cards.
// Logic, API calls and behavior are unchanged.

import React, { useEffect, useState, useRef } from "react";
import api, { safeGet } from "../api";

/* ---------- Decorative helpers (presentation-only) ---------- */
function Sparkle({ className = "h-4 w-4 inline-block" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2l1.6 3.3L17 7l-3 1.9L15 13l-3-1.9L9 13l1-4.1L7 7l3.4-1.7L12 2z" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallIcon({ name, className = "h-5 w-5" }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "calendar":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M16 3v4M8 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "qr":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="15" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="3" y="15" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="12" y="12" width="3" height="3" fill="currentColor" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common} aria-hidden>
          <path d="M20 12a8 8 0 1 0-2.1 5.1L20 21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    default:
      return null;
  }
}

/* Fancy small button for consistent UI */
function FancyBtn({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transform transition hover:-translate-y-0.5 shadow ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------- Row component (keeps same props & rendering behavior) ---------- */
function Row({ a }) {
  // keep behavior: show '—' when values missing
  const checkIn = a?.check_in_time ? new Date(a.check_in_time).toLocaleString() : "—";
  const status = a?.status ?? "—";

  // status color mapping
  const statusColor = status === "LATE" ? "text-amber-700 bg-amber-50" : status === "ABSENT" ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50";

  return (
    <tr className="group hover:bg-slate-50">
      <td className="px-3 py-3 border-b align-top">
        <div className="text-sm font-medium text-slate-800">{a.guard?.username ?? "—"}</div>
      </td>
      <td className="px-3 py-3 border-b align-top">
        <div className="text-sm text-slate-600">{a.shift?.premise?.name ?? "—"}</div>
      </td>
      <td className="px-3 py-3 border-b align-top">
        <div className="text-sm text-slate-700">{checkIn}</div>
      </td>
      <td className="px-3 py-3 border-b align-top">
        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
          <span className="w-2 h-2 rounded-full" aria-hidden style={{ background: status === "LATE" ? "#f59e0b" : status === "ABSENT" ? "#ef4444" : "#10b981" }} />
          <span>{status}</span>
        </div>
      </td>
    </tr>
  );
}

/* ---------- Main component (logic unchanged) ---------- */
export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0 });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const pollingRef = useRef(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await safeGet(`/attendance/?date=${date}`);
      const data = res.data || [];
      setRows(data);

      // compute stats (preserve original approach)
      let present = 0,
        late = 0;
      data.forEach((r) => {
        if (r.status === "LATE") late++;
        else present++;
      });
      setStats({ present, late, absent: Math.max(0, 12 - (present + late)) });
    } catch (err) {
      console.warn("attendance load failed", err);
      if (err?.response?.status === 401) {
        setMsg({ type: "error", text: "Unauthorized (401). Token expired? Please login again or refresh token." });
      } else {
        setMsg({ type: "error", text: err?.response?.data || err.message || "Failed to load attendance." });
      }
      setRows([]);
      setStats({ present: 0, late: 0, absent: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load on mount / date change
    load();

    // start polling every 10s for near real-time updates
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => load(), 10000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function simulateQR() {
    setMsg(null);
    const shiftRaw = window.prompt("Enter shift_id to simulate (e.g. 2):");
    if (!shiftRaw) return;
    const shift_id = Number(shiftRaw);
    if (!shift_id || isNaN(shift_id)) {
      setMsg({ type: "error", text: "Invalid shift_id" });
      return;
    }
    const uuid = window.prompt("Enter premise uuid (copy the premise uuid from admin or premises list):");
    if (!uuid) {
      setMsg({ type: "error", text: "Premise uuid required for simulation" });
      return;
    }

    // optional geolocation
    let coords = { lat: null, lng: null };
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not available"));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
      });
      coords.lat = pos.coords.latitude;
      coords.lng = pos.coords.longitude;
    } catch (e) {
      // ignore if unavailable
      console.warn("geo failed", e);
    }

    const payload = {
      shift_id,
      qr_payload: { uuid },
      check_in_lat: coords.lat,
      check_in_lng: coords.lng,
    };

    try {
      const res = await api.post("/attendance/", payload);
      setMsg({ type: "success", text: "Simulated check-in posted" });
      await load();
    } catch (err) {
      console.error("simulate failed", err);
      if (err?.response) {
        setMsg({ type: "error", text: JSON.stringify(err.response.data) });
      } else {
        setMsg({ type: "error", text: err.message || "Simulate failed" });
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 text-white shadow-lg">📥</span>
              Attendance
            </h1>
            <div className="text-sm text-slate-500 mt-1">QR-based check-in tracking • real-time updates</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm ring-1 ring-slate-100">
              <SmallIcon name="calendar" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-sm px-2 py-1 bg-transparent outline-none"
                aria-label="Choose date"
              />
            </div>

            <FancyBtn onClick={simulateQR} className="bg-emerald-600 text-white">
              <SmallIcon name="qr" />
              Simulate QR
            </FancyBtn>

            <FancyBtn onClick={load} className="bg-white ring-1 ring-slate-100">
              <SmallIcon name="refresh" />
              Refresh
            </FancyBtn>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl p-4 shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Today's Attendance</h3>
              <div className="text-xs text-slate-400">{loading ? "Loading…" : `${rows.length} records`}</div>
            </div>

            {loading ? (
              <div className="min-h-[200px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-emerald-400 border-slate-200 mb-2" />
                  <div className="text-sm text-slate-500">Loading attendance…</div>
                </div>
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm table-auto">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-3 py-3">Guard</th>
                      <th className="px-3 py-3">Site</th>
                      <th className="px-3 py-3">Check-in</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <Row key={r.id} a={r} />
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                          No attendance records for this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="bg-white rounded-2xl p-4 shadow-2xl border flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Summary</h3>
              <div className="text-xs text-slate-400">Snapshot</div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-white/60 to-emerald-50 border flex flex-col items-center">
                <div className="text-xs text-slate-500">Present</div>
                <div className="text-xl font-bold text-emerald-700">{stats.present}</div>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-white/60 to-amber-50 border flex flex-col items-center">
                <div className="text-xs text-slate-500">Late</div>
                <div className="text-xl font-bold text-amber-700">{stats.late}</div>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-white/60 to-rose-50 border flex flex-col items-center">
                <div className="text-xs text-slate-500">Absent</div>
                <div className="text-xl font-bold text-rose-700">{stats.absent}</div>
              </div>
            </div>

            <div className="flex-1 text-sm text-slate-600">
              <div className="mb-3">Notes</div>
              <div className="text-xs text-slate-400">Attendance is collected from QR check-ins. The simulation tool can post a fake check-in for testing purposes (admins only).</div>

              {msg && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                }`}>
                  {String(msg.text)}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="mt-6">
          <div className="bg-white rounded-2xl p-4 shadow-inner text-sm text-slate-600 border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-md p-2 bg-emerald-100 text-emerald-700"><Sparkle /></div>
                <div>
                  <div className="font-semibold">Active QR check-in sites</div>
                  <div className="text-xs text-slate-400">Counts and site details (coming soon)</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">Feature roadmap</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- Tailwind notes ----------
- This file uses only Tailwind utility classes. For extra micro-animations you can add these to tailwind.config.js:
  animation: {
    'spin-slow': 'spin 6s linear infinite',
    'float': 'float 6s ease-in-out infinite'
  },
  keyframes: {
    float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } }
  }
- All functionality (API calls, prompts, polling) is preserved exactly as in the original file.
-------------------------------------- */
