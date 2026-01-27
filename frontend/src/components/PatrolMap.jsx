// frontend/src/components/PatrolMap.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../api";

/**
 * Robust PatrolMap
 *
 * Props:
 *  - shiftId: optional (int or string); if falsy, fetches /patrols/latest/
 *  - token: optional auth token (if your api instance doesn't include it)
 *
 * Notes:
 *  - keeps map stable to avoid disappearance
 *  - invalidates size on mount/resize
 *  - handles heat layer safely
 */

function toHeatPoints(points = []) {
  return points.map((p) => [Number(p.lat), Number(p.lng), p[2] ?? 0.5]).filter(pt => !Number.isNaN(pt[0]) && !Number.isNaN(pt[1]));
}

/* Hook component to add a heat layer using leaflet.heat plugin (if available). */
function HeatLayer({ points = [], options = {} }) {
  const map = useMap();
  const heatRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    // Try multiple ways of grabbing heatLayer func (plugin may attach differently)
    const heatFn = (L && L.heatLayer) || (window && window.L && window.L.heatLayer) || null;
    if (!heatFn || typeof heatFn !== "function") return;

    // Clean previous
    try { if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; } } catch (e) {}

    const pts = toHeatPoints(points);
    if (!pts || pts.length === 0) return;

    try {
      const heat = heatFn(pts, options);
      heat.addTo(map);
      heatRef.current = heat;
    } catch (e) {
      // ignore plugin errors
      // console.warn("heat add failed", e);
    }

    return () => {
      try { if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; } } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(points), JSON.stringify(options)]);

  return null;
}

