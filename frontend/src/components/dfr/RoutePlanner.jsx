import { useState } from "react";
import { Polyline } from "react-leaflet";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Route, Check } from "lucide-react";
import { fmtHrs, roundQuarter } from "@/lib/dfr";

const OSRM = "https://router.project-osrm.org/route/v1/driving";

/** Driving legs between consecutive job pins (OSRM) → miles + drive time, optionally applied to the report rows. */
export const fetchPlannedRoute = async (stops) => {
  const coords = stops.map((s) => `${s.pos[1]},${s.pos[0]}`).join(";");
  const res = await fetch(`${OSRM}/${coords}?overview=full&geometries=geojson&steps=false`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) throw new Error(data.message || "No route found");
  const r = data.routes[0];
  return {
    line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    legs: r.legs.map((leg, i) => ({ from: stops[i], to: stops[i + 1], miles: leg.distance / 1609.34, hours: leg.duration / 3600 })),
    miles: r.distance / 1609.34,
    hours: r.duration / 3600,
  };
};

export const PlannedRouteLine = ({ plan }) => (plan ? <Polyline positions={plan.line} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85, dashArray: "10 8" }} /> : null);

export const RoutePlanner = ({ pins, plan, onPlan, onApply }) => {
  const [busy, setBusy] = useState(false);
  const stops = pins.filter((p) => p.pos);

  const run = async () => {
    if (stops.length < 2) { toast.error("Need at least two job rows with a location to plan a route"); return; }
    setBusy(true);
    try { onPlan(await fetchPlannedRoute(stops)); }
    catch (e) { toast.error(`Route planning failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="border border-blue-300 bg-blue-50/60 rounded p-2 space-y-2" data-testid="dfr-route-planner">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono uppercase tracking-widest text-blue-900 flex items-center gap-1"><Route className="w-4 h-4" />Plan route (no driving needed)</span>
        <span className="text-[11px] text-zinc-600">Drive legs between the job pins in row order — estimated miles and time to each next location.</span>
        <Button type="button" onClick={run} disabled={busy || stops.length < 2} className="ml-auto h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" data-testid="dfr-plan-route-btn">
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Route className="w-3.5 h-3.5 mr-1" />}{plan ? "Re-plan" : "Plan route"}
        </Button>
        {plan && onApply && (
          <Button type="button" onClick={() => onApply(plan)} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="dfr-apply-route-btn"><Check className="w-3.5 h-3.5 mr-1" />Apply to report</Button>
        )}
      </div>
      {plan && (
        <table className="w-full text-xs bg-white border border-zinc-300" data-testid="dfr-route-legs">
          <thead><tr className="bg-zinc-800 text-white"><th className="px-2 py-1 text-left">Leg</th><th className="px-2 py-1 text-left">From</th><th className="px-2 py-1 text-left">To</th><th className="px-2 py-1 text-right">Miles</th><th className="px-2 py-1 text-right">Drive time</th><th className="px-2 py-1 text-right">Hrs (¼)</th></tr></thead>
          <tbody>
            {plan.legs.map((l, i) => (
              <tr key={i} className={i % 2 ? "bg-zinc-50" : "bg-white"} data-testid={`dfr-route-leg-${i}`}>
                <td className="px-2 py-1">{i + 1}</td><td className="px-2 py-1 font-semibold">{l.from.row.job || "Job"}</td><td className="px-2 py-1 font-semibold">{l.to.row.job || "Job"}</td>
                <td className="px-2 py-1 text-right">{l.miles.toFixed(1)}</td><td className="px-2 py-1 text-right">{Math.round(l.hours * 60)} min</td><td className="px-2 py-1 text-right">{fmtHrs(roundQuarter(l.hours))}</td>
              </tr>
            ))}
            <tr className="bg-blue-100 font-semibold"><td className="px-2 py-1" colSpan={3}>Total</td><td className="px-2 py-1 text-right">{plan.miles.toFixed(1)}</td><td className="px-2 py-1 text-right">{Math.round(plan.hours * 60)} min</td><td className="px-2 py-1 text-right">{fmtHrs(roundQuarter(plan.hours))}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RoutePlanner;
