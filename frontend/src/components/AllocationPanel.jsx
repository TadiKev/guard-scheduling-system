import React, { useState } from "react";
import api from "../api";

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
    <div className="bg-white rounded shadow p-6">
      <h3 className="text-lg font-semibold mb-1">
        Smart Shift Allocation
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Automatically assign guards based on skills, workload & compliance
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500">Start Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">End Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <button
        onClick={runAllocation}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
      >
        Run Allocation Algorithm
      </button>

      {status === "running" && (
        <div className="text-sm text-gray-500 mt-3">
          Running allocation…
        </div>
      )}

      {status === "success" && (
        <div className="text-sm text-green-600 mt-3">
          Allocation completed successfully
        </div>
      )}

      {status === "error" && (
        <div className="text-sm text-red-600 mt-3">
          Allocation failed. Check backend logs.
        </div>
      )}
    </div>
  );
}
