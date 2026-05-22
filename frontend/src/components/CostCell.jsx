import { usd } from "../lib/format.js";

// IonQ populates cost_usd at submission as a deterministic quote under the
// quantum_compute_time model. It only becomes a settled charge once the job
// is "completed" — for any other status the same number is a quote that
// IonQ may never have actually invoiced.
export default function CostCell({ cost, isQuote }) {
  if (cost == null) return <span className="text-white/30">—</span>;
  if (isQuote) {
    return (
      <span className="inline-flex items-baseline gap-1 tabular-nums">
        <span className="text-white/60">{usd(cost)}</span>
        <span
          className="rounded bg-white/5 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40"
          title="Quoted at submission, not necessarily charged. IonQ only confirms billing for status=completed."
        >
          quote
        </span>
      </span>
    );
  }
  return (
    <span className="tabular-nums font-medium text-accent-mint">
      {usd(cost)}
    </span>
  );
}
