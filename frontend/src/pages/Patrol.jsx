// src/pages/Patrol.jsx
import React, { useEffect, useState, useContext } from "react";
import { safeGet } from "../api";
import AuthContext from "../AuthContext";

/*
  Patrol page:
  - GET /patrols/latest/ (no undefined params)
  - Gracefully handles 401/500/404 and shows messages
  - Shows list of live guard points and simple map placeholder
  - If react-leaflet is installed, will attempt to render map (lazy import)
*/

function PatrolItem({ p }) {
  return (
    <div className="p-3 border rounded flex items-start gap-3">
      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center font-semibold">
        {p.guard?.username?.[0] ?? "G"}
      </div>
      <div className="flex-1">
        <div className="font-medium">{p.guard?.username ?? `guard ${p.guard_id}`}</div>
        <div className="text-xs text-slate-500">
          {p.premise?.name ?? p.shift?.premise?.name ?? "—"}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Updated: {p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : "—"}
        </div>
      </div>
      <div className="text-xs text-slate-500">
        {typeof p.lat === "number" ? p.lat.toFixed(4) : p.lat},{ " " }
        {typeof p.lng === "number" ? p.lng.toFixed(4) : p.lng}
      </div>
    </div>
  );
}

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
      // fix default icon URLs for many bundlers
      try {
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
        Popup: rl.Popup
      });
      setMapReady(true);
    } catch (e) {
      // leaflet missing — not fatal; we show placeholder and instructions
      setMapReady(false);
    }
  }

  // load latest patrol points
  async function loadLatest() {
    setLoading(true);
    setError(null);
    try {
      // request latest points (no undefined query param)
      const res = await safeGet("/patrols/latest/?limit=1000");
      const rows = res?.data || [];
      // normalize fields: ensure lat,lng are numbers
      const normalized = rows
        .filter(r => (r.lat != null && r.lng != null)) // drop invalid coords
        .map(r => ({
          ...r,
          lat: Number(r.lat),
          lng: Number(r.lng),
        }));
      setPoints(normalized);
    } catch (err) {
      // if unauthorized, force logout
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("Unauthorized — please login again.");
        logout();
        return;
      }
      console.warn("Failed to fetch latest patrols", err);
      // show friendly message
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
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Patrol Tracking</h1>
            <div className="text-sm text-slate-500">Real-time GPS tracking and coverage</div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadLatest} className="px-3 py-2 bg-slate-100 rounded">Refresh</button>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-3">Map / Heatmap</h3>

            <div className="h-96 rounded border-2 border-dashed overflow-hidden">
              {mapReady && MapComponents && points.length > 0 ? (
                <MapComponents.MapContainer
                  center={[points[0].lat, points[0].lng]}
                  zoom={13}
                  style={{ height: "100%", width: "100%" }}
                >
                  <MapComponents.TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {points.map(p => (
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
                <div className="h-full w-full flex flex-col items-center justify-center text-slate-500 p-4">
                  <div className="mb-2 text-sm">
                    {error ? error : (loading ? "Loading map data…" : "Map not available")}
                  </div>
                  {!mapReady && (
                    <div className="text-xs text-slate-400">
                      To enable the interactive map install: <code>npm i react-leaflet leaflet</code> and import <code>leaflet/dist/leaflet.css</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-3">Live guards</h3>
            <div className="space-y-2 max-h-[480px] overflow-auto">
              {loading && <div className="text-sm text-slate-400">Loading…</div>}
              {!loading && points.length === 0 && <div className="text-sm text-slate-400">No patrol data</div>}
              {points.map(p => <PatrolItem key={p.id} p={p} />)}
            </div>
          </aside>
        </section>

        <section className="mt-6">
          <div className="bg-white p-4 rounded shadow text-sm text-slate-600">
            Recent checkpoint activity will appear here in real-time
          </div>
        </section>
      </main>
    </div>
  );
}
