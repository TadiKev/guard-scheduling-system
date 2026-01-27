// src/components/SummaryCard.jsx
import React from "react";
import SparklineCard from "./SparklineCard";

/**
 * SummaryCard
 * - title, value, subtitle
 * - accent selects gradient on the circle
 * - sparkData is optional and passed to SparklineCard
 */
export default function SummaryCard({ title, value, subtitle, accent = "blue", sparkData }) {
  const accentMap = {
    blue: "from-blue-500 to-blue-300",
    green: "from-emerald-500 to-emerald-300",
    yellow: "from-yellow-400 to-yellow-300",
    purple: "from-purple-500 to-purple-300",
  };
  const gradient = accentMap[accent] || accentMap.blue;

  return (
    <div className="bg-white rounded-2xl shadow p-4 flex flex-col justify-between h-36 border">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">{title}</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{value}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
        </div>

        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 12h18" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" />
            <path d="M3 6h18" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {sparkData && (
        <div className="mt-3">
          <SparklineCard data={sparkData} color={accent === "green" ? "#10B981" : accent === "purple" ? "#7c3aed" : "#2563eb"} />
        </div>
      )}
    </div>
  );
}
