import React, { useEffect, useState } from "react";
import api from "../api";

export default function AttendanceTable({ date = "today" }) {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    loadAttendance();
  }, [date]);

  async function loadAttendance() {
    try {
      const res = await api.get(`/attendance/?date=${date}`);
      setRecords(res.data);
    } catch (err) {
      console.error("Attendance load failed", err);
    }
  }

  return (
    <div className="bg-white rounded shadow p-4">
      <h3 className="font-semibold mb-3">Attendance Records</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Guard</th>
              <th>Shift</th>
              <th>Check-in</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2">{r.guard.username}</td>
                <td>
                  {r.shift.start_time}–{r.shift.end_time}
                </td>
                <td>{new Date(r.check_in).toLocaleTimeString()}</td>
                <td>
                  {r.on_time ? (
                    <span className="text-green-600 font-medium">
                      On time
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium">
                      Late
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {records.length === 0 && (
          <div className="text-sm text-gray-500 py-4">
            No attendance records
          </div>
        )}
      </div>
    </div>
  );
}
