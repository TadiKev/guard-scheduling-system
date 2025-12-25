// frontend/src/components/PatrolMap.jsx
import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../api";

function toHeatPoints(points) {
  return points.map((p) => [p.lat, p.lng, 0.5]);
}

export default function PatrolMap({ shiftId, token }) {
  const [points, setPoints] = useState([]);
  const [latest, setLatest] = useState([]);
  const mapRef = useRef(null);

  async function loadShiftPatrols() {
  if (!shiftId || shiftId === "undefined") return setPoints([]);
  try {
    const res = await api.get(`/shifts/${shiftId}/patrols/?limit=1000`);
    setPoints(res.data || []);
  } catch (err) {
    console.error("Patrol load failed", err);
    setPoints([]);
  }
}

async function loadLatest() {
  try {
    // only add param if shiftId is numeric-ish
    const url = (shiftId && shiftId !== "undefined") ? `/patrols/latest/?shift_id=${shiftId}` : `/patrols/latest/`;
    const res = await api.get(url);
    setLatest(res.data || []);
  } catch (err) {
    console.error("Failed to fetch latest patrols", err);
    setLatest([]);
  }
}


  useEffect(() => {
    loadShiftPatrols();
    loadLatest();
    const t = setInterval(() => loadLatest(), 5000);
    return () => clearInterval(t);
  }, [shiftId]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // remove old heat layer
    if (map._heatLayer) {
      map.removeLayer(map._heatLayer);
      map._heatLayer = null;
    }

    if (points && points.length > 0) {
      // FIXED: JS-safe detection of heatLayer (no TypeScript)
      const heatFn = L.heatLayer || (L && L.heatLayer);

      if (typeof heatFn === "function") {
        const heat = heatFn(toHeatPoints(points), { radius: 25, blur: 20 });
        heat.addTo(map);
        map._heatLayer = heat;
      }

      const last = points[points.length - 1];
      if (last) map.setView([last.lat, last.lng], 15);
    }
  }, [points]);

  const center = latest.length
    ? [latest[0].lat, latest[0].lng]
    : [-17.8292, 31.0522];

  return (
    <div style={{ height: "520px", width: "100%" }}>
      <MapContainer
        center={center}
        zoom={15}
        whenCreated={(m) => (mapRef.current = m)}
        style={{ height: "100%", width: "100%", minHeight: 400 }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {latest.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={8}>
            <Popup>
              <div>
                <strong>{p.guard?.username || `Guard ${p.guard_id}`}</strong>
                <br />
                {new Date(p.timestamp).toLocaleString()}
                <br />
                {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="p-2">
        <button
          className="btn"
          onClick={() => {
            loadShiftPatrols();
            loadLatest();
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
