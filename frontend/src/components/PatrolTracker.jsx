// src/components/PatrolTracker.jsx
import React, { useEffect, useState, useContext, useRef } from "react";
import api, { authHeaders, safeGet } from "../api";
import AuthContext from "../AuthContext";

/*
  PatrolTracker
  - fetches active shifts (GET /shifts/?status=active)
  - user selects a shift (required) before starting
  - uses navigator.geolocation.watchPosition to send coords
  - posts to POST /patrols/ with { lat, lng, accuracy, shift_id }
  - respects a client-side minimum interval (configurable) to avoid flooding backend
*/

export default function PatrolTracker() {
  const { token, logout } = useContext(AuthContext);
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [minIntervalSec, setMinIntervalSec] = useState(10); // default min interval between posts
  const lastSentRef = useRef(0);

  useEffect(() => {
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadShifts() {
    try {
      const res = await safeGet("/shifts/?status=active");
      setShifts(res.data || []);
      if ((res.data || []).length > 0 && !selectedShift) {
        setSelectedShift(res.data[0]);
      }
    } catch (err) {
      const statusCode = err?.response?.status;
      if (statusCode === 401) {
        logout();
        return;
      }
      console.warn("Failed to load shifts", err);
      setShifts([]);
    }
  }

  function canSendNow() {
    const now = Date.now();
    return (now - lastSentRef.current) / 1000 >= minIntervalSec;
  }

  async function sendPosition(payload) {
    // ensure we use field names backend expects: lat, lng, accuracy, shift_id (if present)
    const body = {
      lat: Number(payload.latitude ?? payload.lat),
      lng: Number(payload.longitude ?? payload.lng),
      accuracy: Number(payload.accuracy ?? 0),
    };
    if (selectedShift?.id) body.shift_id = selectedShift.id;

    try {
      const res = await api.post("/patrols/", body, { headers: authHeaders(token) });
      lastSentRef.current = Date.now();
      setLastSentAt(new Date().toLocaleTimeString());
      setLastResponse({ ok: true, time: new Date().toLocaleTimeString(), data: res.data });
      setStatus("Tracking…");
    } catch (err) {
      const statusCode = err?.response?.status;
      setLastResponse({ ok: false, time: new Date().toLocaleTimeString(), status: statusCode, data: err?.response?.data || err.message });
      if (statusCode === 401) {
        // unauthorized -> logout
        setStatus("Unauthorized");
        logout();
      } else if (statusCode === 429) {
        setStatus("Rate limited - slowing down");
        // push lastSentRef forward by minInterval to avoid immediate retry
        lastSentRef.current = Date.now();
      } else {
        setStatus("Error sending position");
        console.warn("Patrol send failed", err);
      }
    }
  }

  function startTracking() {
    if (!navigator.geolocation) {
      alert("Geolocation not supported by this browser.");
      return;
    }
    if (!selectedShift || !selectedShift.id) {
      alert("Select a shift before starting patrol tracking.");
      return;
    }

    setStatus("Requesting permission…");

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        // ensure numeric values
        const payload = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };

        if (!canSendNow()) {
          // skip to avoid flooding; update UI so user knows we skip
          setStatus(`Waiting (${Math.round((minIntervalSec - ((Date.now() - lastSentRef.current) / 1000)))}s)`);
          return;
        }

        // attempt send
        setStatus("Sending…");
        await sendPosition(payload);
      },
      (err) => {
        console.error("Geolocation error", err);
        setStatus("Geolocation error: " + (err.message || err.code));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    setWatchId(id);
    setStatus("Tracking…");
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setStatus("Stopped");
    } else {
      setStatus("Idle");
    }
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded shadow p-6">
      <h2 className="text-xl font-semibold mb-2">Patrol Tracker</h2>
      <p className="text-sm text-gray-500 mb-4">Start a patrol for a selected shift. This posts {`{ lat, lng, accuracy, shift_id }`} to <code>/patrols/</code>.</p>

      <div className="mb-3">
        <label className="block text-sm text-gray-700 mb-1">Active shift</label>
        <select
          value={selectedShift?.id || ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            const s = shifts.find(x => x.id === id);
            setSelectedShift(s || null);
          }}
          className="w-full px-3 py-2 border rounded"
        >
          {shifts.length === 0 && <option value="">No active shifts</option>}
          {shifts.map(s => (
            <option key={s.id} value={s.id}>
              {s.premise?.name ?? "Site"} — {s.date} {s.start_time}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="block text-sm text-gray-700 mb-1">Minimum interval between sends (seconds)</label>
        <input
          type="number"
          min="1"
          value={minIntervalSec}
          onChange={(e) => setMinIntervalSec(Math.max(1, Number(e.target.value || 1)))}
          className="w-32 px-3 py-2 border rounded"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={startTracking}
          disabled={watchId !== null}
          className={`flex-1 px-4 py-2 rounded ${watchId ? "bg-slate-200 text-slate-600" : "bg-green-600 text-white"}`}
        >
          Start Patrol
        </button>

        <button
          onClick={stopTracking}
          disabled={watchId === null}
          className={`flex-1 px-4 py-2 rounded ${watchId ? "bg-red-600 text-white" : "bg-slate-200 text-slate-600"}`}
        >
          Stop
        </button>
      </div>

      <div className="mt-4 text-sm space-y-1">
        <div>Status: <span className="font-medium">{status}</span></div>
        <div>Selected shift: <span className="font-medium">{selectedShift ? `${selectedShift.premise?.name} (${selectedShift.id})` : "—"}</span></div>
        <div>Last sent: <span className="font-medium">{lastSentAt ?? "never"}</span></div>
        {lastResponse && (
          <div className={`mt-2 p-2 rounded text-xs ${lastResponse.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            <div><strong>{lastResponse.ok ? "Last send OK" : `Error ${lastResponse.status ?? ""}`}</strong></div>
            <div className="truncate">{JSON.stringify(lastResponse.data)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
