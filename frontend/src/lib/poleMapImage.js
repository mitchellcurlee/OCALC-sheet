import axios from "axios";
import { toast } from "sonner";
import JSZip from "jszip";

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

export const fmtFeet = (ft) => {
  // Show decimal for more precision - no rounding
  if (ft < 10) {
    return `${ft.toFixed(1)} ft`;
  } else if (ft < 100) {
    return `${ft.toFixed(1)} ft`;
  } else {
    // For larger distances, show whole number
    return `${Math.round(ft).toLocaleString()} ft`;
  }
};

// Convert feet to station format (0+00)
export const feetToStation = (feet) => {
  const stations = Math.floor(feet / 100);
  const remainder = Math.round(feet % 100);
  return `${stations}+${remainder.toString().padStart(2, '0')}`;
};

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
  "SOC Start": "SOC-S",
  "SOC End": "SOC-E",
  Riser: "RSR",
  MPOE: "MPOE",
  EOP: "EOP",
  ROW: "ROW",
  "DW Start": "DW-S",
  "DW End": "DW-E",
  "UG Path Start": "UGP-S",
  "UG Path End": "UGP-E",
  "Aerial Splice": "AS",
  Loop: "LOOP",
  Power: "PWR",
  Culvert: "CULV",
  "Drainage Start": "DR-S",
  "Drainage End": "DR-E",
  Eyebolt: "EB",
  Pullbox: "PB",
  "Weather Head": "WH",
  FDF: "FDF",
  "Aerial NTE": "NTE",
  "Aerial PI": "PI",
  "Aerial FBT": "FBT",
};
export const undergroundAbbr = (type) => UNDERGROUND_ABBR[type] || String(type || "").slice(0, 3).toUpperCase();
export const UNDERGROUND_TYPES = Object.keys(UNDERGROUND_ABBR);

export const ugWithGps = (underground) =>
  (underground || [])
    .filter((u) => Number.isFinite(parseFloat(u.latitude)) && Number.isFinite(parseFloat(u.longitude)))
    .map((u) => ({ ...u, pos: [parseFloat(u.latitude), parseFloat(u.longitude)] }));

export const markerLabel = (p, i, showStops) =>
  showStops ? `${i + 1}\u00B7${p.pole_number || ""}` : String(p.pole_number || "");

// Sort with respect to sort_order if set, otherwise natural sort
export const poleSortKey = (p) => {
  if (p.sort_order !== null && p.sort_order !== undefined) {
    return [0, p.sort_order, ""];
  }
  return [1, 0, String(p.pole_number || "")];
};

export const sortPoles = (poles) => {
  return [...poles].sort((a, b) => {
    const keyA = poleSortKey(a);
    const keyB = poleSortKey(b);
    for (let i = 0; i < keyA.length; i++) {
      if (keyA[i] < keyB[i]) return -1;
      if (keyA[i] > keyB[i]) return 1;
    }
    // If sort_order priority is the same, use natural compare for pole_number
    return naturalCompare(a, b);
  });
};

// Build the ordered route, segments (with footage + bearing), missing-GPS list
export const computeRoute = (poles) => {
  const sorted = sortPoles(poles);
  const route = sorted.filter(hasGps).map((p) => ({ ...p, pos: [parseFloat(p.latitude), parseFloat(p.longitude)] }));
  const missing = sorted.filter((p) => !hasGps(p)).map((p) => p.pole_number || "(unnumbered)");
  const segments = [];
  let totalFeet = 0;
  let totalRiserFeet = 0;
  let usingManualSpans = false;
  
  for (let i = 0; i < route.length - 1; i++) {
    const poleA = route[i];
    const poleB = route[i + 1];
    const gpsFt = distanceFeet(poleA.pos, poleB.pos);
    const deg = bearingDeg(poleA.pos, poleB.pos);
    const mid = [(poleA.pos[0] + poleB.pos[0]) / 2, (poleA.pos[1] + poleB.pos[1]) / 2];
    
    // Check if poleA has use_manual_spans enabled and has a manual span1_distance
    // The span from pole A goes TO pole B, so we use poleA's span distances
    let ft = gpsFt;
    let isManual = false;
    
    // Check for manual spans - handle boolean, string "true", or truthy value
    const useManual = poleA.use_manual_spans === true || poleA.use_manual_spans === "true";
    const manualDist = parseFloat(poleA.span1_distance);
    
    if (useManual && manualDist > 0) {
      ft = manualDist;
      isManual = true;
      usingManualSpans = true;
    }
    
    segments.push({ ft, gpsFt, deg, mid, a: poleA.pole_number, b: poleB.pole_number, isManual });
    totalFeet += ft;
  }
  
  // Calculate total riser footage
  for (const p of route) {
    if (p.riser_height && p.risers) {
      const riserCount = parseInt(p.risers) || 0;
      const riserHeight = parseFloat(p.riser_height) || 0;
      totalRiserFeet += riserCount * riserHeight;
    }
  }
  
  return { route, segments, missing, totalFeet, totalRiserFeet, grandTotalFeet: totalFeet + totalRiserFeet, usingManualSpans };
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
      ugType: u.type, // Include the underground type for MPOE detection
    };
  });
};

