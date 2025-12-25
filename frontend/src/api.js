// src/api.js
import axios from "axios";

/**
 * Robust API client for Smart Guards frontend.
 * - Uses VITE_API_URL if set (e.g. http://localhost:8000/api)
 * - Attaches JWT access token automatically (searches a few keys)
 * - Exposes helpers: authHeaders, safeGet/post/put/delete
 * - Exposes getWebsocketUrl(path) helper to build ws/wss backend URLs including token.
 */

// default backend API base (development fallback)
const DEFAULT_BACKEND = "http://localhost:8000/api";

// prefer Vite env var, otherwise fallback
const BASE_URL = (import.meta && import.meta.env && import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL : DEFAULT_BACKEND;

console.info("[api] baseURL =", BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: false,
});

// helper: read access token from common locations (you can add your own key here)
export function getAccessToken() {
  try {
    // try common keys in order
    const keys = ["access", "token", "auth_token"];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
    // optionally try a JSON auth object
    const authJson = localStorage.getItem("auth");
    if (authJson) {
      try {
        const parsed = JSON.parse(authJson);
        if (parsed?.access) return parsed.access;
        if (parsed?.token) return parsed.token;
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // ignore localStorage errors
  }
  return null;
}

// attach token to every request if present
api.interceptors.request.use(
  (config) => {
    try {
      const token = getAccessToken();
      if (token) {
        config.headers = {
          ...(config.headers || {}),
          Authorization: `Bearer ${token}`,
        };
      }
    } catch (err) {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// response interceptor: dispatch unauthorized event for central handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    try {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        // broadcast event so AuthContext and other parts can react (logout, redirect)
        try { window.dispatchEvent(new CustomEvent("api:unauthorized", { detail: { status } })); } catch(e){}
      }
    } catch (e) {}
    return Promise.reject(err);
  }
);

// ---------- helpers ----------

export function authHeaders(token) {
  const t = token || getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function safeGet(path, token = null, opts = {}) {
  const headers = { ...(opts.headers || {}), ...authHeaders(token) };
  return api.get(path, { ...opts, headers });
}
export async function safePost(path, data = {}, token = null, opts = {}) {
  const headers = { ...(opts.headers || {}), ...authHeaders(token) };
  return api.post(path, data, { ...opts, headers });
}
export async function safePut(path, data = {}, token = null, opts = {}) {
  const headers = { ...(opts.headers || {}), ...authHeaders(token) };
  return api.put(path, data, { ...opts, headers });
}
export async function safeDelete(path, token = null, opts = {}) {
  const headers = { ...(opts.headers || {}), ...authHeaders(token) };
  return api.delete(path, { ...opts, headers });
}

// CSV helper (keeps old behaviour)
export function downloadCSV(rows = [], filename = "export.csv") {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          let v = row[h] ?? "";
          v = String(v).replace(/"/g, '""');
          return v.includes(",") || v.includes('"') ? `"${v}"` : v;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Build a websocket URL for the backend.
 * - If BASE_URL is "http://host:port/api" this returns "ws://host:port" + path
 * - If BASE_URL uses https, it uses wss.
 * - `path` should start with "/" and is appended directly (eg "/ws/assignments/").
 * - If tokenExists is true (default) the function will append ?token=<JWT> (or &token=... if query present).
 */
export function getWebsocketUrl(path = "/ws/", { tokenize = true } = {}) {
  // sanitize path
  if (!path.startsWith("/")) path = `/${path}`;
  // remove trailing "/api" from BASE_URL to get host root
  let hostRoot = BASE_URL.replace(/\/api\/?$/, "");
  // ensure protocol
  let wsProto;
  if (hostRoot.startsWith("https://")) wsProto = "wss://";
  else if (hostRoot.startsWith("http://")) wsProto = "ws://";
  else {
    // fallback to same host (relative)
    const loc = window.location;
    wsProto = (loc.protocol === "https:") ? "wss://" : "ws://";
    hostRoot = `${loc.hostname}${loc.port ? `:${loc.port}` : ""}`;
  }
  // strip proto from hostRoot
  hostRoot = hostRoot.replace(/^https?:\/\//, "");
  // compose
  let url = `${wsProto}${hostRoot}${path}`;
  if (tokenize) {
    const token = getAccessToken();
    if (token) {
      url += (url.includes("?") ? "&" : "?") + `token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}

export default api;
