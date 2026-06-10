import axios from "axios";
import { toast } from "sonner";

export const FEET_PER_METER = 3.28084;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Haversine distance in feet
export const distanceFeet = (a, b) => {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * FEET_PER_METER;
};

// Initial compass bearing (deg from north, clockwise)
export const bearingDeg = (a, b) => {
  const f1 = toRad(a[0]);
  const f2 = toRad(b[0]);
  const dl = toRad(b[1] - a[1]);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

export const hasGps = (p) => Number.isFinite(parseFloat(p.latitude)) && Number.isFinite(parseFloat(p.longitude));

export const naturalCompare = (a, b) =>
  String(a.pole_number || "").localeCompare(String(b.pole_number || ""), undefined, { numeric: true, sensitivity: "base" });

export const fmtFeet = (ft) => `${Math.round(ft).toLocaleString()} ft`;

// Underground attribute abbreviations for map labels
export const UNDERGROUND_ABBR = {
  Handhole: "HH",
  Manhole: "MH",
  "Brooks Enclosure": "BE",
  Flowerpot: "FP",
  "Hoffman Box": "HB",
  Pedestal: "PED",
  "Point of Intersection": "PI",
  FBT: "FBT",
  NTE: "NTE",
  "FBT/NTE": "FBT/NTE",
  PFP: "PFP",
};
export const undergroundAbbr = (type) => UNDERGROUND_ABBR[type] || String(type || "").slice(0, 3).toUpperCase();
export const UNDERGROUND_TYPES = Object.keys(UNDERGROUND_ABBR);

export const ugWithGps = (underground) =>
  (underground || [])
    .filter((u) => Number.isFinite(parseFloat(u.latitude)) && Number.isFinite(parseFloat(u.longitude)))
    .map((u) => ({ ...u, pos: [parseFloat(u.latitude), parseFloat(u.longitude)] }));

export const markerLabel = (p, i, showStops) =>
  showStops ? `${i + 1}\u00B7${p.pole_number || ""}` : String(p.pole_number || "");

// Build the ordered route, segments (with footage + bearing), missing-GPS list
export const computeRoute = (poles) => {
  const sorted = [...poles].sort(naturalCompare);
  const route = sorted.filter(hasGps).map((p) => ({ ...p, pos: [parseFloat(p.latitude), parseFloat(p.longitude)] }));
  const missing = sorted.filter((p) => !hasGps(p)).map((p) => p.pole_number || "(unnumbered)");
  const segments = [];
  let totalFeet = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const ft = distanceFeet(route[i].pos, route[i + 1].pos);
    const deg = bearingDeg(route[i].pos, route[i + 1].pos);
    const mid = [(route[i].pos[0] + route[i + 1].pos[0]) / 2, (route[i].pos[1] + route[i + 1].pos[1]) / 2];
    segments.push({ ft, deg, mid, a: route[i].pole_number, b: route[i + 1].pole_number });
    totalFeet += ft;
  }
  return { route, segments, missing, totalFeet };
};

