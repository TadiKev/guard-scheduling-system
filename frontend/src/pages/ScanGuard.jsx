// src/pages/ScanGuard.jsx
import React, { useState, useContext } from "react";
import api, { safePost } from "../api";
import AuthContext from "../AuthContext";

/**
 * ScanGuard page
 * - Sends qr_payload (or uses authenticated user if QR left blank)
 * - Renders a readable, styled result card from backend JSON
 */
function InfoRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between text-sm text-slate-700 py-0.5">
      <div className="text-slate-400">{label}</div>
      <div className="font-medium">{String(value)}</div>
    </div>
  );
}

function ResultBox({ data }) {
  // data can be many shapes; handle common patterns robustly
  const assigned = data?.assigned ?? false;
  const reason = data?.reason ?? data?.error ?? null;
  const assignment = data?.assignment ?? (Array.isArray(data?.assignments) ? data.assignments[0] : null);
  const assignments = data?.assignments ?? null;

  return (
    <div className="mt-4">
      {/* status */}
      <div
        className={`p-4 rounded-lg shadow-sm border ${
          assigned ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-sm font-semibold ${assigned ? "text-emerald-800" : "text-rose-700"}`}>
              {assigned ? "Guard successfully assigned" : "No assignment made"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {assigned
                ? "The system found a matching shift and assigned the guard automatically."
                : reason || "The allocation algorithm did not find a suitable shift."}
            </div>
          </div>

          {/* quick summary pill */}
          <div className="text-xs">
            {assigned ? (
              <div className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Assigned</div>
            ) : (
              <div className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-semibold">Not assigned</div>
            )}
          </div>
        </div>

        {/* assignment details */}
        {assigned && assignment && (
          <div className="mt-4 bg-white p-3 rounded border">
            <InfoRow label="Guard" value={assignment.guard_username ?? assignment.guard?.username ?? "—"} />
            <InfoRow label="Shift ID" value={assignment.shift_id ?? (assignment.shift && assignment.shift.id) ?? "—"} />
            <InfoRow label="Premise" value={assignment.premise_name ?? assignment.premise?.name ?? "—"} />
            <InfoRow label="Score" value={assignment.score ?? "—"} />
            <InfoRow label="Assigned at" value={assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleString() : "—"} />
            {/* any extra keys */}
            {Object.entries(assignment)
              .filter(([k]) => !["guard_username", "shift_id", "premise_name", "score", "assigned_at"].includes(k))
              .map(([k, v]) => (
                <InfoRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
              ))}
          </div>
        )}

        {/* multiple assignments (batch) */}
        {Array.isArray(assignments) && assignments.length > 0 && (
          <div className="mt-4">
            <div className="text-sm text-slate-600 mb-2">Assignments returned</div>
            <div className="space-y-2">
              {assignments.map((a, idx) => (
                <div key={idx} className="p-2 border rounded bg-white">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{a.guard_username ?? a.guard?.username ?? "Guard"}</div>
                    <div className="text-xs text-slate-400">shift {a.shift_id}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">premise: {a.premise_name ?? a.premise?.name ?? "—"}</div>
                  <div className="text-xs text-slate-400 mt-1">score: {a.score ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* failure reason details */}
        {!assigned && reason && (
          <div className="mt-4 p-3 bg-white rounded border text-sm text-slate-700">
            <div className="font-medium text-slate-800 mb-2">Why it didn't assign</div>
            <div className="text-xs text-slate-500">{String(reason)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScanGuardPage() {
  const { user, token } = useContext(AuthContext);
  const [qrText, setQrText] = useState("");
  const [result, setResult] = useState(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendScan() {
    setLoading(true);
    setResult(null);
    try {
      // if user is logged in and no qrText provided, backend should use request.user
      const body = qrText ? { qr_payload: JSON.parse(qrText) } : {};
      const res = await safePost("/allocate/scan_guard/", body);
      const data = res.data;
      // normalize response into expected shape if backend returned alternate fields
      // Example normalized shape handled by ResultBox: { assigned: bool, assignment: {...}, assignments: [...], reason: "..." }
      setResult({ ok: true, data });
    } catch (err) {
      const payload = err?.response?.data ?? err?.message ?? "Request failed";
      setResult({ ok: false, err: payload });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Scan Guard QR (Auto-allocate)</h2>
      <div className="mb-3 text-sm text-slate-500">
        If you are logged in as the guard, leave QR blank and press <span className="font-semibold">Scan & Allocate</span> — the system will auto allocate you.
      </div>

      <textarea
        value={qrText}
        onChange={(e) => setQrText(e.target.value)}
        placeholder='Paste QR JSON e.g. {"type":"guard","id":21,"uuid":"..."}'
        className="w-full border rounded p-2 mb-3 h-28 text-sm"
      />

      <div className="flex gap-3 items-center">
        <button
          onClick={sendScan}
          disabled={loading}
          className="px-4 py-2 rounded bg-emerald-600 text-white hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Scanning…" : "Scan & Allocate"}
        </button>

        <button
          onClick={() => {
            setQrText(JSON.stringify({ type: "guard", id: user?.id ?? null, uuid: undefined }, null, 2));
          }}
          className="px-3 py-2 rounded border text-sm text-slate-700"
          title="Quick-fill QR with current user (if logged-in guard)"
        >
          Fill with my user
        </button>

        <div className="text-sm text-slate-400 ml-auto">Result:</div>
      </div>

      <div className="mt-4">
        {result && result.ok && (
          <>
            <ResultBox data={result.data} />
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setRawOpen((s) => !s)}
                className="px-3 py-1 text-xs rounded bg-slate-100 border text-slate-700"
              >
                {rawOpen ? "Hide raw JSON" : "Show raw JSON"}
              </button>
              <div className="text-xs text-slate-400"> — backend response</div>
            </div>
            {rawOpen && (
              <pre className="mt-3 p-3 bg-slate-50 rounded text-xs overflow-auto">{JSON.stringify(result.data, null, 2)}</pre>
            )}
          </>
        )}

        {result && !result.ok && (
          <div className="mt-4 p-3 rounded border bg-rose-50 text-rose-700">
            <div className="font-semibold">Error</div>
            <pre className="mt-2 text-sm">{JSON.stringify(result.err, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
