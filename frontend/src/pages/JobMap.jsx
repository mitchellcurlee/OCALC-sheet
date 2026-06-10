import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Zap, AlertTriangle, Crosshair, ListOrdered } from "lucide-react";

const FEET_PER_METER = 3.28084;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Haversine distance in feet between [lat,lng] points
const distanceFeet = (a, b) => {
  const R = 6371000; // earth radius meters
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * FEET_PER_METER;
};

// Initial compass bearing (deg from north, clockwise) from a -> b
const bearingDeg = (a, b) => {
  const φ1 = toRad(a[0]);
  const φ2 = toRad(b[0]);
  const Δλ = toRad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const hasGps = (p) => Number.isFinite(parseFloat(p.latitude)) && Number.isFinite(parseFloat(p.longitude));

// natural-order comparator on pole_number (P-2 < P-12, 1 < 2 < 10)
const naturalCompare = (a, b) =>
  String(a.pole_number || "").localeCompare(String(b.pole_number || ""), undefined, { numeric: true, sensitivity: "base" });

const poleIcon = (label) =>
  L.divIcon({
    className: "pole-route-marker",
    html: `<div style="background:#dc2626;color:#fff;border:2px solid #fff;border-radius:13px;min-width:26px;height:26px;padding:0 6px;display:flex;align-items:center;justify-content:center;font:700 11px/1 ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const segIcon = (text, deg) =>
  L.divIcon({
    className: "seg-label",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-2px);">
      <div style="color:#dc2626;font-size:18px;line-height:1;transform:rotate(${deg}deg);">&#8593;</div>
      <div style="background:#fff;border:1px solid #d4d4d8;border-radius:10px;padding:1px 6px;font:600 11px/1.4 ui-monospace,monospace;color:#18181b;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25);">${text}</div>
    </div>`,
    iconSize: [60, 34],
    iconAnchor: [30, 17],
  });

const FitBounds = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 19);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [60, 60], maxZoom: 20 });
    }
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

const fmtFeet = (ft) => `${Math.round(ft).toLocaleString()} ft`;

