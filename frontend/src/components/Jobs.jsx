import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ArrowRight } from "lucide-react";
import { api } from "../lib/api.js";
import { num, usd, timeAgo, statusClass } from "../lib/format.js";

const STATUS_OPTIONS = [
  "",
  "submitted",
  "ready",
  "running",
  "completed",
  "canceled",
  "failed",
];

export default function Jobs({ onPickJob }) {
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.jobs({ status: status || undefined, limit }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, limit]);

  const rows = useMemo(() => {
    const jobs = data?.jobs || [];
    if (!query) return jobs;
    const q = query.toLowerCase();
    return jobs.filter((j) =>
      [j.id, j.name, j.backend, j.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, query]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-white/40">
            Browse, filter, and inspect every job submitted with this key
          </p>
        </div>
        <button onClick={load} className="btn">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="glass flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, id, backend, status…"
            className="input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input w-40"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s : "Any status"}
            </option>
          ))}
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="input w-28"
        >
          {[25, 50, 100, 250].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="glass border-accent-rose/30 p-4 text-sm text-accent-rose">
          {error}
        </div>
      )}

      <div className="glass overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-10" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Backend</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Shots</th>
                  <th className="px-4 py-3 font-medium text-right">Qubits</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => onPickJob(j.id)}
                    className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <div className="truncate font-medium text-white">
                        {j.name || (
                          <span className="text-white/40">untitled</span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-white/30">
                        {j.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/70">{j.backend || j.target || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`pill ${statusClass(j.status)}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {num(j.shots)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {num(j.qubits)}
                    </td>
                    <td className="px-4 py-3 text-right text-white/50">
                      {timeAgo(j.request || j.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ArrowRight size={14} className="inline text-white/30" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="py-12 text-center text-sm text-white/40">
                No jobs match these filters.
              </div>
            )}
          </div>
        )}
        {data?.next && (
          <div className="border-t border-white/5 p-3 text-center text-xs text-white/40">
            More pages exist. (Page-through via the API's <code className="rounded bg-white/5 px-1">next</code> token —
            implement in your own tools.)
          </div>
        )}
      </div>
    </div>
  );
}
