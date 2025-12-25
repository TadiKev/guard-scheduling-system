import React, { useEffect, useState } from "react";
import api from "../api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function DashboardAnalytics() {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      const res = await api.get("/dashboard/analytics/");
      setAnalytics(res.data);
    } catch (err) {
      console.error("analytics fetch failed", err?.response?.data || err);
    }
  }

  if (!analytics) return <div className="p-4 bg-white rounded shadow">Loading analytics…</div>;

  return (
    <div className="bg-white rounded shadow p-4">
      <h3 className="mb-3 font-semibold">Attendance (last 7 days)</h3>
      <div style={{ width: "100%", minHeight: 240 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={analytics.attendance_last_7_days}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="on_time" stroke="#10B981" dot={false} />
            <Line type="monotone" dataKey="late" stroke="#F59E0B" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="mt-6 mb-3 font-semibold">Guard workload (top)</h3>
      <div className="space-y-2">
        {analytics.workload.map((g, i) => (
          <div key={i} className="flex justify-between">
            <div>{g["guard__username"] || "Unknown"}</div>
            <div className="text-sm text-gray-600">{g.shifts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
