import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Home, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Address box inside the GPS section: auto-fills the building number + street of the lot
// the item sits on whenever the coordinates change (user can still type their own).
export const AddressField = ({ latitude, longitude, value, onChange, testId = "item-address-input" }) => {
  const [loading, setLoading] = useState(false);
  const lastAutoRef = useRef("");
  const timerRef = useRef(null);
  const lat = parseFloat(latitude), lng = parseFloat(longitude);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

  useEffect(() => {
    if (!valid) return;
    // Only overwrite when the box is empty or still holds our previous auto-fill
    if (value && value !== lastAutoRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await axios.get("/maps/address-at", { params: { lat: lat.toFixed(6), lng: lng.toFixed(6) } });
        const addr = r.data?.address || "";
        if (addr) { lastAutoRef.current = addr; onChange(addr); }
      } catch { /* leave as is */ } finally { setLoading(false); }
    }, 500);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, valid]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-1"><Home className="w-3.5 h-3.5" />Address (lot)</Label>
      <div className="relative">
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={valid ? "Looking up nearest home address…" : "Auto-fills from GPS (building # + street)"} className="h-10 bg-white border-zinc-300 text-zinc-900 pr-8" data-testid={testId} />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400 absolute right-2.5 top-3" />}
      </div>
      <p className="text-[11px] text-zinc-500">Shown next to this item in the span measurements and on every export.</p>
    </div>
  );
};

export default AddressField;
