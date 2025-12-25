// src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef, useContext } from "react";
import AuthContext from "../AuthContext";
import api, { safeGet } from "../api";

/*
  Map & heatmap require packages:
    npm i react-leaflet leaflet leaflet.heat
  And add CSS once: @import "leaflet/dist/leaflet.css";
*/

let LeafletMapComponents = null; // will hold { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, L, ... }

const HIGHLIGHT_MS = 2 * 60 * 1000; // highlight newly assigned shifts for 2 minutes

const KPI = ({ label, value, delta, color = "emerald" }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <div className="text-sm text-slate-500">{label}</div>
    <div className="mt-2 flex items-baseline gap-3">
      <div className="text-2xl font-bold">{value}</div>
      {delta !== undefined && (
        <div className={`text-xs inline-block px-2 py-1 rounded bg-${color}-50 text-${color}-600`}>
          {delta >= 0 ? `+${delta}%` : `${delta}%`}
        </div>
      )}
    </div>
  </div>
);

const Sparkline = ({ points = [], width = 160, height = 40 }) => {
  if (!points || points.length === 0) return <div className="text-xs text-slate-400">no data</div>;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = width / Math.max(points.length - 1, 1);
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Donut = ({ parts = [], size = 110 }) => {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let angle = 0;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {parts.map((p, idx) => {
        const start = (angle / 360) * Math.PI * 2;
        const slice = (p.value / total) * 360;
        const end = ((angle + slice) / 360) * Math.PI * 2;
        const large = slice > 180 ? 1 : 0;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        angle += slice;
        return <path key={idx} d={d} fill={p.color} stroke="white" strokeWidth="1" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.6} fill="white" />
    </svg>
  );
};

const GuardTile = ({ g, onClick }) => (
  <div className="p-3 border rounded-md flex items-start gap-3 hover:shadow cursor-pointer" onClick={() => onClick && onClick(g)}>
    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-semibold">
      {g.username?.[0]?.toUpperCase() ?? "G"}
    </div>
    <div className="flex-1">
      <div className="font-semibold">{g.username}</div>
      <div className="text-xs text-slate-500">{g.status ?? "On Patrol"}</div>
      <div className="text-xs text-slate-400 mt-2">
        Skills: <span className="text-slate-700">{(g.profile?.skills || "").split(",").slice(0, 3).join(", ")}</span>
      </div>
    </div>
    <div className="text-xs text-slate-400">{g.updated_at ?? "just now"}</div>
  </div>
);

/* Simple modal used for guard inspection */
function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-[95%] md:w-3/4 max-h-[90vh] overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-sm text-slate-500">Close</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/* HeatLayerInner for leaflet.heat usage */
function HeatLayerInner({ points = [], options = {}, useMapHook }) {
  const map = useMapHook ? (typeof useMapHook === "function" ? useMapHook() : null) : null;
  useEffect(() => {
    if (!map || !LeafletMapComponents || !LeafletMapComponents.L || typeof LeafletMapComponents.L.heatLayer !== "function") return;
    const heatPts = (points || []).map((p) => (p && p.length === 3 ? p : [p[0], p[1], 0.5]));
    let heat;
    try {
      heat = LeafletMapComponents.L.heatLayer(heatPts, options).addTo(map);
    } catch (e) {
      console.warn("failed to add heat layer", e);
    }
    return () => {
      try { if (heat) map.removeLayer(heat); } catch (e) {}
    };
  }, [map, JSON.stringify(points), JSON.stringify(options)]);
  return null;
}

export default function DashboardPage() {
  const { logout } = useContext(AuthContext);

  // data state
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [guards, setGuards] = useState([]);
  const [recent, setRecent] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [allPatrolPoints, setAllPatrolPoints] = useState([]);

  // UI + map state
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [selectedGuard, setSelectedGuard] = useState(null);

  // assignment-tracking state
  // prevAssignedRef stores map shiftId -> assigned_guard_id (or null) from last poll
  const prevAssignedRef = useRef({});
  // highlightedShifts: map shiftId -> { assignedAt: Date } for UI highlight; state so re-renders occur
  const [highlightedShifts, setHighlightedShifts] = useState({});
  // recentAssignments: newest assignment events, show in activity area
  const [recentAssignments, setRecentAssignments] = useState([]);

  // lazy load leaflet + heat
  async function loadLeaflet() {
    try {
      const [rl, L, _heat] = await Promise.all([import("react-leaflet"), import("leaflet"), import("leaflet.heat")]);
      try {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
          iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
          shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
        });
      } catch (e) { /* ignore */ }
      LeafletMapComponents = {
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        Marker: rl.Marker,
        Popup: rl.Popup,
        Polyline: rl.Polyline,
        useMap: rl.useMap,
        L,
      };
      setMapReady(true);
    } catch (err) {
      console.warn("leaflet load failed:", err);
      setMapError("Map libraries not installed. Run: npm i react-leaflet leaflet leaflet.heat");
      setMapReady(false);
    }
  }

  // central loader (KPIs, analytics, patrols, shifts, attendance recent)
  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        safeGet("/dashboard/summary/"),
        safeGet("/dashboard/analytics/"),
        safeGet("/patrols/latest/?limit=1000"),
        safeGet("/shifts/?status=active"),
        safeGet("/attendance/?date=today"),
      ]);

      // summary
      if (results[0].status === "fulfilled") setSummary(results[0].value.data);
      else if (results[0].status === "rejected" && results[0].reason?.response?.status === 401) logout();

      // analytics
      if (results[1].status === "fulfilled") setAnalytics(results[1].value.data);

      // patrols -> guards + heat points
      if (results[2].status === "fulfilled") {
        const pts = results[2].value.data || [];
        const mapped = pts.map((pt) => {
          const lat = Number(pt.lat ?? 0);
          const lng = Number(pt.lng ?? 0);
          return {
            id: pt.id,
            guard_id: pt.guard_id,
            username: pt.guard?.username ?? `guard${pt.guard_id}`,
            lat,
            lng,
            timestamp: pt.timestamp,
            updated_at: new Date(pt.timestamp).toLocaleTimeString(),
            profile: pt.guard?.profile || {},
            raw: pt,
          };
        }).filter(p => !Number.isNaN(p.lat) && !Number.isNaN(p.lng));
        setGuards(mapped);
        setAllPatrolPoints(mapped.map(p => [p.lat, p.lng, 0.6]));
      } else {
        if (results[2].status === "rejected" && results[2].reason?.response?.status === 401) logout();
        setGuards([]);
        setAllPatrolPoints([]);
      }

      // shifts: IMPORTANT - normalize to ensure assigned_guard is safe for rendering
      if (results[3].status === "fulfilled") {
        const rawShifts = results[3].value.data || [];
        const normalized = rawShifts.map(s => ({
          id: s.id,
          premise_name: s.premise?.name || (s.premise_name || ""),
          date: typeof s.date === "string" ? s.date : (s.date?.date || String(s.date || "")),
          start_time: s.start_time ? String(s.start_time) : "",
          end_time: s.end_time ? String(s.end_time) : "",
          assigned_guard: s.assigned_guard ? { id: s.assigned_guard.id, username: s.assigned_guard.username } : null,
        }));
        // detect newly-assigned shifts by comparing with prevAssignedRef
        detectAssignmentsAndHighlight(normalized);
        setShifts(normalized);
      } else {
        setShifts([]);
      }

      // attendance recent -> recent activities list
      if (results[4].status === "fulfilled") {
        const rows = results[4].value.data || [];
        setRecent(rows.slice(0, 8).map((r) => ({
          id: r.id,
          text: r.guard ? `${r.guard.username} checked in` : `${r.shift?.premise?.name ?? "unknown"}`,
          time: new Date(r.check_in_time).toLocaleTimeString(),
        })));
      }

    } catch (err) {
      console.warn("dashboard load failed", err);
    } finally {
      setLoading(false);
    }
  }

  // detect newly assigned shifts and create local highlight + recent assignment event
  function detectAssignmentsAndHighlight(newShifts) {
    const prevMap = prevAssignedRef.current || {};
    const now = new Date();
    const newHighlights = { ...highlightedShifts }; // copy
    const newRecent = [...recentAssignments];

    newShifts.forEach(s => {
      const prevAssignedId = prevMap[s.id] ?? null;
      const newAssignedId = s.assigned_guard ? s.assigned_guard.id : null;

      // case: previously unassigned or different guard -> now assigned (and previously null or different)
      const becameAssigned = (prevAssignedId == null || prevAssignedId === undefined) && newAssignedId != null;
      const changedAssignment = prevAssignedId != null && newAssignedId != null && prevAssignedId !== newAssignedId;

      if (becameAssigned || changedAssignment) {
        // create an assignment event
        const assignedAt = now.toISOString();
        // add highlight entry
        newHighlights[s.id] = { assignedAt, guard: s.assigned_guard };
        // add to recentAssignments (most recent first)
        newRecent.unshift({
          shift_id: s.id,
          guard_username: s.assigned_guard ? s.assigned_guard.username : "unknown",
          assigned_at: assignedAt,
        });

        // schedule removal of highlight after HIGHLIGHT_MS
        setTimeout(() => {
          setHighlightedShifts(curr => {
            const copy = { ...(curr || {}) };
            delete copy[s.id];
            return copy;
          });
        }, HIGHLIGHT_MS);
      }
    });

    // cap recent assignments to, say, 20
    if (newRecent.length > 20) newRecent.length = 20;

    // update refs/state
    setHighlightedShifts(newHighlights);
    setRecentAssignments(newRecent);

    // update prevAssignedRef to current snapshot
    const snapshot = {};
    newShifts.forEach(s => { snapshot[s.id] = s.assigned_guard ? s.assigned_guard.id : null; });
    prevAssignedRef.current = snapshot;
  }

  useEffect(() => {
    loadAll();
    loadLeaflet();
    const t = setInterval(loadAll, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when user inspects a guard, show last 24h route + checkpoint info (best-effort)
  async function openGuardModal(g) {
    setSelectedGuard({ ...g, loading: true, route: null, checkpoints: null });
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const shiftId = g.raw?.shift_id || g.raw?.shift?.id;
      let routePoints = [];

      if (shiftId) {
        try {
          const res = await safeGet(`/shifts/${shiftId}/patrols/?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(now.toISOString())}&limit=5000`);
          const pts = (res.data || []).map(p => [Number(p.lat), Number(p.lng), 0.6]).filter(x => !Number.isNaN(x[0]) && !Number.isNaN(x[1]));
          routePoints = pts;
        } catch (e) {
          // best-effort fallback
        }
      } else {
        try {
          const res = await safeGet(`/patrols/?guard_id=${g.guard_id}&from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(now.toISOString())}&limit=5000`);
          const pts = (res.data || []).map(p => [Number(p.lat), Number(p.lng), 0.6]).filter(x => !Number.isNaN(x[0]) && !Number.isNaN(x[1]));
          routePoints = pts;
        } catch (e) {}
      }

      setSelectedGuard(curr => ({ ...curr, route: routePoints, loading: false }));
    } catch (err) {
      setSelectedGuard(curr => ({ ...curr, loading: false }));
    }
  }

  function exportCSV(rows, filename = "export.csv") {
    if (!rows || rows.length === 0) {
      const blob = new Blob([""], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => {
      let v = r[k] == null ? "" : String(r[k]).replace(/"/g, '""');
      if (v.includes(",") || v.includes('"') || v.includes("\n")) v = `"${v}"`;
      return v;
    }).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Prepare visuals content
  const trend = (analytics?.attendance_last_7_days || []).map((d) => d.on_time ?? 0);
  const statusParts = analytics?.workload && analytics.workload.length ? [
    { value: 0.6 * analytics.workload.length || 20, color: "#06b6d4", label: "On Patrol" },
    { value: 0.2 * analytics.workload.length || 8, color: "#f59e0b", label: "On Break" },
    { value: 0.2 * analytics.workload.length || 12, color: "#ef4444", label: "Off Duty" },
  ] : [
    { value: 28, color: "#06b6d4", label: "On Patrol" },
    { value: 8, color: "#f59e0b", label: "On Break" },
    { value: 12, color: "#ef4444", label: "Off Duty" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold">Dashboard</h1>
            <div className="text-sm text-slate-500 mt-1">Real-time monitoring · patrol coverage · shift compliance</div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-3 py-2 bg-slate-100 rounded text-sm">Switch to Guard View</button>
            <button
              onClick={() => exportCSV(guards.map(g => ({ id: g.id, username: g.username, lat: g.lat, lng: g.lng, updated_at: g.updated_at })), "guards.csv")}
              className="px-3 py-2 bg-blue-600 text-white rounded text-sm"
            >
              Export Guards CSV
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPI label="Active Guards" value={summary?.guards_on_duty ?? "—"} delta={summary?.guards_delta ?? 0} />
          <KPI label="Active Sites" value={summary?.active_shifts ?? "—"} delta={summary?.shifts_delta ?? 0} />
          <KPI label="On-time Check-ins" value={`${summary?.on_time_pct ?? "—"}%`} delta={summary?.on_time_delta ?? 0} />
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-slate-500">Compliance (7 days)</div>
            <div className="mt-3 flex items-center justify-between">
              <div><Sparkline points={trend} width={220} height={48} /></div>
              <div className="text-right">
                <div className="text-lg font-semibold">{trend.length ? Math.round(trend.reduce((a, b) => a + b, 0) / Math.max(trend.length, 1)) : "—"}</div>
                <div className="text-xs text-slate-400">avg on-time</div>
              </div>
            </div>
          </div>
        </section>

        {/* Main content */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-4 rounded shadow min-h-[520px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Live Patrol Coverage</h3>
              <div className="text-sm text-slate-400">updated every 15s</div>
            </div>

            {/* Map or fallback */}
            <div className="h-[420px] rounded border overflow-hidden">
              {mapReady && LeafletMapComponents ? (
                <LeafletMapComponents.MapContainer center={guards.length ? [guards[0].lat, guards[0].lng] : [-19.0, 29.9]} zoom={13} style={{ height: "100%", width: "100%" }}>
                  <LeafletMapComponents.TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {LeafletMapComponents.L && typeof LeafletMapComponents.L.heatLayer === "function" && (
                    <HeatLayerInner points={allPatrolPoints} options={{ radius: 25, blur: 15, maxZoom: 17 }} useMapHook={LeafletMapComponents.useMap} />
                  )}

                  {guards.map((g) => (
                    <LeafletMapComponents.Marker key={g.id} position={[g.lat, g.lng]}>
                      <LeafletMapComponents.Popup>
                        <div className="text-sm">
                          <div className="font-semibold">{g.username}</div>
                          <div className="text-xs text-slate-500">{g.profile?.skills || "—"}</div>
                          <div className="text-xs text-slate-400 mt-1">Updated: {g.updated_at}</div>
                          <div className="mt-2">
                            <button onClick={() => openGuardModal(g)} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded">Inspect last 24h</button>
                          </div>
                        </div>
                      </LeafletMapComponents.Popup>
                    </LeafletMapComponents.Marker>
                  ))}

                  {selectedGuard?.route && selectedGuard.route.length > 1 && (
                    <LeafletMapComponents.Polyline positions={selectedGuard.route.map(p => [p[0], p[1]])} color="#06b6d4" weight={4} />
                  )}
                </LeafletMapComponents.MapContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-slate-500 p-4">
                  <div>
                    <div className="mb-2 text-sm">{mapError ?? "Map not available"}</div>
                    <div className="text-xs text-slate-400">Install: npm i react-leaflet leaflet leaflet.heat to enable map + heatmap</div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4">
              <h4 className="font-semibold mb-2">Recent activities</h4>
              <div className="space-y-2">
                {/* include recent assignment events on top */}
                {recentAssignments.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-slate-500 mb-1">Assignments (recent)</div>
                    <div className="space-y-1">
                      {recentAssignments.slice(0, 6).map((ra, idx) => (
                        <div key={idx} className="text-sm p-2 border rounded bg-slate-50">
                          <div><strong>{ra.guard_username}</strong> assigned to shift {ra.shift_id}</div>
                          <div className="text-xs text-slate-400">Detected at {new Date(ra.assigned_at).toLocaleTimeString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recent.length === 0 && <div className="text-sm text-slate-400">No recent activity</div>}
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2 border rounded">
                    <div className="text-sm">{r.text}</div>
                    <div className="text-xs text-slate-400">{r.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Status distribution</h3>
              <div className="text-xs text-slate-400">overview</div>
            </div>

            <div className="flex items-center gap-4">
              <Donut parts={statusParts} />
              <div>
                {statusParts.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm mb-2">
                    <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} />
                    <div>{p.label} <span className="text-slate-400">({Math.round(p.value)})</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h4 className="font-semibold mb-2">Guards on Duty</h4>
              <div className="space-y-2 max-h-[260px] overflow-auto">
                {guards.length === 0 && <div className="text-sm text-slate-400">No live guard locations</div>}
                {guards.map((g) => <GuardTile key={g.id} g={g} onClick={(x) => openGuardModal(x)} />)}
              </div>
            </div>

            <div className="mt-4">
              <h4 className="font-semibold">Active shifts</h4>
              <div className="text-sm text-slate-500 mt-2">
                {shifts.length === 0 ? "No active shifts" : `${shifts.length} active`}
              </div>

              {/* list shifts with highlight if newly assigned */}
              <div className="mt-3 space-y-2 max-h-[240px] overflow-auto">
                {shifts.length === 0 && <div className="text-sm text-slate-400">No active shifts</div>}
                {shifts.map(s => {
                  const hl = highlightedShifts && highlightedShifts[s.id];
                  const assigned = s.assigned_guard;
                  return (
                    <div key={s.id} className={`p-2 border rounded flex items-center justify-between ${hl ? "bg-yellow-50 border-yellow-200" : ""}`}>
                      <div>
                        <div className="text-sm font-medium">Shift {s.id} — {s.premise_name}</div>
                        <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
                        {assigned ? (
                          <div className="text-xs mt-1">
                            Assigned to <strong>{assigned.username}</strong>
                            {hl ? <span className="ml-2 inline-block text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">NEW</span> : null}
                          </div>
                        ) : (
                          <div className="text-xs mt-1 text-amber-600">Unassigned</div>
                        )}
                      </div>

                      <div className="text-right text-xs">
                        {hl ? (
                          <div>
                            <div className="text-emerald-700">Detected {new Date(hl.assignedAt).toLocaleTimeString()}</div>
                          </div>
                        ) : assigned ? (
                          <div className="text-slate-500">Assigned</div>
                        ) : (
                          <div className="text-slate-400">—</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </section>
      </main>

      {/* guard modal */}
      <Modal open={!!selectedGuard} onClose={() => setSelectedGuard(null)} title={selectedGuard ? `Guard: ${selectedGuard.username}` : ""}>
        {!selectedGuard && <div>Loading...</div>}
        {selectedGuard && selectedGuard.loading && <div className="text-sm text-slate-500">Loading guard data…</div>}
        {selectedGuard && !selectedGuard.loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-72 border rounded overflow-hidden">
                {mapReady && LeafletMapComponents ? (
                  <LeafletMapComponents.MapContainer center={selectedGuard.route && selectedGuard.route.length ? [selectedGuard.route[0][0], selectedGuard.route[0][1]] : [selectedGuard.lat ?? -19.0, selectedGuard.lng ?? 29.9]} zoom={14} style={{ height: "100%", width: "100%" }}>
                    <LeafletMapComponents.TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {selectedGuard.route && selectedGuard.route.length > 0 && (
                      <>
                        <LeafletMapComponents.Polyline positions={selectedGuard.route.map(p => [p[0], p[1]])} color="#06b6d4" weight={4} />
                        <LeafletMapComponents.Marker position={[selectedGuard.route[0][0], selectedGuard.route[0][1]]}>
                          <LeafletMapComponents.Popup>Start</LeafletMapComponents.Popup>
                        </LeafletMapComponents.Marker>
                        <LeafletMapComponents.Marker position={[selectedGuard.route[selectedGuard.route.length - 1][0], selectedGuard.route[selectedGuard.route.length - 1][1]]}>
                          <LeafletMapComponents.Popup>Latest</LeafletMapComponents.Popup>
                        </LeafletMapComponents.Marker>
                      </>
                    )}
                  </LeafletMapComponents.MapContainer>
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-slate-500 p-4">Map not available</div>
                )}
              </div>

              <div>
                <h4 className="font-semibold">Checkpoint completion</h4>
                <div className="mt-2 text-sm text-slate-600">Checkpoint details appear here if available.</div>
                <div className="mt-4">
                  <button onClick={() => {
                    const rows = (selectedGuard.route || []).map((r, i) => ({ idx: i+1, lat: r[0], lng: r[1] }));
                    exportCSV(rows, `${selectedGuard.username || 'guard'}-route.csv`);
                  }} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Export route CSV</button>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold">Quick info</h4>
              <div className="mt-2 text-sm">
                <div>Last seen: <strong>{selectedGuard.updated_at}</strong></div>
                <div>Lat / Lng: <strong>{selectedGuard.lat?.toFixed?.(4) ?? "—"}, {selectedGuard.lng?.toFixed?.(4) ?? "—"}</strong></div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
