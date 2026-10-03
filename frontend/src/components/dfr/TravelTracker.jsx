import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Navigation, MapPin, LogOut, Square, Loader2 } from "lucide-react";
import { summarizeRowTrack, trackMiles, fmtHrs } from "@/lib/dfr";

const MIN_MOVE_M = 8;

/**
 * 4-phase GPS tracker for the active DFR row: Start Travel → Arrived at Site → Leaving Site → Stop Travel.
 * Points are appended to report.track as {lat,lng,t,row_id,phase}; on Stop the row's hours/miles are auto-filled.
 */
export const TravelTracker = ({ report, activeRow, rowIndex, onTrack, onRowChange }) => {
  const [watching, setWatching] = useState(false);
  const [lastFix, setLastFix] = useState(null);
  const watchRef = useRef(null);
  const wakeRef = useRef(null); // Screen Wake Lock keeps the phone awake so GPS keeps flowing
  const phaseRef = useRef(null); // current phase while watching
  const lastPtRef = useRef(null);

  const gps = activeRow?.gps || {};
  const phase = gps.stop ? "done" : gps.leaving ? "return" : gps.arrived ? "work" : gps.travel_start ? "travel" : "idle";
  phaseRef.current = ["travel", "work", "return"].includes(phase) ? phase : null;

  const stopWatch = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    try { wakeRef.current?.release?.(); } catch { /* ignore */ }
    wakeRef.current = null;
    setWatching(false);
  };

  const requestWakeLock = async () => {
    try { if (navigator.wakeLock && !wakeRef.current) wakeRef.current = await navigator.wakeLock.request("screen"); } catch { /* not supported / denied */ }
  };

  const startWatch = () => {
    if (!navigator.geolocation) { toast.error("GPS not available on this device"); return false; }
    if (watchRef.current != null) return true;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: new Date(pos.timestamp || Date.now()).toISOString(), acc: pos.coords.accuracy };
        setLastFix(pt);
        const ph = phaseRef.current;
        if (!ph || !activeRow) return;
        const prev = lastPtRef.current;
        if (prev && trackMiles([prev, pt]) * 1609.34 < MIN_MOVE_M) return;
        lastPtRef.current = pt;
        onTrack({ ...pt, row_id: activeRow.id, phase: ph });
      },
      (err) => { toast.error(err.code === 1 ? "Location permission denied — allow access in browser settings" : "GPS error: " + err.message); stopWatch(); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    setWatching(true);
    requestWakeLock();
    return true;
  };

  // Re-acquire the wake lock when the tab becomes visible again (it is released automatically when hidden)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && watchRef.current != null) requestWakeLock(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => () => stopWatch(), []);
  useEffect(() => { if (watching && phase === "idle") lastPtRef.current = null; }, [watching, phase]);

  const mark = (key) => {
    if (!activeRow) { toast.error("Pick a row to track first (radio icon on the left)"); return; }
    const now = new Date().toISOString();
    const nextGps = { ...gps, [key]: now };
    const row = { ...activeRow, gps: nextGps };
    if (key === "travel_start") { if (!startWatch()) return; toast.success("Travel started — recording GPS"); }
    if (key === "stop") {
      stopWatch();
      const s = summarizeRowTrack([...(report.track || [])], row);
      const first = rowIndex === 0;
      if (first && s.travel_hrs != null) row.travel_hrs = fmtHrs(s.travel_hrs);
      if (s.work_hrs != null) row.work_hrs = fmtHrs(s.work_hrs);
      if (s.return_hrs != null) row.return_hrs = fmtHrs(s.return_hrs);
      row.miles = String(s.miles);
      toast.success(`Auto-filled: ${first ? `travel ${fmtHrs(s.travel_hrs ?? 0)}h, ` : ""}work ${fmtHrs(s.work_hrs ?? 0)}h, return ${fmtHrs(s.return_hrs ?? 0)}h, ${s.miles} mi${first ? "" : " (travel left for manual entry)"}`);
    }
    onRowChange(row);
  };

  const resetRow = () => {
    if (!activeRow || !window.confirm("Clear GPS phases for this row? Recorded track points for this row are removed.")) return;
    stopWatch();
    onTrack(null, activeRow.id);
    onRowChange({ ...activeRow, gps: {} });
  };

  const rowPts = (report.track || []).filter((p) => p.row_id === activeRow?.id);
  const steps = [
    { key: "travel_start", label: "Start Travel", icon: Navigation, enabled: phase === "idle" },
    { key: "arrived", label: "Arrived at Site", icon: MapPin, enabled: phase === "travel" },
    { key: "leaving", label: "Leaving Site", icon: LogOut, enabled: phase === "work" },
    { key: "stop", label: "Stop Travel", icon: Square, enabled: phase === "return" },
  ];

  return (
    <div className="industrial-card bg-white p-3 space-y-2" data-testid="dfr-travel-tracker">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase">GPS Travel Tracking</h3>
        <span className="text-xs text-zinc-600">{activeRow ? <>Row {rowIndex + 1}: <b>{activeRow.job || "(no job)"}</b></> : "Select a row with the radio icon"}</span>
        <span className={`ml-auto inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded ${watching ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500"}`} data-testid="dfr-gps-status">
          {watching ? <><Loader2 className="w-3 h-3 animate-spin" />RECORDING · {rowPts.length} pts · {trackMiles(rowPts).toFixed(1)} mi</> : phase === "done" ? "DONE" : "IDLE"}
          {lastFix?.acc ? ` · ±${Math.round(lastFix.acc)} m` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map(({ key, label, icon: Icon, enabled }) => (
          <Button key={key} type="button" disabled={!enabled || !activeRow} onClick={() => mark(key)}
            className={`h-11 text-xs ${key === "stop" ? "bg-red-600 hover:bg-red-700" : key === "travel_start" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700"} text-white disabled:opacity-40`}
            data-testid={`dfr-${key.replace("_", "-")}-btn`}>
            <Icon className="w-4 h-4 mr-1" />{label}{gps[key] ? ` ✓ ${new Date(gps[key]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Button>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Screen is kept awake while recording; keep this page open (browsers pause GPS when the app is in the background). {rowIndex === 0 ? "First row: Travel, Work and Return are auto-filled." : "Rows after the first: Work and Return auto-filled; Travel to site left for manual entry."} Any value can be edited.</span>
        {activeRow && (gps.travel_start || rowPts.length > 0) && <button type="button" onClick={resetRow} className="underline hover:text-red-600" data-testid="dfr-gps-reset">Reset row GPS</button>}
      </div>
    </div>
  );
};

export default TravelTracker;
