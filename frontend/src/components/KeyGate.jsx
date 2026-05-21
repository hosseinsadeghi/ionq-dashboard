import { useEffect, useState } from "react";
import {
  Key,
  ShieldCheck,
  ExternalLink,
  Eye,
  EyeOff,
  ServerCog,
  Database,
  RefreshCw,
} from "lucide-react";
import {
  setKey,
  getKey,
  setKeyName,
  getKeyName,
  clearAuth,
} from "../lib/api.js";

const MANUAL = "__manual__";

export default function KeyGate({ onUnlock }) {
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selected, setSelected] = useState(getKeyName() || "");
  const [manualKey, setManualKey] = useState(getKey());
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refreshSources = async () => {
    setLoadingSources(true);
    try {
      const res = await fetch("/api/key-sources");
      const body = await res.json();
      const list = body.sources || [];
      setSources(list);
      if (!selected && list.length) {
        // Default: IONQ_API_KEY if present, else the first one.
        const def =
          list.find((s) => s.name === "IONQ_API_KEY") || list[0];
        setSelected(def.name);
      } else if (!list.length && !selected) {
        setSelected(MANUAL);
      }
    } catch {
      setSources([]);
      setSelected(MANUAL);
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    refreshSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    let headers;
    if (selected && selected !== MANUAL) {
      setKeyName(selected);
      setKey("");
      headers = { "X-IonQ-Key-Name": selected };
    } else {
      const trimmed = manualKey.trim();
      if (!trimmed) {
        setError("Enter an IonQ API key.");
        return;
      }
      setKey(trimmed);
      setKeyName("");
      headers = { "X-IonQ-Key": trimmed };
    }

    setBusy(true);
    try {
      const res = await fetch("/api/whoami", { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(formatError(body, res.status));
      }
      onUnlock(await res.json());
    } catch (err) {
      setError(err.message || String(err));
      clearAuth();
    } finally {
      setBusy(false);
    }
  };

  const usingManual = selected === MANUAL || sources.length === 0;
  const activeSource = sources.find((s) => s.name === selected);

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950">
      <div className="absolute inset-0 bg-grid-fade" />
      <div className="absolute inset-0 bg-grid" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent-violet to-accent-cyan shadow-glow">
            <div className="h-4 w-4 rounded-full bg-ink-950" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">
              IonQ Dashboard
            </div>
            <div className="text-xs text-white/40">
              An open-source viewer for IonQ API keys
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="glass w-full p-7"
          autoComplete="off"
        >
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Key size={16} className="text-accent-violet" />
            Sign in with an IonQ API key
          </div>
          <p className="mb-5 text-xs text-white/50">
            Pick a key the server already knows about, or paste your own.
            Keys never leave this machine.
          </p>

          {/* Source selector */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label flex items-center gap-1.5">
                <Database size={11} /> Available keys
              </label>
              <button
                type="button"
                onClick={refreshSources}
                className="text-[11px] text-white/40 hover:text-white inline-flex items-center gap-1"
              >
                <RefreshCw size={10} /> rescan
              </button>
            </div>
            {loadingSources ? (
              <div className="skeleton h-11" />
            ) : (
              <select
                value={selected || MANUAL}
                onChange={(e) => setSelected(e.target.value)}
                className="input"
              >
                {sources.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} — {s.fingerprint} ({sourceLabel(s.source)})
                  </option>
                ))}
                <option value={MANUAL}>
                  ✎ Paste a key manually…
                </option>
              </select>
            )}
            {activeSource && !usingManual && (
              <div className="mt-1.5 truncate text-[11px] text-white/40">
                from <span className="font-mono">{activeSource.source}</span>
              </div>
            )}
            {sources.length === 0 && !loadingSources && (
              <div className="mt-1.5 text-[11px] text-white/40">
                No <span className="font-mono">IONQ_API_KEY*</span> entries
                found in the environment or known <span className="font-mono">.env</span>{" "}
                files. Paste a key below.
              </div>
            )}
          </div>

          {usingManual && (
            <>
              <label className="label mb-1.5 block">API key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="paste key here…"
                  className="input pr-11 font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-accent-rose/30 bg-accent-rose/10 px-3 py-2 text-xs leading-relaxed text-accent-rose">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary mt-5 w-full justify-center"
            disabled={busy}
          >
            {busy ? "Validating…" : "Unlock dashboard"}
          </button>

          <div className="mt-5 flex items-center justify-between text-xs text-white/40">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-accent-mint" />
              {usingManual ? "Stored in localStorage only" : "Resolved server-side"}
            </div>
            <a
              href="https://cloud.ionq.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-white"
            >
              Generate one <ExternalLink size={11} />
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function sourceLabel(src) {
  if (!src) return "";
  if (src === "environment") return "env";
  const parts = src.split("/");
  if (parts.length <= 2) return src;
  return `…/${parts.slice(-2).join("/")}`;
}

function formatError(body, status) {
  const d = body && body.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    const upstream =
      d.upstream_body && typeof d.upstream_body === "object"
        ? d.upstream_body.message ||
          d.upstream_body.error ||
          JSON.stringify(d.upstream_body)
        : d.upstream_body;
    return `IonQ ${d.upstream_status || status}${
      d.api_version ? ` (${d.api_version})` : ""
    }: ${upstream || "rejected"}${d.hint ? ` — ${d.hint}` : ""}`;
  }
  return `IonQ rejected the key (${status})`;
}
