// frontend/src/pages/GuardDashboard.jsx
import React, { useEffect, useState, useContext } from "react";
import AuthContext from "../AuthContext";
import api, { safeGet } from "../api";
import ScanQR from "../components/ScanQR";

/*
  GuardDashboard — styling-only enhancement
  - Kept all logic, API calls and behavior unchanged.
  - Only visual improvements: layout, icons, micro-animations, badges, nicer buttons and cards.
*/

function Icon({ name, className = "h-5 w-5" }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "clock":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" />
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
    case "history":
      return (
        <svg {...common} aria-hidden>
          <path d="M21 10a8 8 0 1 0-2.7 5.7L21 21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M12 7v5l3 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "location":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2c3.3 0 6 2.7 6 6 0 4.5-6 10-6 10s-6-5.5-6-10c0-3.3 2.7-6 6-6z" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <circle cx="12" cy="8" r="1.6" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

function Badge({ children, tone = "emerald" }) {
  const toneMap = {
    emerald: "bg-emerald-100 text-emerald-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-rose-100 text-rose-800",
    slate: "bg-slate-100 text-slate-800",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${toneMap[tone] || toneMap.slate}`}>{children}</span>;
}

function ShiftCard({ s, onCheckIn, busy }) {
  return (
    <div className="p-4 rounded-2xl bg-white/90 backdrop-blur-sm border shadow-sm flex items-center justify-between gap-4 transition hover:shadow-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-300 text-white font-bold shadow">
            <span className="text-sm">SG</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">{s.premise?.name ?? `Premise ${s.premise_id ?? ""}`}</div>
            <div className="text-xs text-slate-500 truncate">{s.date} • {s.start_time} - {s.end_time}</div>
            <div className="text-xs text-slate-400 mt-2">Required: <span className="text-slate-700">{s.required_skills || "—"}</span></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="text-xs text-slate-500">{s.assigned_at ? `Assigned: ${new Date(s.assigned_at).toLocaleString()}` : "Assigned"}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCheckIn(s)}
            disabled={busy}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold shadow ${
              busy ? "bg-emerald-300 text-white opacity-80" : "bg-emerald-600 text-white hover:scale-[1.03]"
            } transition`}
            title="Scan QR to check in"
            aria-label="Check in (scan QR)"
          >
            <Icon name="qr" className="h-4 w-4" />
            <span>{busy ? "Processing…" : "Check in"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main component: GuardDashboard (logic unchanged) ---------- */
export default function GuardDashboard() {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  async function loadShifts() {
    setLoading(true);
    try {
      const res = await safeGet("/shifts/?status=active");
      const all = Array.isArray(res.data) ? res.data : (res.data || []);
      const mine = all.filter((s) => s.assigned_guard && user && s.assigned_guard.id === user.id);
      setShifts(mine);
      if (!selectedShift && mine.length) setSelectedShift(mine[0]);
    } catch (e) {
      console.warn("failed to load shifts", e);
      setMsg({ type: "error", text: "Failed to load shifts" });
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const res = await safeGet("/attendance/history/?limit=20");
      const rows = Array.isArray(res.data) ? res.data : (res.data || []);
      setHistory(rows);
    } catch (e) {
      console.warn("failed to load attendance history", e);
      setHistory([]);
    }
  }

  useEffect(() => {
    loadShifts();
    loadHistory();
    const t1 = setInterval(loadShifts, 15000);
    const t2 = setInterval(loadHistory, 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openScannerFor(shift) {
    setSelectedShift(shift);
    setMsg(null);
    setShowScanner(true);
  }

  async function handleDetected(text) {
    setShowScanner(false);
    setBusy(true);
    setMsg(null);

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      const t = String(text).trim();
      if (/^\d+$/.test(t)) payload = { id: Number(t) };
      else payload = { uuid: t };
    }

    let coords = { lat: null, lng: null };
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not available"));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      });
      coords.lat = pos.coords.latitude;
      coords.lng = pos.coords.longitude;
    } catch (e) {
      console.warn("geolocation failed", e);
    }

    const body = { qr_payload: payload };
    if (coords.lat != null) {
      body.check_in_lat = coords.lat;
      body.check_in_lng = coords.lng;
    }

    try {
      const res = await api.post("/attendance/checkin/", body);
      setMsg({ type: "success", text: "Check-in successful." });
      await loadShifts();
      await loadHistory();
    } catch (err) {
      console.error("check-in failed", err);
      const server = err?.response?.data;
      let text = "Check-in failed";
      if (server) {
        try {
          if (server.detail) text = Array.isArray(server.detail) ? server.detail.join(" ") : String(server.detail);
          else text = JSON.stringify(server);
        } catch(e){ text = String(server); }
      } else {
        text = err?.message || text;
      }
      setMsg({ type: "error", text });
    } finally {
      setBusy(false);
    }
  }

  async function manualCheckin() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await api.post("/attendance/checkin/", { manual: true });
      setMsg({ type: "success", text: "Manual check-in recorded." });
      await loadShifts();
      await loadHistory();
    } catch (err) {
      const server = err?.response?.data;
      let text = "Manual check-in failed";
      if (server) {
        try { text = server.detail ? (Array.isArray(server.detail) ? server.detail.join(" ") : server.detail) : JSON.stringify(server); } catch(e){ text = String(server); }
      } else {
        text = err?.message || text;
      }
      setMsg({ type: "error", text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-4xl mx-auto p-6">
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-300 text-white shadow-lg">🛡️</span>
              Guard Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">Check in to your assigned shifts using the premise QR code</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 shadow ring-1 ring-slate-100 text-sm">
              <Icon name="clock" />
              <span>Auto-refresh • <strong className="ml-1">15s</strong></span>
            </div>
            <div className="text-xs text-slate-400">Signed in as <span className="text-slate-700 font-medium">{user?.username ?? "—"}</span></div>
          </div>
        </header>

        <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Assigned active shifts</h2>
              <div className="text-xs text-slate-400">Tap a shift to check in</div>
            </div>

            {loading && <div className="text-sm text-slate-400 p-4">Loading…</div>}
            {!loading && shifts.length === 0 && <div className="text-sm text-slate-400 p-4">You have no assigned active shifts.</div>}

            <div className="space-y-3">
              {shifts.map((s) => (
                <ShiftCard key={s.id} s={s} onCheckIn={openScannerFor} busy={busy} />
              ))}
            </div>

            <div className="mt-4 flex gap-2 items-center">
              <button
                onClick={manualCheckin}
                disabled={busy}
                className={`px-3 py-2 rounded-full text-sm font-semibold ${busy ? "bg-yellow-300 text-white" : "bg-yellow-500 text-white hover:scale-[1.02]"} transition shadow`}
              >
                {busy ? "Processing…" : "Manual check-in (fallback)"}
              </button>

              <button
                onClick={() => { loadShifts(); loadHistory(); }}
                className="px-3 py-2 rounded-full text-sm bg-white ring-1 ring-slate-100 shadow hover:scale-[1.02] transition"
              >
                Refresh
              </button>
            </div>

            {msg && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : (msg.type === "warn" ? "bg-yellow-50 text-yellow-800 border border-yellow-100" : "bg-rose-50 text-rose-700 border border-rose-100")}`}>
                {msg.text}
              </div>
            )}
          </section>

          <aside className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Your check-in history</h2>
              <div className="text-xs text-slate-400 flex items-center gap-2"><Icon name="history" /> Most recent first</div>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-auto pr-2">
              {history.length === 0 && <div className="text-sm text-slate-400 p-2">No recent check-ins</div>}
              {history.map((h) => (
                <div key={h.id} className="p-3 rounded-lg border bg-white">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{h.shift?.premise?.name ?? h.premise ?? `Shift ${h.shift?.id ?? h.shift_id ?? ""}`}</div>
                    <Badge tone={h.status === "LATE" ? "yellow" : h.status === "ABSENT" ? "red" : "emerald"}>
                      {h.status ?? "—"}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">Time: {new Date(h.check_in_time).toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2"><Icon name="location" className="h-4 w-4" /> Lat/Lng: <span className="text-slate-700">{h.check_in_lat ?? "—"}/{h.check_in_lng ?? "—"}</span></div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>

      {showScanner && (
        <ScanQR
          onDetected={(text) => handleDetected(text)}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
