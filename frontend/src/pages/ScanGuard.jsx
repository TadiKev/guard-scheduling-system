// src/pages/ScanGuard.jsx
import React, { useState, useContext } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";
import AuthContext from "../AuthContext";
import { safePost, safeGet } from "../api";

/*
  ScanGuardPage
  - Sends qr_payload (or uses authenticated user if QR left blank)
  - Renders a professional, readable assignment + skills transparency card
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

function Pills({ items = [], emptyText = "—" }) {
  if (!items || items.length === 0) return <div className="text-xs text-slate-400">{emptyText}</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it, i) => (
        <div key={i} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          {it}
        </div>
      ))}
    </div>
  );
}

function normalizeSkills(input) {
  // Accept string "a, b" or array ["a","b"], return array of trimmed values (preserve original casing for display)
  if (!input) return [];
  if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function computeMatched(guardSkills, premiseSkills) {
  // More forgiving matching: exact (case-insensitive) first, then simple partials (contains)
  if (!guardSkills || guardSkills.length === 0 || !premiseSkills || premiseSkills.length === 0) return [];

  const gLower = guardSkills.map((s) => String(s).toLowerCase());
  const pLower = premiseSkills.map((s) => String(s).toLowerCase());
  const matchedOrdered = [];

  pLower.forEach((req, idx) => {
    // exact match
    const exactIndex = gLower.findIndex((gs) => gs === req);
    if (exactIndex !== -1) {
      matchedOrdered.push(guardSkills[exactIndex]);
      return;
    }
    // partial match: guard contains requirement or requirement contains guard
    const partialIndex = gLower.findIndex((gs) => gs.includes(req) || req.includes(gs));
    if (partialIndex !== -1) {
      matchedOrdered.push(guardSkills[partialIndex]);
      return;
    }
    // fuzzy-ish: split words and compare tokens (e.g., "retail security" vs "retail")
    const reqTokens = req.split(/\s+/).filter(Boolean);
    let tokenMatched = false;
    for (let i = 0; i < gLower.length && !tokenMatched; i++) {
      const gTokens = gLower[i].split(/\s+/).filter(Boolean);
      for (let rt of reqTokens) {
        if (gTokens.includes(rt)) {
          matchedOrdered.push(guardSkills[i]);
          tokenMatched = true;
          break;
        }
      }
    }
  });

  // dedupe preserving order
  const seen = new Set();
  const deduped = [];
  for (const s of matchedOrdered) {
    if (!seen.has(s)) {
      seen.add(s);
      deduped.push(s);
    }
  }
  return deduped;
}

/* Result renderer */
function ResultBox({ data }) {
  if (!data) return null;

  const assigned = !!data.assigned;
  // assignment object: prefer assignment or first in assignments or top-level fields
  const assignment = data.assignment || (Array.isArray(data.assignments) && data.assignments[0]) || data;

  const guardUsername = assignment.guard_username || assignment.guard?.username || data.guard_username || "Guard";
  const premiseName = assignment.premise_name || (assignment.premise && assignment.premise.name) || data.premise_name || "—";
  const shiftId = assignment.shift_id || (assignment.shift && assignment.shift.id) || null;
  const score = assignment.score ?? data.score ?? null;
  const assignedAt = assignment.assigned_at || data.assigned_at || null;

  // Skills arrays (component ensures these keys exist when setting result)
  const guardSkills = normalizeSkills(data.guard_skills || assignment.guard_skills || data.guard_profile?.skills || []);
  const premiseSkills = normalizeSkills(
    data.premise_required_skills || assignment.premise_required_skills || data.premise?.required_skills || ""
  );
  const matchedSkills = normalizeSkills(data.matched_skills || computeMatched(guardSkills, premiseSkills));

  // Professional success card
  if (assigned) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-800" />
          <div>
            <div className="text-emerald-800 font-semibold text-lg">Assignment Confirmed</div>
            <div className="text-sm text-slate-600">You have been assigned to the selected shift and premise.</div>
          </div>
        </div>

        <div className="bg-white rounded border p-4">
          <div className="text-sm text-slate-600 mb-2">Assignment</div>
          <InfoRow label="Assigned to" value={guardUsername} />
          <InfoRow label="Premise" value={premiseName} />
          <InfoRow label="Shift ID" value={shiftId ? `#${shiftId}` : "—"} />
          <InfoRow label="Match Score" value={score ?? "—"} />
          <InfoRow label="Assigned at" value={assignedAt ? new Date(assignedAt).toLocaleString() : "—"} />
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-800 mb-2">Why you were selected</div>
          <div className="bg-white rounded border p-3 space-y-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Your skills</div>
              <div className="mt-1">
                <Pills items={guardSkills} emptyText="No skills listed" />
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Premise requirements</div>
              <div className="mt-1">
                <Pills items={premiseSkills} emptyText="No requirements listed" />
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Matched skills used for assignment</div>
              <div className="mt-1">
                <Pills items={matchedSkills} emptyText="No matched skills" />
              </div>
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-600 italic">Please report to the premise as scheduled and follow the site SOPs.</div>
      </div>
    );
  }

  // Not assigned
  return (
    <div className="mt-6 rounded-lg border border-rose-300 bg-rose-50 p-5">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-rose-700" />
        <div>
          <div className="text-rose-700 font-semibold text-lg">Assignment Not Completed</div>
          <div className="text-sm text-slate-600">The system couldn't assign you automatically.</div>
        </div>
      </div>

      <div className="mt-3 text-sm text-slate-700">
        Reason: <span className="font-medium">{data.reason || data.error || "No suitable shift found (conflicts or no skill match)."}</span>
      </div>

      {/* show what we checked */}
      <div className="mt-4 bg-white rounded border p-3 text-sm">
        <div className="text-xs text-slate-500 mb-2">What we checked</div>
        <InfoRow label="Guard skills" value={guardSkills.join(", ") || "—"} />
        <InfoRow label="Premise requirements" value={premiseSkills.join(", ") || "—"} />
        <InfoRow label="Matched skills" value={matchedSkills.join(", ") || "—"} />
      </div>
    </div>
  );
}

