// src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef, useMemo, useContext } from "react";
import AuthContext from "../AuthContext";
import api, { safeGet } from "../api";
import PatrolMap from "../components/PatrolMap";
import "leaflet/dist/leaflet.css";

const HIGHLIGHT_MS = 2 * 60 * 1000;

function Sparkle({ className = "" }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2l1.9 4.3L18 8l-4 2 1 4.3L12 12l-3 2.3L10 10 6 8l4.1-1.7L12 2z" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallIcon({ name, className = "h-5 w-5" }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "clock":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
          <path d="M12 8v5l3 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "guards":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2l3 6 6 .5-4.5 3.5L19 20l-7-4-7 4 2.5-7L3 8.5 9 8 12 2z" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "map":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 6l7-3 7 3 7-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M3 21l7-3 7 3 7-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "export":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 3v12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="15" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    default:
      return null;
  }
}

const KPI = ({ label, value, delta, color = "emerald" }) => {
  const colorMap = {
    emerald: { bg: "from-emerald-50 to-emerald-10", accent: "text-emerald-600", ring: "ring-emerald-100" },
    slate: { bg: "from-slate-50 to-slate-10", accent: "text-slate-700", ring: "ring-slate-100" },
    blue: { bg: "from-sky-50 to-sky-10", accent: "text-sky-600", ring: "ring-sky-100" },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className={`rounded-2xl p-4 shadow-xl border ${c.ring} bg-gradient-to-br ${c.bg} transform-gpu hover:-translate-y-1 transition`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 font-medium">{label}</div>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{value ?? "—"}</div>
            {delta !== undefined && (
              <div className={`inline-flex items-center gap-1 text-xs font-semibold ${delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"} px-2 py-1 rounded-full`}>
                {delta >= 0 ? `+${delta}%` : `${delta}%`}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white/60 backdrop-blur-sm shadow-inner ring-1 ring-white">
            <SmallIcon name={color === "blue" ? "clock" : color === "slate" ? "map" : "guards"} />
          </div>
          <div className="text-emerald-400 animate-pulse opacity-60">
            <Sparkle className="inline-block" />
          </div>
        </div>
      </div>
    </div>
  );
};

const GuardTile = ({ g, onClick, selected }) => (
  <div
    onClick={() => onClick && onClick(g)}
    className={`p-3 border rounded-2xl flex items-start gap-3 cursor-pointer transition-transform transform hover:-translate-y-1 ${selected ? "ring-2 ring-emerald-300 bg-gradient-to-r from-emerald-50 to-white shadow-lg" : "bg-white/70 backdrop-blur-sm"}`}
  >
    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-200 to-cyan-100 flex items-center justify-center text-sm font-bold text-slate-800 shadow-inner">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-md bg-white/60 flex items-center justify-center shadow-sm">{g.username?.[0]?.toUpperCase() ?? "G"}</div>
      </div>
    </div>

    <div className="flex-1">
      <div className="font-semibold text-slate-800">{g.full_name || g.username || "Unknown Guard"}</div>
      <div className="text-xs text-slate-500 mt-1">{g.profile?.status ?? "On Patrol"}</div>
      <div className="text-xs text-slate-400 mt-2">
        Skills: <span className="text-slate-700">{(g.profile?.skills || "").split(",").slice(0, 3).join(", ") || "—"}</span>
      </div>
    </div>

    <div className="text-xs text-slate-400 text-right">
      <div>{g.updated_at ?? "just now"}</div>
      {selected && <div className="text-emerald-600 text-[10px] font-semibold mt-1">Selected</div>}
    </div>
  </div>
);

function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div style={{ zIndex: 2147483647 }} className="fixed inset-0 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-md p-2 bg-gradient-to-r from-emerald-400 to-cyan-300 text-white shadow">
              <SmallIcon name="guards" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-900 leading-tight">{title}</h3>
              <div className="text-xs text-slate-500">Guard checkpoint detail</div>
            </div>
          </div>
          <button onClick={onClose} className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 transition text-sm">Close</button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { logout } = useContext(AuthContext);

  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [guards, setGuards] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [allPatrolPoints, setAllPatrolPoints] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [showGuardModal, setShowGuardModal] = useState(false);

  const prevAssignedRef = useRef({});
  const [highlightedShifts, setHighlightedShifts] = useState({});
  const [recentAssignments, setRecentAssignments] = useState([]);

  const bringGuardToTop = (g) => {
    setGuards((prev) => {
      const copy = prev.filter((x) => x.id !== g.id);
      return [g, ...copy];
    });
  };

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        safeGet("/dashboard/summary/"),
        safeGet("/dashboard/analytics/"),
        safeGet("/patrols/latest/?limit=1000"),
        safeGet("/shifts/?status=active"),
      ]);

      if (results[0].status === "fulfilled") setSummary(results[0].value.data);
      if (results[1].status === "fulfilled") setAnalytics(results[1].value.data);

      if (results[2].status === "fulfilled") {
        const pts = results[2].value.data || [];
        const mapped = pts
          .map((pt) => ({
            id: pt.id,
            guard_id: pt.guard_id,
            username: pt.guard?.username ?? `guard${pt.guard_id}`,
            full_name:
              pt.guard?.first_name || pt.guard?.last_name
                ? `${pt.guard?.first_name ?? ""} ${pt.guard?.last_name ?? ""}`.trim()
                : null,
            lat: Number(pt.lat),
            lng: Number(pt.lng),
            timestamp: pt.timestamp,
            updated_at: new Date(pt.timestamp).toLocaleTimeString(),
            profile: pt.guard?.profile || {},
            raw: pt,
            premise_name: pt.premise?.name || pt.premise_name || pt.shift?.premise?.name || null,
          }))
          .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lng));
        setGuards(mapped);
        setAllPatrolPoints(mapped.map((p) => [p.lat, p.lng, 0.6]));
      } else {
        setGuards([]);
        setAllPatrolPoints([]);
      }

      if (results[3].status === "fulfilled") {
        const rawShifts = results[3].value.data || [];
        const normalized = rawShifts.map((s) => ({
          id: s.id,
          premise_name: s.premise?.name || s.premise_name || "",
          date: s.date,
          start_time: s.start_time || "",
          end_time: s.end_time || "",
          assigned_guard: s.assigned_guard ? { id: s.assigned_guard.id, username: s.assigned_guard.username } : null,
        }));
        detectAssignmentsAndHighlight(normalized);
        setShifts(normalized);
      } else {
        setShifts([]);
      }
    } catch (err) {
      console.warn("dashboard load failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 15000);
    return () => clearInterval(t);
  }, []);

  function detectAssignmentsAndHighlight(newShifts) {
    const prev = prevAssignedRef.current || {};
    const now = new Date();
    const newHighlights = { ...highlightedShifts };
    const newRecent = [...recentAssignments];

    newShifts.forEach((s) => {
      const prevAssigned = prev[s.id] ?? null;
      const newAssigned = s.assigned_guard ? s.assigned_guard.id : null;
      const becameAssigned = prevAssigned == null && newAssigned != null;
      const changedAssignment = prevAssigned != null && newAssigned != null && prevAssigned !== newAssigned;
      if (becameAssigned || changedAssignment) {
        const assignedAt = now.toISOString();
        newHighlights[s.id] = { assignedAt, guard: s.assigned_guard };
        newRecent.unshift({ shift_id: s.id, guard_username: s.assigned_guard?.username || "unknown", assigned_at: assignedAt });
        setTimeout(() => {
          setHighlightedShifts((curr) => {
            const copy = { ...(curr || {}) };
            delete copy[s.id];
            return copy;
          });
        }, HIGHLIGHT_MS);
      }
      prev[s.id] = newAssigned;
    });

    if (newRecent.length > 20) newRecent.length = 20;
    setHighlightedShifts(newHighlights);
    setRecentAssignments(newRecent);
    prevAssignedRef.current = prev;
  }

  async function handleMapGuardClick(g, mapHelpers = {}) {
    bringGuardToTop(g);

    const enriched = { ...g, loading: true, premise_name: g.premise_name || null, full_name: g.full_name || g.username };
    setSelectedGuard(enriched);
    setShowGuardModal(true);

    try {
      if (!enriched.full_name && g.guard_id) {
        try {
          const u = await safeGet(`/users/${g.guard_id}/`);
          if (u?.data) enriched.full_name = `${u.data.first_name || ""} ${u.data.last_name || ""}`.trim() || u.data.username || enriched.full_name;
          enriched.profile = enriched.profile || u.data.profile || enriched.profile;
        } catch (e) {}
      }

      const shiftId = g.raw?.shift_id || g.raw?.shift?.id;
      if (!enriched.premise_name && shiftId) {
        try {
          const s = await safeGet(`/shifts/${shiftId}/`);
          if (s?.data) enriched.premise_name = s.data.premise?.name || s.data.premise_name || enriched.premise_name;
        } catch (e) {}
      }

      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let routePoints = [];
      try {
        if (shiftId) {
          const res = await safeGet(
            `/shifts/${shiftId}/patrols/?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(now.toISOString())}&limit=5000`
          );
          const pts = (res.data || []).map((p) => [Number(p.lat), Number(p.lng)]).filter((x) => !Number.isNaN(x[0]) && !Number.isNaN(x[1]));
          routePoints = pts;
        } else {
          const res = await safeGet(
            `/patrols/?guard_id=${g.guard_id}&from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(now.toISOString())}&limit=5000`
          );
          const pts = (res.data || []).map((p) => [Number(p.lat), Number(p.lng)]).filter((x) => !Number.isNaN(x[0]) && !Number.isNaN(x[1]));
          routePoints = pts;
        }
      } catch (e) {}

      enriched.route = routePoints;
    } catch (err) {
      console.warn("failed to enrich guard", err);
    } finally {
      enriched.loading = false;
      setSelectedGuard({ ...enriched });
    }

    try {
      if (mapHelpers?.panTo) mapHelpers.panTo([g.lat, g.lng]);
      else if (mapHelpers?.map && typeof mapHelpers.map.panTo === "function") mapHelpers.map.panTo([g.lat, g.lng]);
    } catch (e) {}
  }

  // 30-day trend points
  const trend30Points = (analytics?.attendance_last_30_days || []).map((d) => d.on_time || 0);
  const monthlyCompliance = analytics?.monthly_compliance || [];
  const trend7 = (analytics?.attendance_last_7_days || []).map((d) => d.on_time ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">Dashboard</h1>
            <div className="text-sm text-slate-500 mt-1">Real-time monitoring · patrol coverage · shift compliance</div>
            <div className="mt-3 flex items-center gap-2">
              <div className="text-xs inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-cyan-50 text-emerald-700 font-semibold shadow-sm">Live • <span className="animate-pulse ml-1">●</span></div>
              <div className="text-xs text-slate-400">Auto refresh every 15s</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-3 py-2 rounded-full bg-white/80 shadow hover:scale-[1.02] transition text-sm flex items-center gap-2">
              <SmallIcon name="map" />
              Switch to Guard View
            </button>
            <button
              onClick={() => {
                const rows = guards.map((g) => ({ id: g.id, username: g.username, lat: g.lat, lng: g.lng, updated_at: g.updated_at }));
                const keys = ["id", "username", "lat", "lng", "updated_at"];
                const csvText = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
                const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "guards.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-2 rounded-full bg-gradient-to-r from-emerald-600 to-cyan-500 text-white shadow-lg text-sm flex items-center gap-2 transform hover:-translate-y-0.5 transition"
            >
              <SmallIcon name="export" />
              Export Guards CSV
            </button>
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KPI label="Active Guards" value={summary?.guards_on_duty ?? "—"} delta={summary?.guards_delta ?? 0} color="emerald" />
          <KPI label="Active Sites" value={summary?.active_shifts ?? "—"} delta={summary?.shifts_delta ?? 0} color="slate" />
          <KPI label="On-time Check-ins" value={`${summary?.on_time_pct ?? "—"}%`} delta={summary?.on_time_delta ?? 0} color="blue" />
          <div className="rounded-2xl p-4 shadow-xl border bg-white/60 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">Compliance (30 days)</div>
                <div className="text-lg font-semibold text-slate-900 mt-1">{trend30Points.length ? `${Math.round(trend30Points.reduce((a, b) => a + b, 0) / Math.max(trend30Points.length, 1))}` : "—"}</div>
                <div className="text-xs text-slate-400">avg daily on-time</div>
              </div>
              <div style={{ width: 200, height: 48 }} className="flex items-center">
                <svg viewBox="0 0 200 48" width="200" height="48" className="overflow-visible">
                  {trend30Points && trend30Points.length > 0 ? (() => {
                    const width = 200, height = 48;
                    const max = Math.max(...trend30Points), min = Math.min(...trend30Points), range = max - min || 1;
                    const stepX = width / Math.max(trend30Points.length - 1, 1);
                    const d = trend30Points.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${(height - ((v - min) / range) * height).toFixed(2)}`).join(" ");
                    return (
                      <>
                        <path d={d} stroke="#06b6d4" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={d} stroke="#06b6d4" strokeWidth="6" opacity="0.08" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    );
                  })() : <text x="10" y="25" className="text-xs">no data</text>}
                </svg>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-3xl p-4 shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-300 text-white shadow">📡</div>
                Live Patrol Coverage
              </h3>
              <div className="text-sm text-slate-500">updated every 15s</div>
            </div>

            <div className="h-[420px] rounded-2xl border overflow-hidden shadow-inner">
              <PatrolMap shiftId={null} onMarkerClick={(g, helpers) => handleMapGuardClick(g, helpers)} markers={guards} heatPoints={allPatrolPoints} />
            </div>

            <div className="mt-4">
              <h4 className="font-semibold mb-2">Recent assignment events</h4>
              <div className="space-y-2">
                {recentAssignments.length === 0 && <div className="text-sm text-slate-400">No recent assignment events</div>}
                {recentAssignments.slice(0, 6).map((ra, idx) => (
                  <div key={idx} className="p-3 rounded-2xl border bg-white flex items-center justify-between shadow-sm">
                    <div>
                      <div className="text-sm"><strong>{ra.guard_username}</strong> assigned to <span className="font-medium">shift {ra.shift_id}</span></div>
                      <div className="text-xs text-slate-400">{new Date(ra.assigned_at).toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-slate-500">Event</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="bg-white rounded-3xl p-4 shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Guards on Duty</h3>
              <div className="text-xs text-slate-400">live locations</div>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-auto pr-2">
              {guards.length === 0 && <div className="text-sm text-slate-400">No live guard locations</div>}
              {guards.map((g) => (
                <GuardTile
                  key={g.id}
                  g={g}
                  onClick={(x) => { bringGuardToTop(x); setSelectedGuard(x); setShowGuardModal(true); }}
                  selected={selectedGuard?.id === g.id}
                />
              ))}
            </div>

            <div className="mt-4">
              <h4 className="font-semibold">Active shifts</h4>
              <div className="text-sm text-slate-500 mt-2">{shifts.length === 0 ? "No active shifts" : `${shifts.length} active`}</div>
              <div className="mt-3 space-y-2 max-h-[200px] overflow-auto">
                {shifts.map((s) => {
                  const hl = highlightedShifts && highlightedShifts[s.id];
                  const assigned = s.assigned_guard;
                  return (
                    <div key={s.id} className={`p-2 border rounded-lg flex items-center justify-between ${hl ? "bg-yellow-50 border-yellow-200 shadow-sm" : "bg-white/70"}`}>
                      <div>
                        <div className="text-sm font-medium">Shift {s.id} — {s.premise_name}</div>
                        <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
                        {assigned ? (
                          <div className="text-xs mt-1 text-slate-700">Assigned to <strong>{assigned.username}</strong>{hl ? <span className="ml-2 inline-block text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">NEW</span> : null}</div>
                        ) : <div className="text-xs mt-1 text-amber-600">Unassigned</div>}
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        {hl ? `Detected ${new Date(hl.assignedAt).toLocaleTimeString()}` : (assigned ? "Assigned" : "—")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-6">
          <div className="bg-white rounded-3xl p-4 shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Compliance (last 12 months)</h3>
              <div className="text-xs text-slate-400">For audit / export</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="space-y-2">
                  {monthlyCompliance.length === 0 && <div className="text-sm text-slate-400 p-4 rounded">No monthly compliance data</div>}
                  {monthlyCompliance.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg border flex items-center justify-between">
                      <div>
                        <div className="font-medium">{m.month_label}</div>
                        <div className="text-xs text-slate-500">{m.on_time}/{m.total} on-time • {m.shifts_count} shifts</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{m.on_time_pct !== null ? `${m.on_time_pct}%` : "—"}</div>
                        <div className="text-xs text-slate-400">absent: {m.absent}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <button onClick={() => {
                    // export CSV
                    const rows = monthlyCompliance || [];
                    if (!rows.length) return;
                    const keys = ["month_label","year","month","on_time","late","total","shifts_count","absent","on_time_pct"];
                    const csv = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "monthly_compliance.csv"; a.click(); URL.revokeObjectURL(url);
                  }} className="px-3 py-2 rounded bg-emerald-600 text-white">Export CSV</button>

                  <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(monthlyCompliance, null, 2)); }} className="px-3 py-2 rounded bg-slate-100">Copy JSON</button>
                </div>
              </div>

              <div>
                <div className="text-sm text-slate-500 mb-2">30-day on-time trend</div>
                <div className="p-3 border rounded-lg bg-white">
                  <svg viewBox="0 0 300 120" width="100%" height="120">
                    {trend30Points && trend30Points.length > 0 ? (() => {
                      const width = 300, height = 120;
                      const max = Math.max(...trend30Points), min = Math.min(...trend30Points), range = max - min || 1;
                      const stepX = width / Math.max(trend30Points.length - 1, 1);
                      const d = trend30Points.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${(height - ((v - min) / range) * height).toFixed(2)}`).join(" ");
                      return <path d={d} stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
                    })() : <text x="12" y="24" className="text-xs">no data</text>}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Modal open={showGuardModal && !!selectedGuard} onClose={() => setShowGuardModal(false)} title={selectedGuard ? `${selectedGuard.full_name || selectedGuard.username}` : ""}>
        {selectedGuard ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-72 border rounded-2xl overflow-hidden shadow-inner">
                <PatrolMap
                  shiftId={selectedGuard.raw?.shift_id || null}
                  markers={[{ ...selectedGuard, selected: true }]}
                  heatPoints={selectedGuard.route ? selectedGuard.route.map((p) => [p[0], p[1], 0.6]) : []}
                  centerOverride={[selectedGuard.lat, selectedGuard.lng]}
                />
              </div>

              <div className="flex flex-col">
                <h4 className="font-semibold">Checkpoint summary</h4>
                <div className="mt-2 text-sm text-slate-600">Latest location and details</div>

                <div className="mt-4 p-4 bg-gradient-to-br from-white/60 to-slate-50 rounded-2xl border shadow-sm">
                  <div className="text-sm">Name: <strong className="text-slate-800">{selectedGuard.full_name || selectedGuard.username}</strong></div>
                  <div className="text-sm mt-1">Site: <strong className="text-slate-800">{selectedGuard.premise_name || selectedGuard.raw?.premise?.name || "—"}</strong></div>
                  <div className="text-sm mt-1">Last seen: <strong className="text-slate-800">{selectedGuard.updated_at}</strong></div>
                  <div className="text-sm mt-1">Lat / Lng: <strong className="text-slate-800">{selectedGuard.lat?.toFixed?.(5) ?? "—"}, {selectedGuard.lng?.toFixed?.(5) ?? "—"}</strong></div>
                  <div className="text-sm mt-1">Profile: <strong className="text-slate-800">{selectedGuard.profile?.skills || "—"}</strong></div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button onClick={() => {
                    const rows = (selectedGuard.route || []).map((r, i) => ({ idx: i + 1, lat: r[0], lng: r[1] }));
                    const keys = ["idx", "lat", "lng"];
                    const csvText = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
                    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${selectedGuard.username || "guard"}-route.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }} className="px-3 py-2 bg-gradient-to-r from-sky-600 to-indigo-500 text-white rounded-2xl shadow">Export route CSV</button>

                  <button onClick={() => {
                    const text = `${selectedGuard.lat}, ${selectedGuard.lng} (${selectedGuard.premise_name || "location"})`;
                    navigator.clipboard?.writeText(text);
                  }} className="px-3 py-2 bg-white rounded-2xl shadow-inner ring-1">Copy coords</button>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold">Checkpoint list (last 24h)</h4>
              <div className="mt-2 max-h-48 overflow-auto border rounded-2xl bg-white p-2 shadow-inner">
                {selectedGuard.route && selectedGuard.route.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="p-2">#</th>
                        <th className="p-2">Latitude</th>
                        <th className="p-2">Longitude</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGuard.route.slice(0, 200).map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2">{Number(r[0]).toFixed(5)}</td>
                          <td className="p-2">{Number(r[1]).toFixed(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-slate-400 p-2">No checkpoint history available for the last 24 hours.</div>
                )}
              </div>
            </div>
          </div>
        ) : <div>Loading...</div>}
      </Modal>
    </div>
  );
}