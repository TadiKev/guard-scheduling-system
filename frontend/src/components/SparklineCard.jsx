// src/components/SparklineCard.jsx
import React from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

/**
 * SparklineCard
 * - Accepts array of numbers or objects with `.value`
 * - Pure presentation; no logic changes
 */
export default function SparklineCard({ data = [], color = "#2563eb" }) {
  const formatted = data.map((v, i) => (typeof v === "number" ? { value: v, i } : { value: v.value ?? 0, i }));
  return (
    <div style={{ width: "100%", height: 48 }} className="rounded">
      <ResponsiveContainer>
        <AreaChart data={formatted} margin={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="spark-1" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} fill="url(#spark-1)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
