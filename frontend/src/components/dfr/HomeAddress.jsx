import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Home, LocateFixed, Loader2 } from "lucide-react";

/** Fielder's saved home / start address (per user) — the planned route's first leg starts here. */
export const HomeAddress = ({ home, onChange, compact = false }) => {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(home?.address || "");
  const [busy, setBusy] = useState(false);
  const isSet = Number.isFinite(home?.lat) && Number.isFinite(home?.lng);

  const save = async (h) => {
    const r = await axios.put("/field-reports/home", h);
    onChange(r.data);
    setQ(r.data.address || "");
    setEditing(false);
  };

  const geocode = async () => {
    setBusy(true);
    try { await save((await axios.get("/field-reports/geocode", { params: { q } })).data); toast.success("Home address saved"); }
    catch (e) { toast.error(e.response?.data?.detail || "Could not find that address"); }
    finally { setBusy(false); }
  };

  const useLocation = () => {
    if (!navigator.geolocation) { toast.error("GPS not available on this device"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      try {
        let address = "";
        try { address = (await axios.get("/maps/address-at", { params: { lat, lng } })).data.address || ""; } catch { /* keep coords */ }
        await save({ address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
        toast.success("Home set to your current location");
      } catch { toast.error("Could not save home location"); }
      finally { setBusy(false); }
    }, (err) => { setBusy(false); toast.error(err.code === 1 ? "Location permission denied" : "GPS error: " + err.message); }, { enableHighAccuracy: true, timeout: 15000 });
  };

  const clear = async () => { try { await save({ address: "", lat: null, lng: null }); toast.success("Home address cleared"); } catch { toast.error("Could not clear"); } };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-emerald-50 border border-emerald-300 rounded px-3 py-2" data-testid="dfr-home-address">
      <span className="text-xs font-mono uppercase tracking-widest text-emerald-900 flex items-center gap-1"><Home className="w-4 h-4" />Home / start</span>
      {!editing && isSet ? (
        <>
          <span className="text-sm text-zinc-800" data-testid="dfr-home-address-text">{home.address}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-[11px] underline text-zinc-600 hover:text-emerald-700" data-testid="dfr-home-edit-btn">Change</button>
          <button type="button" onClick={clear} className="text-[11px] underline text-zinc-500 hover:text-red-600" data-testid="dfr-home-clear-btn">Clear</button>
        </>
      ) : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && geocode()} placeholder="Street, City, State — e.g. 123 Main St, Tomball, TX" className="h-8 text-sm flex-1 min-w-[220px] bg-white" data-testid="dfr-home-input" />
          <Button type="button" onClick={geocode} disabled={busy || q.trim().length < 4} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="dfr-home-set-btn">
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Home className="w-3.5 h-3.5 mr-1" />}Set home
          </Button>
          <Button type="button" onClick={useLocation} disabled={busy} variant="outline" className="h-8 text-xs bg-white border-emerald-400 text-emerald-800" data-testid="dfr-home-use-location-btn"><LocateFixed className="w-3.5 h-3.5 mr-1" />Use my location</Button>
          {isSet && <button type="button" onClick={() => { setEditing(false); setQ(home.address || ""); }} className="text-[11px] underline text-zinc-500" data-testid="dfr-home-cancel-btn">Cancel</button>}
        </>
      )}
      {!compact && <span className="basis-full text-[11px] text-zinc-600">Saved to your profile. The Travel Map's planned route starts here, so the first job's Travel to site hours and miles are estimated too.</span>}
    </div>
  );
};

export default HomeAddress;
