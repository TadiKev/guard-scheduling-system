// frontend/src/components/ManualCheckIn.jsx
import React, { useEffect, useState, useContext } from "react";
import api, { safeGet } from "../api";
import AuthContext from "../AuthContext";

export default function ManualCheckIn() {
  const { user } = useContext(AuthContext);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    async function loadShifts() {
      setLoading(true);
      try {
        // fetch today's shifts for this guard or active shifts where assigned_guard is user
        const today = new Date().toISOString().slice(0,10);
        const res = await safeGet(`/shifts/?date=${today}&assigned=1`); // adapt server query param if available
        // fallback: fetch shifts and filter
        const arr = Array.isArray(res?.data) ? res.data : (res?.data?.results || []);
        setShifts(arr.filter(s => !s.assigned_guard || (s.assigned_guard && s.assigned_guard.id === user?.id)));
      } catch (e) {
        setShifts([]);
      } finally {
        setLoading(false);
      }
    }
    loadShifts();
  }, [user]);

  async function handleCheckIn(shift) {
    setMsg({ type: "info", text: "Checking in…" });
    try {
      const body = { shift_id: shift.id, qr_payload: { shift_id: shift.id } };
      const res = await api.post("/attendance/checkin/", body);
      setMsg({ type: "success", text: "Checked in." });
    } catch (err) {
      setMsg({ type: "error", text: JSON.stringify(err?.response?.data || err?.message) });
    }
  }

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="font-semibold mb-2">Manual Check-in</h3>
      {msg && <div className={`p-2 mb-2 ${msg.type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'} rounded`}>{msg.text}</div>}
      {loading && <div className="text-sm text-slate-400">Loading shifts…</div>}
      {!loading && shifts.length === 0 && <div className="text-sm text-slate-400">No suitable shifts found for manual check-in.</div>}
      <div className="space-y-2">
        {shifts.map(s => (
          <div key={s.id} className="p-2 border rounded flex items-center justify-between">
            <div>
              <div className="font-medium">{s.premise?.name ?? "Shift"}</div>
              <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
            </div>
            <div>
              <button onClick={() => handleCheckIn(s)} className="px-2 py-1 bg-emerald-600 text-white rounded text-sm">Check in</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
