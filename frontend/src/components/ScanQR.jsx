// frontend/src/components/ScanQR.jsx
import React, { useEffect, useRef, useState, useContext, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode"; // npm i html5-qrcode
import api from "../api";
import AuthContext from "../AuthContext";

/*
  Changes / fixes:
  - Maintain running/paused flags (runningRef, pausedRef) to avoid calling stop/pause/resume
    when scanner isn't in the expected state (prevents "Cannot stop, scanner is not running or paused." errors).
  - Wrap all scanner ops in try/catch and ignore known harmless library errors.
  - Expose a "Force check-in" retry if backend returns the "outside allowed window" message.
  - Prevent double starts by checking instRef.current.
  - Do not throw from lifecycle handlers (prevents React error boundary triggers).
*/

export default function ScanQR() {
  const { token } = useContext(AuthContext);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState(null);
  const [rawText, setRawText] = useState("");
  const [showForceOption, setShowForceOption] = useState(false);
  const instRef = useRef(null);           // Html5Qrcode instance
  const mountRef = useRef(null);          // dom node ref
  const runningRef = useRef(false);       // true when start() succeeded
  const pausedRef = useRef(false);        // true when paused
  const mountedRef = useRef(true);        // to check unmounted state

  useEffect(() => {
    mountedRef.current = true;
    async function startScanner() {
      try {
        if (!mountRef.current) return;
        // avoid double start
        if (instRef.current) return;

        const containerId = mountRef.current.id || `qr-reader-${Math.random().toString(36).slice(2,8)}`;
        mountRef.current.id = containerId;

        const html5QrCode = new Html5Qrcode(containerId);
        instRef.current = html5QrCode;

        // start scanning
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
          // If start fails (no camera or permission denied)
          runningRef.current = false;
          setScanning(false);
          setMessage({ type: "error", text: "Camera unavailable or permission denied. Use manual fallback below." });
          // ensure instance cleared
          try { await html5QrCode.clear(); } catch (_) {}
        }
      } catch (err) {
        // swallow lifecycle errors so React doesn't crash
        console.warn("startScanner error:", err);
      }
    }

    startScanner();

    return () => {
      // cleanup safely
      mountedRef.current = false;
      (async () => {
        try {
          if (instRef.current) {
            // only stop if we believe it's running
            if (runningRef.current && typeof instRef.current.stop === "function") {
              try {
                await instRef.current.stop();
              } catch (e) {
                // ignore known library errors (e.g., "Cannot stop, scanner is not running or paused.")
                console.debug("stop ignored:", e?.message || e);
              }
            }
            // always try to clear the DOM bindings
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
    // frequent parse failures are normal; ignore them silently in production
    // console.debug("scan failure", error);
  }

  // helper to safely pause scanner (if available)
  const safePause = useCallback(async () => {
    if (!instRef.current) return false;
    if (pausedRef.current) return true;
    try {
      if (typeof instRef.current.pause === "function" && runningRef.current) {
        await instRef.current.pause();
        pausedRef.current = true;
        return true;
      }
      // if pause not available, we try stop (and mark running=false)
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

  // helper to safely resume scanner (if available)
  const safeResume = useCallback(async () => {
    if (!instRef.current) return false;
    try {
      if (pausedRef.current && typeof instRef.current.resume === "function") {
        await instRef.current.resume();
        pausedRef.current = false;
        return true;
      }
      // if we previously stopped, try to start again (reusing mount id)
      if (!runningRef.current && typeof instRef.current.start === "function" && mountRef.current) {
        // restart using same callbacks
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

  async function onScanSuccess(decodedText, decodedResult) {
    // immediately avoid double-processing
    try {
      await safePause(); // graceful pause/stop
    } catch (e) {
      console.debug("pause on success ignored:", e?.message || e);
    }

    setShowForceOption(false);
    setMessage({ type: "info", text: `Scanned: ${String(decodedText).slice(0, 200)}` });

    // parse payload
    let payload = null;
    try {
      payload = JSON.parse(decodedText);
    } catch (e) {
      const m = decodedText.match(/(\d{1,6})/);
      if (m) payload = { id: Number(m[1]) };
      else payload = { raw: decodedText };
    }

    const bodyBase = {
      shift_id: payload.shift_id || payload.shift || null,
      qr_payload: payload,
    };

    // add geolocation if available
    try {
      if (navigator.geolocation) {
        const pos = await new Promise((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 });
        });
        bodyBase.check_in_lat = pos.coords.latitude;
        bodyBase.check_in_lng = pos.coords.longitude;
      }
    } catch (e) {
      // ignore geolocation errors
    }

    // perform check-in
    try {
      const res = await api.post("/attendance/checkin/", bodyBase);
      setMessage({ type: "success", text: "Checked in successfully." });
      // delay a bit then resume scanner
      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 1400);
    } catch (err) {
      // pick useful server message if present
      const server = err?.response?.data;
      if (server) {
        // If backend sends { detail: [...] } or similar, surface it
        if (Array.isArray(server.detail) && server.detail.length > 0) {
          setMessage({ type: "error", text: server.detail.join(" ") });
          // show force option when the failure is specifically about attendance window
          const joined = server.detail.join(" ").toLowerCase();
          if (joined.includes("outside allowed window") || joined.includes("outside the allowed window")) {
            setShowForceOption(true);
          }
        } else if (server.message) {
          setMessage({ type: "error", text: server.message });
        } else {
          setMessage({ type: "error", text: JSON.stringify(server) });
        }
      } else {
        setMessage({ type: "error", text: err?.message || "Check-in failed" });
      }

      // do not auto-resume immediately if error was critical; resume after a delay so user reads message
      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 2000);
    }
  }

  // allow user to attempt force check-in (useful during testing or when backend supports it)
  async function handleForceCheckin() {
    // attempt to parse whatever last message payload was (best-effort).
    // For clarity: this re-uses rawText if present, otherwise we ask user to paste payload.
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

    const body = {
      shift_id: payload.shift_id || payload.shift || null,
      qr_payload: payload,
      force: true
    };

    try {
      const res = await api.post("/attendance/checkin/", body);
      setMessage({ type: "success", text: "Force check-in succeeded." });
      setShowForceOption(false);
      setTimeout(() => {
        if (mountedRef.current) safeResume();
      }, 1200);
    } catch (err) {
      const server = err?.response?.data;
      setMessage({ type: "error", text: server ? JSON.stringify(server) : (err?.message || "Force check-in failed") });
      // resume scanner after short delay
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

    const body = { shift_id: payload.shift_id || payload.shift || null, qr_payload: payload };

    try {
      const res = await api.post("/attendance/checkin/", body);
      setMessage({ type: "success", text: "Manual check-in succeeded." });
    } catch (err) {
      const server = err?.response?.data;
      if (server && Array.isArray(server.detail)) {
        setMessage({ type: "error", text: server.detail.join(" ") });
        const joined = server.detail.join(" ").toLowerCase();
        if (joined.includes("outside allowed window")) setShowForceOption(true);
      } else {
        setMessage({ type: "error", text: JSON.stringify(server || err?.message) });
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white p-4 rounded shadow">
      <h2 className="text-lg font-semibold mb-2">Scan QR - Guard Check-in</h2>

      <div id="qr-reader" ref={mountRef} style={{ width: "100%", height: 360 }} className="mb-3" />

      {message && (
        <div
          className={`p-2 mb-3 ${message.type === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"} rounded`}
        >
          {message.text}
        </div>
      )}

      {showForceOption && (
        <div className="mb-3">
          <div className="text-sm text-slate-600 mb-2">The backend rejected the check-in due to attendance window. You can retry with force (only use if permitted).</div>
          <div className="flex gap-2">
            <button onClick={handleForceCheckin} className="px-3 py-2 bg-amber-600 text-white rounded">Retry with force</button>
            <button onClick={() => setShowForceOption(false)} className="px-3 py-2 bg-slate-100 rounded">Dismiss</button>
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
        Tip: QR payload should contain an `id` or `uuid` matching the premise/shift or a `shift_id`.
      </div>
    </div>
  );
}
