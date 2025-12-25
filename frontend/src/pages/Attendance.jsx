import React, { useEffect, useState } from "react";
import api, { safeGet } from "../api";

function Row({ a }) {
  return (
    <tr>
      <td className="px-3 py-2 border-b">{a.guard?.username ?? "—"}</td>
      <td className="px-3 py-2 border-b">{a.shift?.premise?.name ?? "—"}</td>
      <td className="px-3 py-2 border-b">{new Date(a.check_in_time).toLocaleTimeString()}</td>
      <td className="px-3 py-2 border-b">{a.status}</td>
    </tr>
  );
}

export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({present:0, late:0, absent:0});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await safeGet(`/attendance/?date=${date}`);
      setRows(res.data || []);
      // compute stats
      let present = 0, late = 0;
      (res.data||[]).forEach(r => {
        if (r.status === "LATE") late++;
        else present++;
      });
      // absent is unknown without shifts count; leave blank
      setStats({present, late, absent: Math.max(0, (12 - (present+late)) )});
    } catch (err) {
      console.warn("attendance load failed", err);
      setRows([]);
      setStats({present:0,late:0,absent:0});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  async function simulateQR() {
    setMsg(null);
    try {
      await api.post("/attendance/", {}); // backend needs qr_payload etc — this is a placeholder; adjust as needed
      setMsg({ type: "success", text: "Simulated check-in posted" });
      load();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data || "Simulate failed" });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
   
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Attendance</h1>
            <div className="text-sm text-slate-500">QR-based check-in tracking</div>
          </div>
          <div className="flex items-center gap-3">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border rounded" />
            <button onClick={simulateQR} className="px-3 py-2 bg-emerald-600 text-white rounded">Simulate QR</button>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-3">Today's Attendance</h3>
            {loading && <div className="text-sm text-slate-400">Loading…</div>}
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2">Guard</th>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Check-in</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => <Row key={r.id} a={r} />)}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold">Summary</h3>
            <div className="mt-3 text-sm space-y-2">
              <div>Present: <strong>{stats.present}</strong></div>
              <div>Late: <strong>{stats.late}</strong></div>
              <div>Absent: <strong>{stats.absent}</strong></div>
              {msg && <div className={`mt-3 text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>{String(msg.text)}</div>}
            </div>
          </aside>
        </section>

        <section className="mt-6">
          <div className="bg-white p-4 rounded shadow text-sm text-slate-600">Active QR check-in sites and counts (coming soon)</div>
        </section>
      </main>
    </div>
  );
}
