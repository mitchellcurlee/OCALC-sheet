import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

/** Touch / mouse signature pad → PNG data URL via onChange. */
export const SignaturePad = ({ value, onChange, testId = "signature-pad" }) => {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(!value);

  useEffect(() => {
    const cv = ref.current; const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, cv.width, cv.height); img.src = value; setEmpty(false); } else setEmpty(true);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * (ref.current.width / r.width), y: (p.clientY - r.top) * (ref.current.height / r.height) }; };
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = ref.current.getContext("2d"); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = ref.current.getContext("2d"); const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); setEmpty(false); };
  const end = () => { if (!drawing.current) return; drawing.current = false; onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const cv = ref.current; cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); setEmpty(true); onChange(""); };

  return (
    <div className="space-y-1">
      <canvas ref={ref} width={600} height={160} className="w-full h-28 bg-white border border-zinc-400 rounded touch-none cursor-crosshair" data-testid={testId}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>{empty ? "Sign here with finger, stylus or mouse" : "Signed"}</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={clear} data-testid={`${testId}-clear`}><Eraser className="w-3 h-3 mr-1" />Clear</Button>
      </div>
    </div>
  );
};

export default SignaturePad;
