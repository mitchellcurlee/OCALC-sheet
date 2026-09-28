import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Camera, Check, FolderInput, Images, Loader2, Trash2, Upload, X } from "lucide-react";
import { JobPhotoAssignDialog, galleryItemLabel } from "@/components/JobPhotoAssignDialog";

const fmtDate = (s) => { try { return new Date(s).toLocaleDateString(); } catch { return s; } };

export const JobPhotoGallery = ({ jobId, poles = [], undergroundItems = [], onAssigned }) => {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [assignTargets, setAssignTargets] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const items = useMemo(() => [
    ...poles.map((p) => ({ ...p, _type: "pole" })),
    ...undergroundItems.map((u) => ({ ...u, _type: "underground" })),
  ].sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)), [poles, undergroundItems]);
  const itemById = useMemo(() => Object.fromEntries(items.map((it) => [`${it._type}:${it.id}`, it])), [items]);

  const load = async () => {
    try { setPhotos((await axios.get(`/jobs/${jobId}/gallery`)).data || []); } catch { /* ignore */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  const handleFiles = async (e) => {
    const list = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!list.length) return;
    setUploading(true);
    let ok = 0;
    for (const f of list) {
      if (f.size > 25 * 1024 * 1024) { toast.error(`${f.name} is too large (max 25MB)`); continue; }
      try {
        const fd = new FormData();
        fd.append("file", f);
        await axios.post(`/jobs/${jobId}/gallery`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        ok += 1;
      } catch (err) { toast.error(err.response?.data?.detail || `Failed to upload ${f.name}`); }
    }
    if (ok) toast.success(`${ok} photo${ok > 1 ? "s" : ""} added to job gallery`);
    await load();
    setUploading(false);
  };

  const handleDelete = async (p) => {
    if (!window.confirm("Remove this photo from the job gallery? Copies already assigned to items are kept.")) return;
    try { await axios.delete(`/jobs/${jobId}/gallery/${p.id}`); setSelected((s) => s.filter((id) => id !== p.id)); await load(); } catch { toast.error("Delete failed"); }
  };

  const assign = async (keys) => {
    setBusy(true);
    try {
      for (const pid of assignTargets) {
        for (const key of keys) {
          const [item_type, item_id] = key.split(":");
          await axios.post(`/jobs/${jobId}/gallery/${pid}/assign`, { item_type, item_id });
        }
      }
      toast.success(`Assigned to ${keys.map((k) => galleryItemLabel(itemById[k])).join(", ")}`);
      setSelected([]);
      await load();
      onAssigned?.();
    } catch (err) { toast.error(err.response?.data?.detail || "Assign failed"); }
    finally { setBusy(false); }
  };

  const unassign = async (p, ref) => {
    try {
      await axios.delete(`/jobs/${jobId}/gallery/${p.id}/assign/${ref.item_type}/${ref.item_id}`);
      await load();
      onAssigned?.();
    } catch { toast.error("Could not remove assignment"); }
  };

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="industrial-card p-4 bg-white h-full" data-testid="job-photo-gallery">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-2"><Images className="w-4 h-4" />Job Photo Gallery{photos.length > 0 && ` (${photos.length})`}</h3>
        <div className="flex gap-2 ml-auto">
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} data-testid="job-gallery-camera-input" />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} data-testid="job-gallery-file-input" />
          <Button variant="outline" size="sm" onClick={() => camRef.current?.click()} disabled={uploading} className="bg-zinc-50 border-zinc-300 h-8 text-xs" data-testid="job-gallery-camera-btn">
            <Camera className="w-3.5 h-3.5 mr-1" />Camera
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-zinc-50 border-zinc-300 h-8 text-xs" data-testid="job-gallery-upload-btn">
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}Upload
          </Button>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-zinc-400">No photos yet — snap or upload every picture for this job here, then assign each to a pole or underground item.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" data-testid="job-gallery-grid">
            {photos.map((p, i) => {
              const picked = selected.includes(p.id);
              return (
                <div key={p.id} className="relative group w-24" data-testid={`job-gallery-photo-${i}`}>
                  <img src={p.url} alt={p.original_filename} loading="lazy"
                    onClick={() => (selected.length ? toggleSelect(p.id) : setViewing(p))}
                    className={`w-24 h-20 object-cover rounded border-2 cursor-pointer transition-colors ${picked ? "border-sky-600 ring-2 ring-sky-400" : "border-zinc-200 hover:border-sky-400"}`}
                    data-testid={`job-gallery-thumb-${i}`} />
                  <button type="button" onClick={() => toggleSelect(p.id)} title={picked ? "Deselect" : "Select"}
                    className={`absolute -top-1.5 -left-1.5 rounded-full w-5 h-5 flex items-center justify-center border shadow-sm ${picked ? "bg-sky-600 border-sky-600 text-white" : "bg-white border-zinc-300 text-transparent hover:text-zinc-300"}`}
                    data-testid={`job-gallery-select-${i}`}><Check className="w-3 h-3" /></button>
                  <button type="button" onClick={() => handleDelete(p)} title="Remove from gallery"
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    data-testid={`job-gallery-delete-${i}`}><X className="w-2.5 h-2.5" /></button>
                  <div className="flex flex-wrap gap-0.5 mt-0.5 min-h-[14px]">
                    {(p.assigned_to || []).map((ref) => {
                      const it = itemById[`${ref.item_type}:${ref.item_id}`];
                      return (
                        <span key={`${ref.item_type}:${ref.item_id}`} className="inline-flex items-center gap-0.5 text-[10px] leading-none px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200" title="Assigned — click × to undo" data-testid={`job-gallery-tag-${i}-${ref.item_id}`}>
                          {it ? galleryItemLabel(it) : "Removed item"}
                          <button type="button" onClick={() => unassign(p, ref)} className="hover:text-red-600" data-testid={`job-gallery-untag-${i}-${ref.item_id}`}><X className="w-2.5 h-2.5" /></button>
                        </span>
                      );
                    })}
                    {!(p.assigned_to || []).length && <span className="text-[10px] text-zinc-400">Unassigned</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {selected.length > 0 ? (
              <>
                <Button size="sm" className="h-8 text-xs bg-sky-600 hover:bg-sky-700 text-white" onClick={() => setAssignTargets(selected)} data-testid="job-gallery-assign-selected-btn">
                  <FolderInput className="w-3.5 h-3.5 mr-1" />Assign {selected.length} selected
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs bg-white border-zinc-300" onClick={() => setSelected([])} data-testid="job-gallery-clear-selection-btn">Clear</Button>
              </>
            ) : (
              <p className="text-[11px] text-zinc-500">Tap a photo to enlarge. Use the circle to select photos, then assign them to poles / underground items.</p>
            )}
          </div>
        </>
      )}

      <JobPhotoAssignDialog open={!!assignTargets} onOpenChange={(o) => { if (!o) setAssignTargets(null); }} items={items} count={assignTargets?.length || 0} busy={busy} onConfirm={assign} />

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-3xl bg-white" aria-describedby={undefined} data-testid="job-gallery-viewer">
          <DialogTitle className="sr-only">Job photo</DialogTitle>
          {viewing && (
            <div className="space-y-2">
              <img src={viewing.url} alt={viewing.original_filename} className="max-h-[70vh] w-auto max-w-full object-contain mx-auto rounded" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="truncate max-w-[50%]">{viewing.original_filename}</span>
                <span>· {viewing.uploaded_by} · {fmtDate(viewing.created_at)}</span>
                <span className="ml-auto flex gap-2">
                  <Button size="sm" className="h-8 text-xs bg-sky-600 hover:bg-sky-700 text-white" onClick={() => { setAssignTargets([viewing.id]); setViewing(null); }} data-testid="job-gallery-viewer-assign-btn"><FolderInput className="w-3.5 h-3.5 mr-1" />Assign to item</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-red-300 text-red-600 bg-white" onClick={() => { const p = viewing; setViewing(null); handleDelete(p); }} data-testid="job-gallery-viewer-delete-btn"><Trash2 className="w-3.5 h-3.5 mr-1" />Remove</Button>
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobPhotoGallery;