// Aerial attribute types (kept in sync with JobMap.jsx AERIAL_ATTR_TYPES)
export const AERIAL_ATTR_TYPES = new Set(["Loop", "Aerial Splice", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head", "Aerial NTE", "Aerial PI", "Aerial FBT"]);

// Per-item aerial/underground classification: explicit override wins, else by type
export const isAerialAttr = (u) =>
  (u.aerial_override === "aerial" || u.aerial_override === "underground")
    ? u.aerial_override === "aerial"
    : AERIAL_ATTR_TYPES.has(u.type);

// Class of a pair item: "aerial" | "underground" | "neutral" (pass-through)
export const pairItemClass = (it) => {
  if (it.type === "pole") return "aerial";
  if (it.aerialOverride === "neutral") return "neutral";
  if (it.aerialOverride) return it.aerialOverride;
  return AERIAL_ATTR_TYPES.has(it.ugType) ? "aerial" : "underground";
};

// Resolve a segment's aerial-ness: neutral items inherit from the other end
export const resolvePairAerial = (fromItem, toItem) => {
  const cf = pairItemClass(fromItem), ct = pairItemClass(toItem);
  if (cf === "neutral" && ct === "neutral") return true;
  if (cf === "neutral") return ct === "aerial";
  if (ct === "neutral") return cf === "aerial";
  return cf === "aerial" && ct === "aerial";
};

// Build map line pairs the same way the live Job Map does (custom connections + End Path breaks + standalone items)
export const computeConnectionPairs = (route, ug, connections = []) => {
  const allItems = [];
  route.forEach((p) => allItems.push({ id: p.id, type: "pole", pos: p.pos, sort_order: p.sort_order ?? Infinity, label: p.pole_number || "Pole", start_path: p.start_path === true, end_path: p.end_path === true, standalone: p.standalone === true, markerColor: p.marker_color || null }));
  ug.forEach((u) => allItems.push({ id: u.id, type: "underground", ugType: u.type, aerialOverride: ["aerial", "underground", "neutral"].includes(u.aerial_override) ? u.aerial_override : null, pos: u.pos, sort_order: u.sort_order ?? Infinity, label: u.label || u.type, start_path: u.start_path === true, end_path: u.end_path === true, standalone: u.standalone === true, hasPath: (u.path_measurements || []).length > 0, markerColor: u.marker_color || null }));
  allItems.sort((a, b) => a.sort_order - b.sort_order);
  const byId = {};
  allItems.forEach((it) => { byId[it.id] = it; });
  // Standalone items are excluded from the path chain entirely
  const pathItems = allItems.filter((it) => !it.standalone);
  let pairs = [];
  if (connections.length > 0) {
    // "removed" tombstones: user deleted this auto line — draw nothing, but keep
    // the endpoints counted as referenced so the chain fallback doesn't resurrect it
    pairs = connections
      .filter((c) => c.connection_type !== "removed")
      .map((c) => ({ from: byId[c.from_item_id], to: byId[c.to_item_id], connType: c.connection_type, typeOverride: c.type_override }))
      .filter((p) => p.from && p.to && p.from.id !== p.to.id)
      .filter((p) => {
        if (p.connType === "custom") return true;
        if (p.from.standalone || p.to.standalone) return false;
        const earlier = p.from.sort_order <= p.to.sort_order ? p.from : p.to;
        const later = p.from.sort_order <= p.to.sort_order ? p.to : p.from;
        return !earlier.end_path && !later.start_path;
      });
    const referenced = new Set();
    connections.forEach((c) => { referenced.add(c.from_item_id); referenced.add(c.to_item_id); });
    const unreferenced = pathItems.filter((it) => !referenced.has(it.id));
    // Drop non-custom connections that skip over a newly added (unreferenced) path item —
    // the chain segments through that item replace the direct line
    if (unreferenced.length > 0) {
      pairs = pairs.filter((p) => {
        if (p.connType === "custom") return true;
        const lo = Math.min(p.from.sort_order, p.to.sort_order);
        const hi = Math.max(p.from.sort_order, p.to.sort_order);
        return !unreferenced.some((it) => it.sort_order > lo && it.sort_order < hi);
      });
    }
    for (let i = 0; i < pathItems.length - 1; i++) {
      const a = pathItems[i], b = pathItems[i + 1];
      if ((!referenced.has(a.id) || !referenced.has(b.id)) && !a.end_path && !b.start_path) pairs.push({ from: a, to: b });
    }
    // Keep the whole list in route order (fallback pairs included)
    pairs.sort((a, b) =>
      (Math.min(a.from.sort_order, a.to.sort_order) - Math.min(b.from.sort_order, b.to.sort_order)) ||
      (Math.max(a.from.sort_order, a.to.sort_order) - Math.max(b.from.sort_order, b.to.sort_order))
    );
  } else {
    for (let i = 0; i < pathItems.length - 1; i++) {
      if (pathItems[i].end_path || pathItems[i + 1].start_path) continue;
      pairs.push({ from: pathItems[i], to: pathItems[i + 1] });
    }
  }
  return pairs;
};

export const pairIsAerial = (pr) => {
  if (pr.typeOverride === "aerial") return true;
  if (pr.typeOverride === "underground") return false;
  return resolvePairAerial(pr.from, pr.to);
};

// A pair whose FROM item has manual path measurements: its auto GPS footage is replaced
export const pairIsManual = (pr) => pr.from.type === "underground" && pr.from.hasPath === true;

// Waypoint-following path helpers (routes = { "fromId-toId": [{lat,lng}, ...] })
const segPath = (pr, routes) => {
  const wps = (routes && routes[`${pr.from.id}-${pr.to.id}`]) || [];
  return [pr.from.pos, ...wps.map((w) => [w.lat, w.lng]), pr.to.pos];
};
const pathFeet = (path) => path.reduce((s2, p, i) => (i === 0 ? 0 : s2 + distanceFeet(path[i - 1], p)), 0);
const pathMid = (path) => {
  const m = Math.floor(path.length / 2);
  return path.length % 2 === 0
    ? [(path[m - 1][0] + path[m][0]) / 2, (path[m - 1][1] + path[m][1]) / 2]
    : path[m];
};

// Insert UG path-measurement rows into a display-row list at their route position (by sort_order)
const insertPathRows = (displayRows, underground) => {
  [...(underground || [])]
    .filter((u) => (u.path_measurements || []).length > 0)
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    .forEach((u) => {
      const ft = u.path_measurements.reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);
      const row = {
        type: "path",
        so: u.sort_order ?? Infinity,
        text: `${undergroundAbbr(u.type)}${u.label && u.label !== u.type ? ` ${u.label}` : ""}: ${u.path_measurements.map((m) => `${m.direction} ${m.feet}ft`).join(", ")}`,
        ft,
      };
      const idx = displayRows.findIndex((r) => (r.so ?? Infinity) >= row.so);
      if (idx === -1) displayRows.push(row);
      else displayRows.splice(idx, 0, row);
    });
};

const totalPathFeet = (underground) =>
  (underground || []).reduce((acc, u) => acc + (u.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0), 0);

// Build the exact text lines shown in the interactive map's Span Measurements list.
// Used by the ASE checklist "path of approach" so both always match.
export const buildSpanMeasurementTexts = ({ poles, underground = [], connections = [], includeStations = false, stationsOnly = false, routes = {} }) => {
  if (stationsOnly) includeStations = true;
  const { route } = computeRoute(poles);
  const ug = ugWithGps(underground);
  const pairs = computeConnectionPairs(route, ug, connections);
  const itemName = (it) => it.type === "pole"
    ? (/^\d/.test(String(it.label || "")) ? `P${it.label}` : (it.label || "Pole"))
    : `${undergroundAbbr(it.ugType)}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`;

  // Cumulative station numbers per item (matches the map's Sta #'s toggle).
  // New-riser footage advances the chainage after its pole.
  const stations = {};
  const riserStations = {};
  if (includeStations) {
    const all = [
      ...ug.map((u) => ({ id: u.id, pos: u.pos, so: u.sort_order ?? Infinity, extraFeet: (u.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0) })),
      ...route.map((p) => ({ id: p.id, pos: p.pos, so: p.sort_order ?? Infinity, extraFeet: (parseInt(p.risers) || 0) * (parseFloat(p.riser_height) || 0) })),
    ].sort((a, b) => a.so - b.so);
    let run = 0, prev = null;
    all.forEach((it) => {
      if (prev) run += distanceFeet(prev.pos, it.pos);
      stations[it.id] = feetToStation(run);
      if (it.extraFeet > 0) {
        run += it.extraFeet;
        riserStations[it.id] = feetToStation(run);
      }
      prev = it;
    });
  }
  const nameWithSta = (it, departure = false) => {
    const sta = departure ? (riserStations[it.id] || stations[it.id]) : stations[it.id];
    return `${itemName(it)}${includeStations && sta ? ` ${sta}` : ""}`;
  };

  const rows = [];
  const riserDone = new Set();
  const pathDone = new Set();
  const pathTextOf = (u) => {
    const t = (u.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);
    const base = `${undergroundAbbr(u.type)}${u.label && u.label !== u.type ? ` ${u.label}` : ""}: ${u.path_measurements.map((m) => `${m.direction} ${m.feet}ft${m.to ? ` to ${m.to}` : ""}`).join(", ")} = ${fmtFeet(t)}`;
    return stationsOnly && riserStations[u.id] ? `${base} (${stations[u.id]} to ${riserStations[u.id]})` : base;
  };
  const pushRiser = (it) => {
    if (it.type !== "pole" || riserDone.has(it.id)) return;
    const p = route.find((x) => x.id === it.id);
    const c = parseInt(p?.risers) || 0, h = parseFloat(p?.riser_height) || 0;
    if (c > 0 && h > 0) {
      riserDone.add(it.id);
      rows.push({
        so: it.sort_order ?? Infinity,
        text: stationsOnly
          ? `${itemName(it)} New Riser${c > 1 ? ` x${c}` : ""} ${riserStations[it.id] || stations[it.id] || ""}`.trim()
          : `${itemName(it)} New Riser${c > 1 ? ` x${c}` : ""} = ${fmtFeet(c * h)}`,
      });
    }
  };
  const pushPath = (it) => {
    if (it.type === "pole" || pathDone.has(it.id)) return;
    const u = underground.find((x) => x.id === it.id);
    if (!u || !(u.path_measurements || []).length) return;
    pathDone.add(it.id);
    rows.push({ so: it.sort_order ?? Infinity, text: pathTextOf(u) });
  };
  pairs.forEach((pr) => {
    pushRiser(pr.from);
    pushPath(pr.from);
    if (!pairIsManual(pr)) {
      rows.push({
        so: pr.from.sort_order ?? Infinity,
        text: stationsOnly
          ? `${nameWithSta(pr.from, true)} to ${nameWithSta(pr.to)}${pairIsAerial(pr) ? "" : " (UG)"}`
          : `${nameWithSta(pr.from, true)} to ${nameWithSta(pr.to)} = ${fmtFeet(pathFeet(segPath(pr, routes)))}${pairIsAerial(pr) ? "" : " (UG)"}`,
      });
    }
  });
  if (pairs.length > 0) {
    const last = pairs[pairs.length - 1];
    pushRiser(last.to);
    pushPath(last.to);
  }
  [...underground]
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    .filter((u) => (u.path_measurements || []).length > 0 && !pathDone.has(u.id))
    .forEach((u) => {
      pathDone.add(u.id);
      const so = u.sort_order ?? Infinity;
      const row = { so, text: pathTextOf(u) };
      const idx = rows.findIndex((r) => (r.so ?? Infinity) > so);
      if (idx === -1) rows.push(row);
      else rows.splice(idx, 0, row);
    });
  return rows.map((r) => r.text);
};

// Fetch a single satellite image (via backend proxy) and draw the annotated
// pole-route exhibit, then trigger a PNG download. Returns true on success.
export const downloadPoleMapImage = async ({ poles, job, showStops = false, underground = [], connections = [], routes = {}, basemap = "esri", returnBlob = false }) => {
  const { route, totalRiserFeet } = computeRoute(poles);
  const ug = ugWithGps(underground);
  // Mirror the live Job Map lines: custom connections + End Path breaks
  const pairSegs = computeConnectionPairs(route, ug, connections).map((pr) => {
    const path = segPath(pr, routes);
    return {
      from: pr.from,
      to: pr.to,
      path,
      ft: pathFeet(path),
      deg: bearingDeg(pr.from.pos, pr.to.pos),
      mid: pathMid(path),
      aerial: pairIsAerial(pr),
      manual: pairIsManual(pr),
    };
  });
  const aerialFt = pairSegs.reduce((acc, x) => acc + (x.aerial && !x.manual ? x.ft : 0), 0);
  const ugFt = pairSegs.reduce((acc, x) => acc + (!x.aerial && !x.manual ? x.ft : 0), 0);
  const pathFt = totalPathFeet(underground);
  const grandFt = aerialFt + ugFt + totalRiserFeet + pathFt;
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
      params: { bbox: `${xmin},${ymin},${xmax},${ymax}`, size: `${mapW},${mapH}`, source: basemap || "esri" },
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

    // 1) Route lines mirroring the live map: aerial (BLUE solid), underground (GREEN dashed)
    pairSegs.forEach((sg) => {
      const pts = (sg.path || [sg.from.pos, sg.to.pos]).map((ll) => pt(ll));
      ctx.save();
      if (!sg.aerial) ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeStyle = sg.aerial ? "#2563eb" : "#16a34a";
      ctx.lineWidth = sg.aerial ? 3 * s : 2.5 * s;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
      ctx.restore();
    });

    // 2) Direction arrows at aerial segment midpoints (on the line - BLUE)
    pairSegs.filter((sg) => sg.aerial).forEach((seg) => {
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

    // Helper to detect clustered poles
    const CLUSTER_THRESHOLD_FT = 100;
    const poleClusterInfo = route.map((p, i) => {
      let isCluster = false;
      route.forEach((other, j) => {
        if (i !== j) {
          const dist = distanceFeet(p.pos, other.pos);
          if (dist < CLUSTER_THRESHOLD_FT) {
            isCluster = true;
          }
        }
      });
      const labelAngle = (i * 137.5) % 360; // golden angle distribution
      return { ...p, isCluster, labelAngle };
    });

    // 3) Pole markers (small dots with side labels)
    poleClusterInfo.forEach((p, i) => {
      const [x, y] = pt(p.pos);
      const label = markerLabel(p, i, showStops);
      const dotR = 6 * s; // smaller dot radius
      const poleColor = p.marker_color || "#dc2626";
      
      // Draw pole dot (custom color or red)
      ctx.fillStyle = poleColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw label with arrow if clustered, otherwise side label
      ctx.font = `700 ${10 * s}px ui-monospace, monospace`;
      const tw = ctx.measureText(label).width;
      const labelPadX = 6 * s;
      const labelH = 18 * s;
      const labelW = tw + labelPadX * 2;
      
      let labelX, labelY;
      
      if (p.isCluster) {
        // Clustered: draw arrow pointing to dot
        const arrowDist = 45 * s;
        const rad = (p.labelAngle * Math.PI) / 180;
        labelX = x + Math.cos(rad) * arrowDist;
        labelY = y + Math.sin(rad) * arrowDist;
        
        // Draw arrow line
        ctx.strokeStyle = poleColor;
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(labelX, labelY);
        ctx.stroke();
        
        // Draw arrowhead pointing to dot
        const headLen = 6 * s;
        const headAngle = Math.atan2(y - labelY, x - labelX);
        ctx.fillStyle = poleColor;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(headAngle) * dotR, y - Math.sin(headAngle) * dotR);
        ctx.lineTo(x - Math.cos(headAngle) * dotR - headLen * Math.cos(headAngle - 0.4), y - Math.sin(headAngle) * dotR - headLen * Math.sin(headAngle - 0.4));
        ctx.lineTo(x - Math.cos(headAngle) * dotR - headLen * Math.cos(headAngle + 0.4), y - Math.sin(headAngle) * dotR - headLen * Math.sin(headAngle + 0.4));
        ctx.closePath();
        ctx.fill();
      } else {
        // Non-clustered: label to the side (alternating left/right)
        const offset = 16 * s;
        labelX = i % 2 === 0 ? x + offset + labelW / 2 : x - offset - labelW / 2;
        labelY = y;
      }
      
      // Draw label background
      ctx.fillStyle = poleColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.roundRect(labelX - labelW / 2, labelY - labelH / 2, labelW, labelH, 6 * s);
      ctx.fill();
      ctx.stroke();
      
      // Draw label text
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX, labelY);
      
      // END badge for End Path poles
      if (p.end_path === true) {
        const t = "END";
        ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
        const tw2 = ctx.measureText(t).width;
        const bw2 = tw2 + 8 * s, bh2 = 14 * s;
        const bx2 = x + 9 * s, by2 = y - 24 * s;
        ctx.fillStyle = "#dc2626";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.roundRect(bx2, by2, bw2, bh2, 3 * s);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t, bx2 + bw2 / 2, by2 + bh2 / 2);
      }
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
      ctx.fillStyle = u.marker_color || (u.aerial_override === "neutral" ? "#9333ea" : isAerialAttr(u) ? "#2563eb" : "#16a34a");
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
      
      // END badge for End Path underground items
      if (u.end_path === true) {
        const t = "END";
        ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
        const tw2 = ctx.measureText(t).width;
        const bw2 = tw2 + 8 * s, bh2 = 14 * s;
        const bx2 = x + w / 2 + 3 * s, by2 = y - h / 2 - 14 * s;
        ctx.fillStyle = "#dc2626";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.roundRect(bx2, by2, bw2, bh2, 3 * s);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t, bx2 + bw2 / 2, by2 + bh2 / 2);
      }
    });

    // 4) Footage labels (BLUE pills aerial / GREEN pills underground), offset perpendicular
    //    to the line, alternating sides so they don't cover markers or each other
    pairSegs.forEach((seg, i) => {
      if (seg.manual) return;
      const [mx, my] = pt(seg.mid);
      const ang = toRad(seg.deg - 90);
      const perp = ang + Math.PI / 2;
      const side = i % 2 === 0 ? 1 : -1;
      const off = 26 * s * side;
      const lx = mx + Math.cos(perp) * off;
      const ly = my + Math.sin(perp) * off;
      const main = seg.aerial ? "#2563eb" : "#16a34a";
      const dark = seg.aerial ? "#1e40af" : "#166534";
      // leader line
      ctx.strokeStyle = seg.aerial ? "rgba(37,99,235,0.7)" : "rgba(22,163,74,0.7)";
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
      ctx.strokeStyle = main;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, lx, ly);
    });

    // 5) Title banner (top-left)
    const ugPart = ug.length ? `, ${ug.length} UG` : "";
    const titleParts = [`${fmtFeet(aerialFt)} aerial`];
    if (ugFt > 0) titleParts.push(`${fmtFeet(ugFt)} UG`);
    if (pathFt > 0) titleParts.push(`${fmtFeet(pathFt)} path`);
    if (totalRiserFeet > 0) titleParts.push(`${fmtFeet(totalRiserFeet)} new risers`);
    const title = `${job?.name || "Job"}  -  ${route.length} poles${ugPart}, ${titleParts.join(" + ")} = ${fmtFeet(grandFt)} total`;
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

    // 7b) Legend (bottom-right of map): only what's in use
    const presentUg = [...new Set(ug.map((u) => u.type))];
    const colorInUse = (hex) => route.some((p) => p.marker_color === hex) || ug.some((u) => u.marker_color === hex);
    const legendLines = [];
    if (route.length) legendLines.push({ kind: "pole", text: "Pole (Red)" });
    if (colorInUse("#39ff14")) legendLines.push({ kind: "dot", color: "#39ff14", text: "FST (Neon Green)" });
    if (colorInUse("#ff6600")) legendLines.push({ kind: "dot", color: "#ff6600", text: "FBT (Neon Orange)" });
    if (ug.some((u) => u.aerial_override === "neutral")) legendLines.push({ kind: "dot", color: "#9333ea", text: "Neutral (Purple)" });
    if (pairSegs.some((sg) => sg.aerial)) legendLines.push({ kind: "aerial", text: "Aerial Path (Blue)" });
    if (pairSegs.some((sg) => !sg.aerial)) legendLines.push({ kind: "ug", text: "Underground (Green)" });
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
        if (ln.kind === "pole" || ln.kind === "dot") {
          ctx.fillStyle = ln.kind === "dot" ? ln.color : "#dc2626";
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
    // Calculate required panel height to show ALL measurements
    const rowH = 19 * s;
    const headerH = 46 * s;
    const hasRisers = totalRiserFeet > 0;
    const bottomSection = hasRisers ? 68 * s : 34 * s;
    
    // Build display rows: pair segments (in live-map order) interleaved with riser info
    const itemName = (it) => it.type === "pole"
      ? (it.label || "Pole")
      : `${undergroundAbbr(it.ugType)}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`;
    const displayRows = [];
    const riserDone = new Set();
    pairSegs.forEach((sg) => {
      if (!sg.manual) displayRows.push({ type: "segment", so: sg.from.sort_order ?? Infinity, text: `${itemName(sg.from)} -> ${itemName(sg.to)}${sg.aerial ? "" : " (UG)"}`, ft: sg.ft });
      const poleB = sg.to.type === "pole" ? route.find((p) => p.id === sg.to.id) : null;
      if (poleB?.risers && poleB?.riser_height && !riserDone.has(poleB.id)) {
        const riserCount = parseInt(poleB.risers) || 0;
        const riserHeight = parseFloat(poleB.riser_height) || 0;
        if (riserCount > 0 && riserHeight > 0) {
          riserDone.add(poleB.id);
          displayRows.push({ 
            type: "riser", 
            so: sg.to.sort_order ?? Infinity,
            text: `  ↳ ${poleB.pole_number} Riser${riserCount > 1 ? ` x${riserCount}` : ""}`, 
            ft: riserCount * riserHeight 
          });
        }
      }
    });
    insertPathRows(displayRows, underground);
    
    // Calculate required height to show all measurements
    const requiredPanelHeight = headerH + (displayRows.length * rowH) + bottomSection + 20 * s;
    const finalHeight = Math.max(mapH, requiredPanelHeight);
    
    const final = document.createElement("canvas");
    final.width = mapW + panelW;
    final.height = finalHeight;
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

    let yy = headerH;
    fctx.font = `${11 * s}px ui-monospace, monospace`;
    
    // Draw ALL measurements - no truncation
    const fitText = (t, maxW) => {
      if (fctx.measureText(t).width <= maxW) return t;
      let s2 = t;
      while (s2.length > 1 && fctx.measureText(s2 + "…").width > maxW) s2 = s2.slice(0, -1);
      return s2 + "…";
    };
    for (let i = 0; i < displayRows.length; i++) {
      const row = displayRows[i];
      fctx.fillStyle = row.type === "riser" ? "#f97316" : row.type === "path" ? "#059669" : "#18181b";
      const valText = row.type === "riser" ? `+${fmtFeet(row.ft)}` : fmtFeet(row.ft);
      const maxTextW = panelW - 28 * s - fctx.measureText(valText).width - 6 * s;
      fctx.textAlign = "left";
      fctx.fillText(fitText(row.text, maxTextW), mapW + 14 * s, yy);
      fctx.textAlign = "right";
      fctx.fillText(valText, mapW + panelW - 14 * s, yy);
      yy += rowH;
    }
    
    // Add riser row if there are risers
    if (hasRisers) {
      fctx.fillStyle = "#f97316"; // Orange background for risers
      fctx.fillRect(mapW, final.height - 68 * s, panelW, 34 * s);
      fctx.fillStyle = "#ffffff";
      fctx.font = `700 ${11 * s}px ui-monospace, monospace`;
      fctx.textAlign = "left";
      fctx.fillText("RISERS", mapW + 14 * s, final.height - 51 * s);
      fctx.textAlign = "right";
      fctx.fillText(`+ ${fmtFeet(totalRiserFeet)}`, mapW + panelW - 14 * s, final.height - 51 * s);
    }
    
    // Total row
    fctx.fillStyle = "#dc2626";
    fctx.fillRect(mapW, final.height - 34 * s, panelW, 34 * s);
    fctx.fillStyle = "#ffffff";
    fctx.font = `700 ${12 * s}px ui-monospace, monospace`;
    fctx.textAlign = "left";
    fctx.fillText("TOTAL", mapW + 14 * s, final.height - 17 * s);
    fctx.textAlign = "right";
    fctx.fillText(fmtFeet(grandFt), mapW + panelW - 14 * s, final.height - 17 * s);

    if (returnBlob) {
      return await new Promise((res) => final.toBlob(res, "image/png"));
    }
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

// Split route pairs into pages of approximately targetFeet (default 800ft)
const splitPairsIntoPages = (pairSegs, targetFeet = 800) => {
  const pages = [];
  let current = { pairs: [], footage: 0 };
  pairSegs.forEach((sg, i) => {
    current.pairs.push(sg);
    current.footage += sg.manual ? 0 : sg.ft;
    if (current.footage >= targetFeet && i < pairSegs.length - 1) {
      pages.push(current);
      current = { pairs: [], footage: 0 };
    }
  });
  if (current.pairs.length > 0) pages.push(current);
  return pages;
};

// Generate a single page image for a set of route pairs
const generateSegmentPage = async ({ 
  pageNum, totalPages, pagePairs, pageItems, pageFootage,
  startLabel, endLabel, job, basemap = "esri"
}) => {
  const R = 6378137;
  const mercX = (lng) => ((lng * Math.PI) / 180) * R;
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;

  const mapW = 1400;
  const mapH = 1050;
  const headerH = 60;
  const s = 2;

  // Calculate bounds for this page's items (with padding)
  const allPts = pageItems.map((it) => it.pos);
  
  if (allPts.length === 0) return null;

  const xs = allPts.map((p) => mercX(p[1]));
  const ys = allPts.map((p) => mercY(p[0]));
  let xmin = Math.min(...xs);
  let xmax = Math.max(...xs);
  let ymin = Math.min(...ys);
  let ymax = Math.max(...ys);
  const padX = Math.max((xmax - xmin) * 0.25, 180);
  const padY = Math.max((ymax - ymin) * 0.25, 180);
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

  // Fetch satellite image for this segment's bounds
  const res = await axios.get("/maps/static", {
    params: { bbox: `${xmin},${ymin},${xmax},${ymax}`, size: `${mapW},${mapH}`, source: basemap || "esri" },
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
  canvas.height = mapH + headerH;
  const ctx = canvas.getContext("2d");
  
  // Draw header background
  ctx.fillStyle = "#1e40af"; // Blue header
  ctx.fillRect(0, 0, mapW, headerH);
  
  // Draw page number and segment info
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${18 * s}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const pageLabel = `Page ${pageNum} of ${totalPages}`;
  ctx.fillText(pageLabel, 20 * s, headerH / 2);
  
  ctx.font = `${14 * s}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  const segmentLabel = `${startLabel} → ${endLabel}  |  ${fmtFeet(pageFootage)}`;
  ctx.fillText(segmentLabel, mapW / 2, headerH / 2);
  
  ctx.textAlign = "right";
  ctx.font = `${12 * s}px ui-sans-serif, system-ui, sans-serif`;
  const jobLabel = job?.name || "Job Map";
  ctx.fillText(jobLabel, mapW - 20 * s, headerH / 2);

  // Draw satellite image below header
  ctx.drawImage(img, 0, headerH, mapW, mapH);
  URL.revokeObjectURL(imgUrl);

  const pt = (latlng) => {
    const mx = mercX(latlng[1]);
    const my = mercY(latlng[0]);
    return [
      ((mx - xmin) / (xmax - xmin)) * mapW, 
      headerH + ((ymax - my) / (ymax - ymin)) * mapH
    ];
  };

  // Draw route lines mirroring the live map (aerial BLUE solid / underground GREEN dashed)
  pagePairs.forEach((sg) => {
    const pts = (sg.path || [sg.from.pos, sg.to.pos]).map((ll) => pt(ll));
    ctx.save();
    if (!sg.aerial) ctx.setLineDash([6 * s, 4 * s]);
    ctx.strokeStyle = sg.aerial ? "#2563eb" : "#16a34a";
    ctx.lineWidth = sg.aerial ? 4 * s : 3 * s;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    ctx.restore();
  });

  // Draw direction arrows at aerial pair midpoints
  pagePairs.filter((sg) => sg.aerial).forEach((seg) => {
    const [mx, my] = pt(seg.mid);
    const ang = toRad(seg.deg - 90);
    const len = 10 * s;
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

  // Draw distance labels on pairs (blue aerial / green UG)
  pagePairs.forEach((seg, i) => {
    if (seg.manual) return;
    const [mx, my] = pt(seg.mid);
    const ang = toRad(seg.deg - 90);
    const perp = ang + Math.PI / 2;
    const side = i % 2 === 0 ? 1 : -1;
    const off = 28 * s * side;
    const lx = mx + Math.cos(perp) * off;
    const ly = my + Math.sin(perp) * off;
    const main = seg.aerial ? "#2563eb" : "#16a34a";
    const dark = seg.aerial ? "#1e40af" : "#166534";
    // leader line
    ctx.strokeStyle = seg.aerial ? "rgba(37,99,235,0.6)" : "rgba(22,163,74,0.6)";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    // pill background
    const text = fmtFeet(seg.ft);
    ctx.font = `bold ${12 * s}px ui-monospace, monospace`;
    const tw = ctx.measureText(text).width;
    const padX2 = 6 * s;
    const ph = 22 * s;
    const pw = tw + padX2 * 2;
    const px = lx - pw / 2;
    const py = ly - ph / 2;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = main;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 4 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx, ly);
  });

  const pagePoles = pageItems.filter((it) => it.type === "pole");
  const pageUg = pageItems.filter((it) => it.type === "underground");

  // Draw pole markers (small RED dots with side labels)
  // Detect clustered poles
  const CLUSTER_THRESHOLD_FT = 100;
  const pageClusterInfo = pagePoles.map((p, i) => {
    let isCluster = false;
    pagePoles.forEach((other, j) => {
      if (i !== j) {
        const dist = distanceFeet(p.pos, other.pos);
        if (dist < CLUSTER_THRESHOLD_FT) {
          isCluster = true;
        }
      }
    });
    const labelAngle = (i * 137.5) % 360;
    return { ...p, isCluster, labelAngle };
  });

  pageClusterInfo.forEach((p, i) => {
    const [x, y] = pt(p.pos);
    const label = p.label || `${i + 1}`;
    const dotR = 6 * s;
    const poleColor = p.markerColor || "#dc2626";
    
    // Draw pole dot (custom color or red)
    ctx.fillStyle = poleColor;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Draw label
    ctx.font = `bold ${10 * s}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    const labelPadX = 6 * s;
    const labelH = 18 * s;
    const labelW = tw + labelPadX * 2;
    
    let labelX, labelY;
    
    if (p.isCluster) {
      // Clustered: draw arrow
      const arrowDist = 45 * s;
      const rad = (p.labelAngle * Math.PI) / 180;
      labelX = x + Math.cos(rad) * arrowDist;
      labelY = y + Math.sin(rad) * arrowDist;
      
      ctx.strokeStyle = poleColor;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(labelX, labelY);
      ctx.stroke();
      
      const headLen = 6 * s;
      const headAngle = Math.atan2(y - labelY, x - labelX);
      ctx.fillStyle = poleColor;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(headAngle) * dotR, y - Math.sin(headAngle) * dotR);
      ctx.lineTo(x - Math.cos(headAngle) * dotR - headLen * Math.cos(headAngle - 0.4), y - Math.sin(headAngle) * dotR - headLen * Math.sin(headAngle - 0.4));
      ctx.lineTo(x - Math.cos(headAngle) * dotR - headLen * Math.cos(headAngle + 0.4), y - Math.sin(headAngle) * dotR - headLen * Math.sin(headAngle + 0.4));
      ctx.closePath();
      ctx.fill();
    } else {
      const offset = 16 * s;
      labelX = i % 2 === 0 ? x + offset + labelW / 2 : x - offset - labelW / 2;
      labelY = y;
    }
    
    ctx.fillStyle = poleColor;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.roundRect(labelX - labelW / 2, labelY - labelH / 2, labelW, labelH, 6 * s);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX, labelY);
  });

  // Draw underground items (GREEN squares)
  pageUg.forEach((u) => {
    const [x, y] = pt(u.pos);
    const abbr = undergroundAbbr(u.ugType);
    ctx.font = `bold ${10 * s}px ui-monospace, monospace`;
    const tw = ctx.measureText(abbr).width;
    const sz = Math.max(24 * s, tw + 10 * s);
    ctx.fillStyle = u.markerColor || "#16a34a";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.rect(x - sz / 2, y - sz / 2, sz, sz);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(abbr, x, y + 1 * s);
  });

  // North arrow (top-right, below header)
  const nax = mapW - 34 * s;
  const nay = headerH + 30 * s;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(nax, nay, 20 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.moveTo(nax, nay - 12 * s);
  ctx.lineTo(nax - 6 * s, nay + 4 * s);
  ctx.lineTo(nax + 6 * s, nay + 4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#18181b";
  ctx.font = `700 ${10 * s}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", nax, nay + 12 * s);

  // Scale bar (bottom-left, above footer)
  const segCenterLat = ((2 * Math.atan(Math.exp(((ymin + ymax) / 2) / R)) - Math.PI / 2) * 180) / Math.PI;
  const segFeetPerPx = ((xmax - xmin) / mapW) * Math.cos((segCenterLat * Math.PI) / 180) * FEET_PER_METER;
  const segTarget = segFeetPerPx * 110;
  const segPw = Math.pow(10, Math.floor(Math.log10(segTarget)));
  let segBarFeet = segPw;
  [1, 2, 5, 10].forEach((m) => { const o = m * segPw; if (o <= segTarget) segBarFeet = o; });
  const segBarPx = segBarFeet / segFeetPerPx;
  const sbx2 = 16 * s;
  const sby2 = headerH + mapH - 40 * s - 14 * s;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(sbx2 - 6 * s, sby2 - 16 * s, segBarPx + 12 * s, 26 * s);
  ctx.strokeStyle = "#18181b";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(sbx2, sby2 - 6 * s);
  ctx.lineTo(sbx2, sby2);
  ctx.lineTo(sbx2 + segBarPx, sby2);
  ctx.lineTo(sbx2 + segBarPx, sby2 - 6 * s);
  ctx.stroke();
  ctx.fillStyle = "#18181b";
  ctx.font = `${10 * s}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(fmtFeet(segBarFeet), sbx2 + segBarPx / 2, sby2 - 7 * s);

  // Add page footer with segment summary
  const footerH = 40 * s;
  const footerY = mapH + headerH - footerH;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, footerY, mapW, footerH);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${11 * s}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`Segment ${pageNum}: ${pagePoles.length} poles${pageUg.length ? ` + ${pageUg.length} UG` : ""} | ${fmtFeet(pageFootage)}`, 20 * s, footerY + footerH / 2);
  
  // Add scale reference
  ctx.textAlign = "right";
  ctx.fillText(`${pageNum}/${totalPages}`, mapW - 20 * s, footerY + footerH / 2);

  return canvas.toDataURL("image/png");
};