/* Main page */
export default function ScanGuardPage() {
  const { user } = useContext(AuthContext);
  const [qrText, setQrText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // parse safe QR JSON or return null
  function parseQR(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      try {
        return JSON.parse(raw.replace("'", '"'));
      } catch (e2) {
        return null;
      }
    }
  }

  async function sendScan() {
    setLoading(true);
    setResult(null);

    try {
      // derive logged-in user's skills (try common shapes: array or comma-string)
      const loggedInGuardSkills = normalizeSkills(
        user?.profile?.skills ||
          user?.profile?.skills_text ||
          user?.profile?.skillsList ||
          user?.skills ||
          user?.skills_text ||
          []
      );

      // build request body:
      // - if QR provided, send as qr_payload (server may resolve guard from QR)
      // - otherwise, send guard_id and guard_skills (if available) to help backend match immediately
      const body = qrText
        ? { qr_payload: parseQR(qrText) }
        : {
            guard_id: user?.id ?? null,
            // only include guard_skills when we actually have skills (avoid sending empty arrays)
            ...(loggedInGuardSkills && loggedInGuardSkills.length > 0 ? { guard_skills: loggedInGuardSkills } : {}),
          };

      const res = await safePost("/allocate/scan_guard/", body);
      const data = res.data || {};

      // Normalize data and ensure skills transparency:
      // Try to source guard_skills & premise_required_skills if not present
      let guardSkills = normalizeSkills(
        data.guard_skills ||
          (data.assignment && data.assignment.guard_skills) ||
          data.guard_profile?.skills ||
          []
      );

      let premiseSkills = normalizeSkills(
        data.premise_required_skills ||
          (data.assignment && data.assignment.premise_required_skills) ||
          (data.assignment && data.assignment.required_skills) ||
          data.premise?.required_skills ||
          []
      );

      let matchedSkills = normalizeSkills(
        data.matched_skills ||
          (data.assignment && data.assignment.matched_skills) ||
          []
      );

      // If missing guardSkills but we have the logged-in user's skills, use them (so UI shows them)
      if ((!guardSkills || guardSkills.length === 0) && loggedInGuardSkills && loggedInGuardSkills.length > 0) {
        guardSkills = loggedInGuardSkills;
      }

      // If missing guardSkills but we have guard id in the response, try fetching profile (best-effort)
      const assignment = data.assignment || (Array.isArray(data.assignments) && data.assignments[0]) || data;
      const guardId = assignment?.assigned_guard_id || assignment?.guard_id || data?.assigned_guard_id || data?.guard_id || null;
      const premiseId = assignment?.premise_id || (assignment?.premise && assignment.premise.id) || data?.premise_id || null;

      try {
        if ((!guardSkills || guardSkills.length === 0) && guardId) {
          const u = await safeGet(`/users/${guardId}/`);
          const prof = u?.data?.profile || u?.data;
          guardSkills = normalizeSkills(prof?.skills || prof?.profile?.skills || prof?.skills_text || "");
        }
      } catch (e) {
        // ignore fetch errors
      }

      try {
        if ((!premiseSkills || premiseSkills.length === 0) && premiseId) {
          const p = await safeGet(`/premises/${premiseId}/`);
          premiseSkills = normalizeSkills(p?.data?.required_skills || p?.data?.requiredSkills || "");
        }
      } catch (e) {
        // ignore
      }

      // compute matched if not provided
      if ((!matchedSkills || matchedSkills.length === 0) && guardSkills.length > 0 && premiseSkills.length > 0) {
        matchedSkills = computeMatched(guardSkills, premiseSkills);
      }

      // produce enriched object to render
      const enriched = {
        ...data,
        guard_skills: guardSkills,
        premise_required_skills: premiseSkills,
        matched_skills: matchedSkills,
      };

      setResult({ ok: true, data: enriched });
    } catch (err) {
      // Keep error message readable
      const payload = err?.response?.data ?? err?.message ?? "Request failed";
      setResult({ ok: false, err: payload });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold mb-3">Guard Automatic Allocation</h2>

      <p className="text-sm text-slate-500 mb-4">
        If you are logged in as a guard, leave the QR field empty and click{" "}
        <strong>Allocate</strong>. The system will attempt to assign you to the best matching open shift and show a clear explanation of why.
      </p>

      <textarea
        value={qrText}
        onChange={(e) => setQrText(e.target.value)}
        placeholder=''
        className="w-full border rounded p-2 mb-4 h-28 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={sendScan}
          disabled={loading}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
        >
          {loading ? "Scanning…" : "Allocate"}
        </button>

        <button
          onClick={() =>
            setQrText(
              JSON.stringify({ type: "guard", id: user?.id ?? null, uuid: user?.profile?.qr_uuid ?? undefined }, null, 2)
            )
          }
          className="px-3 py-2 rounded border text-sm text-slate-700"
          title="Quick-fill QR with current user (if logged-in guard)"
        >
          Fill with my user
        </button>

        <div className="text-sm text-slate-400 ml-auto">Result:</div>
      </div>

      <div className="mt-4">
        {result && result.ok && <ResultBox data={result.data} />}

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