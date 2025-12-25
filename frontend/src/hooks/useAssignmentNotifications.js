// src/hooks/useAssignmentNotifications.js
import { useEffect, useRef } from "react";
import api, { getWebsocketUrl, safeGet, getAccessToken } from "../api";

/**
 * useAssignmentNotifications({ intervalMs = 15000, onData, onAuthError })
 * - onData(items) called with an array of assignment objects (newest first)
 * - onAuthError() called when a 401 is encountered (so host app can logout)
 */
export default function useAssignmentNotifications({ intervalMs = 15000, onData = () => {}, onAuthError = () => {} } = {}) {
  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);
  const reconnectRef = useRef({ attempts: 0, timer: null });
  const runningRef = useRef(true);

  async function pollOnce() {
    try {
      const res = await safeGet("/assignments/recent/");
      if (res && res.data && Array.isArray(res.data.assignments)) {
        onData(res.data.assignments);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        onAuthError();
      }
      // else ignore; onData remains unchanged
    }
  }

  function startPolling() {
    // immediate poll
    pollOnce();
    pollTimerRef.current = setInterval(pollOnce, intervalMs);
  }

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function startWebsocket() {
    stopWebsocket();

    const token = getAccessToken();
    if (!token) return;

    const url = getWebsocketUrl("/ws/assignments/", { tokenize: true });
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current.attempts = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data?.type === "assignment.created") {
            const payload = data.payload || data.assignment || data;
            // convert to array for onData (prepend)
            onData([payload]);
          }
        } catch (e) {
          // parse error, ignore
        }
      };

      ws.onerror = () => {
        // error: will trigger close; fallback to polling remains
      };

      ws.onclose = (ev) => {
        if (!runningRef.current) return;
        // If server closed with 4401 (unauth) call onAuthError
        if (ev && ev.code === 4401) {
          onAuthError();
          return;
        }
        // reconnect with exponential backoff
        reconnectRef.current.attempts += 1;
        const attempt = reconnectRef.current.attempts;
        const backoff = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 6)));
        reconnectRef.current.timer = setTimeout(() => {
          startWebsocket();
        }, backoff);
      };
    } catch (err) {
      // Could not create ws, ignore and rely on polling
    }
  }

  function stopWebsocket() {
    try {
      if (reconnectRef.current.timer) {
        clearTimeout(reconnectRef.current.timer);
        reconnectRef.current.timer = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
        wsRef.current = null;
      }
    } catch (e) {}
  }

  useEffect(() => {
    runningRef.current = true;
    // always start polling fallback
    startPolling();

    // if token present start websocket
    const token = getAccessToken();
    if (token) startWebsocket();

    // listen for login/logout via storage events or auth events
    function onStorage(e) {
      if (e.key === "access" || e.key === "auth") {
        stopWebsocket();
        const t = getAccessToken();
        if (t) startWebsocket();
      }
    }
    function onApiUnauthorized() {
      // backend says unauthorized
      onAuthError();
      stopWebsocket();
      stopPolling();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("api:unauthorized", onApiUnauthorized);

    return () => {
      runningRef.current = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("api:unauthorized", onApiUnauthorized);
      stopWebsocket();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // no return value needed; the hook works via callbacks
}
