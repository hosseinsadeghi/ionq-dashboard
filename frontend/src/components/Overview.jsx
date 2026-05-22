import { useEffect, useState } from "react";
import {
  Coins,
  Cpu,
  CircleDot,
  Hash,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { api } from "../lib/api.js";
import { usd, num, dur, timeAgo, statusClass } from "../lib/format.js";
import CostCell from "./CostCell.jsx";

const STATUS_PALETTE = {
  completed: "#34d399",
  ready: "#22d3ee",
  running: "#8b5cf6",
  submitted: "#6366f1",
  queued: "#6366f1",
  failed: "#f43f5e",
  canceled: "#9ca3af",
  cancelled: "#9ca3af",
  unknown: "#6b7280",
};
const palette = (k) => STATUS_PALETTE[k] || "#a78bfa";

export default function Overview({ onPickJob }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.summary());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) return <LoadingSkeleton />;
  if (error)
    return (
      <ErrorBlock message={error} onRetry={load} />
    );
  if (!data) return null;

  const t = data.totals;
  const statusData = Object.entries(data.status_counts || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const backendData = Object.entries(data.backend_counts || {})
    .map(([name, value]) => ({
      name: shortBackend(name),
      jobs: value,
      billed: data.backend_billed_usd?.[name] || 0,
      quoted: data.backend_quoted_usd?.[name] || 0,
    }))
    .sort(
      (a, b) =>
        b.billed + b.quoted - (a.billed + a.quoted) || b.jobs - a.jobs
    );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-white/40">
            Aggregated across {num(t.jobs_seen)} jobs
            {t.truncated ? " (truncated — older jobs not loaded)" : ""}
          </p>
        </div>
        <button onClick={load} className="btn">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Billed"
          value={
            <span className="text-accent-mint">
              {usd(t.billed_spend_usd)}
            </span>
          }
          sub={`completed jobs only · quoted ${usd(t.quoted_spend_usd)}`}
          subTitle="Cost only confirmed for jobs with status=completed. Other rows show IonQ's submission-time quote, which is not necessarily billed."
          icon={Coins}
          tint="from-accent-mint/30 to-transparent"
        />
        <StatCard
          label="Jobs seen"
          value={num(t.jobs_seen)}
          sub={`${num(t.completed)} completed · ${num(t.failed_or_canceled)} failed`}
          icon={Hash}
          tint="from-accent-indigo/30 to-transparent"
        />
        <StatCard
          label="Shots executed"
          value={num(t.total_shots)}
          icon={CircleDot}
          tint="from-accent-cyan/25 to-transparent"
        />
        <StatCard
          label="Backends visible"
          value={num((data.backends || []).length)}
          sub={`${(data.backends || []).filter((b) => b.name.startsWith("qpu.")).length} QPUs`}
          icon={Cpu}
          tint="from-accent-mint/25 to-transparent"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass lg:col-span-2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Daily activity</div>
            <div className="flex items-center gap-3 text-[11px] text-white/40">
              <Swatch color="#34d399" label="billed" />
              <Swatch color="#a78bfa" label="quoted" />
              <Swatch color="#22d3ee" label="jobs (count)" />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2333" />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#0a0c14",
                    border: "1px solid rgba(139,92,246,0.3)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v, k) =>
                    k === "jobs" ? num(v) : usd(v)
                  }
                />
                <Bar
                  dataKey="billed"
                  stackId="cost"
                  fill="#34d399"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="quoted"
                  stackId="cost"
                  fill="#a78bfa"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="jobs" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass p-5">
          <div className="mb-3 text-sm font-semibold">Job status mix</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {statusData.map((s) => (
                    <Cell key={s.name} fill={palette(s.name)} stroke="#0a0c14" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0a0c14",
                    border: "1px solid rgba(139,92,246,0.3)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass lg:col-span-2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Recent jobs</div>
            <span className="text-xs text-white/40">{data.recent_jobs.length} shown</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="py-2 pr-3 font-medium">Name / ID</th>
                  <th className="py-2 pr-3 font-medium">Backend</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Shots</th>
                  <th className="py-2 pr-3 font-medium text-right">Cost</th>
                  <th className="py-2 pr-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_jobs.slice(0, 10).map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => onPickJob && onPickJob(j.id)}
                    className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.03]"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="truncate text-white">
                        {j.name || (
                          <span className="text-white/40">untitled</span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-white/30">{j.id}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-white/70">{shortBackend(j.backend)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`pill ${statusClass(j.status)}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{num(j.shots)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <CostCell cost={j.cost} isQuote={j.cost_is_quote} />
                    </td>
                    <td className="py-2.5 pr-3 text-right text-white/50">{timeAgo(j.request_epoch || j.request)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.recent_jobs.length === 0 && (
              <div className="py-10 text-center text-sm text-white/40">
                No jobs visible on this key yet.
              </div>
            )}
          </div>
        </div>

        <div className="glass p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Spend by backend</div>
            <div className="flex items-center gap-2 text-[10px] text-white/40">
              <Swatch color="#34d399" label="billed" />
              <Swatch color="#a78bfa" label="quoted" />
            </div>
          </div>
          <div className="space-y-3">
            {backendData.length === 0 && (
              <div className="text-sm text-white/40">No backend usage yet.</div>
            )}
            {backendData.map((b) => {
              const max =
                Math.max(
                  ...backendData.map((x) => (x.billed || 0) + (x.quoted || 0))
                ) || 1;
              const billedPct = (b.billed / max) * 100;
              const quotedPct = (b.quoted / max) * 100;
              return (
                <div key={b.name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/70">{b.name}</span>
                    <span className="tabular-nums text-white/50">
                      <span className="text-accent-mint">{usd(b.billed)}</span>
                      {b.quoted > 0 && (
                        <>
                          {" "}+ <span className="text-accent-violet">{usd(b.quoted)}</span>
                        </>
                      )}
                      <span className="text-white/30"> · {num(b.jobs)}j</span>
                    </span>
                  </div>
                  <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-white/5">
                    {b.billed > 0 && (
                      <div
                        className="h-full bg-accent-mint"
                        style={{ width: `${billedPct}%` }}
                      />
                    )}
                    {b.quoted > 0 && (
                      <div
                        className="h-full bg-accent-violet/70"
                        style={{ width: `${quotedPct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, subTitle, icon: Icon, tint }) {
  return (
    <div className={`glass relative overflow-hidden p-5`}>
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${tint} blur-2xl`}
      />
      <div className="relative">
        <div className="mb-2 flex items-center gap-2 text-xs text-white/40">
          <Icon size={14} /> {label}
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && (
          <div
            className="mt-1 text-[11px] text-white/40"
            title={subTitle || undefined}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function Swatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="h-2 w-2 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-8 w-40" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}

function ErrorBlock({ message, onRetry }) {
  return (
    <div className="glass flex items-start gap-3 border-accent-rose/30 p-5">
      <AlertTriangle className="mt-0.5 text-accent-rose" size={18} />
      <div className="flex-1">
        <div className="font-semibold text-accent-rose">Couldn't load summary</div>
        <div className="mt-1 text-sm text-white/60">{message}</div>
        <button className="btn mt-3" onClick={onRetry}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    </div>
  );
}

function shortBackend(name) {
  if (!name) return "?";
  return name.replace(/^ionq[._]?/, "").replace(/^qpu\./, "qpu.");
}
