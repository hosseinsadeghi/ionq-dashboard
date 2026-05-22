import {
  LayoutDashboard,
  Server,
  Activity,
  ListChecks,
} from "lucide-react";
import KeyPicker from "./KeyPicker.jsx";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "backends", label: "Backends", icon: Server },
  { id: "jobs", label: "Jobs", icon: ListChecks },
  { id: "calibration", label: "Calibration", icon: Activity },
];

export default function Sidebar({ view, setView, onKeyChange }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-ink-900/60 p-4 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent-violet to-accent-cyan shadow-glow">
          <div className="h-3.5 w-3.5 rounded-full bg-ink-950" />
        </div>
        <div className="text-sm font-semibold tracking-tight">
          IonQ Dashboard
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-gradient-to-r from-accent-violet/20 to-transparent text-white border border-accent-violet/30"
                  : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto">
        <KeyPicker onChange={onKeyChange} />
      </div>
    </aside>
  );
}
