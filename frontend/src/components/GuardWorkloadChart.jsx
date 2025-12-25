// GuardWorkloadChart.jsx
import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/*
Expected data:
[
  { guard_id: 1, username: "guard1", assigned_shifts: 5 },
  ...
]
*/

export default function GuardWorkloadChart({ data = [] }) {
  const safe = Array.isArray(data) ? data : [];
  const formatted = safe.map(s => ({ name: s.username || `#${s.guard_id}`, value: s.assigned_shifts || 0 }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
          <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={60} />
          <YAxis />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip />
          <Bar dataKey="value" fill="#3b82f6" name="Assigned shifts" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
