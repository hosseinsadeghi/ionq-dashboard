import { useEffect, useState } from "react";
import {
  Database,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import {
  api,
  setKey,
  setKeyName,
  getKey,
  getKeyName,
  fingerprint,
  hasAnyKey,
} from "../lib/api.js";

const MANUAL = "__manual__";

/**
 * Compact live key picker. Lives in the sidebar. Loads server-known keys,
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
  const [status, setStatus] = useState({ state: "idle" }); // idle|checking|ok|err
  const [whoami, setWhoami] = useState(null);

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
      // First-time auto-pick if user hasn't chosen anything yet.
      if (!selected && list.length) {
        const def =
          list.find((s) => s.name === "IONQ_API_KEY") || list[0];
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

  const pickSource = (name) => {
    if (name === MANUAL) {
      setSelected(MANUAL);
      setShowManual(true);
      setKeyName("");
      // keep manualKey value so user can edit
      return;
    }
    setSelected(name);
    setShowManual(false);
    setKeyName(name);
    setKey("");
    setTimeout(validate, 0);
  };

  const submitManual = (e) => {
    e?.preventDefault();
    const trimmed = manualKey.trim();
    if (!trimmed) return;
    setKey(trimmed);
    setKeyName("");
    setSelected(MANUAL);
    setTimeout(validate, 0);
  };

  return (
    <div className="glass p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="label flex items-center gap-1">
          <Database size={11} /> IonQ key
        </div>
        <div className="flex items-center gap-1">
          <StatusDot status={status} />
          <button
            onClick={() => loadSources().then(validate)}
            className="rounded p-1 text-white/30 hover:bg-white/5 hover:text-white"
            title="Rescan key sources and revalidate"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <select
        value={selected || ""}
        onChange={(e) => pickSource(e.target.value)}
        className="input py-1.5 text-xs"
      >
        {sources.length === 0 && !selected && (
          <option value="">No keys discovered</option>
        )}
        {sources.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name} — {s.fingerprint}
          </option>
        ))}
        <option value={MANUAL}>✎ Paste a key…</option>
      </select>

      {showManual && (
        <form onSubmit={submitManual} className="mt-2 space-y-1">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
              placeholder="paste key"
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
          <button type="submit" className="btn-primary w-full py-1 text-xs">
            Use key
          </button>
        </form>
      )}

      {status.state === "ok" && whoami && (
        <div className="mt-2 text-[10px] text-white/40">
          {fingerprint(whoami.key_fingerprint?.replace(/[^a-zA-Z0-9…]/g, "") || "")
            ? ""
            : ""}
          {whoami.qpus_visible}q · {whoami.backends_visible}b
          {whoami.api_version ? ` · ${whoami.api_version}` : ""}
        </div>
      )}
      {status.state === "err" && (
        <div className="mt-2 flex items-start gap-1 rounded border border-accent-rose/30 bg-accent-rose/10 p-1.5 text-[10px] leading-snug text-accent-rose">
          <AlertTriangle size={10} className="mt-0.5 shrink-0" />
          <span className="break-all">{status.message}</span>
        </div>
      )}
    </div>
  );
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
