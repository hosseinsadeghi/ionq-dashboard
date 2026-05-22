import { useEffect, useRef, useState } from "react";
import {
  Database,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  KeyRound,
} from "lucide-react";
import {
  api,
  setKey,
  setKeyName,
  getKey,
  getKeyName,
  hasAnyKey,
} from "../lib/api.js";

const MANUAL = "__manual__";

/**
 * Compact horizontal key picker for the top header. Loads server-known keys,
 * pre-selects the conventional one, validates against /api/whoami on every
 * change, and calls onChange() so the rest of the app re-fetches.
 */
export default function KeyPicker({ onChange }) {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState(() => {
    const name = getKeyName();
    if (name) return name;
    if (getKey()) return MANUAL;
    return "";
  });
  const [manualKey, setManualKey] = useState(getKey());
  const [showManual, setShowManual] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({ state: "idle" });
  const [whoami, setWhoami] = useState(null);
  const rootRef = useRef(null);

  const validate = async () => {
    if (!hasAnyKey()) {
      setStatus({ state: "idle" });
      setWhoami(null);
      onChange?.(null);
      return;
    }
    setStatus({ state: "checking" });
    try {
      const w = await api.whoami();
      setWhoami(w);
      setStatus({ state: "ok" });
      onChange?.(w);
    } catch (err) {
      setStatus({ state: "err", message: err.message || String(err) });
      setWhoami(null);
      onChange?.(null);
    }
  };

  const loadSources = async () => {
    try {
      const r = await api.keySources();
      const list = r.sources || [];
      setSources(list);
      if (!selected && list.length) {
        const def = list.find((s) => s.name === "IONQ_API_KEY") || list[0];
        setKeyName(def.name);
        setKey("");
        setSelected(def.name);
      }
    } catch {
      setSources([]);
    }
  };

  useEffect(() => {
    (async () => {
      await loadSources();
      validate();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target))
        setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const pickSource = (name) => {
    if (name === MANUAL) {
      setSelected(MANUAL);
      setShowManual(true);
      setKeyName("");
      return;
    }
    setSelected(name);
    setShowManual(false);
    setKeyName(name);
    setKey("");
    setOpen(false);
    setTimeout(validate, 0);
  };

  const submitManual = (e) => {
    e?.preventDefault();
    const trimmed = manualKey.trim();
    if (!trimmed) return;
    setKey(trimmed);
    setKeyName("");
    setSelected(MANUAL);
    setOpen(false);
    setTimeout(validate, 0);
  };

  const activeLabel = activeSourceLabel(selected, sources, manualKey);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-800/60 px-3 py-2 text-sm text-white/90 hover:border-accent-violet/40 hover:bg-white/5 transition"
      >
        <StatusDot status={status} />
        <KeyRound size={13} className="text-white/40" />
        <span className="max-w-[260px] truncate font-mono text-xs">
          {activeLabel || "Select IonQ key"}
        </span>
        {whoami?.api_version && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
            {whoami.api_version}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`text-white/40 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] origin-top-right rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="label flex items-center gap-1.5">
              <Database size={11} /> Available keys
            </div>
            <button
              onClick={() => loadSources().then(validate)}
              className="rounded p-1 text-white/30 hover:bg-white/5 hover:text-white"
              title="Rescan key sources and revalidate"
            >
              <RefreshCw size={11} />
            </button>
          </div>

          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {sources.length === 0 && (
              <div className="rounded-lg border border-white/5 px-3 py-3 text-center text-xs text-white/40">
                No <span className="font-mono">IONQ_API_KEY*</span> entries found
                in env or known <span className="font-mono">.env</span> files.
              </div>
            )}
            {sources.map((s) => {
              const active = selected === s.name;
              return (
                <button
                  key={s.name}
                  onClick={() => pickSource(s.name)}
                  className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                    active
                      ? "border-accent-violet/40 bg-gradient-to-r from-accent-violet/15 to-transparent"
                      : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <div className="mt-0.5">
                    {active ? (
                      <Check size={12} className="text-accent-mint" />
                    ) : (
                      <span className="block h-3 w-3 rounded-full border border-white/15" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-white">{s.name}</span>
                      <span className="font-mono text-[10px] text-white/40">
                        {s.fingerprint}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-white/40">
                      {sourceLabel(s.source)}
                    </div>
                  </div>
                </button>
              );
            })}

            <button
              onClick={() => pickSource(MANUAL)}
              className={`mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-left text-xs transition ${
                selected === MANUAL
                  ? "border-accent-violet/40 bg-accent-violet/5"
                  : "border-white/10 hover:bg-white/5"
              }`}
            >
              <span className="text-white/40">✎</span>
              <span className="text-white/70">Paste a key manually…</span>
            </button>
          </div>

          {showManual && (
            <form onSubmit={submitManual} className="mt-3 space-y-2 border-t border-white/5 pt-3">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="paste IonQ API key"
                  className="input py-1.5 pr-8 font-mono text-[11px]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 hover:text-white"
                >
                  {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <button type="submit" className="btn-primary w-full py-1.5 text-xs">
                Use this key
              </button>
            </form>
          )}

          {status.state === "ok" && whoami && (
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-white/40">
              <span>{whoami.qpus_visible} QPU · {whoami.backends_visible} backends</span>
              <span>API {whoami.api_version}</span>
            </div>
          )}
          {status.state === "err" && (
            <div className="mt-3 flex items-start gap-1.5 rounded border border-accent-rose/30 bg-accent-rose/10 p-2 text-[10px] leading-snug text-accent-rose">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span className="break-all">{status.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function activeSourceLabel(selected, sources, manualKey) {
  if (!selected) return "";
  if (selected === MANUAL) {
    if (!manualKey) return "Manual key";
    if (manualKey.length <= 8) return "•".repeat(manualKey.length);
    return `${manualKey.slice(0, 4)}…${manualKey.slice(-4)}`;
  }
  const s = sources.find((x) => x.name === selected);
  if (!s) return selected;
  return `${s.name} · ${s.fingerprint}`;
}

function sourceLabel(src) {
  if (!src) return "";
  if (src === "environment") return "env";
  const parts = src.split("/");
  if (parts.length <= 2) return src;
  return `…/${parts.slice(-2).join("/")}`;
}

function StatusDot({ status }) {
  if (status.state === "checking")
    return (
      <span
        title="Validating"
        className="h-2 w-2 animate-pulse rounded-full bg-accent-cyan"
      />
    );
  if (status.state === "ok")
    return (
      <span
        title="Key valid"
        className="grid h-3.5 w-3.5 place-items-center rounded-full bg-accent-mint/20 text-accent-mint"
      >
        <Check size={9} strokeWidth={3} />
      </span>
    );
  if (status.state === "err")
    return (
      <span
        title="Key rejected"
        className="grid h-3.5 w-3.5 place-items-center rounded-full bg-accent-rose/20 text-accent-rose"
      >
        <X size={9} strokeWidth={3} />
      </span>
    );
  return <span title="No key" className="h-2 w-2 rounded-full bg-white/15" />;
}
