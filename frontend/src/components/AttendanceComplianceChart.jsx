// AttendanceComplianceChart.jsx
import React from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

/*
Expected data shape (array, ascending by date):
[
  { date: "2025-12-12", total: 10, on_time: 8, late: 2, absent: 0 },
  ...
]
*/

export default function AttendanceComplianceChart({ data = [] }) {
  // ensure data exists
  const safe = Array.isArray(data) ? data : [];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <AreaChart data={safe} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gOn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="gLate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
            </linearGradient>
          </defs>

          <XAxis dataKey="date" />
          <YAxis />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="on_time" name="On time" stroke="#10b981" fill="url(#gOn)" />
          <Area type="monotone" dataKey="late" name="Late" stroke="#f59e0b" fill="url(#gLate)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
