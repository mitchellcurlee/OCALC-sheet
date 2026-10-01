import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, MapPin, X } from "lucide-react";

export const PENDING_PHOTOS_KEY = "pendingAttributePhotos";

/** Read-and-clear photos handed off from the map "Take Photo" flow (used by Pole/Underground forms). */
export const takePendingAttributePhotos = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_PHOTOS_KEY);
    if (!raw) return [];
    sessionStorage.removeItem(PENDING_PHOTOS_KEY);
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch { return []; }
};

const getGps = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
  );
});

const TypeButton = ({ label, onClick, accent }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick} className={`h-9 justify-start text-xs bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-emerald-50 hover:border-emerald-400 ${accent || ""}`} data-testid={`photo-pin-type-${label}`}>
    {label}
  </Button>
);

/**
 * Map "Take Photo" flow: camera → upload → pin at GPS → pick attribute type → open form with photos attached.
 * `active` starts the camera; parent gets the pin via onPin(latlng|null) and the destination via onChooseType.
 */
export const MapPhotoCapture = ({ active, onDone, onPin, onChooseType, aerialTypes, undergroundTypes, fallbackCenter }) => {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [pin, setPin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (active && !startedRef.current) {
      startedRef.current = true;
      setTimeout(() => inputRef.current?.click(), 50);
    }
    if (!active) startedRef.current = false;
  }, [active]);

  const reset = () => { setPhotos([]); setPin(null); setOpen(false); onPin?.(null); onDone?.(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) { if (!photos.length) reset(); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("/upload-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = res.data.url;
      setPhotos((p) => [...p, url]);
      if (!pin) {
        const gps = await getGps();
        const spot = gps || (fallbackCenter ? { ...fallbackCenter, fallback: true } : null);
        if (!spot) { toast.error("Could not get your location"); setBusy(false); return; }
        if (spot.fallback) toast.warning("GPS unavailable — pin placed at map center; drag it in the form if needed");
        setPin(spot);
        onPin?.(spot);
      }
      setOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Photo upload failed");
      if (!photos.length) reset();
    } finally { setBusy(false); }
  };

  const choose = (kind, type) => {
    if (!pin) return;
    sessionStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify(photos));
    setOpen(false);
    onChooseType({ kind, type, lat: pin.lat, lng: pin.lng });
    setPhotos([]); setPin(null); onDone?.();
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} data-testid="map-take-photo-input" />
      {busy && !open && (
        <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center" data-testid="map-take-photo-busy">
          <div className="bg-white rounded px-4 py-3 flex items-center gap-2 text-sm font-mono"><Loader2 className="w-4 h-4 animate-spin" />Saving photo &amp; locating…</div>
        </div>
      )}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { if (window.confirm("Discard this pin and its photos?")) reset(); } }}>
        <DialogContent className="max-w-lg bg-white z-[1300]" aria-describedby={undefined} data-testid="photo-pin-type-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-500" />What is this? Pick the attribute type</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="photo-pin-photos">
            {photos.map((u, i) => <img key={u} src={u} alt={`Capture ${i + 1}`} className="w-16 h-14 object-cover rounded border border-zinc-300 shrink-0" data-testid={`photo-pin-thumb-${i}`} />)}
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} className="h-14 w-16 shrink-0 flex-col gap-1 text-[10px] bg-zinc-50 border-dashed border-zinc-400" data-testid="photo-pin-take-another">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}Another
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">{photos.length} photo{photos.length !== 1 ? "s" : ""} will be attached to this record{pin?.accuracy ? ` · GPS ±${Math.round(pin.accuracy)} m` : ""}. You can add more in the form before saving.</p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-1.5">
              <TypeButton label="Pole" accent="font-semibold border-red-300" onClick={() => choose("pole", null)} />
              <TypeButton label="Pole Terminal" accent="font-semibold border-red-300" onClick={() => choose("pole_terminal", null)} />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 pt-1">Aerial</p>
            <div className="grid grid-cols-2 gap-1.5">{aerialTypes.map((t) => <TypeButton key={t} label={t} onClick={() => choose("underground", t)} />)}</div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 pt-1">Underground</p>
            <div className="grid grid-cols-2 gap-1.5">{undergroundTypes.map((t) => <TypeButton key={t} label={t} onClick={() => choose("underground", t)} />)}</div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-zinc-600" onClick={() => { if (window.confirm("Discard this pin and its photos?")) reset(); }} data-testid="photo-pin-cancel"><X className="w-3.5 h-3.5 mr-1" />Discard</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MapPhotoCapture;
