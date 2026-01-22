// frontend/src/pages/GuardDashboard.jsx
import React, { useEffect, useState, useContext } from "react";
import AuthContext from "../AuthContext";
import api, { safeGet } from "../api";
import ScanQR from "../components/ScanQR";

/**
 * GuardDashboard
 * - shows today's assigned active shifts for current guard
 * - check-in via ScanQR (qr -> geolocation -> POST /api/attendance/checkin/)
 * - shows guard's recent check-in history (GET /api/attendance/history/ or /attendance/?date=...)
 */

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
      // your backend guard history endpoint: /attendance/history/ or /attendance/my/
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

  // Called when ScanQR returns decoded text
  async function handleDetected(text) {
    setShowScanner(false);
    setBusy(true);
    setMsg(null);

    // Parse payload: prefer JSON with id/uuid
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      const t = String(text).trim();
      if (/^\d+$/.test(t)) payload = { id: Number(t) };
      else payload = { uuid: t };
    }

    // get geolocation (best effort)
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

    const body = {
      qr_payload: payload,
    };
    if (coords.lat != null) {
      body.check_in_lat = coords.lat;
      body.check_in_lng = coords.lng;
    }

    try {
      // **IMPORTANT:** new endpoint that does not require shift_id
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
          // server may return structured errors
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

  // Manual fallback check-in (if QR or camera fails)
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
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold">Guard Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Check in to your assigned shifts using the premise QR code</p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Assigned active shifts</div>
              <div className="text-xs text-slate-400">Tap a shift to check in</div>
            </div>

            {loading && <div className="text-sm text-slate-400 p-4">Loading…</div>}
            {!loading && shifts.length === 0 && <div className="text-sm text-slate-400 p-4">You have no assigned active shifts.</div>}

            <div className="space-y-3">
              {shifts.map((s) => (
                <div key={s.id} className="p-3 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.premise?.name ?? `Premise ${s.premise_id ?? ""}`}</div>
                    <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
                    <div className="text-xs text-slate-400 mt-1">Required: {s.required_skills || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs mb-2">{s.assigned_at ? `Assigned: ${new Date(s.assigned_at).toLocaleString()}` : "Assigned"}</div>
                    <button
                      onClick={() => openScannerFor(s)}
                      disabled={busy}
                      className="px-3 py-1 bg-emerald-600 text-white rounded text-sm"
                    >
                      {busy ? "Processing…" : "Check in (Scan QR)"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button onClick={manualCheckin} className="px-3 py-2 bg-yellow-500 text-white rounded text-sm" disabled={busy}>
                {busy ? "Processing…" : "Manual check-in (fallback)"}
              </button>
            </div>

            {msg && (
              <div className={`mt-3 text-sm ${msg.type === "success" ? "text-green-600" : (msg.type === "warn" ? "text-yellow-700" : "text-red-600")}`}>
                {msg.text}
              </div>
            )}
          </div>

          <aside className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Your check-in history</div>
              <div className="text-xs text-slate-400">Most recent first</div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-auto">
              {history.length === 0 && <div className="text-sm text-slate-400 p-2">No recent check-ins</div>}
              {history.map((h) => (
                <div key={h.id} className="p-2 border rounded">
                  <div className="text-sm font-medium">{h.shift?.premise?.name ?? h.premise ?? `Shift ${h.shift?.id ?? h.shift_id ?? ""}`}</div>
                  <div className="text-xs text-slate-500">Time: {new Date(h.check_in_time).toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-1">Status: {h.status ?? "—"} — Lat/Lng: {h.check_in_lat ?? "—"}/{h.check_in_lng ?? "—"}</div>
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
