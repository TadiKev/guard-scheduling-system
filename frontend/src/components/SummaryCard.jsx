// src/components/SummaryCard.jsx
import React from "react";
import SparklineCard from "./SparklineCard";

export default function SummaryCard({ title, value, subtitle, accent = "blue", sparkData }) {
  const accentMap = {
    blue: "from-blue-500 to-blue-300",
    green: "from-green-500 to-green-300",
    yellow: "from-yellow-400 to-yellow-300",
    purple: "from-purple-500 to-purple-300",
  };
  const gradient = accentMap[accent] || accentMap.blue;

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col justify-between h-36">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{value}</div>
          {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
        </div>

        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none">
            <path d="M3 12h18" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" />
            <path d="M3 6h18" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {sparkData && <div className="mt-3"><SparklineCard data={sparkData} /></div>}
    </div>
  );
}
