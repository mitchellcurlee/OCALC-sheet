import axios from "axios";
import { toast } from "sonner";
import JSZip from "jszip";
import { drawSmartTags } from "./labelLayout";

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
  const total = Math.round(feet);
  const stations = Math.floor(total / 100);
  const remainder = total % 100;
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
  "Gas Valve": "GV",
  "Gas Meter": "GM",
  FST: "FST",
  "Water Meter/Valve": "WMV",
  "Aerial NTE": "NTE",
  "Aerial PI": "PI",
  "Aerial FBT": "FBT",
  Core: "C",
  "St. Start": "ST-S",
  "St. End": "ST-E",
  "Underground Path": "UGP",
  Suite: "SU",
  Address: "ADDR",
};
export const undergroundAbbr = (type) => UNDERGROUND_ABBR[type] || String(type || "").slice(0, 3).toUpperCase();
export const UNDERGROUND_TYPES = Object.keys(UNDERGROUND_ABBR);

// One path measurement row as text: "Down 5ft to FBT" / "Over 3ft from HH-1"
export const pathRowText = (m, withTarget = true) => `${m.direction} ${m.feet}ft${withTarget && m.to ? ` ${m.rel === "from" ? "from" : "to"} ${m.to}` : ""}`;

// " / HH tie in- <measurements>" for each span endpoint (underground item) that has tie-in data
export const tieInSuffix = (from, to, underground = []) => {
  const parts = [];
  [from, to].forEach((it) => {
    if (!it || it.type === "pole") return;
    const u = (underground || []).find((x) => x.id === it.id);
    const tie = String(u?.tie_in_measurements || "").trim();
    if (tie) parts.push(`${undergroundAbbr(u.type)} tie in- ${tie}`);
  });
  return parts.length ? ` / ${parts.join(" / ")}` : "";
};


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
// Suite / Address attributes: the tag shows the address text (not just "SU") and renders blue
export const ADDRESS_BLUE = "#2563eb";
export const ADDRESS_TYPES = new Set(["Suite", "Address"]);
export const isAddressAttr = (u) => ADDRESS_TYPES.has(u.type) || (u.marker_color || "").toLowerCase() === ADDRESS_BLUE;
export const ugTagText = (u) => {
  const label = (u.label || "").trim();
  if (u.type === "Address") return label || undergroundAbbr(u.type);
  return isAddressAttr(u) && label ? `${undergroundAbbr(u.type)} ${label}` : undergroundAbbr(u.type);
};
export const ugTagColor = (u, fallback = "#16a34a") => u.marker_color || (ADDRESS_TYPES.has(u.type) ? ADDRESS_BLUE : u.aerial_override === "neutral" ? "#9333ea" : isAerialAttr(u) ? ADDRESS_BLUE : fallback);

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
// Direction-free key for a span (A|B == B|A)
export const spanKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);

// Waypoints for a segment regardless of which way the line was drawn
export const routeWaypoints = (routes, fromId, toId) => {
  if (!routes) return [];
  const direct = routes[`${fromId}-${toId}`];
  if (direct && direct.length) return direct;
  const rev = routes[`${toId}-${fromId}`];
  return rev && rev.length ? [...rev].reverse() : [];
};

// Draw Route argument for computeConnectionPairs: tapped sequence when present; `true` (drawn-only, no
// auto chain) for a route-mode job whose spans were wiped; [] for jobs that never used Draw Route
export const routeArg = (job) => {
  const seq = job?.route_sequence || [];
  return seq.length > 0 ? seq : (job?.route_mode ? true : []);
};

// After a manual reorder on a Draw Route job, the new list order becomes the route: rebuild
// route_sequence (pole/underground ids in list order) and span_order (spans between consecutive items
// first, in that order, then any other existing spans). Returns null when the job has no route.
export const routePayloadFromOrder = (job, orderedItems) => {
  if (!(job?.route_sequence || []).length) return null;
  const seq = [];
  orderedItems.forEach((it) => {
    if (it._type !== "pole" && it._type !== "underground") return;
    if (seq[seq.length - 1] !== it.id) seq.push(it.id);
  });
  const known = new Set(job.span_order || []);
  const ordered = [];
  for (let i = 0; i + 1 < seq.length; i++) {
    const k = spanKey(seq[i], seq[i + 1]);
    if (known.has(k) && !ordered.includes(k)) ordered.push(k);
  }
  (job.span_order || []).forEach((k) => { if (!ordered.includes(k)) ordered.push(k); });
  return { route_sequence: seq, span_order: ordered };
};

