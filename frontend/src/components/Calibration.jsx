import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";
import { api } from "../lib/api.js";
import { dur, dt } from "../lib/format.js";

export default function Calibration({ backendName, onBackendChange }) {
  const [backends, setBackends] = useState([]);
  const [selected, setSelected] = useState(backendName);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.backends();
        const qpus = (r.backends || []).filter((b) =>
          b.name.startsWith("qpu.")
        );
        setBackends(qpus);
        if (!selected && qpus.length) {
          setSelected(qpus[0].name);
          onBackendChange?.(qpus[0].name);
        }
      } catch (e) {
        setError(e.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    api
      .characterization(selected)
      .then(setData)
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calibration</h1>
          <p className="text-sm text-white/40">
            Most recent device characterization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected || ""}
            onChange={(e) => {
              setSelected(e.target.value);
              onBackendChange?.(e.target.value);
            }}
            className="input w-56"
          >
            {backends.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => selected && api.characterization(selected).then(setData)}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="glass border-accent-rose/30 p-4 text-sm text-accent-rose">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="skeleton h-72" />
      ) : data ? (
        <Render data={data} />
      ) : (
        <div className="glass p-8 text-center text-sm text-white/40">
          Pick a QPU to inspect its characterization.
        </div>
      )}
    </div>
  );
}

function Render({ data }) {
  const fid = data.fidelity || {};
  const t = data.timing || {};
  const connectivity = data.connectivity;

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label flex items-center gap-1">
              <Activity size={11} /> Active characterization
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight">
              {data.backend || data.name || "—"}
            </div>
          </div>
          <div className="text-xs text-white/40">
            id: <span className="font-mono">{data.id || "—"}</span> · captured{" "}
            {dt(data.date || data.created_at)}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kv label="Qubits" value={data.qubits ?? "—"} />
          <Kv label="Connectivity" value={typeof connectivity === "string" ? connectivity : "all-to-all"} />
          <Kv label="T1" value={t.t1 != null ? dur(t.t1) : "—"} />
          <Kv label="T2" value={t.t2 != null ? dur(t.t2) : "—"} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <FidelityDial
          label="1Q gate fidelity"
          value={asFidelity(fid["1q"]) ?? asFidelity(fid.single_qubit)}
          color="#8b5cf6"
        />
        <FidelityDial
          label="2Q gate fidelity"
          value={asFidelity(fid["2q"]) ?? asFidelity(fid.two_qubit)}
          color="#22d3ee"
        />
        <FidelityDial
          label="SPAM fidelity"
          value={asFidelity(fid.spam)}
          color="#34d399"
        />
      </div>

      <div className="glass p-5">
        <div className="mb-3 text-sm font-semibold">Timing</div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kv label="1Q gate" value={t["1q"] != null ? dur(t["1q"]) : "—"} />
          <Kv label="2Q gate" value={t["2q"] != null ? dur(t["2q"]) : "—"} />
          <Kv label="readout" value={t.readout != null ? dur(t.readout) : "—"} />
          <Kv label="reset" value={t.reset != null ? dur(t.reset) : "—"} />
        </div>
      </div>

      <details className="glass group p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold">
          Raw characterization payload
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-ink-950/80 p-4 font-mono text-[11px] text-white/70">
{JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Kv({ label, value }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1 text-sm text-white">{value}</div>
    </div>
  );
}

function FidelityDial({ label, value, color }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, value * 100));
  const chartData = [{ name: label, value: pct ?? 0, fill: color }];
  return (
    <div className="glass p-5">
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <div className="relative h-44">
        {pct == null ? (
          <div className="grid h-full place-items-center text-sm text-white/40">
            not reported
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={chartData}
                startAngle={210}
                endAngle={-30}
              >
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  tick={false}
                />
                <RadialBar
                  background={{ fill: "#171b29" }}
                  dataKey="value"
                  cornerRadius={8}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-semibold tracking-tight" style={{ color }}>
                {pct.toFixed(2)}%
              </div>
              <div className="text-[11px] text-white/40">
                error {(100 - pct).toFixed(2)}%
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function asFidelity(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if (typeof v.mean === "number") return v.mean;
    if (typeof v.median === "number") return v.median;
    if (typeof v.value === "number") return v.value;
  }
  return null;
}
