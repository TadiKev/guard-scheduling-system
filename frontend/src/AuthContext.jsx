// src/AuthContext.jsx
import React, { createContext, useEffect, useState, useCallback } from "react";
import api from "./api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // initialize from localStorage so page refresh keeps auth
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem("access"); } catch (e) { return null; }
  });
  const [refresh, setRefresh] = useState(() => {
    try { return localStorage.getItem("refresh"); } catch (e) { return null; }
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Persist tokens to localStorage whenever they change
  useEffect(() => {
    try {
      if (token) localStorage.setItem("access", token);
      else localStorage.removeItem("access");
      if (refresh) localStorage.setItem("refresh", refresh);
      else localStorage.removeItem("refresh");
    } catch (e) {
      // ignore localStorage errors
    }
  }, [token, refresh]);

  // Centralized logout function (dispatches event BEFORE clearing tokens so other listeners stop)
  const logout = useCallback(() => {
    try { window.dispatchEvent(new Event("auth:logout")); } catch (e) {}
    // optional: call backend to revoke refresh token if you have that endpoint
    try {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
    } catch (e) {}
    setToken(null);
    setRefresh(null);
    setUser(null);
  }, []);

  // When backend reports unauthorized (api interceptor sends "api:unauthorized"), log out immediately
  useEffect(() => {
    function onApiUnauthorized() {
      // backend said token invalid/expired — log out
      logout();
    }
    window.addEventListener("api:unauthorized", onApiUnauthorized);
    return () => window.removeEventListener("api:unauthorized", onApiUnauthorized);
  }, [logout]);

  // Load user profile whenever token changes (so setToken triggers a fresh user load)
  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      // no token -> ensure user cleared
      if (!token) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        // api.get will use the token (api client reads from localStorage)
        const res = await api.get("/users/me/");
        if (!cancelled) {
          setUser(res.data);
        }
      } catch (err) {
        // If we get a 401/403, the api.interceptors will dispatch api:unauthorized event;
        // still, explicitly logout here to clean up local state.
        logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUser();
    return () => { cancelled = true; };
  }, [token, logout]);

  // Login: exchange credentials for tokens then load user. Dispatch auth:login after storing tokens
  async function loginWithCredentials(username, password) {
    setLoading(true);
    try {
      const res = await api.post("/token/", { username, password });
      const access = res.data?.access;
      const ref = res.data?.refresh;

      // write tokens immediately so api.get() can pick them up (getAccessToken reads localStorage)
      try {
        if (access) localStorage.setItem("access", access);
        if (ref) localStorage.setItem("refresh", ref);
      } catch (e) {}

      // update state
      setToken(access || null);
      setRefresh(ref || null);

      // notify listeners that auth is available (assignment notifier will start)
      try { window.dispatchEvent(new Event("auth:login")); } catch (e) {}

      // load user profile
      try {
        const meRes = await api.get("/users/me/");
        setUser(meRes.data);
      } catch (e) {
        // If /users/me fails we still keep tokens but user stays null
        setUser(null);
      }
      setLoading(false);
      return { ok: true };
    } catch (err) {
      setLoading(false);
      // bubble up error for UI to show message
      const message = err?.response?.data || err?.message || "Login failed";
      return { ok: false, error: message };
    }
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        refresh,
        user,
        loginWithCredentials,
        logout,
        loading,
        setUser, // exported for advanced flows (admin impersonation etc.)
        setToken, // exported if you want to programmatically set token (e.g. refresh logic)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
