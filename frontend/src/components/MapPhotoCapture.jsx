import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, MapPin, Move, X } from "lucide-react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Amber camera pin (shared by the live map and the standalone adjust dialog)
export const photoPinIcon = () => L.divIcon({ className: "photo-pin-marker", html: '<div style="width:30px;height:30px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center"><svg style="transform:rotate(45deg)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></div>', iconSize: [30, 30], iconAnchor: [15, 30] });

/** Mini aerial map with the draggable pin — used where there is no live map (Job Detail page). */
const PinAdjustDialog = ({ pin, onMove, onDone }) => (
  <Dialog open onOpenChange={(o) => { if (!o) onDone(); }}>
    <DialogContent className="max-w-xl bg-white z-[1300] p-4" aria-describedby={undefined} data-testid="photo-pin-adjust-dialog">
      <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><Move className="w-4 h-4 text-amber-500" />Drag the amber pin to the exact spot</DialogTitle></DialogHeader>
      <div className="h-72 rounded overflow-hidden border border-zinc-300">
        <MapContainer center={[pin.lat, pin.lng]} zoom={19} className="h-full w-full" scrollWheelZoom>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} />
          <Marker position={[pin.lat, pin.lng]} icon={photoPinIcon()} draggable eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onMove({ lat: ll.lat, lng: ll.lng }); } }} />
        </MapContainer>
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
        <span data-testid="photo-pin-adjust-coords">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}{pin.accuracy ? ` · GPS ±${Math.round(pin.accuracy)} m` : ""}</span>
        <Button type="button" size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={onDone} data-testid="photo-pin-adjust-done">Done</Button>
      </div>
    </DialogContent>
  </Dialog>
);

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
export const MapPhotoCapture = ({ active, onDone, pin, onPin, adjusting, onAdjusting, onChooseType, aerialTypes, undergroundTypes, fallbackCenter, standalone = false }) => {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const startedRef = useRef(false);
  const setPin = onPin;

  useEffect(() => {
    if (active && !startedRef.current) {
      startedRef.current = true;
      setTimeout(() => inputRef.current?.click(), 50);
    }
    if (!active) startedRef.current = false;
  }, [active]);

  const reset = () => { setPhotos([]); setOpen(false); onPin?.(null); onAdjusting?.(false); onDone?.(); };

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
        if (!spot) { toast.error("Could not get your location — allow location access and try again"); setPhotos([]); reset(); setBusy(false); return; }
        if (spot.fallback) toast.warning("GPS unavailable — pin placed near the job; use Adjust pin to move it");
        setPin(spot);
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
    setPhotos([]); onAdjusting?.(false); onDone?.();
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} data-testid="map-take-photo-input" />
      {busy && !open && (
        <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center" data-testid="map-take-photo-busy">
          <div className="bg-white rounded px-4 py-3 flex items-center gap-2 text-sm font-mono"><Loader2 className="w-4 h-4 animate-spin" />Saving photo &amp; locating…</div>
        </div>
      )}
      {adjusting && pin && standalone && (
        <PinAdjustDialog pin={pin} onMove={(ll) => setPin({ ...pin, ...ll, accuracy: null, fallback: false })} onDone={() => { onAdjusting?.(false); setOpen(true); }} />
      )}
      {adjusting && pin && !standalone && (
        <div className="fixed left-1/2 -translate-x-1/2 top-20 z-[1300] bg-amber-500 text-white shadow-lg rounded px-3 py-2 flex items-center gap-3 text-xs font-medium" data-testid="photo-pin-adjust-banner">
          <Move className="w-4 h-4 shrink-0" />
          <span>Drag the amber pin to the exact spot{pin.accuracy ? ` (GPS ±${Math.round(pin.accuracy)} m)` : ""}</span>
          <Button type="button" size="sm" className="h-7 text-xs bg-white text-amber-700 hover:bg-amber-50" onClick={() => { onAdjusting?.(false); setOpen(true); }} data-testid="photo-pin-adjust-done">Done</Button>
        </div>
      )}
      <Dialog open={open && !adjusting} onOpenChange={(o) => { if (!o) { if (window.confirm("Discard this pin and its photos?")) reset(); } }}>
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
          <div className="flex items-start gap-2">
            <p className="text-[11px] text-zinc-500 flex-1">{photos.length} photo{photos.length !== 1 ? "s" : ""} will be attached to this record{pin?.accuracy ? ` · GPS ±${Math.round(pin.accuracy)} m` : ""}. You can add more in the form before saving.</p>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0" onClick={() => { setOpen(false); onAdjusting?.(true); }} data-testid="photo-pin-adjust-btn"><Move className="w-3.5 h-3.5 mr-1" />Adjust pin</Button>
          </div>
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
