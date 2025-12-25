// src/components/GuardDetailModal.jsx
import React from "react";

export default function GuardDetailModal({ open, onClose, guard = null, recent = [] }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">{guard?.username || "Guard details"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">Close</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">Experience</div>
            <div className="font-medium">{guard?.experience_years ?? "N/A"} yrs</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Phone</div>
            <div className="font-medium">{guard?.phone ?? "-"}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">Recent patrol points</div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {recent.length === 0 && <div className="text-xs text-gray-400">No points yet</div>}
            {recent.map(p => (
              <div key={p.id} className="text-sm border rounded p-2">
                <div>{new Date(p.timestamp).toLocaleString()}</div>
                <div className="text-xs text-gray-500">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
