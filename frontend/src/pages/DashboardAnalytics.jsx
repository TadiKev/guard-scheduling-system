// src/pages/DashboardAnalytics.jsx
import React, { useEffect, useState } from "react";
import api from "../api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import SummaryCard from "../components/SummaryCard";
import SparklineCard from "../components/SparklineCard";
import AllocationPanel from "../components/AllocationPanel";

export default function DashboardAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/dashboard/analytics/");
      setAnalytics(res.data);
    } catch (err) {
      console.error("analytics fetch failed", err?.response?.data || err);
      setError(err?.response?.data || err.message || "Failed to fetch analytics");
    } finally {
      setLoading(false);
    }
  }

  // ---------- Helpers to normalize workload objects ----------
  function getGuardDisplayName(g) {
    if (!g) return "Unknown";
    // common fields
    if (typeof g === "string") return g;
    const maybe = (k) => {
      if (g[k]) return g[k];
      const alt = g[k.replace(/__/g, ".")];
      if (alt) return alt;
      return null;
    };

    const candidates = [
      // backend variants
      "guard__username",
      "guard_username",
      "username",
      "user__username",
      "user",
      "name",
      "full_name",
      "display_name",
    ];

    for (const k of candidates) {
      const v = maybe(k);
      if (v && typeof v === "string" && v.trim() !== "") return v;
      if (v && typeof v === "object") {
        // e.g. user: { username: "..." }
        if (typeof v.username === "string" && v.username.trim() !== "") return v.username;
        if (typeof v.name === "string" && v.name.trim() !== "") return v.name;
      }
    }

    // nested common shape: { guard: { username: "..." } }
    if (g.guard && (g.guard.username || g.guard.name)) return g.guard.username || g.guard.name;
    if (g.user && (g.user.username || g.user.name)) return g.user.username || g.user.name;

    return "Unknown";
  }

  function getShiftsCount(g) {
    if (!g) return 0;
    // try common numeric fields (in order of preference)
    const maybeNum = (v) => {
      if (v == null) return null;
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) return n;
      }
      return null;
    };

    const numericFields = [
      "shifts",
      "checkins",
      "count",
      "total",
      "shifts_count",
      "shift_count",
      "checkins_count",
      "value",
    ];

    for (const f of numericFields) {
      const v = maybeNum(g[f]);
      if (v != null) return v;
    }

    // sometimes backend returns objects like { username: 'x', checks: 5 } or a single numeric prop
    for (const k of Object.keys(g || {})) {
      const v = maybeNum(g[k]);
      if (v != null) return v;
    }

    return 0;
  }

  // safe accessors for top guard info
  function topWorkloadInfo(workloadArray = []) {
    if (!Array.isArray(workloadArray) || workloadArray.length === 0) return { name: "—", count: "—", sparkData: [] };
    // assume the array is sorted by descending workload; if not, find the max
    const top = workloadArray[0];
    const name = getGuardDisplayName(top) || "Unknown";
    const count = getShiftsCount(top);
    const sparkData = (workloadArray || []).slice(0, 6).map((g) => getShiftsCount(g) || 0);
    return { name, count, sparkData };
  }

  if (loading) {
    return (
      <div className="p-6 bg-gradient-to-br from-white/80 to-slate-50 rounded-2xl shadow-lg">
        <div className="flex items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-emerald-400 border-slate-200" />
          <div className="text-sm text-slate-600">Loading analytics…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 rounded-2xl border border-rose-100 text-rose-700">
        <div className="font-semibold">Failed to load analytics</div>
        <div className="text-sm mt-2">{String(error)}</div>
      </div>
    );
  }

  // Normalize analytics shape (defensive defaults)
  const attendance = (analytics && analytics.attendance_last_7_days) || [];
  const workload = (analytics && analytics.workload) || [];

  // Average on-time percent (rounded). Defensive against missing fields.
  const avgOnTime =
    attendance.length > 0
      ? Math.round(
          attendance.reduce((acc, cur) => acc + (Number(cur?.on_time ?? 0) || 0), 0) / attendance.length
        )
      : "—";

  const topInfo = topWorkloadInfo(workload);

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Avg On-time (7d)"
          value={`${avgOnTime === "—" ? "—" : `${avgOnTime}%`}`}
          subtitle="Attendance punctuality"
          accent="green"
          sparkData={attendance.map((d) => Number(d.on_time ?? 0) || 0)}
        />
        <SummaryCard
          title="Top Guard Load"
          value={topInfo.count !== "—" ? topInfo.count : "—"}
          subtitle={topInfo.name || "—"}
          accent="purple"
          sparkData={topInfo.sparkData}
        />
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-slate-500">Allocation</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">Smart Runner</div>
              <div className="text-xs text-slate-400 mt-1">Run the allocation algorithm for date ranges</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-300 flex items-center justify-center shadow text-white">
              ⚡
            </div>
          </div>

          <div className="mt-4">
            <AllocationPanel />
          </div>
        </div>
      </div>

      {/* Attendance chart + legend */}
      <div className="bg-white rounded-3xl shadow-2xl p-5 border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Attendance (last 7 days)</h3>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> On time
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Late
            </div>
          </div>
        </div>

        <div style={{ width: "100%", minHeight: 260 }} className="rounded-lg p-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={attendance} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="onTimeGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="lateGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#475569" }} />
              <YAxis tick={{ fontSize: 12, fill: "#475569" }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#f1f5f9" }} itemStyle={{ color: "#0f172a" }} />
              <Legend verticalAlign="top" height={36} />

              <Line
                type="monotone"
                dataKey="on_time"
                name="On Time"
                stroke="#10B981"
                strokeWidth={3}
                dot={{ r: 0 }}
                activeDot={{ r: 5 }}
                fill="url(#onTimeGradient)"
              />
              <Line
                type="monotone"
                dataKey="late"
                name="Late"
                stroke="#F59E0B"
                strokeWidth={3}
                dot={{ r: 0 }}
                activeDot={{ r: 5 }}
                fill="url(#lateGradient)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Workload list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow">
          <h3 className="font-semibold mb-3">Guard workload (top)</h3>
          <div className="space-y-2">
            {(workload || []).slice(0, 8).map((g, i) => {
              const name = getGuardDisplayName(g);
              const shifts = getShiftsCount(g);
              const avatarText = String((name && name !== "Unknown" ? name : "U").slice(0, 2)).toUpperCase();
              return (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-300 text-white font-bold">
                      {avatarText}
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">{name}</div>
                      <div className="text-xs text-slate-400">Shifts: {shifts}</div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">{shifts}</div>
                </div>
              );
            })}
            {(workload || []).length === 0 && <div className="text-sm text-slate-400 p-3">No workload data</div>}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow">
          <h3 className="font-semibold mb-3">Quick insights</h3>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-sm text-slate-500">Average on-time (7 days)</div>
              <div className="text-xl font-bold text-emerald-700 mt-1">{avgOnTime === "—" ? "—" : `${avgOnTime}%`}</div>
              <div className="mt-2"><SparklineCard data={attendance.map(d => Number(d.on_time ?? 0) || 0)} /></div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-sm text-slate-500">Total guards monitored</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{analytics?.total_guards ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}