import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Zap, Folder, List, Loader2, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { JobsLocationMap } from "@/components/JobsLocationMap";
import { JobTile } from "@/pages/JobTiles";

// Same month grouping as the Jobs list (folder_month override, else created_at; newest first)
const groupByMonth = (jobs) => {
  const groups = {};
  jobs.forEach((j) => {
    let key = /^\d{4}-\d{2}$/.test(j.folder_month || "") ? j.folder_month : null;
    if (!key) {
      const d = new Date(j.created_at);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!groups[key]) {
      const [y, m] = key.split("-").map(Number);
      groups[key] = { key, label: new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }), jobs: [] };
    }
    groups[key].jobs.push(j);
  });
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
};

/** True Home — landing page: every job on one map + job tiles grouped by month. */
export default function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    axios.get("/jobs").then((r) => setJobs(r.data || [])).catch(() => setJobs([])).finally(() => setLoading(false));
  }, []);
  const months = useMemo(() => groupByMonth(jobs), [jobs]);
  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="home-page">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-600 flex items-center justify-center flex-shrink-0"><Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" /></div>
          <div className="min-w-0">
            <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight uppercase text-zinc-900 leading-tight">Pole Data Sheet</h1>
            <p className="text-xs text-zinc-500 font-mono tracking-wider">Home · {jobs.length} job{jobs.length === 1 ? "" : "s"}{user?.name ? ` · ${user.name}` : ""}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <OfflineIndicator />
            <Button onClick={() => navigate("/jobs")} variant="outline" className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900 gap-1.5" data-testid="home-jobs-list-btn"><List className="w-4 h-4" /><span className="hidden sm:inline">Jobs List</span></Button>
            <Button onClick={() => navigate("/jobs?new=1")} className="bg-red-600 hover:bg-red-700 text-white gap-1.5" data-testid="home-new-job-btn"><Plus className="w-4 h-4" /><span className="hidden sm:inline">New Job</span></Button>
            <Button onClick={logout} variant="ghost" size="icon" className="text-zinc-500 hover:text-red-600" title="Sign out" data-testid="home-logout-btn"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-zinc-500 py-12"><Loader2 className="w-5 h-5 animate-spin" />Loading jobs…</div>
        ) : (
          <>
            <JobsLocationMap jobs={jobs} onOpenJob={(id) => navigate(`/jobs/${id}`)} />
            {months.length === 0 && <div className="industrial-card p-8 text-center text-zinc-500" data-testid="home-empty">No jobs yet — create one from the Jobs List.</div>}
            {months.map((m) => (
              <section key={m.key} className="mb-6" data-testid={`home-month-${m.key}`}>
                <h2 className="flex items-center gap-2 text-base md:text-lg font-heading font-bold text-zinc-900 mb-2"><Folder className="w-5 h-5 text-red-600" />{m.label}<span className="text-xs font-mono text-zinc-500">{m.jobs.length} job{m.jobs.length === 1 ? "" : "s"}</span></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {m.jobs.map((j) => <JobTile key={j.id} job={j} onOpen={(job) => navigate(`/jobs/${job.id}`)} cta="Open job" />)}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
