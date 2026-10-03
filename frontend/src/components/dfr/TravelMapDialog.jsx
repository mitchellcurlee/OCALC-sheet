import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import domtoimage from "dom-to-image-more";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, Route } from "lucide-react";
import { DFRTable } from "./DFRTable";
import { trackMiles } from "@/lib/dfr";

const pinIcon = (n) => L.divIcon({ className: "dfr-job-pin", html: `<div style="background:#dc2626;color:#fff;border:2px solid #fff;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:700 12px ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5)"><span style="transform:rotate(45deg)">${n}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 28] });

// Fits once per view (mode / point count) so dragging a pin doesn't recenter the map
const FitAll = ({ points, fitKey }) => {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const t = setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 17);
      else map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }, 350);
    return () => clearTimeout(t);
  }, [map, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/** Pin position for a row: manual drag override → first "work" fix → last "travel" fix → first pole/UG of the job. */
const useRowPins = (rows, track, open) => {
  const [fallback, setFallback] = useState({});
  useEffect(() => {
    if (!open) return;
    rows.forEach(async (r) => {
      if (!r.job_id || fallback[r.job_id] !== undefined) return;
      try {
        const [p, u] = await Promise.all([axios.get(`/jobs/${r.job_id}/poles`), axios.get(`/jobs/${r.job_id}/underground`)]);
        const it = [...(p.data || []), ...(u.data || [])].find((x) => Number.isFinite(parseFloat(x.latitude)));
        setFallback((f) => ({ ...f, [r.job_id]: it ? [parseFloat(it.latitude), parseFloat(it.longitude)] : null }));
      } catch { setFallback((f) => ({ ...f, [r.job_id]: null })); }
    });
  }, [rows, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => rows.map((r) => {
    const pts = track.filter((p) => p.row_id === r.id);
    const work = pts.find((p) => p.phase === "work");
    const trav = [...pts].reverse().find((p) => p.phase === "travel");
    const src = work || trav;
    const manual = Number.isFinite(r.pin_lat) && Number.isFinite(r.pin_lng) ? [r.pin_lat, r.pin_lng] : null;
    return { row: r, pos: manual || (src ? [src.lat, src.lng] : fallback[r.job_id] || null), manual: !!manual };
  }), [rows, track, fallback]);
};

export const TravelMapDialog = ({ open, onOpenChange, report, jobs, employees, onRowChange }) => {
  const [mode, setMode] = useState("day"); // "day" | row id
  const [shooting, setShooting] = useState(false);
  const captureRef = useRef(null);
  const rows = report.rows || [];
  const track = report.track || [];
  const pins = useRowPins(rows, track, open);

  const shownRows = mode === "day" ? rows : rows.filter((r) => r.id === mode);
  const shownTrack = mode === "day" ? track : track.filter((p) => p.row_id === mode);
  const shownPins = pins.filter((p) => p.pos && shownRows.some((r) => r.id === p.row.id));
  const line = shownTrack.map((p) => [p.lat, p.lng]);
  const fitPts = useMemo(() => [...line, ...shownPins.map((p) => p.pos)], [line, shownPins]); // eslint-disable-line react-hooks/exhaustive-deps

  const screenshot = async () => {
    const el = captureRef.current;
    if (!el) return;
    setShooting(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const url = await domtoimage.toPng(el, { quality: 1, bgcolor: "#ffffff", width: el.scrollWidth, height: el.scrollHeight, filter: (n) => !(n.classList && n.classList.contains("leaflet-control-zoom")) });
      const a = document.createElement("a");
      const label = mode === "day" ? "Full_Day" : (shownRows[0]?.job || "Job").replace(/[^\w-]+/g, "_");
      a.href = url; a.download = `Travel_Map_${report.date}_${label}.png`; a.click();
      toast.success("Travel map image saved");
    } catch (e) { toast.error("Screenshot failed — try again once the map tiles have loaded"); }
    finally { setShooting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[1400px] bg-white z-[1300] p-4 max-h-[95vh] overflow-y-auto" aria-describedby={undefined} data-testid="dfr-travel-map-dialog">
        <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><Route className="w-4 h-4" />Travel Map — {report.date}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-9 text-sm border border-zinc-300 rounded px-2 bg-white" data-testid="dfr-map-mode">
            <option value="day">Full Day — all jobs</option>
            {rows.map((r, i) => <option key={r.id} value={r.id}>Per Job — {i + 1}. {r.job || "(no job)"}</option>)}
          </select>
          <span className="text-xs text-zinc-500">{shownTrack.length} GPS points · {trackMiles(shownTrack).toFixed(1)} mi{onRowChange ? " · drag a pin to correct its spot" : ""}</span>
          {onRowChange && shownPins.some((p) => p.manual) && (
            <button type="button" className="text-[11px] underline text-zinc-500 hover:text-red-600" onClick={() => shownPins.filter((p) => p.manual).forEach((p) => onRowChange({ ...p.row, pin_lat: null, pin_lng: null }))} data-testid="dfr-pin-reset">Reset moved pin{shownPins.filter((p) => p.manual).length > 1 ? "s" : ""}</button>
          )}
          <Button type="button" onClick={screenshot} disabled={shooting} className="ml-auto h-9 text-xs bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="dfr-map-screenshot-btn">
            {shooting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}Screenshot {mode === "day" ? "Full Day" : "Per Job"}
          </Button>
        </div>
        <div ref={captureRef} className="bg-white p-2 space-y-3" data-testid="dfr-map-capture">
          <div className="text-xs font-mono text-zinc-700 flex flex-wrap gap-x-4">
            <span><b>DAILY FIELD REPORT</b> · {report.date}</span><span>Fielder: {report.fielder || "—"}</span><span>{mode === "day" ? "Full day route" : `Job: ${shownRows[0]?.job || ""}`}</span>
          </div>
          <div className="h-[420px] rounded border border-zinc-300 overflow-hidden">
            <MapContainer center={fitPts[0] || [29.76, -95.37]} zoom={12} className="h-full w-full" scrollWheelZoom>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#f97316", weight: 4, opacity: 0.9 }} />}
              {shownPins.map((p) => {
                const n = rows.findIndex((r) => r.id === p.row.id) + 1;
                return (
                  <Marker key={p.row.id} position={p.pos} icon={pinIcon(n)} draggable={!!onRowChange} eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onRowChange?.({ ...p.row, pin_lat: ll.lat, pin_lng: ll.lng }); toast.success(`${p.row.job || "Job"} pin moved`); } }}>
                    <Tooltip permanent direction="right" offset={[10, -14]} className="dfr-pin-label"><span data-testid={`dfr-pin-label-${n - 1}`}><b>{p.row.job || "Job"}</b></span></Tooltip>
                  </Marker>
                );
              })}
              <FitAll points={fitPts} fitKey={`${mode}:${fitPts.length}:${open}`} />
            </MapContainer>
          </div>
          <DFRTable rows={shownRows} jobs={jobs} employees={employees} onChangeRow={() => {}} onRemoveRow={() => {}} onPickJob={() => {}} activeRowId={null} onActivate={() => {}} readOnly />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TravelMapDialog;
