import { useEffect, useState } from "react";
import { Cpu, Clock, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../lib/api.js";
import { dur, dt, statusClass } from "../lib/format.js";

export default function Backends({ onOpenCalibration }) {
  const [backends, setBackends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.backends();
      setBackends(r.backends || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Backends</h1>
          <p className="text-sm text-white/40">
            Every QPU + simulator your key can target
          </p>
        </div>
        <button onClick={load} className="btn">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="glass border-accent-rose/30 p-4 text-sm text-accent-rose">
          {error}
        </div>
      )}

      {loading && backends.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-44" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {backends.map((b) => (
            <BackendCard
              key={b.name}
              backend={b}
              onOpen={() => onOpenCalibration(b.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BackendCard({ backend, onOpen }) {
  const isQpu = backend.name.startsWith("qpu.");
  return (
    <div className="glass glass-hover relative overflow-hidden p-5">
      {isQpu && (
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-accent-violet/20 to-transparent blur-2xl" />
      )}
      <div className="relative">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              {isQpu ? (
                <Cpu size={14} className="text-accent-violet" />
              ) : (
                <Sparkles size={14} className="text-accent-cyan" />
              )}
              <span className="text-[11px] uppercase tracking-wider text-white/40">
                {isQpu ? "QPU" : "Simulator"}
              </span>
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight">
              {backend.name}
            </div>
          </div>
          <span className={`pill ${statusClass(backend.status)}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {backend.status || "unknown"}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Qubits" value={backend.qubits ?? "—"} />
          <Field
            label="Avg queue"
            value={
              backend.average_queue_time != null
                ? dur(backend.average_queue_time)
                : "—"
            }
            icon={Clock}
          />
          <Field label="Access" value={backend.has_access === false ? "Restricted" : "Allowed"} />
          <Field
            label="Updated"
            value={backend.last_updated ? dt(backend.last_updated) : "—"}
          />
        </dl>

        {isQpu && (
          <button
            onClick={onOpen}
            className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 transition hover:border-accent-violet/40 hover:bg-white/5"
          >
            <span>View characterization</span>
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, icon: Icon }) {
  return (
    <div>
      <div className="label flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="mt-0.5 text-white">{value}</div>
    </div>
  );
}