export default function PatrolMap({ shiftId = null, token = null }) {
  const [points, setPoints] = useState([]);   // full patrol points for a shift (when shiftId provided)
  const [latest, setLatest] = useState([]);   // latest points (many guards)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);

  const mapRef = useRef(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef(null);
  const containerRef = useRef(null);

  // Ensure default Leaflet icon URLs (works well with Vite; CRAs might need public assets)
  useEffect(() => {
    try {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
        iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
        shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
      });
    } catch (e) {
      // ignore bundler differences
    }
  }, []);

  // small helper to safely set state only when mounted
  const safeSet = useCallback((setter, value) => {
    if (mountedRef.current) setter(value);
  }, []);

  // Fetch shift patrol points (when viewing a specific shift)
  const loadShiftPatrols = useCallback(async () => {
    if (!shiftId || String(shiftId) === "undefined") {
      safeSet(setPoints, []);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/shifts/${shiftId}/patrols/?limit=1000`);
      safeSet(setPoints, Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Patrol load failed", err);
      safeSet(setPoints, []);
      safeSet(setError, "Failed to load shift patrols");
    } finally {
      safeSet(setLoading, false);
    }
  }, [shiftId, safeSet]);

  // Fetch latest points (latest per guard)
  const loadLatest = useCallback(async () => {
    try {
      setError(null);
      const url = (shiftId && String(shiftId) !== "undefined") ? `/patrols/latest/?shift_id=${shiftId}` : `/patrols/latest/`;
      const res = await api.get(url);
      safeSet(setLatest, Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch latest patrols", err);
      safeSet(setLatest, []);
      safeSet(setError, "Failed to load latest patrols");
    }
  }, [shiftId, safeSet]);

  // initial load and polling
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      await Promise.all([loadShiftPatrols(), loadLatest()]);
    })();

    // poll latest every 5s
    intervalRef.current = setInterval(() => {
      loadLatest();
    }, 5000);

    return () => {
      mountedRef.current = false;
      try { clearInterval(intervalRef.current); } catch (e) {}
      intervalRef.current = null;
    };
  }, [loadShiftPatrols, loadLatest]);

  // When points update, add heat-layer and optionally pan to most recent point
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // invalidate size to avoid disappearing tiles (common in hidden-to-visible transitions)
    try {
      setTimeout(() => {
        try { map.invalidateSize(); } catch (e) {}
      }, 100);
    } catch (e) {}

    // remove previous heat layer (if any stored)
    try {
      if (map._heatLayer) {
        map.removeLayer(map._heatLayer);
        map._heatLayer = null;
      }
    } catch (e) { /* ignore */ }

    // Add heat for shift points only (points is shift-specific)
    if (points && points.length > 0) {
      const heatFn = (L && L.heatLayer) || (window && window.L && window.L.heatLayer) || null;
      if (heatFn && typeof heatFn === "function") {
        try {
          const h = heatFn(toHeatPoints(points), { radius: 25, blur: 20 });
          h.addTo(map);
          map._heatLayer = h;
        } catch (e) {
          // ignore plugin errors
        }
      }

      // pan to last point if available
      const last = points[points.length - 1];
      if (last && !Number.isNaN(Number(last.lat)) && !Number.isNaN(Number(last.lng))) {
        try { map.setView([Number(last.lat), Number(last.lng)], Math.max(map.getZoom(), 14)); } catch (e) {}
      }
    } else {
      // if no points, remove any heat and leave map centered on latest guard if available
      try {
        if (map._heatLayer) { map.removeLayer(map._heatLayer); map._heatLayer = null; }
      } catch (e) {}
    }
  }, [points]);

  // When latest updates, optionally pan to the newest guard location (but do not force zoom)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!latest || latest.length === 0) return;

    const first = latest[0];
    if (!first || Number.isNaN(Number(first.lat)) || Number.isNaN(Number(first.lng))) return;

    // small delay to avoid invalidation conflicts
    setTimeout(() => {
      try { map.panTo([Number(first.lat), Number(first.lng)], { animate: true }); } catch (e) {}
    }, 250);
  }, [latest]);

  // keep map visible when container size changes (ResizeObserver)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = mapRef.current;
    if (!map) return;

    let ro = null;
    try {
      ro = new ResizeObserver(() => {
        try { map.invalidateSize(); } catch (e) {}
      });
      ro.observe(el);
    } catch (e) {
      // ResizeObserver not supported -> fallback to window resize
      const onResize = () => { try { map.invalidateSize(); } catch (e) {} };
      window.addEventListener("resize", onResize);
      return () => { window.removeEventListener("resize", onResize); };
    }

    return () => {
      try { if (ro && el) ro.unobserve(el); } catch (e) {}
    };
  }, []);

  // marker click: pan + bring popup to front visually
  function handleMarkerClick(e, p) {
    try {
      const layer = e?.target;
      if (layer && typeof layer.bringToFront === "function") layer.bringToFront();
    } catch (e) {}
    try {
      const map = mapRef.current;
      if (map && e && e.latlng) map.panTo(e.latlng, { animate: true });
    } catch (e) {}
    setSelectedMarker(p.id);
  }

  // computed center (fallback to coords if available)
  const center = (latest && latest.length > 0 && !Number.isNaN(Number(latest[0].lat)) && !Number.isNaN(Number(latest[0].lng)))
    ? [Number(latest[0].lat), Number(latest[0].lng)]
    : [-17.8292, 31.0522];

  return (
    <div ref={containerRef} className="w-full" style={{ height: "520px", minHeight: 400 }}>
      <div className="relative w-full h-full rounded border overflow-hidden bg-white">
        {/* simple header overlay */}
        <div className="absolute z-20 top-3 left-3 bg-white/80 backdrop-blur rounded px-3 py-1 flex items-center gap-2 shadow-sm">
          <div className="text-sm text-slate-700 font-medium">Patrol Map</div>
          <div className="text-xs text-slate-500">live</div>
        </div>

        <MapContainer
          center={center}
          zoom={15}
          whenCreated={(m) => {
            mapRef.current = m;
            // ensure tiles render correctly if container was hidden previously
            setTimeout(() => { try { m.invalidateSize(); } catch (e) {} }, 120);
          }}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* show latest guard markers */}
          {latest && latest.map((p) => {
            const lat = Number(p.lat);
            const lng = Number(p.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
            const isSelected = selectedMarker === p.id;
            return (
              <CircleMarker
                key={p.id}
                center={[lat, lng]}
                radius={isSelected ? 10 : 7}
                pathOptions={{
                  color: isSelected ? "#0ea5a6" : "#06b6d4",
                  fillColor: isSelected ? "#0ea5a6" : "#06b6d4",
                  fillOpacity: 0.9,
                  weight: isSelected ? 2 : 1,
                }}
                eventHandlers={{
                  click: (e) => handleMarkerClick(e, p),
                  mouseover: (e) => { try { e.target.setStyle({ weight: 2 }); } catch (err) {} },
                  mouseout: (e) => { try { e.target.setStyle({ weight: selectedMarker === p.id ? 2 : 1 }); } catch (err) {} },
                }}
              >
                <Popup>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>
                      {p.guard?.username || p.guard?.first_name || p.guard?.last_name || `Guard ${p.guard_id ?? p.id}`}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      {p.raw?.premise?.name || p.raw?.premise_name || p.raw?.shift?.premise?.name || "Unknown location"}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
                      {new Date(p.timestamp).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: "#374151", marginTop: 8 }}>
                      {lat.toFixed(5)}, {lng.toFixed(5)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* heat layer for points (if shift-specific points exist) */}
          {points && points.length > 0 && <HeatLayer points={points.map(pt => ({ lat: Number(pt.lat), lng: Number(pt.lng), 2: 0.6 }))} options={{ radius: 25, blur: 18, maxZoom: 17 }} />}

        </MapContainer>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => { loadShiftPatrols(); loadLatest(); }}
          className="px-3 py-2 bg-emerald-600 text-white rounded text-sm shadow"
        >
          Refresh
        </button>
        <div className="text-sm text-slate-500">
          {loading ? "Loading…" : (error ? `Error: ${error}` : `${latest.length} live points${points.length ? ` · ${points.length} shift points` : ""}`)}
        </div>
      </div>
    </div>
  );
}
