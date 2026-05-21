export function usd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  if (Math.abs(v) < 1) return `$${v.toFixed(3)}`;
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function num(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

export function dur(seconds) {
  if (seconds == null) return "—";
  const s = Number(seconds);
  if (!Number.isFinite(s)) return "—";
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m - h * 60}m`;
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const sign = diff < 0 ? "in " : "";
  const abs = Math.abs(diff);
  const ago = diff >= 0 ? " ago" : "";
  if (abs < 60) return `${sign}${Math.round(abs)}s${ago}`;
  if (abs < 3600) return `${sign}${Math.round(abs / 60)}m${ago}`;
  if (abs < 86400) return `${sign}${Math.round(abs / 3600)}h${ago}`;
  if (abs < 86400 * 30) return `${sign}${Math.round(abs / 86400)}d${ago}`;
  return d.toLocaleDateString();
}

export function dt(iso) {
  if (!iso) return "—";
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

export const STATUS_COLORS = {
  completed: "text-accent-mint border-accent-mint/30 bg-accent-mint/10",
  ready: "text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10",
  running: "text-accent-violet border-accent-violet/30 bg-accent-violet/10",
  submitted: "text-accent-indigo border-accent-indigo/30 bg-accent-indigo/10",
  queued: "text-accent-indigo border-accent-indigo/30 bg-accent-indigo/10",
  failed: "text-accent-rose border-accent-rose/30 bg-accent-rose/10",
  canceled: "text-white/60 border-white/15 bg-white/5",
  cancelled: "text-white/60 border-white/15 bg-white/5",
  available: "text-accent-mint border-accent-mint/30 bg-accent-mint/10",
  reserved: "text-accent-amber border-accent-amber/30 bg-accent-amber/10",
  unavailable: "text-accent-rose border-accent-rose/30 bg-accent-rose/10",
  retired: "text-white/40 border-white/10 bg-white/5",
  unknown: "text-white/50 border-white/10 bg-white/5",
};

export function statusClass(s) {
  return STATUS_COLORS[s] || STATUS_COLORS.unknown;
}