export const computeConnectionPairs = (route, ug, connections = [], spanOrder = null, drawnOnly = false) => {
  const allItems = [];
  route.forEach((p) => allItems.push({ id: p.id, type: "pole", pos: p.pos, sort_order: p.sort_order ?? Infinity, label: p.pole_number || "Pole", address: p.address || "", start_path: p.start_path === true, end_path: p.end_path === true, standalone: p.standalone === true, hasPath: (p.path_measurements || []).length > 0, pathTarget: pathTargetOf(p.path_measurements), markerColor: p.marker_color || null, labelOffset: Array.isArray(p.label_offset) && p.label_offset.length === 2 ? p.label_offset : null, labelSize: p.label_size || null }));
  ug.forEach((u) => allItems.push({ id: u.id, type: "underground", ugType: u.type, materialType: u.material_type || "", aerialOverride: ["aerial", "underground", "neutral"].includes(u.aerial_override) ? u.aerial_override : null, pos: u.pos, sort_order: u.sort_order ?? Infinity, label: u.label || u.type, address: u.address || "", start_path: u.start_path === true, end_path: u.end_path === true, standalone: u.standalone === true, hasPath: (u.path_measurements || []).length > 0, pathTarget: pathTargetOf(u.path_measurements), markerColor: u.marker_color || null, tagText: ugTagText(u), labelOffset: Array.isArray(u.label_offset) && u.label_offset.length === 2 ? u.label_offset : null }));
  // Stable list order: explicit sort_order first, items without one keep their incoming order at the end
  // (never subtract sort_orders — Infinity - Infinity is NaN and made the numbering random)
  allItems.forEach((it, i) => { it._in = i; });
  allItems.sort((a, b) => (a.sort_order < b.sort_order ? -1 : a.sort_order > b.sort_order ? 1 : a._in - b._in));
  allItems.forEach((it, i) => { it.seq = i; delete it._in; });
  // Draw Route jobs: pass the tapped item order (array) — it drives line direction and span numbering
  const routeSeqArr = Array.isArray(drawnOnly) ? drawnOnly : null;
  const drawn = routeSeqArr ? routeSeqArr.length > 0 : !!drawnOnly;
  const drawnDir = {}; // spanKey -> id of the item tapped first
  if (drawn && routeSeqArr) {
    // Only drawn spans take the tapped direction; untouched spans keep their list-order direction
    for (let i = 0; i < routeSeqArr.length - 1; i++) {
      const k = spanKey(routeSeqArr[i], routeSeqArr[i + 1]);
      if (!drawnDir[k]) drawnDir[k] = routeSeqArr[i];
    }
  }
  const byId = {};
  allItems.forEach((it) => { byId[it.id] = it; });
  // Standalone items are excluded from the path chain entirely
  const pathItems = allItems.filter((it) => !it.standalone);
  let pairs = [];
  if (drawn) {
    // Draw Route jobs: only lines the tech drew (or that were materialized) — no automatic chaining
    connections.forEach((c) => {
      if (c.connection_type === "removed") return;
      const f = byId[c.from_item_id], t = byId[c.to_item_id];
      if (f && t) pairs.push({ from: f, to: t, custom: c.connection_type === "custom" });
    });
  } else if (connections.length > 0) {
    // "removed" tombstones: user deleted this auto line — draw nothing, but keep
    // the endpoints counted as referenced so the chain fallback doesn't resurrect it
    pairs = connections
      .filter((c) => c.connection_type !== "removed")
      .map((c) => ({ from: byId[c.from_item_id], to: byId[c.to_item_id], connType: c.connection_type, typeOverride: c.type_override }))
      .filter((p) => p.from && p.to && p.from.id !== p.to.id)
      .filter((p) => {
        if (p.connType === "custom") return true;
        if (p.from.standalone || p.to.standalone) return false;
        const earlier = p.from.seq <= p.to.seq ? p.from : p.to;
        const later = p.from.seq <= p.to.seq ? p.to : p.from;
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
        const lo = Math.min(p.from.seq, p.to.seq);
        const hi = Math.max(p.from.seq, p.to.seq);
        return !unreferenced.some((it) => it.seq > lo && it.seq < hi);
      });
    }
    for (let i = 0; i < pathItems.length - 1; i++) {
      const a = pathItems[i], b = pathItems[i + 1];
      if ((!referenced.has(a.id) || !referenced.has(b.id)) && !a.end_path && !b.start_path) pairs.push({ from: a, to: b });
    }
    // Keep the whole list in route order (fallback pairs included)
    pairs.sort((a, b) =>
      (Math.min(a.from.seq, a.to.seq) - Math.min(b.from.seq, b.to.seq)) ||
      (Math.max(a.from.seq, a.to.seq) - Math.max(b.from.seq, b.to.seq))
    );
  } else {
    for (let i = 0; i < pathItems.length - 1; i++) {
      if (pathItems[i].end_path || pathItems[i + 1].start_path) continue;
      pairs.push({ from: pathItems[i], to: pathItems[i + 1] });
    }
  }
  // Universal direction: a line always runs from the earlier list item to the later one,
  // no matter which end the user tapped first; the same pair never appears twice
  const seen = new Set();
  pairs = pairs
    .map((pr) => {
      // Drawn routes: the line runs in the order the tech tapped the two items
      if (drawn && routeSeqArr) {
        const k = spanKey(pr.from.id, pr.to.id);
        if (drawnDir[k]) return drawnDir[k] === pr.from.id ? pr : { ...pr, from: pr.to, to: pr.from };
      }
      const flip = pr.from.seq > pr.to.seq;
      return flip ? { ...pr, from: pr.to, to: pr.from } : pr;
    })
    .filter((pr) => {
      const k = spanKey(pr.from.id, pr.to.id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // User-swapped span numbering: permute the ordered spans among their own slots
  if (Array.isArray(spanOrder) && spanOrder.length > 1) {
    const rank = new Map(spanOrder.map((k, i) => [k, i]));
    const slots = [];
    pairs.forEach((pr, i) => { if (rank.has(spanKey(pr.from.id, pr.to.id))) slots.push(i); });
    if (slots.length > 1) {
      const ordered = slots.map((i) => pairs[i]).sort((a, b) => rank.get(spanKey(a.from.id, a.to.id)) - rank.get(spanKey(b.from.id, b.to.id)));
      slots.forEach((slot, j) => { pairs[slot] = ordered[j]; });
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
// Name an item the way the path "to/from" dropdown does, so a path target can be matched to a span endpoint
export const pathItemName = (it) => (it.type === "pole"
  ? (/^\d/.test(String(it.label || "")) ? `P${it.label}` : (it.label || "Pole"))
  : `${undergroundAbbr(it.ugType)}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`);
// Target named on the last path row that has one (the item the path runs to/from)
export const pathTargetOf = (rows) => { const withTarget = (rows || []).filter((m) => m.to); return withTarget.length ? withTarget[withTarget.length - 1].to : ""; };
// A span is "manually measured" (hidden from the list, replaced by the path row) when one endpoint's path
// measurements name the other endpoint as target; paths with no target replace the item's outgoing span
export const pairIsManual = (pr) => {
  for (const [a, b] of [[pr.from, pr.to], [pr.to, pr.from]]) {
    if (!a.hasPath) continue;
    if (a.pathTarget) { if (a.pathTarget === pathItemName(b)) return true; }
    else if (a === pr.from) return true;
  }
  return false;
};

// Waypoint-following path helpers (routes = { "fromId-toId": [{lat,lng}, ...] })
const segPath = (pr, routes) => {
  const wps = routeWaypoints(routes, pr.from.id, pr.to.id);
  return [pr.from.pos, ...wps.map((w) => [w.lat, w.lng]), pr.to.pos];
};
const pathFeet = (path) => path.reduce((s2, p, i) => (i === 0 ? 0 : s2 + distanceFeet(path[i - 1], p)), 0);

// Chainage feet between connected items for station numbering.
// Manual/path-measured pairs contribute 0 here — their measured footage
// advances the chainage via the item's path-measurement feet instead,
// so stations always equal the linear footage from the start of the path.
export const computeStationSegFeet = (route, ug, connections, routes = {}) => {
  const map = {};
  computeConnectionPairs(route, ug, connections).forEach((pr) => {
    const ft = pairIsManual(pr) ? 0 : pathFeet(segPath(pr, routes));
    map[`${pr.from.id}->${pr.to.id}`] = ft;
    map[`${pr.to.id}->${pr.from.id}`] = ft;
  });
  return map;
};

// Station chainage follows the measurement list order: the first item is 0+00 and every
// footage row (span, new riser, path measurement) advances the running total by its feet.
// rows: [{ key, kind: "span"|"riser"|"path"|..., fromId, toId, ft, itemId }]
// Returns { byItem: { itemId: "3+08" }, rowSta: { rowKey: { from: "0+90", to: "1+08" } } }
export const computeListStations = (rows) => {
  const feet = {};
  const rowSta = {};
  let run = 0;
  let prevTo = null;
  let started = false;
  rows.forEach((r) => {
    if (r.kind === "span" && r.fromId && r.toId) {
      const continues = !started || prevTo === r.fromId || feet[r.fromId] === undefined;
      const depart = continues ? run : feet[r.fromId];
      if (feet[r.fromId] === undefined) feet[r.fromId] = started ? depart : 0;
      started = true;
      const arrive = depart + (Number(r.ft) || 0);
      if (feet[r.toId] === undefined) feet[r.toId] = arrive;
      rowSta[r.key] = { from: feetToStation(depart), to: feetToStation(arrive) };
      run = arrive;
      prevTo = r.toId;
    } else if ((r.kind === "riser" || r.kind === "path") && Number(r.ft) > 0) {
      const start = run;
      run += Number(r.ft);
      rowSta[r.key] = { from: feetToStation(start), to: feetToStation(run) };
    }
  });
  const byItem = {};
  Object.keys(feet).forEach((id) => { byItem[id] = feetToStation(feet[id]); });
  return { byItem, rowSta };
};
const pathMid = (path) => {
  const m = Math.floor(path.length / 2);
  return path.length % 2 === 0
    ? [(path[m - 1][0] + path[m][0]) / 2, (path[m - 1][1] + path[m][1]) / 2]
    : path[m];
};

// Insert UG path-measurement rows into a display-row list at their route position (by sort_order)
const insertPathRows = (displayRows, underground) => {
  [...(underground || [])]
    .filter((u) => u.standalone !== true && (u.path_measurements || []).length > 0)
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    .forEach((u) => {
      const ft = u.path_measurements.reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);
      const row = {
        type: "path",
        key: `path:${u.id}`,
        so: u.sort_order ?? Infinity,
        text: `${u.pole_number !== undefined ? (/^\d/.test(String(u.pole_number || "")) ? `P${u.pole_number}` : (u.pole_number || "Pole")) : `${undergroundAbbr(u.type)}${u.label && u.label !== u.type ? ` ${u.label}` : ""}`}: ${u.path_measurements.map((m) => pathRowText(m)).join(", ")}`,
        ft,
      };
      const idx = displayRows.findIndex((r) => (r.so ?? Infinity) >= row.so);
      if (idx === -1) displayRows.push(row);
      else displayRows.splice(idx, 0, row);
    });
};

const totalPathFeet = (underground) =>
  (underground || []).reduce((acc, u) => acc + (u.standalone === true ? 0 : (u.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0)), 0);

// Map items not covered by any span/path/riser get their own "— no span" line (same keys as the interactive list),
// so notes anchored below them land in the same place on exports
const insertNoSpanRows = (rows, poles, underground, pairs, riserDone, pathDone) => {
  const mentionedIds = new Set();
  (pairs || []).forEach((pr) => { mentionedIds.add(pr.from.id); mentionedIds.add(pr.to.id); });
  const extraItems = [
    ...(poles || []).filter((p) => p.standalone !== true && !mentionedIds.has(p.id) && !riserDone.has(p.id)).map((p) => ({ type: "item", key: `item:${p.id}`, so: p.sort_order ?? Infinity, toSo: p.sort_order ?? Infinity, text: `${/^\d/.test(String(p.pole_number || "")) ? `P${p.pole_number}` : (p.pole_number || "Pole")} — no span`, ft: null })),
    ...(underground || []).filter((u) => u.standalone !== true && !mentionedIds.has(u.id) && !pathDone.has(u.id)).map((u) => ({ type: "item", key: `item:${u.id}`, so: u.sort_order ?? Infinity, toSo: u.sort_order ?? Infinity, text: `${undergroundAbbr(u.type)}${u.label ? `-${u.label}` : ""} — no span`, ft: null })),
  ];
  extraItems.sort((a, b) => a.so - b.so).forEach((row) => {
    let at = -1;
    rows.forEach((r, i) => { if (((r.toSo ?? r.so) ?? Infinity) <= row.so) at = i; });
    rows.splice(at + 1, 0, row);
  });
};
const pathDoneSet = (items) => new Set((items || []).filter((u) => u.standalone !== true && (u.path_measurements || []).length > 0).map((u) => u.id));

// Build the exact text lines shown in the interactive map's Span Measurements list.
// Used by the ASE checklist "path of approach" so both always match.
export const buildSpanMeasurementTexts = ({ poles, underground = [], connections = [], includeStations = false, stationsOnly = false, routes = {}, spanNotes = [], spanOrder = null, drawnOnly = false }) => {
  if (stationsOnly) includeStations = true;
  const { route } = computeRoute(poles);
  const ug = ugWithGps(underground);
  const pairs = computeConnectionPairs(route, ug, connections, spanOrder, drawnOnly);
  const baseName = (it) => it.type === "pole"
    ? (/^\d/.test(String(it.label || "")) ? `P${it.label}` : (it.label || "Pole"))
    : `${it.ugType || "Attribute"}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`;
  // "Pedestal PED-2 12345 Jones Rd" — building number + street of the lot the item sits on
  const itemName = (it) => `${baseName(it)}${it.address ? ` ${it.address}` : ""}`;

  // Stations are computed from the final row order (see computeListStations); row.text may be a
  // function of that row's { from, to } station pair.
  const withSta = (it, sta) => `${itemName(it)}${includeStations && sta ? ` ${sta}` : ""}`;

  const rows = [];
  const riserDone = new Set();
  const riserLaterRows = [];
  const anchoredRiserRows = [];
  const orderKeysUsable = route.some((p) => Number.isFinite(p.sort_order)) || (underground || []).some((u) => Number.isFinite(u.sort_order));
  const pathDone = new Set();
  const pathFeetOf = (u) => (u.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);
  const pathTextOf = (u) => (s) => {
    const base = `${u.pole_number !== undefined ? (/^\d/.test(String(u.pole_number || "")) ? `P${u.pole_number}` : (u.pole_number || "Pole")) : `${undergroundAbbr(u.type)}${u.label && u.label !== u.type ? ` ${u.label}` : ""}`}: ${u.path_measurements.map((m) => pathRowText(m)).join(", ")} = ${fmtFeet(pathFeetOf(u))}`;
    return stationsOnly && s ? `${base} (${s.from} to ${s.to})` : base;
  };
  const pushRiser = (it) => {
    if (it.type !== "pole" || riserDone.has(it.id)) return;
    const p = route.find((x) => x.id === it.id);
    const c = parseInt(p?.risers) || 0, h = parseFloat(p?.riser_height) || 0;
    if (c > 0 && h > 0) {
      riserDone.add(it.id);
      const row = {
        key: `riser:${it.id}`,
        kind: "riser",
        itemId: it.id,
        ft: c * h,
        so: p?.riser_sort_order ?? it.sort_order ?? Infinity,
        text: (s) => (stationsOnly
          ? `${itemName(it)} New Riser${c > 1 ? ` x${c}` : ""} ${s ? s.to : ""}`.trim()
          : `${itemName(it)} New Riser${c > 1 ? ` x${c}` : ""} = ${fmtFeet(c * h)}`),
      };
      if (riserAnchor(p) !== undefined) anchoredRiserRows.push({ after: riserAnchor(p), _row: row });
      else if (p?.riser_sort_order != null && orderKeysUsable) riserLaterRows.push(row);
      else rows.push(row);
    }
  };
  const pushPath = (it) => {
    if (pathDone.has(it.id)) return;
    const u = it.type === "pole" ? poles.find((x) => x.id === it.id) : underground.find((x) => x.id === it.id);
    if (!u || !(u.path_measurements || []).length) return;
    pathDone.add(it.id);
    rows.push({ key: `path:${it.id}`, kind: "path", itemId: it.id, ft: pathFeetOf(u), so: it.sort_order ?? Infinity, text: pathTextOf(u) });
  };
  pairs.forEach((pr) => {
    pushRiser(pr.from);
    pushPath(pr.from);
    if (!pairIsManual(pr)) {
      const ft = pathFeet(segPath(pr, routes));
      rows.push({
        key: `span:${spanKey(pr.from.id, pr.to.id)}`,
        kind: "span",
        fromId: pr.from.id,
        toId: pr.to.id,
        ft,
        so: pr.from.sort_order ?? Infinity,
        toSo: pr.to.sort_order ?? Infinity,
        text: (s) => (stationsOnly
          ? `${withSta(pr.from, s?.from)} to ${withSta(pr.to, s?.to)}${pairIsAerial(pr) ? "" : " (UG)"}`
          : `${withSta(pr.from, s?.from)} to ${withSta(pr.to, s?.to)} = ${fmtFeet(ft)}${pairIsAerial(pr) ? "" : " (UG)"}${tieInSuffix(pr.from, pr.to, underground)}`),
      });
    }
  });
  if (pairs.length > 0) {
    const last = pairs[pairs.length - 1];
    pushRiser(last.to);
    pushPath(last.to);
  }
  [...(underground || []), ...(poles || [])]
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    .filter((u) => (u.path_measurements || []).length > 0 && !pathDone.has(u.id))
    .forEach((u) => {
      pathDone.add(u.id);
      const so = u.sort_order ?? Infinity;
      const row = { key: `path:${u.id}`, kind: "path", itemId: u.id, ft: pathFeetOf(u), so, text: pathTextOf(u) };
      const idx = rows.findIndex((r) => (r.so ?? Infinity) > so);
      if (idx === -1) rows.push(row);
      else rows.splice(idx, 0, row);
    });
  riserLaterRows.sort((a, b) => a.so - b.so).forEach((row) => {
    let at = -1;
    rows.forEach((r, i) => { if (((r.toSo ?? r.so) ?? Infinity) <= row.so) at = i; });
    rows.splice(at + 1, 0, row);
  });
  // Items on the map not covered by any span/path/riser get their own line (matches interactive map list)
  insertNoSpanRows(rows, poles, underground, pairs, riserDone, pathDone);
  placeSpanNotes(rows, [...anchoredRiserRows, ...(spanNotes || [])], (n) => (n._row ? n._row : { key: `note:${n.id}`, so: n.so ?? Infinity, text: `Note: ${n.text}` }));
  const { rowSta } = computeListStations(rows);
  return rows.map((r) => (typeof r.text === "function" ? r.text(rowSta[r.key]) : r.text));
};

// Anchor of a riser row: undefined = legacy numeric placement, null = top of list, else key of the row above
export const riserAnchor = (pole) => (pole?.riser_after ? (pole.riser_after === "__top__" ? null : pole.riser_after) : undefined);

// Span notes: legacy notes carry a numeric `so`; notes moved with the arrows carry `after`
// (key of the row they sit directly below, null = top of list) so they stay exactly where placed
export const placeSpanNotes = (rows, spanNotes, makeRow) => {
  const notes = (spanNotes || []).slice();
  const bySo = (n) => {
    const so = n.so ?? Infinity;
    let at = -1;
    rows.forEach((r, i) => { if (((r.toSo ?? r.so) ?? Infinity) <= so) at = i; });
    rows.splice(at + 1, 0, makeRow(n));
  };
  notes.filter((n) => n.after === undefined).sort((a, b) => (a.so ?? Infinity) - (b.so ?? Infinity)).forEach(bySo);
  let pending = notes.filter((n) => n.after !== undefined);
  let top = 0;
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    pending = pending.filter((n) => {
      if (n.after === null) { rows.splice(top++, 0, makeRow(n)); progress = true; return false; }
      const at = rows.findIndex((r) => r.key === n.after);
      if (at === -1) return true;
      rows.splice(at + 1, 0, makeRow(n));
      progress = true;
      return false;
    });
  }
  // Anchor row missing from this list (e.g. export without that row): fall back to the saved numeric position
  pending.forEach(bySo);
};

// Fetch a single satellite image (via backend proxy) and draw the annotated
// pole-route exhibit, then trigger a PNG download. Returns true on success.
export const downloadPoleMapImage = async ({ poles, job, showStops = false, underground = [], connections = [], routes = {}, basemap = "esri", returnBlob = false }) => {
  const { route, totalRiserFeet } = computeRoute(poles);
  const ug = ugWithGps(underground);
  // Mirror the live Job Map lines: custom connections + End Path breaks
  const pairSegs = computeConnectionPairs(route, ug, connections, job?.span_order, routeArg(job)).map((pr) => {
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
  const pathFt = totalPathFeet([...(underground || []), ...(route || [])]);
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

    // 3) Pole dots + smart tags and 3b) attribute badges — same non-crossing layout as the live map,
    //    honouring user-moved tags (label_offset). k = canvas px per live-map px (export text is 10*s px vs 9px live)
    const k = (10 * s) / 9;
    const endBadge = (x, y) => {
      const t = "END";
      ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
      const tw2 = ctx.measureText(t).width;
      const bw2 = tw2 + 8 * s, bh2 = 14 * s;
      const bx2 = x + 9 * s, by2 = y - 24 * s;
      ctx.fillStyle = "#dc2626"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.roundRect(bx2, by2, bw2, bh2, 3 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t, bx2 + bw2 / 2, by2 + bh2 / 2);
    };
    drawSmartTags(ctx, {
      k,
      poles: route.map((p, i) => { const [x, y] = pt(p.pos); return { x, y, text: markerLabel(p, i, showStops), color: p.marker_color || "#dc2626", size: p.label_size || "normal", fixed: Array.isArray(p.label_offset) && p.label_offset.length === 2 ? p.label_offset : null }; }),
      ugs: ug.map((u) => { const [x, y] = pt(u.pos); return { x, y, text: ugTagText(u), color: ugTagColor(u), fixed: Array.isArray(u.label_offset) && u.label_offset.length === 2 ? u.label_offset : null }; }),
    });
    [...route, ...ug].filter((it) => it.end_path === true).forEach((it) => { const [x, y] = pt(it.pos); endBadge(x, y); });

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
    const itemName = (it) => (it.type === "pole"
      ? (it.label || "Pole")
      : `${it.ugType || "Attribute"}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`) + (it.address ? ` ${it.address}` : "");
    const displayRows = [];
    const riserDone = new Set();
    const riserLaterDisplay = [];
    const anchoredRisers = [];
    const orderKeysUsable = route.some((p) => Number.isFinite(p.sort_order)) || (underground || []).some((u) => Number.isFinite(u.sort_order));
    pairSegs.forEach((sg) => {
      if (!sg.manual) displayRows.push({ type: "segment", key: `span:${spanKey(sg.from.id, sg.to.id)}`, so: sg.from.sort_order ?? Infinity, toSo: sg.to.sort_order ?? Infinity, text: `${itemName(sg.from)} -> ${itemName(sg.to)}${sg.aerial ? "" : " (UG)"}`, ft: sg.ft });
      const poleB = sg.to.type === "pole" ? route.find((p) => p.id === sg.to.id) : null;
      if (poleB?.risers && poleB?.riser_height && !riserDone.has(poleB.id)) {
        const riserCount = parseInt(poleB.risers) || 0;
        const riserHeight = parseFloat(poleB.riser_height) || 0;
        if (riserCount > 0 && riserHeight > 0) {
          riserDone.add(poleB.id);
          const row = { 
            type: "riser", 
            key: `riser:${poleB.id}`,
            so: poleB.riser_sort_order ?? sg.to.sort_order ?? Infinity,
            text: `  ↳ ${poleB.pole_number} Riser${riserCount > 1 ? ` x${riserCount}` : ""}`, 
            ft: riserCount * riserHeight 
          };
          if (riserAnchor(poleB) !== undefined) anchoredRisers.push({ after: riserAnchor(poleB), _row: row });
          else if (poleB.riser_sort_order != null && orderKeysUsable) riserLaterDisplay.push(row);
          else displayRows.push(row);
        }
      }
    });
    insertPathRows(displayRows, [...(underground || []), ...(route || [])]);
    riserLaterDisplay.sort((a, b) => a.so - b.so).forEach((row) => {
      let at = -1;
      displayRows.forEach((r, i) => { if (((r.toSo ?? r.so) ?? Infinity) <= row.so) at = i; });
      displayRows.splice(at + 1, 0, row);
    });
    insertNoSpanRows(displayRows, route, underground, pairSegs, riserDone, pathDoneSet([...(underground || []), ...(route || [])]));
    // Notes pinned exactly where they sit in the interactive list (anchored rows), legacy notes by numeric position
    placeSpanNotes(displayRows, [...anchoredRisers, ...(job?.span_notes || [])], (n) => (n._row ? n._row : { type: "note", key: `note:${n.id}`, so: n.so ?? Infinity, text: `Note: ${n.text}`, ft: null }));
    
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
      fctx.fillStyle = row.type === "riser" ? "#f97316" : row.type === "path" ? "#059669" : row.type === "note" ? "#b45309" : row.type === "item" ? "#52525b" : "#18181b";
      const valText = row.type === "note" || row.type === "item" ? "" : row.type === "riser" ? `+${fmtFeet(row.ft)}` : fmtFeet(row.ft);
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
  startLabel, endLabel, job, basemap = "esri",
  boundsOverride = null, edgeLabels = null, mapSize = null, showNotes = false, labelScale = 1
}) => {
  const R = 6378137;
  const mercX = (lng) => ((lng * Math.PI) / 180) * R;
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;

  const mapW = mapSize?.w || 1400;
  const mapH = mapSize?.h || 1050;
  const headerH = 60;
  const s = 2;

  // Calculate bounds for this page's items (with padding)
  const allPts = pageItems.map((it) => it.pos);
  
  if (allPts.length === 0 && !boundsOverride) return null;

  let xmin, xmax, ymin, ymax;
  if (boundsOverride) {
    ({ xmin, xmax, ymin, ymax } = boundsOverride);
  } else {
  const xs = allPts.map((p) => mercX(p[1]));
  const ys = allPts.map((p) => mercY(p[0]));
  xmin = Math.min(...xs);
  xmax = Math.max(...xs);
  ymin = Math.min(...ys);
  ymax = Math.max(...ys);
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

  // Collision avoidance so labels/badges never overlap (clean PDF pages)
  const placedRects = [];
  const rectsOverlap = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  const claimRect = (x, y, w, h) => {
    let ny = y;
    let tries = 0;
    while (placedRects.some((r) => rectsOverlap({ x, y: ny, w, h }, r)) && tries < 24) {
      tries++;
      ny = y + (tries % 2 === 1 ? 1 : -1) * Math.ceil(tries / 2) * 12 * s;
    }
    placedRects.push({ x, y: ny, w, h });
    return ny;
  };
  // Reserve space around every marker so labels never cover them
  pageItems.forEach((it) => {
    const [ix, iy2] = pt(it.pos);
    placedRects.push({ x: ix - 16 * s, y: iy2 - 13 * s, w: 32 * s, h: 26 * s });
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
    let ly = my + Math.sin(perp) * off;
    const main = seg.aerial ? "#2563eb" : "#16a34a";
    const dark = seg.aerial ? "#1e40af" : "#166534";
    // pill background (position adjusted to avoid overlaps)
    const text = fmtFeet(seg.ft);
    const ls = s * labelScale;
    ctx.font = `bold ${12 * ls}px ui-monospace, monospace`;
    const tw = ctx.measureText(text).width;
    const padX2 = 6 * ls;
    const ph = 22 * ls;
    const pw = tw + padX2 * 2;
    const px = lx - pw / 2;
    let py = ly - ph / 2;
    py = claimRect(px, py, pw, ph);
    ly = py + ph / 2;
    // leader line
    ctx.strokeStyle = seg.aerial ? "rgba(37,99,235,0.6)" : "rgba(22,163,74,0.6)";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(lx, ly);
    ctx.stroke();
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

  // Pole dots + smart tags + attribute badges: same non-crossing layout as the live map, user-moved tags honoured.
  // Footage pills / reserved marker space already claimed above are passed as obstacles.
  const kTag = (10 * s * labelScale) / 9;
  const painted = drawSmartTags(ctx, {
    k: kTag,
    obstacles: placedRects.filter((r) => !(r.w === 32 * s && r.h === 26 * s)),
    poles: pagePoles.map((p, i) => { const [x, y] = pt(p.pos); return { x, y, text: p.label || `${i + 1}`, color: p.markerColor || "#dc2626", size: p.labelSize || "normal", fixed: p.labelOffset }; }),
    ugs: pageUg.map((u) => { const [x, y] = pt(u.pos); return { x, y, text: u.tagText || undergroundAbbr(u.ugType), color: u.markerColor || (ADDRESS_TYPES.has(u.ugType) ? ADDRESS_BLUE : "#16a34a"), fixed: u.labelOffset }; }),
  });
  painted.forEach((r) => placedRects.push(r));

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

  // Note callouts (yellow boxes) for items with notes
  if (showNotes) {
    pageItems.filter((it) => (it.note || "").trim()).forEach((it, ni) => {
      const [x, y] = pt(it.pos);
      const ls = s * labelScale;
      ctx.font = `${9 * ls}px ui-sans-serif, system-ui, sans-serif`;
      const words = String(it.note).trim().split(/\s+/);
      const lines = [];
      let cur = "";
      words.forEach((w) => {
        if ((cur + " " + w).trim().length > 30) { lines.push(cur.trim()); cur = w; } else { cur += " " + w; }
      });
      if (cur.trim()) lines.push(cur.trim());
      const shown = lines.slice(0, 4);
      const lw2 = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 12 * ls;
      const lh2 = shown.length * 12 * ls + 10 * ls;
      const side = ni % 2 === 0 ? 1 : -1;
      const bx = x + side * 40 * s - (side < 0 ? lw2 : 0);
      const by = claimRect(x + side * 40 * s - (side < 0 ? lw2 : 0), y + 24 * ls, lw2, lh2);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(side > 0 ? bx : bx + lw2, by + lh2 / 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(254,249,195,0.95)";
      ctx.strokeStyle = "#ca8a04";
      ctx.beginPath();
      ctx.roundRect(bx, by, lw2, lh2, 3 * s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#713f12";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      shown.forEach((l, li) => ctx.fillText(l, bx + 6 * ls, by + 5 * ls + li * 12 * ls));
    });
  }

  // Joining-page indicators at the edges (like "TO PRINT X" on fielding maps)
  if (edgeLabels) {
    ctx.font = `bold ${11 * s * labelScale}px ui-monospace, monospace`;
    const band = (text, cx, cy) => {
      const tw2 = ctx.measureText(text).width;
      const bw = tw2 + 18 * s * labelScale, bh = 22 * s * labelScale;
      ctx.fillStyle = "#ea580c";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 4 * s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
    };
    if (edgeLabels.top) band(`▲ ${edgeLabels.top}`, mapW / 2, headerH + 16 * s);
    if (edgeLabels.bottom) band(`▼ ${edgeLabels.bottom}`, mapW / 2, headerH + mapH - footerH - 16 * s);
    if (edgeLabels.left) band(`◀ ${edgeLabels.left}`, 70 * s, headerH + mapH / 2);
    if (edgeLabels.right) band(`${edgeLabels.right} ▶`, mapW - 70 * s, headerH + mapH / 2);
  }

  return canvas.toDataURL("image/png");
};

// Generate the measurement list as page images of at most LIST_PAGE_LINES rows each ("Page N of M" in the header)
export const LIST_PAGE_LINES = 25;
const generateMeasurementListImages = ({ pairSegs, route, totalRiserFeet, job, underground = [] }) => {
  const s = 2;
  const panelW = 500 * s;
  const rowH = 22 * s;
  const headerH = 50 * s;
  const hasRisers = totalRiserFeet > 0;
  const bottomSection = hasRisers ? 80 * s : 44 * s;
  
  const itemName = (it) => (it.type === "pole"
    ? (it.label || "Pole")
    : `${it.ugType || "Attribute"}${it.label && it.label !== it.ugType ? ` ${it.label}` : ""}`) + (it.address ? ` ${it.address}` : "");
  
  // Build display rows: pair segments interleaved with riser info
  const displayRows = [];
  const riserDone = new Set();
  const anchoredRisers = [];
  pairSegs.forEach((sg) => {
    if (!sg.manual) displayRows.push({ type: "segment", key: `span:${spanKey(sg.from.id, sg.to.id)}`, so: sg.from.sort_order ?? Infinity, toSo: sg.to.sort_order ?? Infinity, text: `${itemName(sg.from)} → ${itemName(sg.to)}${sg.aerial ? "" : " (UG)"}${tieInSuffix(sg.from, sg.to, underground)}`, ft: sg.ft });
    const poleB = sg.to.type === "pole" ? route.find((p) => p.id === sg.to.id) : null;
    if (poleB?.risers && poleB?.riser_height && !riserDone.has(poleB.id)) {
      const riserCount = parseInt(poleB.risers) || 0;
      const riserHeight = parseFloat(poleB.riser_height) || 0;
      if (riserCount > 0 && riserHeight > 0) {
        riserDone.add(poleB.id);
        const riserRow = { 
          type: "riser", 
          key: `riser:${poleB.id}`,
          so: sg.to.sort_order ?? Infinity,
          text: `  ↳ ${poleB.pole_number} Riser${riserCount > 1 ? ` x${riserCount}` : ""}`, 
          ft: riserCount * riserHeight 
        };
        if (riserAnchor(poleB) !== undefined) anchoredRisers.push({ after: riserAnchor(poleB), _row: riserRow });
        else displayRows.push(riserRow);
      }
    }
  });
  insertPathRows(displayRows, [...(underground || []), ...(route || [])]);
  insertNoSpanRows(displayRows, route, underground, pairSegs, riserDone, pathDoneSet([...(underground || []), ...(route || [])]));
  placeSpanNotes(displayRows, [...anchoredRisers, ...(job?.span_notes || [])], (n) => (n._row ? n._row : { type: "note", key: `note:${n.id}`, so: n.so ?? Infinity, text: `Note: ${n.text}`, ft: null }));
  
  const pairFt = pairSegs.reduce((acc, x) => acc + (x.manual ? 0 : x.ft), 0);
  const pathFt = totalPathFeet([...(underground || []), ...(route || [])]);
  const grandTotalFeet = pairFt + totalRiserFeet + pathFt;
  const pageCount = Math.max(1, Math.ceil(displayRows.length / LIST_PAGE_LINES));
  const images = [];

  for (let pg = 0; pg < pageCount; pg++) {
    const rows = displayRows.slice(pg * LIST_PAGE_LINES, (pg + 1) * LIST_PAGE_LINES);
    const isLast = pg === pageCount - 1;
    const footer = isLast ? bottomSection : 0;
    const requiredHeight = headerH + (rows.length * rowH) + footer + 30 * s;
  
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
  ctx.fillText(`ROUTE MEASUREMENTS — Page ${pg + 1} of ${pageCount}`, 16 * s, headerH / 2);
  
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
  for (const row of rows) {
    ctx.fillStyle = row.type === "riser" ? "#f97316" : row.type === "path" ? "#059669" : row.type === "note" ? "#b45309" : row.type === "item" ? "#52525b" : "#18181b";
    const valText = row.type === "note" || row.type === "item" ? "" : row.type === "riser" ? `+${fmtFeet(row.ft)}` : fmtFeet(row.ft);
    const maxTextW = panelW - 32 * s - ctx.measureText(valText).width - 6 * s;
    ctx.textAlign = "left";
    ctx.fillText(fitText(row.text, maxTextW), 16 * s, yy);
    ctx.textAlign = "right";
    ctx.fillText(valText, panelW - 16 * s, yy);
    yy += rowH;
  }
  
  if (isLast) {
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
  }
  
    images.push(canvas.toDataURL("image/png"));
  }
  return images;
};

// Download segmented map pages as a ZIP file with separate measurement list
export const downloadSegmentedMapPages = async ({ 
  poles, job, showStops = false, underground = [], connections = [], routes = {},
  targetFeet = 800, basemap = "esri", returnBlob = false 
}) => {
  const { route, totalRiserFeet } = computeRoute(poles);
  const ug = ugWithGps(underground);
  // Mirror the live Job Map lines: custom connections + End Path breaks + standalone items
  const pairSegs = computeConnectionPairs(route, ug, connections, job?.span_order, routeArg(job)).map((pr) => {
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
    
    // Generate separate measurement list images (max 25 lines per page)
    toast.info("Generating measurement list...");
    const listImages = generateMeasurementListImages({
      pairSegs, route, totalRiserFeet, job, underground
    });
    listImages.forEach((url, i) => {
      zip.file(`00_measurement_list_page_${String(i + 1).padStart(2, "0")}_of_${String(listImages.length).padStart(2, "0")}.png`, url.split(",")[1], { base64: true });
    });
    
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

// PDF export: grid pages with 1000ft limits in every direction + joining-page edge labels
export const downloadMapPdfPages = async ({
  poles, job, underground = [], connections = [], routes = {},
  tileFeet = 1000, basemap = "esri", returnBlob = false
}) => {
  const { route, totalRiserFeet } = computeRoute(poles);
  const ug = ugWithGps(underground);
  const pairSegs = computeConnectionPairs(route, ug, connections, job?.span_order, routeArg(job)).map((pr) => {
    const path = segPath(pr, routes);
    return {
      from: pr.from, to: pr.to, path,
      ft: pathFeet(path), deg: bearingDeg(pr.from.pos, pr.to.pos),
      mid: pathMid(path), aerial: pairIsAerial(pr), manual: pairIsManual(pr),
    };
  });
  if (route.length === 0 && ug.length === 0) {
    toast.error("No items with GPS coordinates to map");
    return false;
  }
  try {
    toast.info("Generating 1000ft PDF pages...");
    const R = 6378137;
    const mercX = (lng) => ((lng * Math.PI) / 180) * R;
    const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;

    // Display items carry notes so callouts stay visible on the PDF
    const noteById = {};
    (poles || []).forEach((p) => { if (p.notes) noteById[p.id] = p.notes; });
    (underground || []).forEach((u) => { if (u.notes) noteById[u.id] = u.notes; });
    const dispItems = [];
    const seenIds = new Set();
    const pushItem = (it) => { if (!seenIds.has(it.id)) { seenIds.add(it.id); dispItems.push({ ...it, note: noteById[it.id] || "" }); } };
    pairSegs.forEach((sg) => { pushItem(sg.from); pushItem(sg.to); });
    route.forEach((p) => pushItem({ id: p.id, type: "pole", pos: p.pos, label: p.pole_number || "Pole", markerColor: p.marker_color || null }));
    ug.forEach((u) => pushItem({ id: u.id, type: "underground", pos: u.pos, ugType: u.type, label: u.label || u.type, markerColor: u.marker_color || null }));

    // Collect coverage points: item positions + sampled path points
    const covPts = dispItems.map((it) => it.pos.slice());
    pairSegs.forEach((sg) => {
      const path = sg.path || [sg.from.pos, sg.to.pos];
      for (let i = 0; i < path.length - 1; i++) {
        for (let t = 0; t <= 10; t++) {
          covPts.push([
            path[i][0] + (path[i + 1][0] - path[i][0]) * (t / 10),
            path[i][1] + (path[i + 1][1] - path[i][1]) * (t / 10),
          ]);
        }
      }
    });

    const xsAll = covPts.map((p) => mercX(p[1]));
    const ysAll = covPts.map((p) => mercY(p[0]));
    const centerLat = covPts.reduce((a, p) => a + p[0], 0) / covPts.length;
    const tileM = (tileFeet / FEET_PER_METER) / Math.cos((centerLat * Math.PI) / 180);
    // Center the page grid on the content so paths sit mid-page
    const bx0 = Math.min(...xsAll), bx1 = Math.max(...xsAll);
    const by0 = Math.min(...ysAll), by1 = Math.max(...ysAll);
    const nCols = Math.max(1, Math.ceil((bx1 - bx0) / tileM) || 1);
    const nRows = Math.max(1, Math.ceil((by1 - by0) / tileM) || 1);
    const gx0 = (bx0 + bx1) / 2 - (nCols * tileM) / 2;
    const gy1 = (by0 + by1) / 2 + (nRows * tileM) / 2;

    // Which grid tiles are occupied
    const tileKeys = new Set();
    covPts.forEach((p, i) => {
      const col = Math.min(nCols - 1, Math.max(0, Math.floor((xsAll[i] - gx0) / tileM)));
      const row = Math.min(nRows - 1, Math.max(0, Math.floor((gy1 - ysAll[i]) / tileM)));
      tileKeys.add(`${row},${col}`);
    });
    const tiles = [...tileKeys].map((k) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col };
    }).sort((a, b) => a.row - b.row || a.col - b.col);
    const pageOf = {};
    tiles.forEach((t, i) => { pageOf[`${t.row},${t.col}`] = i + 2; }); // page 1 = cover
    const listImages = generateMeasurementListImages({ pairSegs, route, totalRiserFeet, job, underground });
    const totalPages = tiles.length + 1 + listImages.length; // cover + tiles + measurement list pages

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [842, 700] });
    let first = true;

    // ---- Cover page: job info, legend, page index ----
    {
      const W = 1684, H = 1400, s2 = 2;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const c = cv.getContext("2d");
      const mono = "ui-monospace, SFMono-Regular, monospace";
      c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
      // Header band
      c.fillStyle = "#1e3a8a"; c.fillRect(0, 0, W, 78 * s2);
      c.fillStyle = "#ffffff"; c.font = `bold ${30 * s2}px ${mono}`; c.textAlign = "left"; c.textBaseline = "middle";
      c.fillText(`FIELDING MAP — ${job?.site_id || job?.name || "Job"}`, 30 * s2, 30 * s2);
      c.font = `${13 * s2}px ${mono}`;
      c.fillText(`${tileFeet}ft × ${tileFeet}ft grid pages · Generated ${new Date().toLocaleDateString()}`, 30 * s2, 58 * s2);
      // Totals
      const aerialFt = pairSegs.filter((sg) => sg.aerial).reduce((a, sg) => a + sg.ft, 0);
      const ugFt = pairSegs.filter((sg) => !sg.aerial).reduce((a, sg) => a + sg.ft, 0);
      // Job info block
      const info = [
        ["SITE ID", job?.site_id || "—"],
        ["WIRE CENTER", job?.name || "—"],
        ["JOB TYPE", job?.job_type || "—"],
        ["EMPLOYEE", job?.employee_info || "—"],
        ["LOCATION", job?.location || "—"],
        ["DESCRIPTION", job?.description || "—"],
        ["TOTALS", `${route.length} poles · ${ug.length} underground`],
        ["FOOTAGE", `${fmtFeet(aerialFt)} aerial + ${fmtFeet(ugFt)} underground`],
        ["", `+ ${fmtFeet(totalRiserFeet || 0)} risers = ${fmtFeet(aerialFt + ugFt + (totalRiserFeet || 0))} total`],
      ];
      let iy = 105 * s2;
      c.textAlign = "left";
      info.forEach(([k, v]) => {
        c.fillStyle = "#71717a"; c.font = `bold ${11 * s2}px ${mono}`;
        c.fillText(k, 30 * s2, iy);
        c.fillStyle = "#18181b"; c.font = `${13 * s2}px ${mono}`;
        c.fillText(String(v).slice(0, 60), 150 * s2, iy);
        iy += 24 * s2;
      });
      // Legend block (right)
      const lx = 500 * s2;
      let ly = 105 * s2;
      c.fillStyle = "#18181b"; c.font = `bold ${13 * s2}px ${mono}`;
      c.fillText("LEGEND", lx, ly); ly += 26 * s2;
      const legendRow = (draw, label) => {
        draw(lx, ly);
        c.fillStyle = "#3f3f46"; c.font = `${12 * s2}px ${mono}`; c.textAlign = "left";
        c.fillText(label, lx + 50 * s2, ly);
        ly += 24 * s2;
      };
      legendRow((x, y) => { c.fillStyle = "#dc2626"; c.beginPath(); c.arc(x + 20 * s2, y, 7 * s2, 0, Math.PI * 2); c.fill(); }, "Pole");
      legendRow((x, y) => { c.strokeStyle = "#2563eb"; c.lineWidth = 4 * s2; c.setLineDash([]); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 40 * s2, y); c.stroke(); }, "Aerial path");
      legendRow((x, y) => { c.strokeStyle = "#16a34a"; c.lineWidth = 4 * s2; c.setLineDash([8 * s2, 5 * s2]); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 40 * s2, y); c.stroke(); c.setLineDash([]); }, "Underground path");
      legendRow((x, y) => { c.fillStyle = "rgba(254,249,195,0.95)"; c.strokeStyle = "#ca8a04"; c.lineWidth = 1.5 * s2; c.beginPath(); c.roundRect(x, y - 8 * s2, 40 * s2, 16 * s2, 3 * s2); c.fill(); c.stroke(); }, "Field note");
      legendRow((x, y) => { c.fillStyle = "#ea580c"; c.beginPath(); c.roundRect(x, y - 9 * s2, 44 * s2, 18 * s2, 4 * s2); c.fill(); c.fillStyle = "#fff"; c.font = `bold ${8 * s2}px ${mono}`; c.textAlign = "center"; c.fillText("TO PAGE", x + 22 * s2, y + 1 * s2); c.textAlign = "left"; }, "Joins adjacent page");
      const presentUg = [...new Set(ug.map((u) => u.type))];
      presentUg.slice(0, 10).forEach((t2) => {
        legendRow((x, y) => {
          c.fillStyle = "#16a34a"; c.beginPath(); c.roundRect(x + 8 * s2, y - 9 * s2, 26 * s2, 18 * s2, 3 * s2); c.fill();
          c.fillStyle = "#fff"; c.font = `bold ${9 * s2}px ${mono}`; c.textAlign = "center";
          c.fillText(undergroundAbbr(t2), x + 21 * s2, y + 1 * s2); c.textAlign = "left";
        }, t2);
      });
      // Page index (bottom area)
      let py = Math.max(iy, ly) + 30 * s2;
      c.fillStyle = "#18181b"; c.font = `bold ${13 * s2}px ${mono}`;
      c.fillText("PAGE INDEX", 30 * s2, py); py += 24 * s2;
      c.font = `${12 * s2}px ${mono}`;
      const idx = [["1", "Cover — job info, legend, page index"]];
      tiles.forEach((t, i2) => {
        const cnt = dispItems.filter((it) => {
          const mx = mercX(it.pos[1]), my = mercY(it.pos[0]);
          return mx >= gx0 + t.col * tileM && mx <= gx0 + (t.col + 1) * tileM && my <= gy1 - t.row * tileM && my >= gy1 - (t.row + 1) * tileM;
        }).length;
        idx.push([`${i2 + 2}`, `Map grid — row ${t.row + 1}, col ${t.col + 1} (${cnt} items)`]);
      });
      listImages.forEach((_, li) => idx.push([`${tiles.length + 2 + li}`, `Span measurements list — page ${li + 1} of ${listImages.length}`]));
      idx.forEach(([n, d2]) => {
        if (py > H - 30 * s2) return;
        c.fillStyle = "#71717a"; c.fillText(`PAGE ${n}`, 30 * s2, py);
        c.fillStyle = "#3f3f46"; c.fillText(d2, 130 * s2, py);
        py += 20 * s2;
      });
      // Border
      c.strokeStyle = "#d4d4d8"; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
      pdf.addImage(cv.toDataURL("image/png"), "PNG", 20, 20, 802, 660);
      pdf.setFontSize(9);
      pdf.text(`${job?.name || job?.site_id || "Job"} — 1000ft Map Pages — Page 1 of ${totalPages}`, 421, 690, { align: "center" });
      first = false;
    }

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      toast.info(`Generating PDF page ${i + 1} of ${tiles.length}...`);
      const xmin = gx0 + t.col * tileM;
      const xmax = xmin + tileM;
      const ymax = gy1 - t.row * tileM;
      const ymin = ymax - tileM;
      const inTile = (pos) => {
        const mx = mercX(pos[1]), my = mercY(pos[0]);
        return mx >= xmin && mx <= xmax && my >= ymin && my <= ymax;
      };
      const pageItems = dispItems.filter((it) => inTile(it.pos));
      const pagePairs = pairSegs.filter((sg) => {
        const path = sg.path || [sg.from.pos, sg.to.pos];
        return path.some((pp) => inTile(pp)) || inTile(sg.from.pos) || inTile(sg.to.pos);
      });
      const footage = pagePairs.reduce((a, sg) => a + (sg.ft || 0), 0);
      const edgeLabels = {
        top: pageOf[`${t.row - 1},${t.col}`] ? `TO PAGE ${pageOf[`${t.row - 1},${t.col}`]}` : null,
        bottom: pageOf[`${t.row + 1},${t.col}`] ? `TO PAGE ${pageOf[`${t.row + 1},${t.col}`]}` : null,
        left: pageOf[`${t.row},${t.col - 1}`] ? `TO PAGE ${pageOf[`${t.row},${t.col - 1}`]}` : null,
        right: pageOf[`${t.row},${t.col + 1}`] ? `TO PAGE ${pageOf[`${t.row},${t.col + 1}`]}` : null,
      };
      const dataUrl = await generateSegmentPage({
        pageNum: i + 2,
        totalPages,
        basemap,
        pagePairs,
        pageItems,
        pageFootage: footage,
        startLabel: `${tileFeet}ft × ${tileFeet}ft grid`,
        endLabel: `${pageItems.length} items`,
        job,
        boundsOverride: { xmin, xmax, ymin, ymax },
        mapSize: { w: 1000, h: 1000 },
        labelScale: 0.65,
        edgeLabels,
        showNotes: true,
      });
      if (!dataUrl) continue;
      if (!first) pdf.addPage([842, 700], "landscape");
      first = false;
      // Fit square image centered on landscape page
      const iw = 640, ih = 640 * (1060 / 1000);
      pdf.addImage(dataUrl, "PNG", (842 - iw) / 2, (700 - ih) / 2, iw, ih);
      pdf.setFontSize(9);
      pdf.text(`${job?.name || job?.site_id || "Job"} — 1000ft Map Pages — Page ${i + 2} of ${totalPages}`, 421, 690, { align: "center" });
    }

    // Final pages: span measurement list, max 25 lines per page
    for (let li = 0; li < listImages.length; li++) {
      const measUrl = listImages[li];
      if (!first) pdf.addPage([842, 700], "landscape");
      first = false;
      const mi = new Image();
      await new Promise((res) => { mi.onload = res; mi.src = measUrl; });
      const scale = Math.min(802 / mi.width, 660 / mi.height);
      pdf.addImage(measUrl, "PNG", (842 - mi.width * scale) / 2, 20, mi.width * scale, mi.height * scale);
      pdf.setFontSize(9);
      pdf.text(`Span Measurements (page ${li + 1} of ${listImages.length}) — Page ${tiles.length + 2 + li} of ${totalPages}`, 421, 690, { align: "center" });
    }

    if (returnBlob) return pdf.output("blob");
    pdf.save(`${(job?.name || job?.site_id || "job").replace(/[^a-z0-9-_]+/gi, "_")}_map_1000ft.pdf`);
    toast.success(`Downloaded PDF with ${totalPages} pages`);
    return true;
  } catch (e) {
    console.error(e);
    toast.error("Could not generate map PDF. Please try again.");
    return false;
  }
};
