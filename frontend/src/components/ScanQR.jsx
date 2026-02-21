// frontend/src/components/ScanQR.jsx
import React, { useEffect, useRef, useState, useContext, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode"; // npm i html5-qrcode
import api from "../api";
import AuthContext from "../AuthContext";

/*
  ScanQR — improved check-in UX:
   - shows readable success including premise name, shift id and check-in time
   - displays assignment payload if backend assigned a shift
   - keeps camera lifecycle and force/manual fallback behavior
*/

function SmallInfoRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between text-sm text-slate-700 py-0.5">
      <div className="text-slate-400">{label}</div>
      <div className="font-medium">{String(value)}</div>
    </div>
  );
}

export default function ScanQR() {
  const { token } = useContext(AuthContext);
  const [scanning, setScanning] = useState(false);
  // message: { type: "info"|"success"|"error", text: string, details?: object }
  const [message, setMessage] = useState(null);
  const [rawText, setRawText] = useState("");
  const [showForceOption, setShowForceOption] = useState(false);

  const instRef = useRef(null); // Html5Qrcode instance
  const mountRef = useRef(null); // dom node ref
  const runningRef = useRef(false); // true when start() succeeded
  const pausedRef = useRef(false); // true when paused
  const mountedRef = useRef(true); // to check unmounted state

  useEffect(() => {
    mountedRef.current = true;
    async function startScanner() {
      try {
        if (!mountRef.current) return;
        if (instRef.current) return;

        const containerId = mountRef.current.id || `qr-reader-${Math.random().toString(36).slice(2, 8)}`;
        mountRef.current.id = containerId;

        const html5QrCode = new Html5Qrcode(containerId);
        instRef.current = html5QrCode;

        setMessage(null);
        setScanning(true);
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 300, height: 300 } },
            onScanSuccess,
            onScanFailure
          );
          runningRef.current = true;
        } catch (err) {
          runningRef.current = false;
          setScanning(false);
          setMessage({ type: "error", text: "Camera unavailable or permission denied. Use manual fallback below." });
          try { await html5QrCode.clear(); } catch (_) {}
        }
      } catch (err) {
        console.warn("startScanner error:", err);
      }
    }

    startScanner();

    return () => {
      mountedRef.current = false;
      (async () => {
        try {
          if (instRef.current) {
            if (runningRef.current && typeof instRef.current.stop === "function") {
              try {
                await instRef.current.stop();
              } catch (e) {
                console.debug("stop ignored:", e?.message || e);
              }
            }
            if (typeof instRef.current.clear === "function") {
              try {
                await instRef.current.clear();
              } catch (e) {
                console.debug("clear ignored:", e?.message || e);
              }
            }
          }
        } catch (e) {
          console.warn("cleanup error:", e);
        } finally {
          runningRef.current = false;
          pausedRef.current = false;
          instRef.current = null;
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScanFailure(error) {
    // ignore frequent parse failures in production
    // console.debug("scan failure", error);
  }

  const safePause = useCallback(async () => {
    if (!instRef.current) return false;
    if (pausedRef.current) return true;
    try {
      if (typeof instRef.current.pause === "function" && runningRef.current) {
        await instRef.current.pause();
        pausedRef.current = true;
        return true;
      }
      if (typeof instRef.current.stop === "function" && runningRef.current) {
        await instRef.current.stop();
        runningRef.current = false;
        return true;
      }
    } catch (e) {
      console.debug("safePause ignored:", e?.message || e);
    }
    return false;
  }, []);

  const safeResume = useCallback(async () => {
    if (!instRef.current) return false;
    try {
      if (pausedRef.current && typeof instRef.current.resume === "function") {
        await instRef.current.resume();
        pausedRef.current = false;
        return true;
      }
      if (!runningRef.current && typeof instRef.current.start === "function" && mountRef.current) {
        await instRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 300, height: 300 } },
          onScanSuccess,
          onScanFailure
        );
        runningRef.current = true;
        pausedRef.current = false;
        return true;
      }
    } catch (e) {
      console.debug("safeResume ignored:", e?.message || e);
    }
    return false;
  }, []);

  function makeCheckinBody(payload) {
    const b = { qr_payload: payload || {} };
    const sidRaw = payload?.shift_id ?? payload?.shift ?? payload?.shiftId ?? payload?.id ?? null;
    if (sidRaw !== null && sidRaw !== undefined && String(sidRaw).trim() !== "") {
      const sidNum = Number(sidRaw);
      b.shift_id = Number.isFinite(sidNum) ? sidNum : sidRaw;
    }
    return b;
  }

  // helper to build human-friendly success details and set message
  function setSuccessFromResponse(data) {
    // data may contain: premise / premise_name / shift_id / check_in_time / assignment
    const premiseName = (data.premise && (data.premise.name || data.premise.title)) || data.premise_name || data.premiseName || null;
    const shiftId = data.shift_id || data.shift?.id || data.assigned_shift_id || null;
    const checkInTime = data.check_in_time || data.checked_in_at || data.checked_at || null;
    const assigned = data.assigned === true || data.assignment || false;

    let text;
    if (premiseName) text = `Checked in successfully to ${premiseName}.`;
    else if (assigned && data.assignment && data.assignment.premise_name) text = `Assigned & checked in to ${data.assignment.premise_name}.`;
    else text = "Checked in successfully.";

    const details = {
      premise_name: premiseName,
      shift_id: shiftId,
      check_in_time: checkInTime,
      assignment: data.assignment || (assigned ? data : null),
    };

    setMessage({ type: "success", text, details });
  }

  async function onScanSuccess(decodedText, decodedResult) {
    try {
      await safePause();
    } catch (e) {
      console.debug("pause on success ignored:", e?.message || e);
    }

    setShowForceOption(false);
    setMessage({ type: "info", text: `Scanned: ${String(decodedText).slice(0, 200)}` });
    setRawText(String(decodedText));

    let payload = null;
    try {
      payload = JSON.parse(decodedText);
    } catch (e) {
      const m = decodedText.match(/(\d{1,6})/);
      if (m) payload = { id: Number(m[1]) };
      else payload = { raw: decodedText };
    }

    const bodyBase = makeCheckinBody(payload);

    try {
      if (navigator.geolocation) {
        const pos = await new Promise((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 });
        });
        bodyBase.check_in_lat = pos.coords.latitude;
        bodyBase.check_in_lng = pos.coords.longitude;
      }
    } catch (e) {
      // ignore
    }

    console.debug("Checkin body:", bodyBase);

    try {
      const res = await api.post("/attendance/checkin/", bodyBase);
      // prefer res.data if available
      const data = res?.data ?? {};
      // Use the structured handler to set a success message with premise name etc.
      setSuccessFromResponse(data);

      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 1400);
    } catch (err) {
      const server = err?.response?.data;
      if (server) {
        // If backend sends helpful info (e.g. premise, shift), attempt to include it even on error
        const premiseName = server?.premise?.name || server?.premise_name || server?.premiseName || null;
        if (Array.isArray(server.detail) && server.detail.length > 0) {
          setMessage({ type: "error", text: server.detail.join(" "), details: { premise_name: premiseName } });
          const joined = server.detail.join(" ").toLowerCase();
          if (joined.includes("outside allowed window")) setShowForceOption(true);
        } else if (server.message) {
          setMessage({ type: "error", text: server.message, details: { premise_name: premiseName } });
        } else {
          setMessage({ type: "error", text: JSON.stringify(server), details: { premise_name: premiseName } });
        }
      } else {
        setMessage({ type: "error", text: err?.message || "Check-in failed" });
      }

      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 2000);
    }
  }

  // Force check-in (backend must support `force`)
  async function handleForceCheckin() {
    let payload = null;
    if (rawText) {
      try { payload = JSON.parse(rawText); } catch (e) {
        const m = rawText.match(/(\d{1,6})/);
        if (m) payload = { id: Number(m[1]) };
        else payload = { raw: rawText };
      }
    }

    if (!payload) {
      setMessage({ type: "error", text: "No payload available to force check-in. Paste payload below and retry." });
      return;
    }

    const body = makeCheckinBody(payload);
    body.force = true;

    console.debug("Force checkin body:", body);

    try {
      const res = await api.post("/attendance/checkin/", body);
      const data = res?.data ?? {};
      setSuccessFromResponse(data);
      setShowForceOption(false);
      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 1200);
    } catch (err) {
      const server = err?.response?.data;
      setMessage({ type: "error", text: server ? JSON.stringify(server) : (err?.message || "Force check-in failed") });
      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 1800);
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!rawText) return setMessage({ type: "error", text: "Paste QR payload or enter shift id" });

    let payload = null;
    try {
      payload = JSON.parse(rawText);
    } catch (e) {
      const m = rawText.match(/(\d{1,6})/);
      if (m) payload = { id: Number(m[1]) };
      else payload = { raw: rawText };
    }

    const body = makeCheckinBody(payload);
    console.debug("Manual checkin body:", body);

    try {
      const res = await api.post("/attendance/checkin/", body);
      const data = res?.data ?? {};
      setSuccessFromResponse(data);
    } catch (err) {
      const server = err?.response?.data;
      if (server && Array.isArray(server.detail)) {
        setMessage({ type: "error", text: server.detail.join(" "), details: {} });
        const joined = server.detail.join(" ").toLowerCase();
        if (joined.includes("outside allowed window")) setShowForceOption(true);
      } else {
        setMessage({ type: "error", text: JSON.stringify(server || err?.message), details: {} });
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white p-4 rounded shadow">
      <h2 className="text-lg font-semibold mb-2">Scan QR - Guard Check-in</h2>

      <div id="qr-reader" ref={mountRef} style={{ width: "100%", height: 360 }} className="mb-3" />

      {/* Message area */}
      {message && message.type === "info" && (
        <div className="p-2 mb-3 bg-slate-100 text-slate-700 rounded">{message.text}</div>
      )}

      {message && message.type === "success" && (
        <div className="p-3 mb-3 rounded border bg-emerald-50 border-emerald-200">
          <div className="font-semibold text-emerald-800 mb-1">{message.text}</div>
          {/* details */}
          {message.details && (
            <div className="bg-white p-3 rounded border">
              <SmallInfoRow label="Premise" value={message.details.premise_name} />
              <SmallInfoRow label="Shift ID" value={message.details.shift_id ? `#${message.details.shift_id}` : null} />
              <SmallInfoRow label="Check-in time" value={
                message.details.check_in_time ? new Date(message.details.check_in_time).toLocaleString() : null
              } />
              {/* if backend returned assignment object show it */}
              {message.details.assignment && (
                <>
                  <div className="text-xs text-slate-500 mt-2 mb-1">Assignment details</div>
                  <SmallInfoRow label="Assigned guard" value={message.details.assignment.guard_username || message.details.assignment.assigned_guard_id} />
                  <SmallInfoRow label="Assignment score" value={message.details.assignment.score ?? null} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {message && message.type === "error" && (
        <div className="p-2 mb-3 rounded bg-rose-50 text-rose-700 border border-rose-100">
          <div className="font-semibold">Check-in failed</div>
          <div className="text-sm mt-1">{message.text}</div>
          {message.details && message.details.premise_name && (
            <div className="text-xs mt-2 text-slate-500">Premise: {message.details.premise_name}</div>
          )}
        </div>
      )}

      {showForceOption && (
        <div className="mb-3">
          <div className="text-sm text-slate-600 mb-2">
            The backend rejected the check-in due to the attendance window. Retry with force (only use if permitted).
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleForceCheckin} className="px-3 py-2 bg-amber-600 text-white rounded">
              Retry with force
            </button>
            <button type="button" onClick={() => setShowForceOption(false)} className="px-3 py-2 bg-slate-100 rounded">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <h4 className="font-medium">Manual / paste fallback</h4>
        <form onSubmit={handleManualSubmit}>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder='Paste QR JSON or shift id here'
            className="w-full border rounded p-2 mb-2"
            rows={4}
          />
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-2 bg-emerald-600 text-white rounded">Submit manual check-in</button>
            <button type="button" onClick={() => setRawText("")} className="px-3 py-2 bg-slate-100 rounded">Clear</button>
          </div>
        </form>
      </div>

      <div className="text-xs text-slate-400 mt-3">
        Tip: QR payload should contain an <code>id</code> or <code>uuid</code> matching the premise/shift or a <code>shift_id</code>.
      </div>
    </div>
  );
}