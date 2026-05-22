import KeyPicker from "./KeyPicker.jsx";

const TITLES = {
  overview: "Overview",
  backends: "Backends",
  jobs: "Jobs",
  job: "Job detail",
  calibration: "Calibration",
};

export default function TopBar({ view, onKeyChange }) {
  return (
    <div className="sticky top-0 z-30 -mx-5 mb-6 border-b border-white/5 bg-ink-950/70 px-5 py-3 backdrop-blur-xl md:-mx-8 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-white/30">
            IonQ Dashboard
          </div>
          <div className="truncate text-sm font-semibold text-white">
            {TITLES[view] || ""}
          </div>
        </div>
        <KeyPicker onChange={onKeyChange} />
      </div>
    </div>
  );
}
