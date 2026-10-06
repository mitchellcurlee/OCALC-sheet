import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LifeBuoy, Loader2, UploadCloud, CheckCircle2, MapPin, Camera, Layers } from "lucide-react";
import { getAllJobs, getAllPoles, getAllUnderground, getAllPhotoBlobs, saveJob } from "@/lib/offlineDb";
import { syncOfflinePhotos, OFFLINE_PHOTO_PREFIX } from "@/lib/offlinePhotos";
import { HomeButton } from "@/components/HomeButton";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function DataRecovery() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orphans, setOrphans] = useState([]);
  const [restoring, setRestoring] = useState(null);
  const [restored, setRestored] = useState({});

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      // Raw fetch to bypass the offline merge interceptor — we need the true server list
      const res = await fetch(`${API_URL}/api/jobs`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error("Could not reach the server — recovery needs a connection");
      const serverJobs = await res.json();
      const serverIds = new Set(serverJobs.map((j) => j.id));

      const [localJobs, localPoles, localUg, photoBlobs] = await Promise.all([
        getAllJobs(), getAllPoles(), getAllUnderground(), getAllPhotoBlobs(),
      ]);
      const found = localJobs
        .filter((j) => !serverIds.has(j.id))
        .map((j) => {
          const poles = localPoles.filter((p) => p.job_id === j.id);
          const ug = localUg.filter((u) => u.job_id === j.id);
          const blob = JSON.stringify([...poles, ...ug]);
          const queuedPhotos = photoBlobs.filter((b) => blob.includes(`${OFFLINE_PHOTO_PREFIX}${b.id}`)).length;
          return { job: j, poles, ug, queuedPhotos };
        });
      setOrphans(found);
    } catch (e) {
      toast.error(e.message || "Recovery scan failed");
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const restore = async (entry) => {
    setRestoring(entry.job.id);
    try {
      const strip = (o) => { const { _offline, ...rest } = o; return rest; };
      const now = new Date().toISOString();
      const mk = (entity, item) => ({ id: uuidv4(), action: "create", entity, entity_id: item.id, data: strip(item), timestamp: now });
      const actions = [
        mk("job", entry.job),
        ...entry.poles.map((p) => mk("pole", p)),
        ...entry.ug.map((u) => mk("underground", u)),
      ];
      const res = await axios.post("/sync/push", { actions });
      const results = res.data?.results || [];
      const failed = results.filter((r) => !r.success);
      if (failed.length === results.length) {
        throw new Error(failed[0]?.error || "Server rejected the restore");
      }
      // Clear the offline flag on the local copy
      try { await saveJob({ ...entry.job, _offline: undefined }); } catch (e) { /* non-blocking */ }
      if (failed.length > 0) {
        toast.warning(`Restored with ${failed.length} item(s) skipped: ${failed[0]?.error || ""}`);
      } else {
        toast.success(`Job "${entry.job.name}" restored to the server (${entry.poles.length} poles, ${entry.ug.length} attributes)`);
      }
      setRestored((p) => ({ ...p, [entry.job.id]: true }));
      // Upload any photos still queued on this device for the restored poles
      if (entry.queuedPhotos > 0) {
        toast.info(`Uploading ${entry.queuedPhotos} queued photo(s)…`);
        await syncOfflinePhotos();
      }
      scan();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Restore failed");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="data-recovery-page">
      <header className="bg-zinc-900 text-white sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button onClick={() => navigate("/")} size="icon" variant="ghost" className="text-white hover:bg-zinc-700" data-testid="recovery-back-btn">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <HomeButton className="text-white hover:bg-zinc-700" />
          <LifeBuoy className="w-5 h-5 text-amber-400" />
          <div>
            <h1 className="text-lg font-bold tracking-wide">DEVICE DATA RECOVERY</h1>
            <p className="text-xs text-zinc-400 font-mono">Jobs saved on this device that are missing from the server</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 font-mono text-sm" data-testid="recovery-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Scanning this device…
          </div>
        ) : orphans.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center" data-testid="recovery-empty">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-zinc-800">No unsynced jobs found on this device</p>
            <p className="text-sm text-zinc-500 mt-1">
              Every job stored locally also exists on the server. If a job is missing, open this page on the device where the job was created — its data may still be saved there.
            </p>
          </div>
        ) : (
          orphans.map((entry) => (
            <div key={entry.job.id} className="bg-white border border-amber-300 rounded-lg p-4 shadow-sm" data-testid={`recovery-job-${entry.job.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold text-zinc-900">{entry.job.name}</p>
                  <p className="text-xs text-zinc-500 font-mono">Created {entry.job.created_at ? new Date(entry.job.created_at).toLocaleString() : "—"} · only on this device</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-zinc-600">
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-blue-500" /> {entry.poles.length} poles</span>
                    <span className="flex items-center gap-1"><Layers className="w-4 h-4 text-emerald-600" /> {entry.ug.length} attributes</span>
                    <span className="flex items-center gap-1"><Camera className="w-4 h-4 text-purple-500" /> {entry.queuedPhotos} queued photos</span>
                  </div>
                </div>
                {restored[entry.job.id] ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-semibold text-sm"><CheckCircle2 className="w-4 h-4" /> Restored</span>
                ) : (
                  <Button onClick={() => restore(entry)} disabled={restoring === entry.job.id} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold" data-testid={`restore-job-btn-${entry.job.id}`}>
                    {restoring === entry.job.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                    Restore to server
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-zinc-400 font-mono">
          Tip: run this on the tablet or phone the job was created on. Photos taken offline upload automatically after the job is restored.
        </p>
      </main>
    </div>
  );
}
