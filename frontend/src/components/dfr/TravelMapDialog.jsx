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
import { trackMiles, roundQuarter, fmtHrs } from "@/lib/dfr";
import { RoutePlanner, PlannedRouteLine } from "./RoutePlanner";
import { HomeAddress } from "./HomeAddress";

const pinIcon = (n) => L.divIcon({ className: "dfr-job-pin", html: `<div style="background:#dc2626;color:#fff;border:2px solid #fff;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:700 12px ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5)"><span style="transform:rotate(45deg)">${n}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 28] });
const homeIcon = L.divIcon({ className: "dfr-home-pin", html: `<div style="background:#059669;color:#fff;border:2px solid #fff;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:700 12px ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5)"><span style="transform:rotate(45deg)">H</span></div>`, iconSize: [28, 28], iconAnchor: [14, 28] });

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

/** Pin position for a row: manual drag override → job's location (address / first attribute, from the jobs list) → GPS fix → first pole/UG of the job. */
const useRowPins = (rows, track, open, jobs) => {
  const [fallback, setFallback] = useState({});
  const jobPos = (jobId) => { const j = jobs?.find((x) => x.id === jobId); return j && Number.isFinite(j.latitude) && Number.isFinite(j.longitude) ? [j.latitude, j.longitude] : null; };
  useEffect(() => {
    if (!open) return;
    rows.forEach(async (r) => {
      if (r.job_id) {
        if (jobPos(r.job_id) || fallback[r.job_id] !== undefined) return;
        try {
          const [p, u] = await Promise.all([axios.get(`/jobs/${r.job_id}/poles`), axios.get(`/jobs/${r.job_id}/underground`)]);
          const it = [...(p.data || []), ...(u.data || [])].find((x) => Number.isFinite(parseFloat(x.latitude)));
          setFallback((f) => ({ ...f, [r.job_id]: it ? [parseFloat(it.latitude), parseFloat(it.longitude)] : null }));
        } catch { setFallback((f) => ({ ...f, [r.job_id]: null })); }
      } else if ((r.job_address || "").trim().length >= 4) {
        const k = `addr:${r.job_address.trim()}`;
        if (fallback[k] !== undefined) return;
        setFallback((f) => ({ ...f, [k]: null }));
        try { const g = (await axios.get("/field-reports/geocode", { params: { q: r.job_address.trim() } })).data; setFallback((f) => ({ ...f, [k]: [g.lat, g.lng] })); }
        catch { /* leave null */ }
      }
    });
  }, [rows, open, jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => rows.map((r) => {
    const pts = track.filter((p) => p.row_id === r.id);
    const work = pts.find((p) => p.phase === "work");
    const trav = [...pts].reverse().find((p) => p.phase === "travel");
    const src = work || trav;
    const manual = Number.isFinite(r.pin_lat) && Number.isFinite(r.pin_lng) ? [r.pin_lat, r.pin_lng] : null;
    const fb = r.job_id ? fallback[r.job_id] : fallback[`addr:${(r.job_address || "").trim()}`];
    return { row: r, pos: manual || jobPos(r.job_id) || (src ? [src.lat, src.lng] : fb || null), manual: !!manual };
  }), [rows, track, fallback, jobs]); // eslint-disable-line react-hooks/exhaustive-deps
};

export const TravelMapDialog = ({ open, onOpenChange, report, jobs, employees, onRowChange, home, onHomeChange }) => {
  const [mode, setMode] = useState("day"); // "day" | row id
  const [shooting, setShooting] = useState(false);
  const [plan, setPlan] = useState(null); // planned driving route between job pins
  const [addrAt, setAddrAt] = useState({}); // "lat,lng" → nearest address (for pins whose row has no job address)
  const [startHome, setStartHome] = useState(true);
  const [endHome, setEndHome] = useState(false);
  const [showTags, setShowTags] = useState(() => localStorage.getItem("dfrMapTags") !== "off"); // Site ID + address labels on pins
  const toggleTags = () => setShowTags((v) => { localStorage.setItem("dfrMapTags", v ? "off" : "on"); return !v; });
  const captureRef = useRef(null);
  const rows = report.rows || [];
  const track = report.track || [];
  const pins = useRowPins(rows, track, open, jobs);
  const homeSet = Number.isFinite(home?.lat) && Number.isFinite(home?.lng);
  const homePin = useMemo(() => (homeSet ? { row: { id: "home", job: "Home" }, pos: [home.lat, home.lng], home: true } : null), [home, homeSet]);
  const plannerStops = useMemo(() => [...(homePin && startHome ? [homePin] : []), ...pins, ...(homePin && endHome ? [{ ...homePin, row: { id: "home-end", job: "Home" }, end: true }] : [])], [homePin, startHome, endHome, pins]);
  useEffect(() => { setPlan(null); }, [startHome, endHome]);

  const shownRows = mode === "day" ? rows : rows.filter((r) => r.id === mode);
  const shownTrack = mode === "day" ? track : track.filter((p) => p.row_id === mode);
  const shownPins = pins.filter((p) => p.pos && shownRows.some((r) => r.id === p.row.id));
  const line = shownTrack.map((p) => [p.lat, p.lng]);
  const fitPts = useMemo(() => [...line, ...shownPins.map((p) => p.pos), ...(mode === "day" && homePin ? [homePin.pos] : []), ...(mode === "day" && plan ? plan.line : [])], [line, shownPins, plan, mode, homePin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse-geocode pins that have no job address (re-runs when a pin is moved)
  const posKey = (pos) => `${pos[0].toFixed(5)},${pos[1].toFixed(5)}`;
  useEffect(() => {
    if (!open) return;
    shownPins.filter((p) => !p.row.job_address && addrAt[posKey(p.pos)] === undefined).forEach(async (p) => {
      const k = posKey(p.pos);
      setAddrAt((a) => ({ ...a, [k]: null }));
      try { const r = await axios.get("/maps/address-at", { params: { lat: p.pos[0], lng: p.pos[1] } }); setAddrAt((a) => ({ ...a, [k]: r.data.address || "" })); }
      catch { setAddrAt((a) => ({ ...a, [k]: "" })); }
    });
  }, [shownPins, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinAddress = (p) => p.row.job_address || addrAt[posKey(p.pos)] || "";

  const moveHome = async (ll) => {
    try {
      let address = "";
      try { address = (await axios.get("/maps/address-at", { params: { lat: ll.lat, lng: ll.lng } })).data.address || ""; } catch { /* keep old text */ }
      const r = await axios.put("/field-reports/home", { address: address || `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, lat: ll.lat, lng: ll.lng });
      onHomeChange?.(r.data);
      setPlan(null);
      toast.success("Home pin moved");
    } catch { toast.error("Could not save the new home location"); }
  };

  // Home → job 1 fills job 1's Travel to site; job N → next stop (job or Home) fills job N's Return/next site; miles per row = sum of its legs
  const applyPlan = (p) => {
    if (!onRowChange) return;
    const upd = {}, miles = {};
    p.legs.forEach((l) => {
      const r = l.from.home ? l.to.row : l.from.row;
      upd[r.id] = { ...(upd[r.id] || r), [l.from.home ? "travel_hrs" : "return_hrs"]: fmtHrs(roundQuarter(l.hours)) };
      miles[r.id] = (miles[r.id] || 0) + l.miles;
    });
    const filled = Object.keys(upd).some((id) => { const r = rows.find((x) => x.id === id); return r && (r.return_hrs || r.miles || (upd[id].travel_hrs && r.travel_hrs)); });
    if (filled && !window.confirm("Overwrite existing Travel/Return hours and miles with the planned values?")) return;
    Object.values(upd).forEach((r) => onRowChange({ ...r, miles: String(Math.min(500, Math.round(miles[r.id]))) }));
    const homeNote = [p.legs[0]?.from.home && "from Home", p.legs[p.legs.length - 1]?.to.home && "back Home"].filter(Boolean).join(" & ");
    toast.success(`Applied ${p.legs.length} leg${p.legs.length > 1 ? "s" : ""}${homeNote ? ` (${homeNote})` : ""}: Travel/Return hours and miles filled`);
  };

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
      <DialogContent className="max-w-[96vw] w-[1400px] bg-white z-[1300] p-4 max-h-[95vh] overflow-y-auto overflow-x-hidden" aria-describedby={undefined} data-testid="dfr-travel-map-dialog">
        <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><Route className="w-4 h-4" />Travel Map — {report.date}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-9 text-sm border border-zinc-300 rounded px-2 bg-white" data-testid="dfr-map-mode">
            <option value="day">Full Day — all jobs</option>
            {rows.map((r, i) => <option key={r.id} value={r.id}>Per Job — {i + 1}. {r.job || "(no job)"}</option>)}
          </select>
          <span className="text-xs text-zinc-500">{shownTrack.length} GPS points · {trackMiles(shownTrack).toFixed(1)} mi{onRowChange ? " · drag any pin (jobs or Home) to correct its spot" : ""}</span>
          {onRowChange && shownPins.some((p) => p.manual) && (
            <button type="button" className="text-[11px] underline text-zinc-500 hover:text-red-600" onClick={() => shownPins.filter((p) => p.manual).forEach((p) => onRowChange({ ...p.row, pin_lat: null, pin_lng: null }))} data-testid="dfr-pin-reset">Reset moved pin{shownPins.filter((p) => p.manual).length > 1 ? "s" : ""}</button>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 cursor-pointer select-none" title="Show or hide the Site ID / address tags next to the pins">
            <input type="checkbox" checked={showTags} onChange={toggleTags} data-testid="dfr-map-tags-toggle" />Pin tags (Site ID &amp; address)
          </label>
          <Button type="button" onClick={screenshot} disabled={shooting} className="ml-auto h-9 text-xs bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="dfr-map-screenshot-btn">
            {shooting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}Screenshot {mode === "day" ? "Full Day" : "Per Job"}
          </Button>
        </div>
        {onHomeChange && mode === "day" && <HomeAddress home={home || { address: "", lat: null, lng: null }} onChange={onHomeChange} compact />}
        <div ref={captureRef} className="bg-white p-2 space-y-3" data-testid="dfr-map-capture">
          <div className="text-xs font-mono text-zinc-700 flex flex-wrap gap-x-4">
            <span><b>DAILY FIELD REPORT</b> · {report.date}</span><span>Fielder: {report.fielder || "—"}</span><span>{mode === "day" ? "Full day route" : `Job: ${shownRows[0]?.job || ""}`}</span>
          </div>
          <div className="h-[420px] rounded border border-zinc-300 overflow-hidden">
            <MapContainer center={fitPts[0] || [29.76, -95.37]} zoom={12} className="h-full w-full" scrollWheelZoom>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              {/* City / place names */}
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#f97316", weight: 4, opacity: 0.9 }} />}
              {mode === "day" && <PlannedRouteLine plan={plan} />}
              {mode === "day" && homePin && (
                <Marker position={homePin.pos} icon={homeIcon} draggable={!!onHomeChange} eventHandlers={{ dragend: (e) => moveHome(e.target.getLatLng()) }}>
                  {showTags && <Tooltip permanent direction="right" offset={[10, -14]} className="dfr-pin-label"><span data-testid="dfr-home-pin-label"><b>Home</b>{home.address && <><br /><span style={{ fontSize: 10, fontWeight: 400 }}>{home.address}</span></>}</span></Tooltip>}
                </Marker>
              )}
              {shownPins.map((p) => {
                const n = rows.findIndex((r) => r.id === p.row.id) + 1;
                const addr = pinAddress(p);
                return (
                  <Marker key={p.row.id} position={p.pos} icon={pinIcon(n)} draggable={!!onRowChange} eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onRowChange?.({ ...p.row, pin_lat: ll.lat, pin_lng: ll.lng }); toast.success(`${p.row.job || "Job"} pin moved`); } }}>
                    {showTags && <Tooltip permanent direction="right" offset={[10, -14]} className="dfr-pin-label"><span data-testid={`dfr-pin-label-${n - 1}`}><b>{p.row.job || "Job"}</b>{addr && <><br /><span style={{ fontSize: 10, fontWeight: 400 }} data-testid={`dfr-pin-address-${n - 1}`}>{addr}</span></>}</span></Tooltip>}
                  </Marker>
                );
              })}
              <FitAll points={fitPts} fitKey={`${mode}:${fitPts.length}:${open}:${plan ? plan.miles : 0}`} />
            </MapContainer>
          </div>
          {mode === "day" && <RoutePlanner pins={plannerStops} plan={plan} onPlan={setPlan} onApply={onRowChange ? applyPlan : null} homeSet={homeSet} startHome={startHome} endHome={endHome} onStartHome={setStartHome} onEndHome={setEndHome} />}
          <DFRTable rows={shownRows} jobs={jobs} employees={employees} onChangeRow={() => {}} onRemoveRow={() => {}} onPickJob={() => {}} activeRowId={null} onActivate={() => {}} readOnly />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TravelMapDialog;
