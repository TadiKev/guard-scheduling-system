// src/pages/Allocation.jsx
import React, { useEffect, useState, useContext } from "react";
import api, { safeGet, safePost } from "../api";
import AuthContext from "../AuthContext";

function SiteCard({ site, onSelect, selected }) {
  return (
    <div
      className={`p-3 border rounded hover:shadow-sm cursor-pointer ${selected ? "ring-2 ring-emerald-300" : ""}`}
      onClick={() => onSelect(site)}
    >
      <div className="font-semibold">{String(site.name ?? "Unnamed site")}</div>
      <div className="text-xs text-slate-500">{String(site.address ?? "")}</div>
      <div className="text-xs text-slate-400 mt-2">Required: {(site.required_skills || "").split(",").slice(0,3).join(", ")}</div>
    </div>
  );
}

export default function AllocationPage() {
  const { token } = useContext(AuthContext);
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
      const [s, g] = await Promise.allSettled([
        safeGet("/premises/"),
        safeGet("/guards/")
      ]);
      if (s.status === "fulfilled") setSites(Array.isArray(s.value.data) ? s.value.data : []);
      if (g.status === "fulfilled") setGuards(Array.isArray(g.value.data) ? g.value.data : []);
    } catch (err) {
      console.warn("allocation load failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // fetch shifts for selected site + date
  async function loadSiteShifts(site) {
    if (!site) {
      setSiteShifts([]);
      return;
    }
    try {
      const date = new Date().toISOString().slice(0,10);
      const res = await safeGet(`/shifts/?premise=${site.id}&date=${date}`);
      const rows = Array.isArray(res.data) ? res.data : (res.data && res.data.results) ? res.data.results : [];
      // normalize shifts so we render strings not objects
      const normalized = rows.map(s => ({
        id: s.id,
        date: (typeof s.date === "string") ? s.date : (s.date && s.date.date) ? s.date.date : String(s.date || ""),
        start_time: (s.start_time && typeof s.start_time === "string") ? s.start_time : (s.start_time ? String(s.start_time) : ""),
        end_time: (s.end_time && typeof s.end_time === "string") ? s.end_time : (s.end_time ? String(s.end_time) : ""),
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
      const date = new Date().toISOString().slice(0,10);
      const resShifts = await safeGet(`/shifts/?premise=${selectedSite.id}&date=${date}`);
      const shift = (Array.isArray(resShifts.data) ? resShifts.data : (resShifts.data && resShifts.data.results ? resShifts.data.results : []))[0] || null;
      if (!shift) {
        setMsg({ type: "error", text: "No shift found for selected site today." });
        setAssigning(false);
        return;
      }
      // call assign endpoint on shift
      await api.post(`/shifts/${shift.id}/assign/`, { guard_id: guardProfile.user_id || guardProfile.user?.id });
      setMsg({ type: "success", text: `Assigned ${guardProfile.user?.username ?? guardProfile.user_id} to shift ${shift.id}` });
      // refresh
      await load();
      await loadSiteShifts(selectedSite);
    } catch (err) {
      console.error(err);
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
        date: new Date().toISOString().slice(0,10),
        limit_per_shift: 1
      };
      // use safePost so auth header is included
      const res = await safePost("/allocate/", payload);
      const data = res.data || { assignments: [], updated_shifts: [], count: 0 };
      setAllocateResults(data);
      setMsg({ type: "success", text: `${(data.count) ?? 0} assignment(s) performed` });
      // refresh site shifts so UI shows assigned_guard immediately
      await load();
      await loadSiteShifts(selectedSite);
    } catch (err) {
      console.error("Auto-allocate failed", err);
      const server = err?.response?.data;
      if (server) {
        setMsg({ type: "error", text: (typeof server === "string" ? server : JSON.stringify(server)) });
      } else {
        setMsg({ type: "error", text: err?.message || "Auto-allocate failed" });
      }
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold">Guards Allocation</h1>
        <p className="text-sm text-slate-500 mt-1">Match guards to site requirements using skill-based allocation</p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-4 rounded shadow">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Sites requiring guards</h3>
              <div className="text-xs text-slate-400">Select a site</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loading && <div className="text-sm text-slate-400 p-4">Loading…</div>}
              {!loading && sites.length === 0 && <div className="text-sm text-slate-400 p-4">No sites</div>}
              {sites.map(s => <SiteCard key={String(s.id)} site={s} onSelect={setSelectedSite} selected={selectedSite?.id === s.id} />)}
            </div>

            {/* show shifts for selected site */}
            {selectedSite && (
              <div className="mt-4">
                <h4 className="font-semibold">Shifts for {selectedSite.name} (today)</h4>
                <div className="mt-2 space-y-2">
                  {siteShifts.length === 0 && <div className="text-sm text-slate-400">No shifts for today</div>}
                  {siteShifts.map(s => (
                    <div key={s.id} className="p-2 border rounded flex items-center justify-between">
                      <div>
                        <div className="font-medium">Shift {s.id}</div>
                        <div className="text-xs text-slate-500">{s.date} • {s.start_time} - {s.end_time}</div>
                      </div>
                      <div className="text-sm">
                        {s.assigned_guard ? (
                          <div className="text-xs">Assigned: <strong>{s.assigned_guard.username}</strong></div>
                        ) : (
                          <div className="text-xs text-amber-600">Unassigned</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Available guards</h3>
            <div className="text-sm text-slate-400 mb-3">Search and filter by skill (todo)</div>

            <div className="space-y-2 max-h-96 overflow-auto">
              {guards.length === 0 && <div className="text-sm text-slate-400">No guard profiles</div>}
              {guards.map(gp => (
                <div key={String(gp.id)} className="p-2 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{gp.user?.username ?? `guard${gp.id}`}</div>
                    <div className="text-xs text-slate-500">{(gp.skills || "").split(",").slice(0,4).join(", ")}</div>
                  </div>
                  <div className="text-right">
                    <button disabled={!selectedSite || assigning} onClick={() => handleAssign(gp)} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded">
                      Assign
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <button onClick={handleAutoAllocate} disabled={!selectedSite || assigning} className="w-full px-3 py-2 bg-indigo-600 text-white rounded">
                {assigning ? "Allocating…" : "Auto-allocate best guards"}
              </button>

              {allocateResults && (
                <div className="mt-3 p-3 bg-slate-50 rounded text-sm">
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

                  {/* show updated shifts returned by server if present */}
                  {Array.isArray(allocateResults.updated_shifts) && allocateResults.updated_shifts.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-slate-500 mb-1">Updated shifts</div>
                      <div className="space-y-1 text-sm">
                        {allocateResults.updated_shifts.map((us) => (
                          <div key={us.shift_id} className="p-2 border rounded">
                            Shift {us.shift_id} • {String(us.start_time || "")} - {String(us.end_time || "")}
                            <div className="text-xs text-slate-700">
                              Assigned: {us.assigned_guard ? us.assigned_guard.username : "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {msg && <div className={`mt-3 text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>{String(msg.text)}</div>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
