import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, MapPin, Move, X, LocateFixed } from "lucide-react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getBestFix, fmtAcc } from "@/lib/gps";

// Amber camera pin (shared by the live map and the standalone adjust dialog)
export const photoPinIcon = () => L.divIcon({ className: "photo-pin-marker", html: '<div style="width:30px;height:30px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center"><svg style="transform:rotate(45deg)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></div>', iconSize: [30, 30], iconAnchor: [15, 30] });

const Recenter = ({ lat, lng }) => { const map = useMap(); useEffect(() => { map.setView([lat, lng], Math.max(map.getZoom(), 19)); }, [lat, lng]); return null; }; // eslint-disable-line react-hooks/exhaustive-deps

/** Mini aerial map with the draggable pin — used where there is no live map (Job Detail page). */
const PinAdjustDialog = ({ pin, onMove, onDone, onRelocate, locating }) => (
  <Dialog open onOpenChange={(o) => { if (!o) onDone(); }}>
    <DialogContent className="max-w-xl bg-white z-[1300] p-4" aria-describedby={undefined} data-testid="photo-pin-adjust-dialog">
      <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><Move className="w-4 h-4 text-amber-500" />Step 1 · Drag the amber pin to the exact spot</DialogTitle></DialogHeader>
      <div className="h-72 rounded overflow-hidden border border-zinc-300">
        <MapContainer center={[pin.lat, pin.lng]} zoom={19} className="h-full w-full" scrollWheelZoom>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} />
          {pin.accuracy > 0 && <Circle center={[pin.lat, pin.lng]} radius={pin.accuracy} pathOptions={{ color: "#f59e0b", weight: 1, fillOpacity: 0.12 }} />}
          <Marker position={[pin.lat, pin.lng]} icon={photoPinIcon()} draggable eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onMove({ lat: ll.lat, lng: ll.lng }); } }} />
          <Recenter lat={pin.lat} lng={pin.lng} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
        <span data-testid="photo-pin-adjust-coords">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}{pin.accuracy ? ` · GPS ${fmtAcc(pin.accuracy)}` : ""}</span>
        <span className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={locating} className="h-8 text-xs border-amber-400 text-amber-800 bg-amber-50" onClick={onRelocate} data-testid="photo-pin-relocate">{locating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5 mr-1" />}Re-locate</Button>
          <Button type="button" size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={onDone} data-testid="photo-pin-adjust-done">Done</Button>
        </span>
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

// Best fix over ~8 s (first fixes are usually coarse Wi-Fi/cell positions); updates the pin as accuracy improves
const getGps = (onUpdate) => getBestFix({ maxMs: 8000, goodM: 10, onUpdate });

const TypeButton = ({ label, onClick, accent }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick} className={`h-9 justify-start text-xs bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-emerald-50 hover:border-emerald-400 ${accent || ""}`} data-testid={`photo-pin-type-${label}`}>
    {label}
  </Button>
);

/**
 * Map "Pin my location" flow: GPS → amber pin (drag to fine-tune) → pick attribute type → form opens at that spot.
 * Photos are optional here (take them in the form, or snap some now and they're attached).
 * `active` starts the flow; parent gets the pin via onPin(latlng|null) and the destination via onChooseType.
 */
