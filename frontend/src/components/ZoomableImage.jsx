import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useOfflinePhotoUrl } from "@/lib/offlinePhotos";

const MIN_SCALE = 1;
const MAX_SCALE = 8;

/** Pinch/scroll/drag zoomable image area for lightboxes. */
export const ZoomableImage = ({ src, alt = "", className = "" }) => {
  const url = useOfflinePhotoUrl(src);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef({ panX: 0, panY: 0, startX: 0, startY: 0, dist: 0, startScale: 1 });

  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [src]);

  const clamp = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const applyScale = useCallback((next) => {
    setScale((prev) => {
      const s = clamp(next);
      if (s === MIN_SCALE) setPos({ x: 0, y: 0 });
      return s;
    });
  }, []);

  // Wheel zoom needs a non-passive native listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setScale((prev) => {
        const s = clamp(prev * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
        if (s === MIN_SCALE) setPos({ x: 0, y: 0 });
        return s;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current.startX = e.clientX;
      gesture.current.startY = e.clientY;
      gesture.current.panX = pos.x;
      gesture.current.panY = pos.y;
    } else if (pts.length === 2) {
      gesture.current.dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current.startScale = scale;
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (gesture.current.dist > 0) applyScale(gesture.current.startScale * (dist / gesture.current.dist));
    } else if (pts.length === 1 && scale > 1) {
      setPos({
        x: gesture.current.panX + (e.clientX - gesture.current.startX),
        y: gesture.current.panY + (e.clientY - gesture.current.startY),
      });
    }
  };

  const onPointerEnd = (e) => {
    pointers.current.delete(e.pointerId);
  };

  const onDoubleClick = () => applyScale(scale > 1 ? 1 : 2.5);

  return (
    <div className={`relative select-none ${className}`} data-testid="zoomable-image">
      <div
        ref={containerRef}
        className="overflow-hidden flex items-center justify-center bg-zinc-950/90 rounded max-h-[80vh]"
        style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={onDoubleClick}
      >
        <img
          src={url || undefined}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-[80vh] object-contain"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: pointers.current.size ? "none" : "transform 120ms ease-out" }}
        />
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => applyScale(scale / 1.5)} data-testid="zoom-out-btn"><ZoomOut className="w-4 h-4" /></Button>
        <span className="text-[11px] font-mono text-white w-10 text-center" data-testid="zoom-level">{Math.round(scale * 100)}%</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => applyScale(scale * 1.5)} data-testid="zoom-in-btn"><ZoomIn className="w-4 h-4" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => applyScale(1)} data-testid="zoom-reset-btn"><RotateCcw className="w-4 h-4" /></Button>
      </div>
      <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-white/70 bg-black/50 rounded px-2 py-0.5 pointer-events-none">Scroll or pinch to zoom · drag to pan · double-tap to toggle</p>
    </div>
  );
};
