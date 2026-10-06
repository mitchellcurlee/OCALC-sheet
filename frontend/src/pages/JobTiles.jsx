import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Home, LayoutGrid, Loader2, MapPin, Search, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusOf = (j) => (j.completed ? { label: "Complete", cls: "bg-emerald-600 text-white" } : j.started ? { label: "Started", cls: "bg-yellow-400 text-zinc-900" } : { label: "Open", cls: "bg-red-600 text-white" });

export const JobTile = ({ job, onOpen, cta = "Open map" }) => {
  const st = statusOf(job);
  return (
    <button type="button" onClick={() => onOpen(job)} className="group text-left bg-white border border-zinc-300 rounded-lg p-4 shadow-sm hover:shadow-lg hover:border-red-500 hover:-translate-y-0.5 transition-[transform,box-shadow,border-color] duration-150 flex flex-col gap-2" data-testid={`job-tile-${job.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Job ID</div>
          <div className="font-heading font-black text-lg text-zinc-900 truncate" data-testid={`job-tile-id-${job.id}`}>{(job.site_id || "").trim() || job.name || "—"}</div>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${st.cls}`} data-testid={`job-tile-status-${job.id}`}>{st.label}</span>
      </div>
      <div className="flex items-start gap-1.5 text-sm text-zinc-700 min-h-[2.5rem]"><MapPin className="w-4 h-4 mt-0.5 text-red-600 shrink-0" /><span className="line-clamp-2" data-testid={`job-tile-address-${job.id}`}>{job.location || "No address"}</span></div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100">
        <span className="text-xs font-mono text-zinc-600" data-testid={`job-tile-type-${job.id}`}>{job.job_type || "—"}{job.name && job.site_id && job.name !== job.site_id ? ` · ${job.name}` : ""}</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 group-hover:text-red-700"><MapIcon className="w-3.5 h-3.5" />{cta}</span>
      </div>
    </button>
  );
};

export default function JobTiles() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => {
    axios.get("/jobs").then((r) => setJobs(r.data || [])).catch(() => setJobs([])).finally(() => setLoading(false));
  }, []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? jobs.filter((j) => [j.site_id, j.name, j.location, j.job_type].some((v) => String(v || "").toLowerCase().includes(s))) : jobs;
    return [...list].sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
  }, [jobs, q]);
  return (
    <div className="min-h-screen bg-zinc-100" data-testid="job-tiles-page">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900 h-9 w-9" onClick={() => navigate("/")} title="Home" data-testid="home-btn"><Home className="w-5 h-5" /></Button>
          <div className="w-9 h-9 bg-red-600 flex items-center justify-center"><LayoutGrid className="w-5 h-5 text-white" /></div>
          <div className="min-w-0">
            <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight uppercase text-zinc-900 leading-tight">Job Tiles</h1>
            <p className="text-xs text-zinc-500 font-mono tracking-wider">Tap a job to open its interactive map · {shown.length} job{shown.length === 1 ? "" : "s"}</p>
          </div>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, address, type…" className="pl-8 h-9 bg-white" data-testid="job-tiles-search" />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin" />Loading jobs…</div>
        ) : shown.length === 0 ? (
          <div className="bg-white border border-zinc-300 rounded p-8 text-center text-zinc-500" data-testid="job-tiles-empty">No jobs match.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="job-tiles-grid">
            {shown.map((j) => <JobTile key={j.id} job={j} onOpen={(job) => navigate(`/jobs/${job.id}/map`)} />)}
          </div>
        )}
      </main>
    </div>
  );
}
