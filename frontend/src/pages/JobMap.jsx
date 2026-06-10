import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Zap, AlertTriangle, Crosshair, ListOrdered } from "lucide-react";
import { computeRoute, fmtFeet, markerLabel, downloadPoleMapImage, ugWithGps, undergroundAbbr } from "@/lib/poleMapImage";

const poleIcon = (label) =>
  L.divIcon({
    className: "pole-route-marker",
    html: `<div style="background:#dc2626;color:#fff;border:2px solid #fff;border-radius:13px;min-width:26px;height:26px;padding:0 6px;display:flex;align-items:center;justify-content:center;font:700 11px/1 ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

// Small direction arrow centered on the segment midpoint (on the line)
const arrowIcon = (deg) =>
  L.divIcon({
    className: "seg-arrow",
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:16px;line-height:1;transform:rotate(${deg}deg);">&#8593;</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

// Footage pill, offset perpendicular from the line so it never covers markers
const labelIcon = (text, ox, oy) =>
  L.divIcon({
    className: "seg-label",
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><span style="background:#fff;border:1.5px solid #dc2626;border-radius:11px;padding:1px 7px;font-family:ui-monospace,monospace;font-weight:700;font-size:11px;color:#18181b;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);">${text}</span></div>`,
    iconSize: [64, 22],
    iconAnchor: [32 - ox, 11 - oy],
  });

