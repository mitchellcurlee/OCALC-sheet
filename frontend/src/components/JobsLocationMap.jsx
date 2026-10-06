import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const jobPinIcon = (name, completed = false, approx = false, started = false) => {
  const color = completed ? "#16a34a" : started ? "#eab308" : approx ? "#d97706" : "#dc2626";
  return L.divIcon({
    className: "job-pin",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
      <div style="background:${color};color:#fff;font:700 10px ui-monospace,monospace;padding:2px 6px;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;">${name}</div>
      <div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 1px 3px rgba(0,0,0,.5);"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

export const JobsLocationMap = ({ jobs, onOpenJob }) => {
  const pins = jobs.filter((j) => Number.isFinite(j.latitude) && Number.isFinite(j.longitude));
  const unpinned = jobs.filter((j) => !pins.includes(j));
  if (pins.length === 0) return null;
  const bounds = L.latLngBounds(pins.map((j) => [j.latitude, j.longitude]));
  return (
    <div className="industrial-card mb-6 overflow-hidden" data-testid="jobs-location-map-card">
      <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50 flex flex-wrap items-center gap-2">
        <MapIcon className="w-4 h-4 text-red-600" />
        <span className="text-xs font-mono tracking-widest text-zinc-600 uppercase">Job Locations ({pins.length} of {jobs.length})</span>
        <span className="text-[11px] text-zinc-500" data-testid="jobs-pin-legend">Red = open · Yellow = started · Green = complete</span>
        {pins.some((j) => j.pin_approx) && <span className="text-[11px] text-amber-700" data-testid="jobs-approx-legend">Amber pin = address not found exactly, placed at closest match</span>}
        {unpinned.length > 0 && (
          <span className="text-[11px] text-amber-700 ml-auto" data-testid="jobs-unpinned-note" title={unpinned.map((j) => j.name).join(", ")}>
            {unpinned.length} job{unpinned.length > 1 ? "s" : ""} not pinned — add a job address or a GPS attribute: {unpinned.slice(0, 4).map((j) => j.name).join(", ")}{unpinned.length > 4 ? "…" : ""}
          </span>
        )}
      </div>
      <div className="h-[320px]">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [40, 40], maxZoom: 15 }} className="h-full w-full" scrollWheelZoom={true}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
          {/* City / place names */}
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
          {pins.map((job) => (
            <Marker key={job.id} position={[job.latitude, job.longitude]} icon={jobPinIcon(job.name, !!job.completed, !!job.pin_approx, !!job.started)}>
              <Popup>
                <div className="min-w-[160px] font-mono">
                  <div className="text-sm font-bold text-zinc-900">{job.name || job.site_id}</div>
                  {job.location && <div className="text-xs text-zinc-500">{job.location}</div>}
                  {job.pin_approx && <div className="text-[11px] text-amber-700 mt-1" data-testid={`map-pin-approx-${job.id}`}>Address not found exactly — pinned at closest match{job.pin_matched_address ? `: ${job.pin_matched_address}` : ""}</div>}
                  <div className="text-xs text-zinc-600 mt-1">{job.pole_count} attribute{job.pole_count === 1 ? "" : "s"}{job.pinned_by_address && !job.pin_approx ? " · pinned at job address" : ""}</div>
                  <Button size="sm" className="w-full h-7 mt-2 bg-red-600 hover:bg-red-700 text-white" onClick={() => onOpenJob(job.id)} data-testid={`map-open-job-${job.id}`}>
                    Open Job
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

