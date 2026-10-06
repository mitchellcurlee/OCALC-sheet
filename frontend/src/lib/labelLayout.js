// Pixel-space smart-label layout: picks a spot around each marker so no two tags overlap each other,
// a marker dot or an attribute badge. Offsets are in CSS px relative to the dot centre and are zoom-independent.
let _ctx = null;
const measure = (text, font) => {
  if (!_ctx && typeof document !== "undefined") _ctx = document.createElement("canvas").getContext("2d");
  if (!_ctx) return String(text || "").length * 5.4;
  _ctx.font = font;
  return _ctx.measureText(String(text || "")).width;
};
export const labelBox = (text, size = "normal") => {
  const w = measure(text, size === "small" ? "600 7px ui-monospace, monospace" : "600 9px ui-monospace, monospace");
  return size === "small" ? { w: Math.ceil(w + 9), h: 13 } : { w: Math.ceil(w + 13), h: 17 };
};

const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
const RINGS = [10, 26, 46, 70, 100, 135];

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// Candidate top-left offset (relative to dot centre) for a direction + gap
const candidate = ([ux, uy], gap, { w, h }) => ({
  dx: ux === 0 ? -w / 2 : ux > 0 ? gap : -gap - w,
  dy: uy === 0 ? -h / 2 : uy > 0 ? gap : -gap - h,
});

/**
 * items: [{ id, x, y, text, size, fixed?: [dx, dy], center?: bool }]  (x/y = projected px of the marker)
 *   center: badge prefers to sit centred on its point (attribute badges) and only moves away when it collides
 * obstacles: [{ x, y, w, h }] boxes that labels must avoid (marker dots, other map furniture)
 * returns { [id]: { dx, dy, w, h, centered } }
 */
export const layoutLabels = (items, obstacles = []) => {
  const placed = [...obstacles];
  const out = {};
  const put = (it, dx, dy, box) => {
    out[it.id] = { dx, dy, w: box.w, h: box.h, centered: dx === -box.w / 2 && dy === -box.h / 2 };
    placed.push({ x: it.x + dx, y: it.y + dy, w: box.w, h: box.h });
  };
  // User-pinned labels first, then centre-preferring badges, then free labels flow around everything
  const boxOf = (it) => (it.center ? badgeBox(it.text, it.size) : labelBox(it.text, it.size));
  items.filter((it) => it.fixed).forEach((it) => put(it, it.fixed[0], it.fixed[1], boxOf(it)));
  const ordered = [...items.filter((it) => !it.fixed && it.text && it.center), ...items.filter((it) => !it.fixed && it.text && !it.center)];
  ordered.forEach((it, i) => {
    const box = boxOf(it);
    let best = null;
    const cands = [];
    if (it.center) cands.push({ dx: -box.w / 2, dy: -box.h / 2 });
    RINGS.forEach((gap) => DIRS.forEach((_, d) => cands.push(candidate(DIRS[(d + i) % DIRS.length], gap, box))));
    for (const { dx, dy } of cands) {
      const rect = { x: it.x + dx, y: it.y + dy, w: box.w, h: box.h };
      if (!placed.some((p) => overlaps(rect, p))) { put(it, dx, dy, box); return; }
      const area = placed.reduce((s, p) => s + overlapArea(rect, p), 0);
      if (!best || area < best.area) best = { dx, dy, area };
    }
    put(it, best.dx, best.dy, box);
  });
  return out;
};

// Attribute badge box as rendered on the live map (18px tall, 9px mono text)
export const badgeBox = (abbr, size = "normal") => {
  if (size === "off") return { w: 10, h: 10 };
  const h = size === "small" ? 13 : 18;
  return { w: Math.max(h, Math.ceil(measure(abbr, size === "small" ? "600 7px ui-monospace, monospace" : "600 9px ui-monospace, monospace") + (size === "small" ? 4 : 6))), h };
};

/**
 * Canvas renderer shared by the PNG map image and PDF pages: same non-crossing layout as the live map,
 * honouring user-moved tags (fixed = [dx, dy] in live-map CSS px). Returns the canvas rects it painted.
 * poles: [{ x, y, text, color, size, fixed }]  ugs: [{ x, y, text, color, fixed }]  k = canvas px per live-map px
 */
export const drawSmartTags = (ctx, { poles = [], ugs = [], k = 2, obstacles = [] }) => {
  const items = [
    ...ugs.map((u, i) => ({ id: `u${i}`, x: u.x / k, y: u.y / k, text: u.text, size: "normal", fixed: u.fixed, center: true, _src: u, _ug: true })),
    ...poles.map((p, i) => ({ id: `p${i}`, x: p.x / k, y: p.y / k, text: p.size === "off" ? "" : p.text, size: p.size === "small" ? "small" : "normal", fixed: p.fixed, _src: p })),
  ];
  const obs = [...poles.map((p) => ({ x: p.x / k - 5, y: p.y / k - 5, w: 10, h: 10 })), ...obstacles.map((o) => ({ x: o.x / k, y: o.y / k, w: o.w / k, h: o.h / k }))];
  const lay = layoutLabels(items, obs);
  const painted = [];
  const dot = (x, y, color, square) => {
    ctx.fillStyle = color; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2 * (k / 2.2); ctx.beginPath();
    if (square) ctx.rect(x - 2.5 * k, y - 2.5 * k, 5 * k, 5 * k); else ctx.arc(x, y, 3 * k, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  };
  items.forEach((it) => {
    const src = it._src;
    const L = lay[it.id];
    if (it._ug) { if (L && !L.centered) dot(src.x, src.y, src.color, true); }
    else dot(src.x, src.y, src.color, false);
    if (!L || !it.text) return;
    const rx = src.x + L.dx * k, ry = src.y + L.dy * k, rw = L.w * k, rh = L.h * k;
    const nx = Math.max(L.dx, 0, -(L.dx + L.w)), ny = Math.max(L.dy, 0, -(L.dy + L.h));
    // Leader line when a tag is pushed away from its dot, or whenever a badge leaves its point
    if (Math.hypot(nx, ny) > 16 || (it._ug && !L.centered)) {
      ctx.strokeStyle = src.color; ctx.lineWidth = 1.5 * (k / 2.2); ctx.setLineDash([3 * k, 2 * k]);
      ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(rx + rw / 2, ry + rh / 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = src.color; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5 * (k / 2.2); ctx.beginPath();
    if (it._ug) ctx.rect(rx, ry, rw, rh); else ctx.roundRect(rx, ry, rw, rh, 5 * k);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${(it.size === "small" ? 7 : 9) * k}px ui-monospace, monospace`;
    ctx.fillText(it.text, rx + rw / 2, ry + rh / 2 + 0.5 * k);
    painted.push({ x: rx, y: ry, w: rw, h: rh });
  });
  return painted;
};
