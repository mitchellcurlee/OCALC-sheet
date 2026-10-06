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
 * items: [{ id, x, y, text, size, fixed?: [dx, dy] }]  (x/y = projected px of the marker)
 * obstacles: [{ x, y, w, h }] boxes that labels must avoid (marker dots, attribute badges)
 * returns { [id]: { dx, dy, w, h } }
 */
export const layoutLabels = (items, obstacles = []) => {
  const placed = [...obstacles];
  const out = {};
  const put = (it, dx, dy, box) => {
    out[it.id] = { dx, dy, w: box.w, h: box.h };
    placed.push({ x: it.x + dx, y: it.y + dy, w: box.w, h: box.h });
  };
  // User-pinned labels first so automatic ones flow around them
  items.filter((it) => it.fixed).forEach((it) => put(it, it.fixed[0], it.fixed[1], labelBox(it.text, it.size)));
  items.filter((it) => !it.fixed && it.text).forEach((it, i) => {
    const box = labelBox(it.text, it.size);
    let best = null;
    for (const gap of RINGS) {
      for (let d = 0; d < DIRS.length; d++) {
        const { dx, dy } = candidate(DIRS[(d + i) % DIRS.length], gap, box);
        const rect = { x: it.x + dx, y: it.y + dy, w: box.w, h: box.h };
        const hit = placed.some((p) => overlaps(rect, p));
        if (!hit) { put(it, dx, dy, box); return; }
        const area = placed.reduce((s, p) => s + overlapArea(rect, p), 0);
        if (!best || area < best.area) best = { dx, dy, area };
      }
    }
    put(it, best.dx, best.dy, box);
  });
  return out;
};
