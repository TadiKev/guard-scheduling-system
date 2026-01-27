// frontend/src/pages/Allocation.jsx
import React, { useEffect, useState, useContext } from "react";
import api, { safeGet, safePost } from "../api";
import AuthContext from "../AuthContext";

/* ---------- Small presentational helpers (styling only) ---------- */
function Sparkle({ className = "h-4 w-4 inline-block" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2l1.8 3.9L17 7l-3 2 1 4-3-2-3 2 1-4-3-2 3.2-1.1L12 2z" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallIcon({ name, className = "h-5 w-5" }) {
  const common = { className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "site":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2l7 4v9a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3V6l7-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "guard":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 10c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "auto":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 12h18M7 12v6h10v-6M9 12V6h6v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
          <path d="M12 8v5l3 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

/* Fancy button used only for presentation */
function FancyButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-semibold transform transition hover:-translate-y-0.5 " +
        className
      }
    >
      {children}
    </button>
  );
}

/* ---------- Site card — styling only (keeps same props & click behavior) ---------- */
function SiteCard({ site, onSelect, selected }) {
  return (
    <div
      onClick={() => onSelect(site)}
      className={`p-4 border rounded-2xl cursor-pointer transition transform hover:-translate-y-1 hover:shadow-xl ${
        selected ? "ring-2 ring-emerald-300 bg-gradient-to-r from-emerald-50 to-white" : "bg-white/80 backdrop-blur-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500 uppercase tracking-wide font-medium flex items-center gap-2">
            <SmallIcon name="site" /> <span>{String(site.name ?? "Unnamed site")}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">{String(site.address ?? "")}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs px-2 py-1 rounded-full bg-white/60 shadow-inner text-slate-700">Req</div>
          <div className="text-xs text-slate-400">{(site.required_skills || "").split(",").slice(0, 3).join(", ") || "—"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-500">Open shifts: <span className="text-slate-700 font-semibold">{site.open_shifts ?? "—"}</span></div>
        {selected ? <div className="text-xs text-emerald-600 font-semibold">Selected ✓</div> : <div className="text-xs text-slate-400">Tap to select</div>}
      </div>
    </div>
  );
}

/* ---------- Allocation page (logic unchanged, styling upgraded) ---------- */
export default function AllocationPage() {
  const { token, logout } = useContext(AuthContext);
  const [sites, setSites] = useState([]);
  const [guards, setGuards] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [msg, setMsg] = useState(null);
  const [allocateResults, setAllocateResults] = useState(null);
  const [siteShifts, setSiteShifts] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const [s, g] = await Promise.allSettled([safeGet("/premises/"), safeGet("/guards/")]);
      if (s.status === "fulfilled") {
        const sdata = Array.isArray(s.value.data) ? s.value.data : (s.value.data && s.value.data.results ? s.value.data.results : []);
        // compute open_shifts quick count for visual
        const siteMap = sdata.map(site => ({ ...site, open_shifts: site.shifts?.filter(sh => !sh.assigned_guard)?.length ?? site.open_shifts ?? 0 }));
        setSites(siteMap);
      }
      if (g.status === "fulfilled") {
        const gdata = Array.isArray(g.value.data) ? g.value.data : (g.value.data && g.value.data.results ? g.value.data.results : []);
        setGuards(gdata);
      }
    } catch (err) {
      console.warn("allocation load failed", err);
      if (err?.response?.status === 401) logout();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetch shifts for selected site + date
  async function loadSiteShifts(site) {
    if (!site) {
      setSiteShifts([]);
      return;
    }
    try {
      const date = new Date().toISOString().slice(0, 10);
      const res = await safeGet(`/shifts/?premise=${site.id}&date=${date}`);
      const rows = Array.isArray(res.data) ? res.data : res.data && res.data.results ? res.data.results : [];
      const normalized = rows.map((s) => ({
        id: s.id,
        date: typeof s.date === "string" ? s.date : s.date && s.date.date ? s.date.date : String(s.date || ""),
        start_time: s.start_time && typeof s.start_time === "string" ? s.start_time : s.start_time ? String(s.start_time) : "",
        end_time: s.end_time && typeof s.end_time === "string" ? s.end_time : s.end_time ? String(s.end_time) : "",
        assigned_guard: s.assigned_guard || null,
      }));
      setSiteShifts(normalized);
    } catch (err) {
      console.warn("failed loading site shifts", err);
      setSiteShifts([]);
    }
  }

  useEffect(() => {
    loadSiteShifts(selectedSite);
  }, [selectedSite]);

  async function handleAssign(guardProfile) {
    if (!selectedSite) {
      setMsg({ type: "error", text: "Select a site first." });
      return;
    }
    setAssigning(true);
    setMsg(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const resShifts = await safeGet(`/shifts/?premise=${selectedSite.id}&date=${date}`);
      const rows = Array.isArray(resShifts.data) ? resShifts.data : resShifts.data && resShifts.data.results ? resShifts.data.results : [];
      const shift = rows[0] || null;
      if (!shift) {
        setMsg({ type: "error", text: "No shift found for selected site today." });
        setAssigning(false);
        return;
      }
      await api.post(`/shifts/${shift.id}/assign/`, { guard_id: guardProfile.user_id || guardProfile.user?.id });
      setMsg({ type: "success", text: `Assigned ${guardProfile.user?.username ?? guardProfile.user_id} to shift ${shift.id}` });
      await load();
      await loadSiteShifts(selectedSite);
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 401) return logout();
      const server = err?.response?.data || err?.message || "Assign failed";
      setMsg({ type: "error", text: typeof server === "string" ? server : JSON.stringify(server) });
    } finally {
      setAssigning(false);
    }
  }

  async function handleAutoAllocate() {
    if (!selectedSite) {
      setMsg({ type: "error", text: "Select a site first." });
      return;
    }
    setMsg(null);
    setAllocateResults(null);
    setAssigning(true);
    try {
      const payload = {
        premise_id: selectedSite.id,
        date: new Date().toISOString().slice(0, 10),
        limit_per_shift: 1,
      };
      const res = await safePost("/allocate/", payload);
      const data = res.data || { assignments: [], updated_shifts: [], count: 0 };
      setAllocateResults(data);
      setMsg({ type: "success", text: `${data.count ?? 0} assignment(s) performed` });
      await load();
      await loadSiteShifts(selectedSite);
    } catch (err) {
      console.error("Auto-allocate failed", err);
      if (err?.response?.status === 401) return logout();
      const server = err?.response?.data;
      setMsg({ type: "error", text: server ? (typeof server === "string" ? server : JSON.stringify(server)) : err?.message || "Auto-allocate failed" });
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Guards Allocation</h1>
            <p className="text-sm text-slate-500 mt-1">Match guards to site requirements using skill-based allocation</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-cyan-50 text-emerald-700 font-semibold shadow-sm">
                <SmallIcon name="clock" /> Live • <span className="ml-1 animate-pulse">●</span>
              </div>
              <div className="text-xs text-slate-400">Smart recommendations</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <FancyButton className="bg-white/90 ring-1 ring-slate-100">
              <SmallIcon name="site" />
              Browse sites
            </FancyButton>

            <FancyButton onClick={handleAutoAllocate} disabled={!selectedSite || assigning} className="bg-gradient-to-r from-indigo-600 to-cyan-500 text-white disabled:opacity-60">
              <SmallIcon name="auto" />
              {assigning ? "Allocating…" : "Auto-allocate best guards"}
            </FancyButton>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm p-5 rounded-3xl shadow-2xl border">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Sites requiring guards</h3>
              <div className="text-xs text-slate-400">Select a site</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {loading && <div className="text-sm text-slate-400 p-6">Loading…</div>}
              {!loading && sites.length === 0 && <div className="text-sm text-slate-400 p-6">No sites</div>}
              {sites.map((s) => (
                <SiteCard key={String(s.id)} site={s} onSelect={setSelectedSite} selected={selectedSite?.id === s.id} />
              ))}
            </div>

            {/* show shifts for selected site */}
            {selectedSite && (
              <div className="mt-6">
                <h4 className="font-semibold">Shifts for <span className="text-emerald-600">{selectedSite.name}</span> (today)</h4>
                <div className="mt-3 space-y-3">
                  {siteShifts.length === 0 && <div className="text-sm text-slate-400 p-4 rounded">No shifts for today</div>}
                  {siteShifts.map((s) => (
                    <div key={s.id} className="p-3 rounded-2xl border flex items-center justify-between bg-white/90 shadow-sm">
                      <div>
                        <div className="font-medium text-slate-800">Shift {s.id}</div>
                        <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
                      </div>
                      <div className="text-sm text-right">
                        {s.assigned_guard ? (
                          <div className="text-xs">Assigned: <strong className="text-slate-800">{s.assigned_guard.username}</strong></div>
                        ) : (
                          <div className="text-xs text-amber-600 font-semibold">Unassigned</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="bg-white/80 backdrop-blur-sm p-5 rounded-3xl shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Available guards</h3>
              <div className="text-xs text-slate-400">Search & filter</div>
            </div>

            <div className="text-sm text-slate-400 mb-3">Search and filter by skill (todo)</div>

            <div className="space-y-3 max-h-96 overflow-auto pr-2">
              {guards.length === 0 && <div className="text-sm text-slate-400">No guard profiles</div>}
              {guards.map((gp) => (
                <div key={String(gp.id)} className="p-3 border rounded-2xl flex items-center justify-between bg-white/90 shadow-sm">
                  <div>
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-emerald-100 text-emerald-700 shadow-inner">{(gp.user?.username || `G${gp.id}`)[0]?.toUpperCase()}</div>
                      <div>{gp.user?.username ?? `guard${gp.id}`}</div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{(gp.skills || "").split(",").slice(0, 4).join(", ") || "—"}</div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-2">
                    <div>
                      <button
                        disabled={!selectedSite || assigning}
                        onClick={() => handleAssign(gp)}
                        className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow hover:scale-[1.02] disabled:opacity-60"
                      >
                        Assign
                      </button>
                    </div>
                    <div className="text-xs text-slate-400">{gp.availability ?? ""}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <FancyButton onClick={handleAutoAllocate} disabled={!selectedSite || assigning} className="w-full bg-gradient-to-r from-indigo-600 to-cyan-500 text-white">
                <SmallIcon name="auto" /> Auto-allocate
              </FancyButton>

              {allocateResults && (
                <div className="mt-3 p-3 bg-white/70 rounded-xl text-sm border shadow-inner">
                  <div className="font-medium mb-2">Allocation results</div>
                  {Array.isArray(allocateResults.assignments) && allocateResults.assignments.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {allocateResults.assignments.map((a, i) => (
                        <li key={i}>{String(a.guard_username)} assigned to shift {String(a.shift_id)} (score: {String(a.score)})</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-slate-500">No assignments were made.</div>
                  )}

                  {Array.isArray(allocateResults.updated_shifts) && allocateResults.updated_shifts.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-slate-500 mb-1">Updated shifts</div>
                      <div className="space-y-1 text-sm">
                        {allocateResults.updated_shifts.map((us) => (
                          <div key={us.shift_id} className="p-2 border rounded">
                            Shift {us.shift_id} • {String(us.start_time || "")} - {String(us.end_time || "")}
                            <div className="text-xs text-slate-700">Assigned: {us.assigned_guard ? us.assigned_guard.username : "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {msg && (
                <div
                  className={`mt-3 p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}
                >
                  {String(msg.text)}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
