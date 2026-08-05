import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Images, Loader2, FolderInput } from "lucide-react";
import { toast } from "sonner";
import { OfflinePhoto, queuePhotoOffline } from "@/lib/offlinePhotos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const STAGED_PHOTO_MIME = "application/x-staged-photo";

/**
 * PhotoStagingGallery — camera/upload photos into an "unsorted" gallery, then
 * drag any thumbnail onto a photo category below (or tap it to pick a category).
 * @param {string[]} photos - staged (unsorted) photo URLs
 * @param {function} onChange - updates the staged array
 * @param {{key:string,label:string}[]} categories - assignable categories (tap-to-assign)
 * @param {function} onAssign - (url, categoryKey) called on tap-assign; parent adds to category
 * @param {string} testId
 */
export const PhotoStagingGallery = ({ photos = [], onChange, categories = [], onAssign, testId = "staging" }) => {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [assignPhoto, setAssignPhoto] = useState(null);

  const photosRef = useRef(photos);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    photosRef.current = photos;
    onChangeRef.current = onChange;
  }, [photos, onChange]);

  // Drag-assign completed inside a category component → remove from staging
  useEffect(() => {
    const handler = (e) => {
      const url = e.detail?.url;
      if (url && photosRef.current.includes(url)) {
        onChangeRef.current(photosRef.current.filter((p) => p !== url));
      }
    };
    window.addEventListener("staged-photo-assigned", handler);
    return () => window.removeEventListener("staged-photo-assigned", handler);
  }, []);

  const processFiles = useCallback(async (files) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setUploading(true);
    const urls = [];
    for (const file of images) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 25MB)`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await axios.post("/upload-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
        urls.push(res.data.url);
      } catch (err) {
        if (!err.response) {
          try {
            const placeholder = await queuePhotoOffline(file);
            urls.push(placeholder);
            toast.warning(`No signal — ${file.name} saved on this device and will upload automatically.`);
            continue;
          } catch (e2) {
            if (e2?.name === "QuotaExceededError" || `${e2?.message}`.includes("write failed")) {
              toast.error("Device storage is full — free up space to save photos offline.");
              continue;
            }
          }
        }
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    if (urls.length) {
      onChangeRef.current([...photosRef.current, ...urls]);
      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} added — drag onto a category or tap to sort`);
    }
    setUploading(false);
  }, []);

  const handleInput = async (e) => {
    await processFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleAssignPick = (catKey) => {
    if (assignPhoto) {
      onAssign(assignPhoto, catKey);
      onChangeRef.current(photosRef.current.filter((p) => p !== assignPhoto));
    }
    setAssignPhoto(null);
  };

  return (
    <div className="border border-sky-200 bg-sky-50 rounded-lg p-3 space-y-2" data-testid={`${testId}-gallery`}>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs font-mono tracking-widest text-sky-700 uppercase flex items-center gap-1.5">
          <Images className="w-4 h-4" />Photo Gallery{photos.length > 0 && ` (${photos.length} unsorted)`}
        </Label>
        <div className="flex gap-2 ml-auto">
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInput} data-testid={`${testId}-camera-input`} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleInput} data-testid={`${testId}-file-input`} />
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => camRef.current?.click()} className="h-8 text-xs bg-white border-sky-300 text-sky-800 hover:bg-sky-100" data-testid={`${testId}-camera-btn`}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1" />}Camera
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-8 text-xs bg-white border-sky-300 text-sky-800 hover:bg-sky-100" data-testid={`${testId}-upload-btn`}>
            <Upload className="w-3.5 h-3.5 mr-1" />Upload
          </Button>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-sky-600">Snap or upload photos here first, then drag each one onto its category below — or tap a photo to pick the category.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {photos.map((url, i) => (
              <div key={`${url}-${i}`} className="relative group">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(STAGED_PHOTO_MIME, url);
                    e.dataTransfer.setData("text/plain", url);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => setAssignPhoto(url)}
                  className="cursor-pointer active:cursor-grabbing"
                  title="Drag onto a category below, or tap to pick one"
                  data-testid={`${testId}-photo-${i}`}
                >
                  <OfflinePhoto src={url} alt={`Unsorted ${i + 1}`} className="w-20 h-16 object-cover border-2 border-sky-300 rounded hover:border-sky-500 transition-colors" />
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChangeRef.current(photosRef.current.filter((p) => p !== url)); }}
                  className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`${testId}-remove-${i}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-sky-600">Drag a photo onto any category below — or tap it to choose one. Unsorted photos are saved with this item.</p>
        </>
      )}

      <Dialog open={!!assignPhoto} onOpenChange={(o) => !o && setAssignPhoto(null)}>
        <DialogContent className="max-w-sm bg-white" data-testid={`${testId}-assign-dialog`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><FolderInput className="w-4 h-4" />Assign photo to…</DialogTitle>
          </DialogHeader>
          {assignPhoto && (
            <div className="flex justify-center">
              <OfflinePhoto src={assignPhoto} alt="Assign" className="h-28 object-contain border border-zinc-200 rounded" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
            {categories.map((cat) => (
              <Button key={cat.key} type="button" variant="outline" size="sm" className="justify-start h-9 text-xs bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-sky-50 hover:border-sky-300" onClick={() => handleAssignPick(cat.key)} data-testid={`${testId}-assign-${cat.key.replace(/[:]/g, "-")}`}>
                {cat.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
