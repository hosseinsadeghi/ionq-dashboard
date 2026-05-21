import { useState } from "react";
import { Key, ShieldCheck, ExternalLink, Eye, EyeOff } from "lucide-react";
import { setKey, getKey } from "../lib/api.js";

export default function KeyGate({ onUnlock }) {
  const [value, setValue] = useState(getKey());
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter an IonQ API key.");
      return;
    }
    setKey(trimmed);
    setBusy(true);
    try {
      const res = await fetch("/api/whoami", {
        headers: { "X-IonQ-Key": trimmed },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body && body.detail) || `IonQ rejected the key (${res.status})`
        );
      }
      onUnlock(await res.json());
    } catch (err) {
      setError(err.message || String(err));
      setKey("");
    } finally {
      setBusy(false);
    }
  };

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
            Sign in with your IonQ API key
          </div>
          <p className="mb-5 text-xs text-white/50">
            The key stays in your browser and is forwarded to a local proxy on
            each request. Nothing is logged or stored on the server.
          </p>

          <label className="label mb-1.5 block">API key</label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="apiKey …"
              className="input pr-11 font-mono"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"
              aria-label={show ? "Hide key" : "Show key"}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-accent-rose/30 bg-accent-rose/10 px-3 py-2 text-xs text-accent-rose">
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
              Stored in localStorage only
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
