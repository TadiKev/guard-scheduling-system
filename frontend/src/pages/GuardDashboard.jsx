// frontend/src/pages/GuardDashboard.jsx
import React, { useEffect, useState, useContext, useRef } from "react";
import AuthContext from "../AuthContext";
import api, { safeGet } from "../api";
import ScanQR from "../components/ScanQR";

/**
 * GuardDashboard
 * - shows active assigned shifts for the current guard
 * - opens scanner to check in (ScanQR -> onDetected text)
 * - posts check-in to backend at POST /api/attendance/checkin/ (expects JSON result)
 * - shows recent check-in history from GET /api/attendance/my/?limit=...
 *
 * Notes:
 * - This component intentionally accepts a few possible backend shapes:
 *   - GET /attendance/my/ -> { results: [...] } OR an array directly
 *   - POST /attendance/checkin/ -> returns created attendance object
 * - If your backend uses different paths, update the strings below.
 */

export default function GuardDashboard() {
  const { user } = useContext(AuthContext);

  const [loadingShifts, setLoadingShifts] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [busy, setBusy] = useState(false);

  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState(null);

  // refs to keep intervals so we can cleanup on unmount
  const shiftsIntervalRef = useRef(null);
  const historyIntervalRef = useRef(null);

  // helper: normalize axios responses to array
  function unwrapListResponse(res) {
    if (!res) return [];
    const d = res.data ?? res;
    if (Array.isArray(d)) return d;
    if (d?.results && Array.isArray(d.results)) return d.results;
    if (d?.attendance && Array.isArray(d.attendance)) return d.attendance;
    // fallback if server returned object keyed by assignments or similar
    return [];
  }

  // small date formatter (handles nulls safely)
  function fmt(dt) {
    try {
      if (!dt) return "—";
      const d = new Date(dt);
      if (isNaN(d.getTime())) return String(dt);
      return d.toLocaleString();
    } catch (e) {
      return String(dt);
    }
  }

  // load active shifts and filter to current user
  async function loadShifts() {
    setLoadingShifts(true);
    try {
      // try server query for active shifts; adjust query if you have a better endpoint
      const res = await safeGet("/shifts/?status=active");
      const list = unwrapListResponse(res);

      // filter assigned to current user
      const mine = Array.isArray(list)
        ? list.filter((s) => s.assigned_guard && user && s.assigned_guard.id === user.id)
        : [];

      setShifts(mine);
      // if selectedShift not set, default to first
      if (!selectedShift && mine.length) setSelectedShift(mine[0]);
    } catch (err) {
      console.warn("GuardDashboard: failed to load shifts", err);
      setMsg({ type: "error", text: "Failed to load active shifts" });
      setShifts([]);
    } finally {
      setLoadingShifts(false);
    }
  }

  // load personal attendance history
  async function loadHistory() {
    setLoadingHistory(true);
    try {
      // this endpoint matches the backend view we suggested earlier: /attendance/my/
      const res = await safeGet("/attendance/my/?limit=20");
      const list = unwrapListResponse(res);
      setHistory(list);
    } catch (err) {
      console.warn("GuardDashboard: failed to load history", err);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    // only load if we have a user
    if (!user) {
      setShifts([]);
      setHistory([]);
      setLoadingShifts(false);
      setLoadingHistory(false);
      return;
    }

    // initial loads
    loadShifts();
    loadHistory();

    // polling: refresh shifts and history periodically
    shiftsIntervalRef.current = setInterval(loadShifts, 15000); // 15s
    historyIntervalRef.current = setInterval(loadHistory, 30000); // 30s

    return () => {
      if (shiftsIntervalRef.current) clearInterval(shiftsIntervalRef.current);
      if (historyIntervalRef.current) clearInterval(historyIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // open scanner for a particular shift
  function openScannerFor(shift) {
    setSelectedShift(shift);
    setMsg(null);
    setShowScanner(true);
  }

  // Called when ScanQR returns scanned text
  async function handleDetected(text) {
    setShowScanner(false);
    setBusy(true);
    setMsg(null);

    // Parse payload: prefer JSON with id/uuid, fallback to raw string/number
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      const t = String(text).trim();
      if (/^\d+$/.test(t)) payload = { id: Number(t) };
      else payload = { raw: t, uuid: t };
    }

    // Attempt geolocation (best-effort)
    let coords = { lat: null, lng: null };
    try {
      if (navigator.geolocation) {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 7000 });
        });
        coords.lat = pos.coords.latitude;
        coords.lng = pos.coords.longitude;
      }
    } catch (e) {
      // ignore geolocation failures (we still allow check-in)
      console.debug("GuardDashboard: geolocation not available or denied", e);
    }

    // build body for POST; use checkin endpoint that validates QR
    const body = {
      shift_id: selectedShift?.id ?? null,
      qr_payload: payload,
    };
    if (coords.lat != null) {
      body.check_in_lat = coords.lat;
      body.check_in_lng = coords.lng;
    }

    try {
      // prefer the checkin endpoint we recommended earlier
      const res = await api.post("/attendance/checkin/", body);
      // res.data should be created attendance
      const created = res?.data ?? null;

      setMsg({ type: "success", text: "Check-in successful." });

      // update UI: prepend to history and refresh shifts
      if (created) {
        setHistory((h) => [created, ...h].slice(0, 50));
      } else {
        // fallback: reload history from server
        await loadHistory();
      }
      // refresh shifts (in case the server updates shift/assigned_at)
      await loadShifts();
    } catch (err) {
      console.error("GuardDashboard: check-in failed", err);
      // Attempt to derive human-friendly error
      let text = "Check-in failed";
      const server = err?.response?.data;
      if (server) {
        try {
          text = typeof server === "string" ? server : JSON.stringify(server);
        } catch (e) {
          text = String(server);
        }
      } else {
        text = err?.message || text;
      }
      setMsg({ type: "error", text });
    } finally {
      setBusy(false);
    }
  }

  // simple UI to open manual scan (navigates to /scan) as alternative
  function openManualScan() {
    // if you have a dedicated route for scanning, just navigate. We'll use window.location for simplicity.
    window.location.href = "/scan";
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold">Guard Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Check in to your assigned shifts using the premise QR code. Use the manual fallback if camera fails.</p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Assigned active shifts</div>
              <div className="text-xs text-slate-400">Tap a shift to check in</div>
            </div>

            {loadingShifts && <div className="text-sm text-slate-400 p-4">Loading…</div>}
            {!loadingShifts && shifts.length === 0 && <div className="text-sm text-slate-400 p-4">You have no assigned active shifts.</div>}

            <div className="space-y-3">
              {shifts.map((s) => (
                <div key={s.id} className="p-3 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.premise?.name ?? `Premise ${s.premise_id ?? ""}`}</div>
                    <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
                    <div className="text-xs text-slate-400 mt-1">Required: {s.required_skills || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs mb-2">{s.assigned_at ? `Assigned: ${fmt(s.assigned_at)}` : "Assigned"}</div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => openScannerFor(s)}
                        disabled={busy}
                        className="px-3 py-1 bg-emerald-600 text-white rounded text-sm"
                      >
                        {busy ? "Processing…" : "Check in (Scan QR)"}
                      </button>
                      <button
                        onClick={() => {
                          // manual check-in without QR if allowed (attempt direct checkin using shift id)
                          // this performs a check-in using shift_id only (no QR payload) - server must allow it
                          (async () => {
                            if (!window.confirm("Perform manual check-in for this shift (no QR)?")) return;
                            setBusy(true);
                            setMsg(null);
                            try {
                              const body = { shift_id: s.id, qr_payload: { shift_id: s.id, manual: true } };
                              const res = await api.post("/attendance/checkin/", body);
                              const created = res?.data ?? null;
                              setMsg({ type: "success", text: "Manual check-in successful." });
                              if (created) setHistory((h) => [created, ...h].slice(0, 50));
                              await loadShifts();
                            } catch (err) {
                              let text = "Manual check-in failed";
                              const server = err?.response?.data;
                              if (server) {
                                try { text = typeof server === "string" ? server : JSON.stringify(server); } catch(e){ text = String(server); }
                              } else text = err?.message || text;
                              setMsg({ type: "error", text });
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                        className="px-2 py-1 bg-slate-100 rounded text-sm"
                      >
                        Manual check-in
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {msg && (
              <div className={`mt-3 text-sm ${msg.type === "success" ? "text-green-600" : (msg.type === "warn" ? "text-yellow-700" : "text-red-600")}`}>
                {msg.text}
              </div>
            )}

            <div className="mt-3 text-xs text-slate-500">
              If camera scanning fails, you can use the manual check-in button or go to the full scanner page.
              <button onClick={openManualScan} className="ml-2 underline text-emerald-600">Open scanner page</button>
            </div>
          </div>

          <aside className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Your check-in history</div>
              <div className="text-xs text-slate-400">Most recent first</div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-auto">
              {loadingHistory && <div className="text-sm text-slate-400 p-2">Loading history…</div>}
              {!loadingHistory && history.length === 0 && <div className="text-sm text-slate-400 p-2">No recent check-ins</div>}
              {history.map((h) => (
                <div key={h.id ?? `${h.check_in_time}_${Math.random()}`} className="p-2 border rounded">
                  <div className="text-sm font-medium">{h.shift?.premise?.name ?? h.premise ?? `Shift ${h.shift?.id ?? h.shift_id ?? ""}`}</div>
                  <div className="text-xs text-slate-500">Time: {fmt(h.check_in_time)}</div>
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
          // optionally pass a small hint to the scanner UI
          hintText={selectedShift?.premise?.name ? `Scan QR at ${selectedShift.premise.name}` : "Scan premise QR"}
        />
      )}
    </div>
  );
}
