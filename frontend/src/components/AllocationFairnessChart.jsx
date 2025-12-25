// AllocationFairnessChart.jsx
import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

/*
Expected data:
[
  { guard_id: 1, username: "guard1", assigned_shifts: 5 },
  ...
]
And gini: float e.g. 0.12
*/

function prettyGini(g) {
  if (g == null) return "—";
  return (g * 100).toFixed(1) + "%";
}

export default function AllocationFairnessChart({ data = [], gini = null }) {
  const safe = Array.isArray(data) ? data.slice().sort((a, b) => b.assigned_shifts - a.assigned_shifts) : [];
  const bars = safe.map(s => ({ name: s.username || `#${s.guard_id}`, value: s.assigned_shifts || 0 }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-gray-500">Gini (fairness)</div>
          <div className="text-lg font-semibold">{prettyGini(gini)}</div>
        </div>
        <div className="text-xs text-gray-500">Lower is fairer (0 = perfect)</div>
      </div>

      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={bars} margin={{ top: 5, right: 5, left: 0, bottom: 40 }}>
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
