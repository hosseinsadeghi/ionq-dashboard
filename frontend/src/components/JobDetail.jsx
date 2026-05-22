import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Copy, ExternalLink } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../lib/api.js";
import { usd, num, dur, dt, statusClass } from "../lib/format.js";

export default function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null);
  const [results, setResults] = useState(null);
  const [cost, setCost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, r, c] = await Promise.allSettled([
        api.job(jobId),
        api.jobResults(jobId),
        api.jobCost(jobId),
      ]);
      if (j.status === "fulfilled") setJob(j.value);
      else throw new Error(j.reason?.message || "could not load job");
      setResults(r.status === "fulfilled" ? r.value : null);
      setCost(c.status === "fulfilled" ? c.value : null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (loading && !job)
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="btn">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="skeleton h-24" />
        <div className="skeleton h-64" />
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn">
          <ArrowLeft size={14} /> Back
        </button>
        <button onClick={load} className="btn">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="glass border-accent-rose/30 p-4 text-sm text-accent-rose">
          {error}
        </div>
      )}

      {job && (
        <>
          <div className="glass p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-white/40">Job</div>
                <h1 className="text-xl font-semibold tracking-tight">
                  {job.name || (
                    <span className="text-white/40">untitled</span>
                  )}
                </h1>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-white/40">
                  {job.id}
                  <button
                    onClick={() => navigator.clipboard?.writeText(job.id)}
                    className="rounded p-0.5 hover:bg-white/5"
                    title="Copy"
                  >
                    <Copy size={11} />
                  </button>
                </div>
              </div>
              <span className={`pill ${statusClass(job.status)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {job.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
              <KV label="Backend" value={job.backend || job.target} />
              <KV label="Shots" value={num(job.shots)} />
              <KV label="Qubits" value={num(job.qubits)} />
              <KV
                label={costLabel(job.cost_status)}
                value={usd(
                  (typeof cost === "object" && (cost?.amount || cost?.usd)) ||
                    job.cost ||
                    job.actual_cost
                )}
                accent={job.cost_status === "billed"}
                muted={job.cost_status !== "billed"}
                hint={costHint(job.cost_status)}
              />
              <KV
                label="Predicted cost"
                value={usd(job.predicted_cost)}
              />
              <KV
                label="Execution time"
                value={dur(job.execution_time)}
              />
              <KV
                label="Predicted time"
                value={dur(job.predicted_execution_time)}
              />
              <KV
                label="Error mitigation"
                value={
                  job.error_mitigation?.debias === true
                    ? "Debiased"
                    : job.error_mitigation
                    ? "On"
                    : "Off"
                }
              />
              <KV label="Submitted" value={dt(job.request || job.created_at)} />
              <KV label="Completed" value={dt(job.response || job.completed_at)} />
              <KV label="Noise model" value={job.noise?.model || "—"} />
              <KV
                label="Gate counts"
                value={
                  job.gate_counts
                    ? Object.entries(job.gate_counts)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(" · ")
                    : "—"
                }
              />
            </div>
          </div>

          <ResultsBlock results={results} />

          <details className="glass group p-5 open:pb-5" open>
            <summary className="cursor-pointer list-none text-sm font-semibold text-white/80 transition group-hover:text-white">
              Raw job payload
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-ink-950/80 p-4 font-mono text-[11px] leading-relaxed text-white/70">
{JSON.stringify(job, null, 2)}
            </pre>
          </details>

          {cost && cost.available !== false && (
            <details className="glass group p-5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-white/80">
                Cost record (settled)
              </summary>
              <pre className="mt-3 overflow-auto rounded-xl bg-ink-950/80 p-4 font-mono text-[11px] text-white/70">
{JSON.stringify(cost, null, 2)}
              </pre>
            </details>
          )}
          {cost && cost.available === false && (
            <div className="glass p-4 text-xs text-white/50">
              <span className="text-white/70">Settled cost not available:</span>{" "}
              {cost.reason}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function costLabel(status) {
  if (status === "billed") return "Cost (billed)";
  if (status === "pending") return "Cost (pending)";
  if (status === "canceled") return "Cost (voided)";
  return "Cost";
}

function costHint(status) {
  if (status === "billed") return "Actual amount IonQ charged for this run.";
  if (status === "pending")
    return "IonQ's submission-time quote. Will become a real charge if the job executes.";
  if (status === "canceled")
    return "IonQ's quote stays attached for reference, but canceled/failed jobs are normally not charged.";
  return undefined;
}

function KV({ label, value, accent, muted, hint }) {
  const color = accent
    ? "font-semibold text-accent-mint"
    : muted
    ? "text-white/70"
    : "text-white";
  return (
    <div title={hint || undefined}>
      <div className="label">{label}</div>
      <div className={`mt-1 text-sm ${color}`}>{value ?? "—"}</div>
    </div>
  );
}

function ResultsBlock({ results }) {
  if (!results) return null;
  // IonQ results come back as a probability dict keyed by basis state (decimal or bitstring).
  const entries = extractProbabilities(results);
  if (!entries) {
    return (
      <details className="glass group p-5" open>
        <summary className="cursor-pointer list-none text-sm font-semibold">
          Results
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-ink-950/80 p-4 font-mono text-[11px] text-white/70">
{JSON.stringify(results, null, 2)}
        </pre>
      </details>
    );
  }
  const sorted = entries
    .map(([k, v]) => ({ state: k, probability: Number(v) }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 32);
  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Result distribution</div>
        <div className="text-xs text-white/40">
          {entries.length} basis state{entries.length === 1 ? "" : "s"} · top 32 shown
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2333" />
            <XAxis
              dataKey="state"
              stroke="#6b7280"
              fontSize={10}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={11}
              tickFormatter={(v) => (v <= 1 ? v.toFixed(2) : v)}
            />
            <Tooltip
              contentStyle={{
                background: "#0a0c14",
                border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => (v <= 1 ? v.toFixed(4) : v)}
            />
            <Bar
              dataKey="probability"
              fill="url(#barGrad)"
              radius={[4, 4, 0, 0]}
            />
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function extractProbabilities(results) {
  if (!results) return null;
  // Common shapes from IonQ:
  // { "0": 0.49, "1": 0.51 }
  // { histogram: {...} } or { probabilities: {...} } or { results: [{...}] }
  if (
    typeof results === "object" &&
    !Array.isArray(results) &&
    Object.values(results).every((v) => typeof v === "number")
  ) {
    return Object.entries(results);
  }
  for (const k of ["probabilities", "histogram", "counts", "data", "result"]) {
    if (results[k] && typeof results[k] === "object") {
      const e = Object.entries(results[k]);
      if (e.length && e.every(([, v]) => typeof v === "number")) return e;
    }
  }
  return null;
}