// Generate a separate measurement list image showing all span measurements
const generateMeasurementListImage = ({ pairSegs, route, totalRiserFeet, job, underground = [] }) => {
  const s = 2;
  const panelW = 500 * s;
  const rowH = 22 * s;
  const headerH = 50 * s;
  const hasRisers = totalRiserFeet > 0;
  const bottomSection = hasRisers ? 80 * s : 44 * s;
  
  const itemName = (it) => it.type === "pole"
    ? (it.label || "Pole")
    : `${undergroundAbbr(it.ugType)}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`;
  
  // Build display rows: pair segments interleaved with riser info
  const displayRows = [];
  const riserDone = new Set();
  pairSegs.forEach((sg) => {
    if (!sg.manual) displayRows.push({ type: "segment", so: sg.from.sort_order ?? Infinity, text: `${itemName(sg.from)} → ${itemName(sg.to)}${sg.aerial ? "" : " (UG)"}`, ft: sg.ft });
    const poleB = sg.to.type === "pole" ? route.find((p) => p.id === sg.to.id) : null;
    if (poleB?.risers && poleB?.riser_height && !riserDone.has(poleB.id)) {
      const riserCount = parseInt(poleB.risers) || 0;
      const riserHeight = parseFloat(poleB.riser_height) || 0;
      if (riserCount > 0 && riserHeight > 0) {
        riserDone.add(poleB.id);
        displayRows.push({ 
          type: "riser", 
          so: sg.to.sort_order ?? Infinity,
          text: `  ↳ ${poleB.pole_number} Riser${riserCount > 1 ? ` x${riserCount}` : ""}`, 
          ft: riserCount * riserHeight 
        });
      }
    }
  });
  insertPathRows(displayRows, underground);
  
  const pairFt = pairSegs.reduce((acc, x) => acc + (x.manual ? 0 : x.ft), 0);
  const pathFt = totalPathFeet(underground);
  const grandTotalFeet = pairFt + totalRiserFeet + pathFt;
  
  const requiredHeight = headerH + (displayRows.length * rowH) + bottomSection + 30 * s;
  
  const canvas = document.createElement("canvas");
  canvas.width = panelW;
  canvas.height = requiredHeight;
  const ctx = canvas.getContext("2d");
  
  // Background
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, panelW, requiredHeight);
  
  // Header
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(0, 0, panelW, headerH);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${16 * s}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("ROUTE MEASUREMENTS", 16 * s, headerH / 2);
  
  // Job name
  ctx.font = `${11 * s}px ui-monospace, monospace`;
  ctx.textAlign = "right";
  ctx.fillText(job?.name || "Job", panelW - 16 * s, headerH / 2);
  
  // All measurements
  let yy = headerH + 16 * s;
  ctx.font = `${12 * s}px ui-monospace, monospace`;
  
  const fitText = (t, maxW) => {
    if (ctx.measureText(t).width <= maxW) return t;
    let s2 = t;
    while (s2.length > 1 && ctx.measureText(s2 + "…").width > maxW) s2 = s2.slice(0, -1);
    return s2 + "…";
  };
  for (const row of displayRows) {
    ctx.fillStyle = row.type === "riser" ? "#f97316" : row.type === "path" ? "#059669" : "#18181b";
    const valText = row.type === "riser" ? `+${fmtFeet(row.ft)}` : fmtFeet(row.ft);
    const maxTextW = panelW - 32 * s - ctx.measureText(valText).width - 6 * s;
    ctx.textAlign = "left";
    ctx.fillText(fitText(row.text, maxTextW), 16 * s, yy);
    ctx.textAlign = "right";
    ctx.fillText(valText, panelW - 16 * s, yy);
    yy += rowH;
  }
  
  // Riser total row if applicable
  if (hasRisers) {
    const riserY = requiredHeight - bottomSection;
    ctx.fillStyle = "#f97316";
    ctx.fillRect(0, riserY, panelW, 36 * s);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${12 * s}px ui-monospace, monospace`;
    ctx.textAlign = "left";
    ctx.fillText("TOTAL RISERS", 16 * s, riserY + 18 * s);
    ctx.textAlign = "right";
    ctx.fillText(`+ ${fmtFeet(totalRiserFeet)}`, panelW - 16 * s, riserY + 18 * s);
  }
  
  // Grand total row
  const totalY = requiredHeight - 44 * s;
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(0, totalY, panelW, 44 * s);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${14 * s}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.fillText("GRAND TOTAL", 16 * s, totalY + 22 * s);
  ctx.textAlign = "right";
  ctx.fillText(fmtFeet(grandTotalFeet), panelW - 16 * s, totalY + 22 * s);
  
  return canvas.toDataURL("image/png");
};

// Download segmented map pages as a ZIP file with separate measurement list
export const downloadSegmentedMapPages = async ({ 
  poles, job, showStops = false, underground = [], connections = [], routes = {},
  targetFeet = 800, basemap = "esri", returnBlob = false 
}) => {
  const { route, totalRiserFeet } = computeRoute(poles);
  const ug = ugWithGps(underground);
  // Mirror the live Job Map lines: custom connections + End Path breaks + standalone items
  const pairSegs = computeConnectionPairs(route, ug, connections).map((pr) => {
    const path = segPath(pr, routes);
    return {
      from: pr.from,
      to: pr.to,
      path,
      ft: pathFeet(path),
      deg: bearingDeg(pr.from.pos, pr.to.pos),
      mid: pathMid(path),
      aerial: pairIsAerial(pr),
      manual: pairIsManual(pr),
    };
  });
  
  if (route.length === 0 && ug.length === 0) {
    toast.error("No items with GPS coordinates to map");
    return false;
  }
  if (pairSegs.length === 0) {
    toast.error("No route segments to map — add at least two connected items");
    return false;
  }

  try {
    toast.info("Generating map pages...");
    
    // Split route pairs into ~targetFeet pages
    const pages = splitPairsIntoPages(pairSegs, targetFeet);
    const totalPages = pages.length;

    const zip = new JSZip();
    
    // Generate map pages
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNum = i + 1;
      // Unique items on this page (endpoints of its pairs)
      const seen = new Set();
      const pageItems = [];
      page.pairs.forEach((sg) => {
        [sg.from, sg.to].forEach((it) => {
          if (!seen.has(it.id)) { seen.add(it.id); pageItems.push(it); }
        });
      });
      const startLabel = page.pairs[0].from.label;
      const endLabel = page.pairs[page.pairs.length - 1].to.label;
      
      toast.info(`Generating page ${pageNum} of ${totalPages}...`);
      
      const dataUrl = await generateSegmentPage({
        pageNum,
        totalPages,
        basemap,
        pagePairs: page.pairs,
        pageItems,
        pageFootage: page.footage,
        startLabel,
        endLabel,
        job
      });
      
      if (dataUrl) {
        const base64 = dataUrl.split(",")[1];
        zip.file(`page_${String(pageNum).padStart(2, "0")}_${startLabel}_to_${endLabel}.png`.replace(/[^a-z0-9_.-]/gi, "_"), base64, { base64: true });
      }
    }
    
    // Generate separate measurement list image
    toast.info("Generating measurement list...");
    const measurementDataUrl = generateMeasurementListImage({
      pairSegs, route, totalRiserFeet, job, underground
    });
    const measurementBase64 = measurementDataUrl.split(",")[1];
    zip.file("00_measurement_list.png", measurementBase64, { base64: true });
    
    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ type: "blob" });
    if (returnBlob) return zipBlob;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(job?.name || "job").replace(/[^a-z0-9-_]+/gi, "_")}_map_pages.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    toast.success(`Downloaded ${totalPages} map pages + measurement list as ZIP`);
    return true;
  } catch (e) {
    console.error(e);
    toast.error("Could not generate segmented map. Please try again.");
    return false;
  }
};
