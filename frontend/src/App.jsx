import { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Overview from "./components/Overview.jsx";
import Backends from "./components/Backends.jsx";
import Jobs from "./components/Jobs.jsx";
import JobDetail from "./components/JobDetail.jsx";
import Calibration from "./components/Calibration.jsx";

export default function App() {
  const [view, setView] = useState("overview");
  const [jobId, setJobId] = useState(null);
  const [calBackend, setCalBackend] = useState(null);
  // Bump on every key change so all child views remount and re-fetch.
  const [keyEpoch, setKeyEpoch] = useState(0);

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
          onKeyChange={() => setKeyEpoch((n) => n + 1)}
        />
        <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-7xl">
            {view === "overview" && (
              <Overview key={`o-${keyEpoch}`} onPickJob={openJob} />
            )}
            {view === "backends" && (
              <Backends
                key={`b-${keyEpoch}`}
                onOpenCalibration={openCalibration}
              />
            )}
            {view === "jobs" && (
              <Jobs key={`j-${keyEpoch}`} onPickJob={openJob} />
            )}
            {view === "job" && jobId && (
              <JobDetail
                key={`jd-${keyEpoch}-${jobId}`}
                jobId={jobId}
                onBack={() => setView("jobs")}
              />
            )}
            {view === "calibration" && (
              <Calibration
                key={`c-${keyEpoch}`}
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
