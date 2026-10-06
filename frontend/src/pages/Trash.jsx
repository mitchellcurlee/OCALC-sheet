import { HomeButton } from "@/components/HomeButton";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/useGoBack";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, RotateCcw, Folder, Zap, Layers, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TYPE_META = {
  job: { label: "Job", icon: Folder, color: "text-red-600 bg-red-50 border-red-200" },
  pole: { label: "Pole", icon: Zap, color: "text-blue-600 bg-blue-50 border-blue-200" },
  underground: { label: "Underground", icon: Layers, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
};

export default function Trash() {
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [purgeId, setPurgeId] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const fetchTrash = useCallback(async () => {
    try {
      const res = await axios.get("/trash");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast.error("Failed to load deleted items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  const handleRestore = async (item) => {
    setBusyId(item.id);
    try {
      const res = await axios.post(`/trash/${item.id}/restore`);
      toast.success(res.data?.message || `Restored ${item.name}`);
      fetchTrash();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Restore failed");
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!purgeId) return;
    try {
      await axios.delete(`/trash/${purgeId}`);
      toast.success("Permanently deleted");
      setPurgeId(null);
      fetchTrash();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete");
    }
  };

  const handleEmpty = async () => {
    try {
      const res = await axios.delete("/trash");
      toast.success(res.data?.message || "Trash emptied");
      setConfirmEmpty(false);
      fetchTrash();
    } catch (e) {
      toast.error("Failed to empty trash");
    }
  };

  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="trash-page">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-4 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-800" onClick={goBack} data-testid="trash-back-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <HomeButton className="text-zinc-400 hover:text-white hover:bg-zinc-800" />
            <div>
              <h1 className="text-white font-bold tracking-wide uppercase text-sm sm:text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-500" /> Deleted Items
              </h1>
              <p className="text-zinc-500 text-xs">Items you deleted — restore them or delete them permanently</p>
            </div>
          </div>
          {items.length > 0 && (
            <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 bg-white h-8 text-xs" onClick={() => setConfirmEmpty(true)} data-testid="trash-empty-btn">
              <Trash2 className="w-3 h-3 mr-1" /> Empty Trash
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-zinc-500" data-testid="trash-empty-state">
            <Trash2 className="w-10 h-10 mx-auto mb-3 text-zinc-300" />
            <p className="font-medium">Your Deleted Items folder is empty</p>
            <p className="text-xs mt-1">Deleted jobs, poles and underground attributes will appear here so you can restore them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const meta = TYPE_META[item.entity_type] || TYPE_META.underground;
              const Icon = meta.icon;
              return (
                <div key={item.id} className="bg-white border border-zinc-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`trash-item-${item.id}`}>
                  <div className={`w-10 h-10 rounded-md border flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-900 truncate" data-testid={`trash-item-name-${item.id}`}>{item.name}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">{meta.label}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {item.entity_type !== "job" && item.job_name ? <span>Job: {item.job_name} · </span> : null}
                      Deleted {fmtDate(item.deleted_at)}
                      {item.entity_type === "job" && (item.pole_count > 0 || item.underground_count > 0) ? (
                        <span> · contains {item.pole_count} pole(s), {item.underground_count} underground item(s)</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busyId === item.id} onClick={() => handleRestore(item)} data-testid={`trash-restore-btn-${item.id}`}>
                      {busyId === item.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />} Restore
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-red-300 text-red-600 hover:bg-red-50" onClick={() => setPurgeId(item.id)} data-testid={`trash-purge-btn-${item.id}`}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete Forever
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={!!purgeId} onOpenChange={(o) => { if (!o) setPurgeId(null); }}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Forever?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This will permanently delete this item from your Deleted Items folder. This action CANNOT be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900" data-testid="purge-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurge} className="bg-red-600 hover:bg-red-700 text-white" data-testid="purge-confirm-btn">Delete Forever</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This will permanently delete ALL {items.length} item(s) in your Deleted Items folder. This action CANNOT be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900" data-testid="empty-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEmpty} className="bg-red-600 hover:bg-red-700 text-white" data-testid="empty-confirm-btn">Empty Trash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