// For each underground item, find its nearest pole and the connector geometry
export const computeUgConnectors = (route, ug) => {
  if (!route.length || !ug.length) return [];
  return ug.map((u) => {
    let best = route[0];
    let bestD = Infinity;
    route.forEach((p) => {
      const d = distanceFeet(u.pos, p.pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return {
      from: u.pos,
      to: best.pos,
      ft: bestD,
      deg: bearingDeg(u.pos, best.pos),
      mid: [(u.pos[0] + best.pos[0]) / 2, (u.pos[1] + best.pos[1]) / 2],
      pole: best.pole_number,
      abbr: undergroundAbbr(u.type),
    };
  });
};

// Fetch a single satellite image (via backend proxy) and draw the annotated
// pole-route exhibit, then trigger a PNG download. Returns true on success.
export const downloadPoleMapImage = async ({ poles, job, showStops = false, underground = [] }) => {
  const { route, segments, totalFeet } = computeRoute(poles);
  const ug = ugWithGps(underground);
  const connectors = computeUgConnectors(route, ug);
  if (route.length === 0 && ug.length === 0) {
    toast.error("No poles or underground items with GPS coordinates to map");
    return false;
  }
  try {
    const R = 6378137;
    const mercX = (lng) => ((lng * Math.PI) / 180) * R;
    const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
    const mercYtoLat = (my) => ((2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180) / Math.PI;

    const mapW = 1400;
    const mapH = 1050;
    const panelW = 340;
    const s = 2;

    const allPts = [...route.map((p) => p.pos), ...ug.map((u) => u.pos)];
    const xs = allPts.map((p) => mercX(p[1]));
    const ys = allPts.map((p) => mercY(p[0]));
    let xmin = Math.min(...xs);
    let xmax = Math.max(...xs);
    let ymin = Math.min(...ys);
    let ymax = Math.max(...ys);
    const padX = Math.max((xmax - xmin) * 0.18, 140);
    const padY = Math.max((ymax - ymin) * 0.18, 140);
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
      const mx = mercX(latlng[1]);
      const my = mercY(latlng[0]);
      return [((mx - xmin) / (xmax - xmin)) * mapW, ((ymax - my) / (ymax - ymin)) * mapH];
    };

    // 1) Aerial Route line (BLUE)
    if (route.length > 1) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 3 * s;
      ctx.lineJoin = "round";
      ctx.beginPath();
      route.forEach((p, i) => {
        const [x, y] = pt(p.pos);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // 1b) Underground connectors (GREEN dashed) from each UG item to its nearest pole
    if (connectors.length) {
      ctx.save();
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 2.5 * s;
      connectors.forEach((c) => {
        const [x1, y1] = pt(c.from);
        const [x2, y2] = pt(c.to);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
      ctx.restore();
    }

    // 1c) Underground connector distance labels (GREEN pills)
    connectors.forEach((c, i) => {
      const [mx, my] = pt(c.mid);
      const ang = toRad(c.deg - 90);
      const perp = ang + Math.PI / 2;
      const side = i % 2 === 0 ? 1 : -1;
      const off = 22 * s * side;
      const lx = mx + Math.cos(perp) * off;
      const ly = my + Math.sin(perp) * off;
      // leader line
      ctx.strokeStyle = "rgba(22,163,74,0.7)";
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      // pill
      const text = fmtFeet(c.ft);
      ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
      const tw = ctx.measureText(text).width;
      const padX2 = 5 * s;
      const ph = 18 * s;
      const pw = tw + padX2 * 2;
      const px = lx - pw / 2;
      const py = ly - ph / 2;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#166534";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, lx, ly);
    });

    // 2) Direction arrows at segment midpoints (on the line - BLUE)
    segments.forEach((seg) => {
      const [mx, my] = pt(seg.mid);
      const ang = toRad(seg.deg - 90);
      const len = 9 * s;
      const ax = mx + Math.cos(ang) * len;
      const ay = my + Math.sin(ang) * len;
      const left = ang + toRad(150);
      const right = ang - toRad(150);
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(left) * len, ay + Math.sin(left) * len);
      ctx.lineTo(ax + Math.cos(right) * len, ay + Math.sin(right) * len);
      ctx.closePath();
      ctx.fill();
    });

    // 3) Pole markers (numbered)
    route.forEach((p, i) => {
      const [x, y] = pt(p.pos);
      const label = markerLabel(p, i, showStops);
      ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
      const tw = ctx.measureText(label).width;
      const r = 13 * s;
      const w = Math.max(2 * r, tw + 12 * s);
      const rx = x - w / 2;
      const ry = y - r;
      ctx.fillStyle = "#dc2626";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * s;
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
      ctx.fillText(label, x, y + 0.5 * s);
    });

    // 3b) Underground items (GREEN square markers with abbreviation)
    ug.forEach((u) => {
      const [x, y] = pt(u.pos);
      const abbr = undergroundAbbr(u.type);
      ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
      const tw = ctx.measureText(abbr).width;
      const h = 22 * s;
      const w = Math.max(h, tw + 12 * s);
      const rx = x - w / 2;
      const ry = y - h / 2;
      ctx.fillStyle = "#16a34a";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.rect(rx, ry, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(abbr, x, y + 0.5 * s);
    });

    // 4) Aerial footage labels (BLUE pills), offset perpendicular to the line
    //    alternating sides so they don't cover markers or each other
    segments.forEach((seg, i) => {
      const [mx, my] = pt(seg.mid);
      const ang = toRad(seg.deg - 90);
      const perp = ang + Math.PI / 2;
      const side = i % 2 === 0 ? 1 : -1;
      const off = 26 * s * side;
      const lx = mx + Math.cos(perp) * off;
      const ly = my + Math.sin(perp) * off;
      // leader line
      ctx.strokeStyle = "rgba(37,99,235,0.7)";
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      // pill
      const text = fmtFeet(seg.ft);
      ctx.font = `700 ${12 * s}px ui-monospace, monospace`;
      const tw = ctx.measureText(text).width;
      const padX2 = 6 * s;
      const ph = 20 * s;
      const pw = tw + padX2 * 2;
      const px = lx - pw / 2;
      const py = ly - ph / 2;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1e40af";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, lx, ly);
    });

    // 5) Title banner (top-left)
    const ugPart = ug.length ? `, ${ug.length} UG` : "";
    const title = `${job?.name || "Job"}  -  ${route.length} poles${ugPart}, ${fmtFeet(totalFeet)} total`;
    ctx.font = `700 ${13 * s}px ui-monospace, monospace`;
    const bw = ctx.measureText(title).width + 20 * s;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(8 * s, 8 * s, bw, 26 * s);
    ctx.fillStyle = "#18181b";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(title, 18 * s, 8 * s + 13 * s);

    // 6) North arrow (top-right)
    const nx = mapW - 34 * s;
    const ny = 30 * s;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(nx, ny, 20 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.moveTo(nx, ny - 12 * s);
    ctx.lineTo(nx - 6 * s, ny + 4 * s);
    ctx.lineTo(nx + 6 * s, ny + 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#18181b";
    ctx.font = `700 ${10 * s}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", nx, ny + 12 * s);

    // 7) Scale bar (bottom-left)
    const centerLat = mercYtoLat((ymin + ymax) / 2);
    const feetPerPx = ((xmax - xmin) / mapW) * Math.cos((centerLat * Math.PI) / 180) * FEET_PER_METER;
    const targetFeet = feetPerPx * 110;
    const niceFeet = (t) => {
      const pw = Math.pow(10, Math.floor(Math.log10(t)));
      const opts = [1, 2, 5, 10].map((m) => m * pw);
      let v = opts[0];
      opts.forEach((o) => { if (o <= t) v = o; });
      return v;
    };
    const barFeet = niceFeet(targetFeet);
    const barPx = barFeet / feetPerPx;
    const sbx = 16 * s;
    const sby = mapH - 24 * s;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(sbx - 6 * s, sby - 16 * s, barPx + 12 * s, 26 * s);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(sbx, sby - 6 * s);
    ctx.lineTo(sbx, sby);
    ctx.lineTo(sbx + barPx, sby);
    ctx.lineTo(sbx + barPx, sby - 6 * s);
    ctx.stroke();
    ctx.fillStyle = "#18181b";
    ctx.font = `${10 * s}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(fmtFeet(barFeet), sbx + barPx / 2, sby - 7 * s);

    // 7b) Legend (bottom-right of map): red pole, blue aerial, green underground
    const presentUg = [...new Set(ug.map((u) => u.type))];
    const legendLines = [];
    if (route.length) legendLines.push({ kind: "pole", text: "Pole (Red)" });
    if (route.length > 1) legendLines.push({ kind: "aerial", text: "Aerial Path (Blue)" });
    if (ug.length) legendLines.push({ kind: "ug", text: "Underground (Green)" });
    presentUg.forEach((t) => legendLines.push({ kind: "key", abbr: undergroundAbbr(t), text: t }));
    if (legendLines.length) {
      ctx.font = `${11 * s}px ui-monospace, monospace`;
      let maxW = ctx.measureText("LEGEND").width;
      legendLines.forEach((ln) => {
        const t = ln.kind === "key" ? `${ln.abbr}  ${ln.text}` : ln.text;
        maxW = Math.max(maxW, ctx.measureText(t).width + (ln.kind === "key" ? 0 : 22 * s));
      });
      const rowH = 18 * s;
      const boxW = maxW + 24 * s;
      const boxH = (legendLines.length + 1) * rowH + 12 * s;
      const bx = mapW - boxW - 16 * s;
      const by = mapH - boxH - 16 * s;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = "#d4d4d8";
      ctx.lineWidth = 1 * s;
      ctx.strokeRect(bx, by, boxW, boxH);
      ctx.fillStyle = "#18181b";
      ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      let ly = by + 6 * s + rowH / 2;
      ctx.fillText("LEGEND", bx + 12 * s, ly);
      ly += rowH;
      legendLines.forEach((ln) => {
        const sx = bx + 12 * s;
        if (ln.kind === "pole") {
          ctx.fillStyle = "#dc2626";
          ctx.beginPath();
          ctx.arc(sx + 7 * s, ly, 7 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 * s;
          ctx.stroke();
        } else if (ln.kind === "aerial") {
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 3 * s;
          ctx.beginPath();
          ctx.moveTo(sx, ly);
          ctx.lineTo(sx + 14 * s, ly);
          ctx.stroke();
        } else if (ln.kind === "ug") {
          ctx.fillStyle = "#16a34a";
          ctx.fillRect(sx, ly - 7 * s, 14 * s, 14 * s);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 * s;
          ctx.strokeRect(sx, ly - 7 * s, 14 * s, 14 * s);
        }
        ctx.fillStyle = ln.kind === "key" ? "#52525b" : "#18181b";
        ctx.font = `${ln.kind === "key" ? "" : "700 "}${11 * s}px ui-monospace, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const txt = ln.kind === "key" ? `${ln.abbr}  ${ln.text}` : ln.text;
        ctx.fillText(txt, ln.kind === "key" ? sx : sx + 22 * s, ly);
        ly += rowH;
      });
    }

    // 8) Composite: map + right-side segment table panel
    const final = document.createElement("canvas");
    final.width = mapW + panelW;
    final.height = mapH;
    const fctx = final.getContext("2d");
    fctx.fillStyle = "#ffffff";
    fctx.fillRect(0, 0, final.width, final.height);
    fctx.drawImage(canvas, 0, 0);
    fctx.fillStyle = "#f4f4f5";
    fctx.fillRect(mapW, 0, panelW, final.height);
    fctx.fillStyle = "#dc2626";
    fctx.fillRect(mapW, 0, panelW, 30 * s);
    fctx.fillStyle = "#ffffff";
    fctx.font = `700 ${13 * s}px ui-monospace, monospace`;
    fctx.textAlign = "left";
    fctx.textBaseline = "middle";
    fctx.fillText("ROUTE SEGMENTS", mapW + 14 * s, 15 * s);

    let yy = 46 * s;
    const rowH = 19 * s;
    fctx.font = `${11 * s}px ui-monospace, monospace`;
    const maxRows = Math.floor((final.height - 50 * s - yy) / rowH);
    for (let i = 0; i < segments.length; i++) {
      if (segments.length > maxRows && i >= maxRows - 1) {
        fctx.fillStyle = "#71717a";
        fctx.textAlign = "left";
        fctx.fillText(`+ ${segments.length - i} more`, mapW + 14 * s, yy);
        break;
      }
      fctx.fillStyle = "#18181b";
      fctx.textAlign = "left";
      fctx.fillText(`${segments[i].a || "?"} -> ${segments[i].b || "?"}`, mapW + 14 * s, yy);
      fctx.textAlign = "right";
      fctx.fillText(fmtFeet(segments[i].ft), mapW + panelW - 14 * s, yy);
      yy += rowH;
    }
    fctx.fillStyle = "#dc2626";
    fctx.fillRect(mapW, final.height - 34 * s, panelW, 34 * s);
    fctx.fillStyle = "#ffffff";
    fctx.font = `700 ${12 * s}px ui-monospace, monospace`;
    fctx.textAlign = "left";
    fctx.fillText("TOTAL", mapW + 14 * s, final.height - 17 * s);
    fctx.textAlign = "right";
    fctx.fillText(fmtFeet(totalFeet), mapW + panelW - 14 * s, final.height - 17 * s);

    const url = final.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(job?.name || "job").replace(/[^a-z0-9-_]+/gi, "_")}_pole_map.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Map image downloaded");
    return true;
  } catch (e) {
    console.error(e);
    toast.error("Could not generate the map image. Please try again.");
    return false;
  }
};