export const MapPhotoCapture = ({ active, onDone, pin, onPin, adjusting, onAdjusting, onChooseType, aerialTypes, undergroundTypes, fallbackCenter, standalone = false }) => {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(false);
  const startedRef = useRef(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const setPin = onPin;

  const reset = () => { setPhotos([]); setOpen(false); onPin?.(null); onAdjusting?.(false); onDone?.(); };

  // Step 1: drop the pin at the user's location, then let them drag it before anything else
  const locate = async (initial) => {
    setLocating(true);
    let shown = false;
    if (!initial && pinRef.current) setPin({ ...pinRef.current, accuracy: 9999, fallback: false }); // re-locate overrides a manual drag
    const moved = () => pinRef.current && pinRef.current.accuracy === null && !pinRef.current.fallback; // user dragged it — stop auto-updating
    const gps = await getGps((fix) => { if (moved()) return; setPin({ ...fix, fallback: false }); if (!shown) { shown = true; setLocating(false); onAdjusting?.(true); } });
    setLocating(false);
    if (gps) { if (!moved()) setPin({ ...gps, fallback: false }); onAdjusting?.(true); toast.success(`GPS locked ${fmtAcc(gps.accuracy)} (${gps.samples} fix${gps.samples === 1 ? "" : "es"}) — drag the pin if needed`); return; }
    if (!initial) { toast.error("Could not improve the GPS fix — try again outdoors"); return; }
    const spot = fallbackCenter ? { ...fallbackCenter, fallback: true } : null;
    if (!spot) { toast.error("Could not get your location — allow location access and try again"); reset(); return; }
    toast.warning("GPS unavailable — pin placed near the job; drag it to the exact spot");
    setPin(spot);
    onAdjusting?.(true);
  };
  useEffect(() => {
    if (active && !startedRef.current) { startedRef.current = true; locate(true); }
    if (!active) startedRef.current = false;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optional: snap photos now (they're attached to the new record)
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("/upload-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotos((p) => [...p, res.data.url]);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Photo upload failed");
    } finally { setBusy(false); }
  };

  const choose = (kind, type) => {
    if (!pin) return;
    if (photos.length) sessionStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify(photos));
    setOpen(false);
    onChooseType({ kind, type, lat: pin.lat, lng: pin.lng, photos: photos.length });
    setPhotos([]); onAdjusting?.(false); onDone?.();
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} data-testid="map-take-photo-input" />
      {locating && !pin && (
        <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center" data-testid="map-take-photo-busy">
          <div className="bg-white rounded px-4 py-3 flex items-center gap-2 text-sm font-mono"><Loader2 className="w-4 h-4 animate-spin" />Locating you…</div>
        </div>
      )}
      {adjusting && pin && standalone && (
        <PinAdjustDialog pin={pin} onMove={(ll) => setPin({ ...pin, ...ll, accuracy: null, fallback: false })} onDone={() => { onAdjusting?.(false); setOpen(true); }} onRelocate={() => locate(false)} locating={locating} />
      )}
      {adjusting && pin && !standalone && (
        <div className="fixed left-1/2 -translate-x-1/2 top-20 z-[1300] bg-amber-500 text-white shadow-lg rounded px-3 py-2 flex items-center gap-3 text-xs font-medium" data-testid="photo-pin-adjust-banner">
          <Move className="w-4 h-4 shrink-0" />
          <span>Step 1 · Drag the amber pin to the exact spot{pin.accuracy ? ` (GPS ${fmtAcc(pin.accuracy)}${locating ? ", improving…" : ""})` : pin.fallback ? " (no GPS fix)" : " (moved by hand)"}</span>
          <Button type="button" size="sm" variant="outline" disabled={locating} className="h-7 text-xs bg-amber-50 text-amber-800 border-amber-200 hover:bg-white" onClick={() => locate(false)} data-testid="photo-pin-relocate">{locating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5 mr-1" />}Re-locate</Button>
          <Button type="button" size="sm" className="h-7 text-xs bg-white text-amber-700 hover:bg-amber-50" onClick={() => { onAdjusting?.(false); setOpen(true); }} data-testid="photo-pin-adjust-done">Done</Button>
          <button type="button" className="text-white/80 hover:text-white" onClick={reset} data-testid="photo-pin-adjust-cancel" aria-label="Cancel"><X className="w-4 h-4" /></button>
        </div>
      )}
      <Dialog open={open && !adjusting} onOpenChange={(o) => { if (!o) { if (window.confirm("Discard this pin" + (photos.length ? " and its photos" : "") + "?")) reset(); } }}>
        <DialogContent className="max-w-lg bg-white z-[1300]" aria-describedby={undefined} data-testid="photo-pin-type-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-500" />Step 2 · What is at this pin? Pick the attribute type</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-2">
            <p className="text-[11px] text-zinc-500 flex-1" data-testid="photo-pin-coords">Pin: {pin?.lat.toFixed(6)}, {pin?.lng.toFixed(6)}{pin?.accuracy ? ` · GPS ${fmtAcc(pin.accuracy)}` : ""}. The form opens at this spot — take the pictures there (or snap some now).</p>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0" onClick={() => { setOpen(false); onAdjusting?.(true); }} data-testid="photo-pin-adjust-btn"><Move className="w-3.5 h-3.5 mr-1" />Move pin</Button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="photo-pin-photos">
            {photos.map((u, i) => <img key={u} src={u} alt={`Capture ${i + 1}`} className="w-16 h-14 object-cover rounded border border-zinc-300 shrink-0" data-testid={`photo-pin-thumb-${i}`} />)}
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} className="h-14 shrink-0 flex-col gap-1 text-[10px] bg-zinc-50 border-dashed border-zinc-400 px-3" data-testid="photo-pin-take-another">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}{photos.length ? "Another" : "Photo now (optional)"}
            </Button>
            {photos.length > 0 && <span className="text-[11px] text-zinc-500">{photos.length} photo{photos.length !== 1 ? "s" : ""} will be attached</span>}
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
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-zinc-600" onClick={() => { if (window.confirm("Discard this pin" + (photos.length ? " and its photos" : "") + "?")) reset(); }} data-testid="photo-pin-cancel"><X className="w-3.5 h-3.5 mr-1" />Discard</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MapPhotoCapture;