const JobMap = () => {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const mapRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [jobRes, polesRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/poles`),
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data);
    } catch (e) {
      toast.error("Failed to load job map data");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { route, missing, segments, totalFeet } = useMemo(() => {
    const sorted = [...poles].sort(naturalCompare);
    const route = sorted.filter(hasGps).map((p) => ({
      ...p,
      pos: [parseFloat(p.latitude), parseFloat(p.longitude)],
    }));
    const missing = sorted.filter((p) => !hasGps(p)).map((p) => p.pole_number || "(unnumbered)");
    const segments = [];
    let totalFeet = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const ft = distanceFeet(route[i].pos, route[i + 1].pos);
      const deg = bearingDeg(route[i].pos, route[i + 1].pos);
      const mid = [(route[i].pos[0] + route[i + 1].pos[0]) / 2, (route[i].pos[1] + route[i + 1].pos[1]) / 2];
      segments.push({ ft, deg, mid });
      totalFeet += ft;
    }
    return { route, missing, segments, totalFeet };
  }, [poles]);

  const linePoints = route.map((p) => p.pos);

  // Marker label: pole number, optionally prefixed with the route stop sequence
  const markerLabel = (p, i) => (showStops ? `${i + 1}\u00B7${p.pole_number || ""}` : String(p.pole_number || ""));

  const recenter = () => {
    const m = mapRef.current;
    if (!m || linePoints.length === 0) return;
    if (linePoints.length === 1) m.setView(linePoints[0], 19);
    else m.fitBounds(linePoints, { padding: [60, 60], maxZoom: 20 });
  };

  const downloadImage = async () => {
    if (route.length === 0) {
      toast.error("No poles with GPS coordinates to render");
      return;
    }
    setDownloading(true);
    try {
      const R = 6378137;
      const toMercX = (lng) => ((lng * Math.PI) / 180) * R;
      const toMercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
      const mercYtoLat = (my) => ((2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180) / Math.PI;
      const mapW = 1400;
      const mapH = 1050;
      const scale = 2;

      const xs = route.map((p) => toMercX(p.pos[1]));
      const ys = route.map((p) => toMercY(p.pos[0]));
      let xmin = Math.min(...xs);
      let xmax = Math.max(...xs);
      let ymin = Math.min(...ys);
      let ymax = Math.max(...ys);
      const padX = Math.max((xmax - xmin) * 0.15, 120);
      const padY = Math.max((ymax - ymin) * 0.15, 120);
      xmin -= padX; xmax += padX; ymin -= padY; ymax += padY;
      const targetAR = mapW / mapH;
      if ((xmax - xmin) / (ymax - ymin) > targetAR) {
        const nh = (xmax - xmin) / targetAR;
        const cy = (ymin + ymax) / 2;
        ymin = cy - nh / 2;
        ymax = cy + nh / 2;
      } else {
        const nw = (ymax - ymin) * targetAR;
        const cx = (xmin + xmax) / 2;
        xmin = cx - nw / 2;
        xmax = cx + nw / 2;
      }

      const res = await axios.get("/maps/static", {
        params: { bbox: `${xmin},${ymin},${xmax},${ymax}`, size: `${mapW},${mapH}` },
        responseType: "blob",
      });
      const imgUrl = URL.createObjectURL(res.data);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = mapW;
      canvas.height = mapH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, mapW, mapH);
      URL.revokeObjectURL(imgUrl);

      const pt = (latlng) => {
        const mx = toMercX(latlng[1]);
        const my = toMercY(latlng[0]);
        return [((mx - xmin) / (xmax - xmin)) * mapW, ((ymax - my) / (ymax - ymin)) * mapH];
      };

          if (route.length > 1) {
            ctx.strokeStyle = "#dc2626";
            ctx.lineWidth = 3 * scale;
            ctx.lineJoin = "round";
            ctx.beginPath();
            route.forEach((p, i) => {
              const [x, y] = pt(p.pos);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.stroke();
          }

          segments.forEach((s) => {
            const [mx, my] = pt(s.mid);
            const ang = toRad(s.deg - 90);
            const len = 9 * scale;
            const ax = mx + Math.cos(ang) * len;
            const ay = my + Math.sin(ang) * len;
            const left = ang + toRad(150);
            const right = ang - toRad(150);
            ctx.fillStyle = "#dc2626";
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + Math.cos(left) * len, ay + Math.sin(left) * len);
            ctx.lineTo(ax + Math.cos(right) * len, ay + Math.sin(right) * len);
            ctx.closePath();
            ctx.fill();
            const text = fmtFeet(s.ft);
            ctx.font = `${12 * scale}px ui-monospace, monospace`;
            const tw = ctx.measureText(text).width;
            const padX = 5 * scale;
            const ph = 18 * scale;
            const px = mx - tw / 2 - padX;
            const py = my + 6 * scale;
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#d4d4d8";
            ctx.lineWidth = 1 * scale;
            ctx.beginPath();
            ctx.rect(px, py, tw + padX * 2, ph);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#18181b";
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            ctx.fillText(text, mx - tw / 2, py + ph / 2);
          });

          route.forEach((p, i) => {
            const [x, y] = pt(p.pos);
            const label = markerLabel(p, i);
            ctx.font = `700 ${11 * scale}px ui-monospace, monospace`;
            const tw = ctx.measureText(label).width;
            const r = 13 * scale;
            const w = Math.max(2 * r, tw + 12 * scale);
            const rx = x - w / 2;
            const ry = y - r;
            ctx.fillStyle = "#dc2626";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(rx + r, ry);
            ctx.arcTo(rx + w, ry, rx + w, ry + 2 * r, r);
            ctx.arcTo(rx + w, ry + 2 * r, rx, ry + 2 * r, r);
            ctx.arcTo(rx, ry + 2 * r, rx, ry, r);
            ctx.arcTo(rx, ry, rx + w, ry, r);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, x, y + 0.5 * scale);
          });

          // Title banner (top-left)
          const title = `${job?.name || "Job"}  -  ${route.length} poles, ${fmtFeet(totalFeet)} total`;
          ctx.font = `700 ${13 * scale}px ui-monospace, monospace`;
          const bw = ctx.measureText(title).width + 20 * scale;
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.fillRect(8 * scale, 8 * scale, bw, 26 * scale);
          ctx.fillStyle = "#18181b";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(title, 18 * scale, 8 * scale + 13 * scale);

          // North arrow (top-right)
          const nx = canvas.width - 34 * scale;
          const ny = 30 * scale;
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.beginPath();
          ctx.arc(nx, ny, 20 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#dc2626";
          ctx.beginPath();
          ctx.moveTo(nx, ny - 12 * scale);
          ctx.lineTo(nx - 6 * scale, ny + 4 * scale);
          ctx.lineTo(nx + 6 * scale, ny + 4 * scale);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#18181b";
          ctx.font = `700 ${10 * scale}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("N", nx, ny + 12 * scale);

          // Scale bar (bottom-left)
          const centerLat = mercYtoLat((ymin + ymax) / 2);
          const feetPerPxCss = (((xmax - xmin) / mapW) * Math.cos((centerLat * Math.PI) / 180) * FEET_PER_METER) / scale;
          const targetFeet = feetPerPxCss * 110;
          const niceFeet = (t) => {
            const p = Math.pow(10, Math.floor(Math.log10(t)));
            const opts = [1, 2, 5, 10].map((m) => m * p);
            let v = opts[0];
            opts.forEach((o) => { if (o <= t) v = o; });
            return v;
          };
          const barFeet = niceFeet(targetFeet);
          const barPx = (barFeet / feetPerPxCss) * scale;
          const sbx = 16 * scale;
          const sby = canvas.height - 24 * scale;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillRect(sbx - 6 * scale, sby - 16 * scale, barPx + 12 * scale, 26 * scale);
          ctx.strokeStyle = "#18181b";
          ctx.lineWidth = 2 * scale;
          ctx.beginPath();
          ctx.moveTo(sbx, sby - 6 * scale);
          ctx.lineTo(sbx, sby);
          ctx.lineTo(sbx + barPx, sby);
          ctx.lineTo(sbx + barPx, sby - 6 * scale);
          ctx.stroke();
          ctx.fillStyle = "#18181b";
          ctx.font = `${10 * scale}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(fmtFeet(barFeet), sbx + barPx / 2, sby - 7 * scale);

          // Composite: map + right-side per-segment table panel
          const panelW = 250 * scale;
          const final = document.createElement("canvas");
          final.width = canvas.width + panelW;
          final.height = canvas.height;
          const fctx = final.getContext("2d");
          fctx.fillStyle = "#ffffff";
          fctx.fillRect(0, 0, final.width, final.height);
          fctx.drawImage(canvas, 0, 0);
          const px0 = canvas.width;
          fctx.fillStyle = "#f4f4f5";
          fctx.fillRect(px0, 0, panelW, final.height);
          fctx.fillStyle = "#dc2626";
          fctx.fillRect(px0, 0, panelW, 30 * scale);
          fctx.fillStyle = "#ffffff";
          fctx.font = `700 ${13 * scale}px ui-monospace, monospace`;
          fctx.textAlign = "left";
          fctx.textBaseline = "middle";
          fctx.fillText("ROUTE SEGMENTS", px0 + 14 * scale, 15 * scale);

          let yy = 46 * scale;
          const rowH = 19 * scale;
          fctx.font = `${11 * scale}px ui-monospace, monospace`;
          fctx.textBaseline = "middle";
          const maxRows = Math.floor((final.height - 50 * scale - yy) / rowH);
          for (let i = 0; i < segments.length; i++) {
            if (segments.length > maxRows && i >= maxRows - 1) {
              fctx.fillStyle = "#71717a";
              fctx.fillText(`+ ${segments.length - i} more`, px0 + 14 * scale, yy);
              break;
            }
            const from = String(route[i].pole_number || "?");
            const to = String(route[i + 1].pole_number || "?");
            fctx.fillStyle = "#18181b";
            fctx.textAlign = "left";
            fctx.fillText(`${from} -> ${to}`, px0 + 14 * scale, yy);
            const ft = fmtFeet(segments[i].ft);
            fctx.textAlign = "right";
            fctx.fillText(ft, px0 + panelW - 14 * scale, yy);
            yy += rowH;
          }
          // Total row at bottom of panel
          fctx.fillStyle = "#dc2626";
          fctx.fillRect(px0, final.height - 34 * scale, panelW, 34 * scale);
          fctx.fillStyle = "#ffffff";
          fctx.font = `700 ${12 * scale}px ui-monospace, monospace`;
          fctx.textAlign = "left";
          fctx.fillText("TOTAL", px0 + 14 * scale, final.height - 17 * scale);
          fctx.textAlign = "right";
          fctx.fillText(fmtFeet(totalFeet), px0 + panelW - 14 * scale, final.height - 17 * scale);

          const url = final.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(job?.name || "job").replace(/[^a-z0-9-_]+/gi, "_")}_pole_map.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast.success("Map image downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Could not generate image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  const center = route.length ? route[0].pos : [29.7604, -95.3698];

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
                {route.length} pole(s) plotted · {fmtFeet(totalFeet)} total route
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={recenter} disabled={route.length === 0} variant="outline" className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="recenter-btn">
              <Crosshair className="w-4 h-4 mr-2" />
              Fit all
            </Button>
            <Button onClick={() => setShowStops((v) => !v)} disabled={route.length === 0} variant="outline" aria-pressed={showStops} className={showStops ? "bg-red-600 border-red-600 hover:bg-red-700 text-white" : "bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900"} data-testid="toggle-stops-btn">
              <ListOrdered className="w-4 h-4 mr-2" />
              Stop #{"'"}s
            </Button>
            <Button onClick={downloadImage} disabled={downloading || route.length === 0} className="bg-red-600 hover:bg-red-700 text-white" data-testid="download-map-btn">
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

        {route.length === 0 ? (
          <div className="industrial-card p-8 text-center text-zinc-500">
            No poles with GPS coordinates yet. Add coordinates to poles to see them on the map.
          </div>
        ) : (
          <div className="h-[70vh] border border-zinc-300 overflow-hidden rounded">
            <MapContainer center={center} zoom={18} minZoom={3} maxZoom={22} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }} className="z-0">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              <FitBounds points={linePoints} />
              <MapRefSetter mapRef={mapRef} />
              {route.length > 1 && <Polyline positions={linePoints} pathOptions={{ color: "#dc2626", weight: 3 }} />}
              {route.map((p, i) => (
                <Marker key={p.id} position={p.pos} icon={poleIcon(markerLabel(p, i))}>
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
              {segments.map((s, i) => (
                <Marker key={`seg-${i}`} position={s.mid} icon={segIcon(fmtFeet(s.ft), s.deg)} interactive={false} />
              ))}
            </MapContainer>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobMap;
