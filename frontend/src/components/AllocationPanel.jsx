// frontend/src/components/AllocationPanel.jsx
import React, { useState } from "react";
import api from "../api";

/**
 * AllocationPanel — styling-only upgrade
 * Behavior unchanged (calls POST /allocate/)
 */
export default function AllocationPanel() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState(null);

  async function runAllocation() {
    setStatus("running");
    try {
      await api.post("/allocate/", {
        start_date: startDate,
        end_date: endDate,
      });
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-inner border">
      <h4 className="text-sm font-semibold mb-2">Smart Shift Allocation</h4>
      <p className="text-xs text-slate-500 mb-4">Automatically assign guards based on skills, workload & compliance.</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Start Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2 bg-white text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">End Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2 bg-white text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={runAllocation}
          className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-white font-semibold shadow ${
            status === "running" ? "bg-emerald-400" : "bg-indigo-600 hover:bg-indigo-700"
          } transition`}
        >
          {status === "running" ? "Running…" : "Run Allocation Algorithm"}
        </button>
      </div>

      <div className="mt-3 min-h-[36px]">
        {status === "running" && <div className="text-sm text-slate-500">Running allocation…</div>}
        {status === "success" && <div className="text-sm text-emerald-700">Allocation completed successfully</div>}
        {status === "error" && <div className="text-sm text-rose-700">Allocation failed. Check backend logs.</div>}
      </div>
    </div>
  );
}
