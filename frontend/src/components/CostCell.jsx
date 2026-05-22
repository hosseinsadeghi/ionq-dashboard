import { usd } from "../lib/format.js";

// Three states match the backend's cost_status:
//   billed   - the job ran (status=completed); cost_usd is what was billed
//   pending  - submitted/ready/running/queued; quote will likely become real
//   canceled - canceled or failed; quote almost certainly not charged
const STYLES = {
  billed: {
    valueClass: "font-medium text-accent-mint",
    badge: null,
  },
  pending: {
    valueClass: "text-white",
    badge: {
      label: "pending",
      class: "bg-accent-amber/15 text-accent-amber border border-accent-amber/25",
      title:
        "Job has not finished. IonQ has computed a quote; it will become a real charge if the job executes.",
    },
  },
  canceled: {
    valueClass: "text-white/45 line-through decoration-white/20",
    badge: {
      label: "void",
      class: "bg-white/5 text-white/40 border border-white/10",
      title:
        "Job was canceled or failed. IonQ's quote stays attached for reference but is not normally charged.",
    },
  },
};

export default function CostCell({ cost, status }) {
  if (cost == null) return <span className="text-white/30">—</span>;
  const s = STYLES[status] || STYLES.pending;
  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      <span className={s.valueClass}>{usd(cost)}</span>
      {s.badge && (
        <span
          className={`rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider ${s.badge.class}`}
          title={s.badge.title}
        >
          {s.badge.label}
        </span>
      )}
    </span>
  );
}
