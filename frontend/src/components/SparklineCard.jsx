// src/components/SparklineCard.jsx
import React from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

export default function SparklineCard({ data = [] }) {
  // data: array of numbers or {value}
  const formatted = data.map((v, i) => (typeof v === "number" ? { value: v, i } : { value: v.value ?? 0, i }));
  return (
    <div style={{ width: "100%", height: 48 }}>
      <ResponsiveContainer>
        <AreaChart data={formatted}>
          <defs>
            <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke="#2563eb" fill="url(#spark)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
