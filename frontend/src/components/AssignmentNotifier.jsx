// src/components/AssignmentNotifier.jsx
import React, { useContext, useState, useCallback } from "react";
import useAssignmentNotifications from "../hooks/useAssignmentNotifications";
import AuthContext from "../AuthContext";

export default function AssignmentNotifier() {
  const { logout } = useContext(AuthContext);
  const [queue, setQueue] = useState([]);
  const [open, setOpen] = useState(false);

  const onData = useCallback((items) => {
    // items may be an array of one or many assignments
    const arr = Array.isArray(items) ? items : [items];
    setQueue((q) => {
      const merged = [...arr, ...q];
      return merged.slice(0, 50);
    });

    // optional native notification
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        arr.slice(0, 2).forEach(it => {
          new Notification("New assignment", { body: `${it.guard_username || 'A guard'} assigned to shift ${it.shift_id || it.shift}`, silent: false });
        });
      }
    } catch(e){}
  }, []);

  const onAuthError = useCallback(() => {
    // backend signalled unauthorized - log out
    logout();
  }, [logout]);

  useAssignmentNotifications({ intervalMs: 15000, onData, onAuthError });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(s => !s)}
        className="relative px-3 py-2 rounded hover:bg-slate-50"
        title="Recent assignments"
      >
        <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v1M5 7h14M6 21h12a2 2 0 0 0 2-2V8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {queue.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-xs rounded-full px-1.5 py-0.5">
            {queue.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded shadow-lg border z-50">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="font-medium">Assignments</div>
            <div className="text-xs text-slate-400">{queue.length} recent</div>
          </div>

          <div className="max-h-64 overflow-auto p-2 space-y-2">
            {queue.length === 0 && <div className="text-sm text-slate-400 p-2">No recent assignments</div>}
            {queue.map((a, idx) => (
              <div key={idx} className="p-2 border rounded">
                <div className="text-sm font-medium">{a.guard_username ?? a.assigned_guard_username ?? "Guard"}</div>
                <div className="text-xs text-slate-500">Shift: {a.shift_id ?? a.shift ?? "—"}</div>
                <div className="text-xs text-slate-400 mt-1">{a.score ? `score: ${a.score}` : (a.assigned_at || a.created_at || a.timestamp || '')}</div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t flex gap-2">
            <button onClick={() => { setQueue([]); setOpen(false); }} className="flex-1 text-sm px-2 py-1 rounded bg-slate-100">Clear</button>
            <button onClick={() => { window.location.href = "/allocation"; }} className="flex-1 text-sm px-2 py-1 rounded bg-emerald-600 text-white">Open Allocation</button>
          </div>
        </div>
      )}
    </div>
  );
}