// Underground item marker (amber square with abbreviation)
const ugIcon = (abbr) =>
  L.divIcon({
    className: "ug-marker",
    html: `<div style="background:#d97706;color:#fff;border:2px solid #fff;border-radius:4px;min-width:24px;height:24px;padding:0 5px;display:flex;align-items:center;justify-content:center;font:700 11px/1 ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;">${abbr}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

const FitBounds = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 19);
    else if (points.length > 1) map.fitBounds(points, { padding: [60, 60], maxZoom: 20 });
  }, [points, map]);
  return null;
};

const MapRefSetter = ({ mapRef }) => {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
};

const JobMap = () => {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [underground, setUnderground] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const mapRef = useRef(null);
  const autoDownloadedRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const [jobRes, polesRes, ugRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/poles`),
        axios.get(`/jobs/${jobId}/underground`),
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data);
      setUnderground(ugRes.data);
    } catch (e) {
      toast.error("Failed to load job map data");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { route, missing, segments, totalFeet } = useMemo(() => computeRoute(poles), [poles]);
  const ug = useMemo(() => ugWithGps(underground), [underground]);
  const presentUg = useMemo(() => [...new Set(ug.map((u) => u.type))], [ug]);
  const linePoints = route.map((p) => p.pos);
  const allPoints = useMemo(() => [...linePoints, ...ug.map((u) => u.pos)], [linePoints, ug]);

  // perpendicular screen offset for each segment label (alternating sides so
  // close-together measurements don't overlap each other or the markers)
  const segLabels = useMemo(
    () =>
      segments.map((seg, i) => {
        const r = (seg.deg * Math.PI) / 180;
        const side = i % 2 === 0 ? 1 : -1;
        const OFF = 24;
        return { ...seg, ox: Math.cos(r) * OFF * side, oy: Math.sin(r) * OFF * side };
      }),
    [segments]
  );

  const recenter = () => {
    const m = mapRef.current;
    if (!m || allPoints.length === 0) return;
    if (allPoints.length === 1) m.setView(allPoints[0], 19);
    else m.fitBounds(allPoints, { padding: [60, 60], maxZoom: 20 });
  };

  const downloadImage = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadPoleMapImage({ poles, job, showStops, underground });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, showStops, underground]);

  // Auto-download when opened with ?download=1 (e.g. from the Excel "Map Image" link)
  useEffect(() => {
    if (loading || autoDownloadedRef.current) return;
    if (searchParams.get("download") === "1" && allPoints.length > 0) {
      autoDownloadedRef.current = true;
      downloadImage();
    }
  }, [loading, searchParams, allPoints, downloadImage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  const center = allPoints.length ? allPoints[0] : [29.7604, -95.3698];

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="job-map-page">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-[1000]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to={`/jobs/${jobId}`}>
              <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900 h-9 w-9" data-testid="map-back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="w-9 h-9 bg-red-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm sm:text-lg font-bold tracking-tight uppercase text-zinc-900 leading-tight">
                {job?.name || "Job"} — Pole Map
              </h1>
              <p className="text-xs font-mono text-zinc-500">
                {route.length} pole(s){ug.length ? ` · ${ug.length} underground` : ""} · {fmtFeet(totalFeet)} total route
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={recenter} disabled={allPoints.length === 0} variant="outline" className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="recenter-btn">
              <Crosshair className="w-4 h-4 mr-2" />
              Fit all
            </Button>
            <Button onClick={() => setShowStops((v) => !v)} disabled={route.length === 0} aria-pressed={showStops} variant="outline" className={showStops ? "bg-red-600 border-red-600 hover:bg-red-700 text-white" : "bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900"} data-testid="toggle-stops-btn">
              <ListOrdered className="w-4 h-4 mr-2" />
              Stop #{"'"}s
            </Button>
            <Button onClick={downloadImage} disabled={downloading || allPoints.length === 0} className="bg-red-600 hover:bg-red-700 text-white" data-testid="download-map-btn">
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Download image
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {missing.length > 0 && (
          <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 rounded" data-testid="missing-gps-banner">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <span className="font-semibold">{missing.length} pole(s) missing GPS</span> and not shown on the map. Capture coordinates for:{" "}
              <span className="font-mono">{missing.join(", ")}</span>
            </div>
          </div>
        )}

        {route.length === 0 && ug.length === 0 ? (
          <div className="industrial-card p-8 text-center text-zinc-500">
            No poles or underground items with GPS coordinates yet. Add coordinates to see them on the map.
          </div>
        ) : (
          <div className="h-[70vh] border border-zinc-300 overflow-hidden rounded relative">
            <MapContainer center={center} zoom={18} minZoom={3} maxZoom={22} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }} className="z-0">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} />
              <FitBounds points={allPoints} />
              <MapRefSetter mapRef={mapRef} />
              {route.length > 1 && <Polyline positions={linePoints} pathOptions={{ color: "#dc2626", weight: 3 }} />}
              {route.map((p, i) => (
                <Marker key={p.id} position={p.pos} icon={poleIcon(markerLabel(p, i, showStops))}>
                  <Popup>
                    <div className="min-w-[180px] font-mono" data-testid={`pole-popup-${p.id}`}>
                      <div className="text-base font-bold text-zinc-900">{p.pole_number || "(unnumbered)"}</div>
                      <div className="mt-1 text-xs text-zinc-600 space-y-0.5">
                        <div><span className="text-zinc-400">Owner:</span> {p.pole_owner || "—"}</div>
                        <div><span className="text-zinc-400">Condition:</span> {p.condition || "—"}</div>
                        <div><span className="text-zinc-400">Size:</span> {p.pole_size ? `${p.pole_size}'` : "—"}</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Link to={`/jobs/${jobId}/view/${p.id}`} className="flex-1">
                          <Button size="sm" className="w-full h-8 bg-red-600 hover:bg-red-700 text-white" data-testid={`popup-view-${p.id}`}>Open</Button>
                        </Link>
                        <Link to={`/jobs/${jobId}/edit/${p.id}`} className="flex-1">
                          <Button size="sm" variant="outline" className="w-full h-8 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid={`popup-edit-${p.id}`}>Edit</Button>
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {segLabels.map((s, i) => (
                <Marker key={`arr-${i}`} position={s.mid} icon={arrowIcon(s.deg)} interactive={false} />
              ))}
              {segLabels.map((s, i) => (
                <Marker key={`lbl-${i}`} position={s.mid} icon={labelIcon(fmtFeet(s.ft), s.ox, s.oy)} interactive={false} zIndexOffset={1000} />
              ))}
              {ug.map((u) => (
                <Marker key={u.id} position={u.pos} icon={ugIcon(undergroundAbbr(u.type))}>
                  <Popup>
                    <div className="min-w-[170px] font-mono" data-testid={`ug-popup-${u.id}`}>
                      <div className="text-sm font-bold text-amber-700">{undergroundAbbr(u.type)} · {u.type}</div>
                      {u.label && <div className="text-xs text-zinc-600 mt-1">{u.label}</div>}
                      {u.notes && <div className="text-xs text-zinc-500 mt-1">{u.notes}</div>}
                      <Link to={`/jobs/${jobId}/underground/edit/${u.id}`}>
                        <Button size="sm" className="w-full h-8 mt-2 bg-amber-600 hover:bg-amber-700 text-white" data-testid={`ug-edit-${u.id}`}>Edit</Button>
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            <div className="absolute bottom-3 right-3 z-[500] bg-white/90 border border-zinc-200 rounded px-3 py-2 text-xs font-mono shadow pointer-events-none max-w-[220px]" data-testid="map-legend">
              <div className="font-bold text-zinc-700 mb-1">LEGEND</div>
              {route.length > 0 && (
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 border border-white inline-block flex-shrink-0"></span>Pole</div>
              )}
              {ug.length > 0 && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-3 h-3 bg-amber-600 border border-white inline-block flex-shrink-0"></span>Underground</div>
              )}
              {presentUg.map((t) => (
                <div key={t} className="text-zinc-500 mt-0.5 ml-1"><span className="text-amber-700 font-semibold">{undergroundAbbr(t)}</span> {t}</div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobMap;
