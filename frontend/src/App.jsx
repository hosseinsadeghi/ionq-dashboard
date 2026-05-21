import { useEffect, useState } from "react";
import KeyGate from "./components/KeyGate.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Overview from "./components/Overview.jsx";
import Backends from "./components/Backends.jsx";
import Jobs from "./components/Jobs.jsx";
import JobDetail from "./components/JobDetail.jsx";
import Calibration from "./components/Calibration.jsx";
import { api, getKey } from "./lib/api.js";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [whoami, setWhoami] = useState(null);
  const [view, setView] = useState("overview");
  const [jobId, setJobId] = useState(null);
  const [calBackend, setCalBackend] = useState(null);

  // Auto-unlock if a key is already in storage and still valid.
  useEffect(() => {
    if (!getKey()) return;
    api
      .whoami()
      .then((w) => {
        setWhoami(w);
        setUnlocked(true);
      })
      .catch(() => {});
  }, []);

  if (!unlocked) {
    return (
      <KeyGate
        onUnlock={(w) => {
          setWhoami(w);
          setUnlocked(true);
        }}
      />
    );
  }

  const openJob = (id) => {
    setJobId(id);
    setView("job");
  };
  const openCalibration = (name) => {
    setCalBackend(name);
    setView("calibration");
  };

  return (
    <div className="relative min-h-screen bg-ink-950">
      <div className="pointer-events-none fixed inset-0 bg-grid-fade" />
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />
      <div className="relative z-10 flex min-h-screen">
        <Sidebar
          view={view === "job" ? "jobs" : view}
          setView={(v) => {
            setView(v);
            setJobId(null);
          }}
          whoami={whoami}
          onLogout={() => {
            setUnlocked(false);
            setWhoami(null);
          }}
        />
        <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-7xl">
            {view === "overview" && <Overview onPickJob={openJob} />}
            {view === "backends" && (
              <Backends onOpenCalibration={openCalibration} />
            )}
            {view === "jobs" && <Jobs onPickJob={openJob} />}
            {view === "job" && jobId && (
              <JobDetail jobId={jobId} onBack={() => setView("jobs")} />
            )}
            {view === "calibration" && (
              <Calibration
                backendName={calBackend}
                onBackendChange={setCalBackend}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
