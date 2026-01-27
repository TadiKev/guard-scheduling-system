// src/pages/Patrol.jsx
import React, { useEffect, useState, useContext } from "react";
import { safeGet } from "../api";
import AuthContext from "../AuthContext";

/*
  Patrol page — styling-only upgrade:
  - prettier list items, badges, gradients, micro-animations
  - map area has nicer placeholder & instructions if leaflet isn't installed
  - logic (data fetching, lazy leaflet import, error handling) unchanged
*/

/* ---------- Decorative helpers (presentation only) ---------- */
function SmallIcon({ name, className = "h-5 w-5" }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "refresh":
      return (
        <svg {...common} aria-hidden>
          <path d="M20 12a8 8 0 1 0-2.1 5.1L20 21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "map":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 6l7-3 7 3 7-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M3 21l7-3 7 3 7-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2c2.8 0 5 2.2 5 5 0 4.9-5 9-5 9s-5-4.1-5-9c0-2.8 2.2-5 5-5z" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <circle cx="12" cy="7" r="1.5" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

/* Fancy pill used for small labels */
function Pill({ children, tone = "slate" }) {
  const toneMap = {
    slate: "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return <span className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs font-medium ${toneMap[tone] || toneMap.slate}`}>{children}</span>;
}

/* ---------- Patrol item (styling only) ---------- */
function PatrolItem({ p }) {
  const guardInitial = p.guard?.username?.[0] ?? "G";
  const place = p.premise?.name ?? p.shift?.premise?.name ?? "—";
  const time = p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : "—";
  const lat = typeof p.lat === "number" ? p.lat.toFixed(4) : p.lat ?? "—";
  const lng = typeof p.lng === "number" ? p.lng.toFixed(4) : p.lng ?? "—";

  return (
    <div className="p-3 border rounded-2xl flex items-start gap-3 bg-white/80 backdrop-blur-sm hover:shadow-lg transition transform hover:-translate-y-0.5">
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-200 to-cyan-100 flex items-center justify-center font-bold text-slate-800 shadow-inner">
        {guardInitial}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-slate-800 truncate">{p.guard?.username ?? `guard ${p.guard_id}`}</div>
          <div className="text-xs text-slate-400">{time}</div>
        </div>

        <div className="text-xs text-slate-500 mt-1 truncate">{place}</div>

        <div className="mt-3 flex items-center gap-2">
          <Pill tone="emerald"><SmallIcon name="pin" /> {lat}, {lng}</Pill>
          <div className="text-xs text-slate-400">Updated: <span className="text-slate-600">{time}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main page (logic preserved) ---------- */
export default function PatrolPage() {
  const { logout } = useContext(AuthContext);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [MapComponents, setMapComponents] = useState(null);

  // Try lazy-loading react-leaflet (optional). If missing, keep the placeholder UI.
  async function tryLoadLeaflet() {
    try {
      const rl = await import("react-leaflet");
      const L = await import("leaflet");
      try {
        // fix default icon urls for many bundlers
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
          iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
          shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
        });
      } catch (e) {
        // ignore
      }
      setMapComponents({
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        Marker: rl.Marker,
        Popup: rl.Popup,
      });
      setMapReady(true);
    } catch (e) {
      setMapReady(false);
    }
  }

  // load latest patrol points
  async function loadLatest() {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/patrols/latest/?limit=1000");
      const rows = res?.data || [];
      const normalized = rows
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => ({
          ...r,
          lat: Number(r.lat),
          lng: Number(r.lng),
        }));
      setPoints(normalized);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("Unauthorized — please login again.");
        logout();
        return;
      }
      console.warn("Failed to fetch latest patrols", err);
      if (status >= 500) setError("Server error fetching patrols (500). Check backend logs.");
      else if (status === 404) setError("Endpoint not found: /patrols/latest/. Check backend routing.");
      else setError(err?.message || "Network error while fetching patrol data.");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLatest();
    tryLoadLeaflet();
    const t = setInterval(loadLatest, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 text-white shadow-lg">🛰️</span>
              Patrol Tracking
            </h1>
            <div className="text-sm text-slate-500 mt-1">Real-time GPS tracking and coverage</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadLatest}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/90 shadow hover:scale-[1.02] transition ring-1 ring-slate-100"
            >
              <SmallIcon name="refresh" /> Refresh
            </button>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm p-4 rounded-3xl shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <SmallIcon name="map" />
                Map / Heatmap
              </h3>
              <div className="text-xs text-slate-400">{loading ? "Loading…" : `${points.length} points`}</div>
            </div>

            <div className="h-96 rounded-2xl border-2 border-dashed overflow-hidden relative bg-white">
              {mapReady && MapComponents && points.length > 0 ? (
                <MapComponents.MapContainer center={[points[0].lat, points[0].lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
                  <MapComponents.TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {points.map((p) => (
                    <MapComponents.Marker key={p.id} position={[p.lat, p.lng]}>
                      <MapComponents.Popup>
                        <div className="text-sm">
                          <div className="font-semibold">{p.guard?.username ?? `guard ${p.guard_id}`}</div>
                          <div className="text-xs text-slate-500">{p.premise?.name ?? p.shift?.premise?.name ?? "—"}</div>
                          <div className="text-xs text-slate-400 mt-1">{new Date(p.timestamp).toLocaleString()}</div>
                        </div>
                      </MapComponents.Popup>
                    </MapComponents.Marker>
                  ))}
                </MapComponents.MapContainer>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 gap-3">
                  <div className="text-slate-600 text-sm">
                    {error ? error : loading ? "Loading map data…" : "Map not available"}
                  </div>

                  {!mapReady && (
                    <div className="text-xs text-slate-400">
                      To enable the interactive map install: <code className="bg-slate-50 px-1 rounded">npm i react-leaflet leaflet</code> and import <code>leaflet/dist/leaflet.css</code>.
                      <div className="mt-2 text-xs">Or keep using the lightweight list view below — no extra deps required.</div>
                    </div>
                  )}

                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white shadow ring-1 ring-slate-100">
                    <div className="text-xs text-slate-600">Showing {points.length} live point(s)</div>
                  </div>

                  {/* subtle animated decorative glow */}
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[900px] h-36 rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-indigo-300 opacity-10 blur-3xl pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          <aside className="bg-white/80 backdrop-blur-sm p-4 rounded-3xl shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Live guards</h3>
              <div className="text-xs text-slate-400">Real-time list</div>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-auto pr-2">
              {loading && <div className="text-sm text-slate-400">Loading…</div>}
              {!loading && points.length === 0 && <div className="text-sm text-slate-400">No patrol data</div>}
              {points.map((p) => (
                <PatrolItem key={p.id} p={p} />
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-6">
          <div className="bg-white/80 p-4 rounded-2xl shadow-inner text-sm text-slate-600 border">
            Recent checkpoint activity will appear here in real-time.
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- Tailwind notes ----------
- This file uses Tailwind utility classes (rounded-2xl/3xl, gradients, backdrop-blur, small animations).
- If you want small floating/spin animations used elsewhere, add to tailwind.config.js:
  animation: { 'spin-slow': 'spin 6s linear infinite', 'float': 'float 6s ease-in-out infinite' },
  keyframes: { float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } } }
- Everything else (API calls, lazy leaflet import, error handling, auto-refresh) is preserved exactly.
-------------------------------------- */
