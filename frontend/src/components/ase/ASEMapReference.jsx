import React, { useEffect, useState } from "react";
import { Loader2, Map as MapIcon, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPoleMapImage, buildSpanMeasurementTexts, routeArg } from "@/lib/poleMapImage";

// On-screen only reference: a fresh render of the job's map beside its span measurements list.
// Never part of the exported ASE workbook.
export const ASEMapReference = ({ job, poles, underground, connections, routes }) => {
  const [open, setOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open || !job) return undefined;
    let cancelled = false;
    let url = null;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const blob = await downloadPoleMapImage({ poles, job, underground, connections, routes, returnBlob: true });
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setImgUrl(url);
      } catch (e) {
        if (!cancelled) setError("Could not render the map reference");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [open, tick, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const includeStations = typeof window !== "undefined" && localStorage.getItem(`staToggle:${job?.id}`) === "1";
  const spanTexts = job
    ? buildSpanMeasurementTexts({ poles, underground, connections, routes, includeStations, spanNotes: job.span_notes || [], spanOrder: job.span_order || null, drawnOnly: routeArg(job), stationStartId: job.station_start_id || null })
    : [];

  return (
    <div className="bg-white rounded-lg border border-zinc-200" data-testid="ase-map-reference">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left" data-testid="ase-map-reference-toggle">
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
          <MapIcon className="w-4 h-4 text-blue-600" />
          Map &amp; Span List Reference
          <span className="text-[10px] font-mono uppercase text-zinc-400 ml-1">on-screen only · not exported</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="ase-map-reference-body">
          <div className="relative min-h-[220px] rounded border border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden">
            {busy && <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" />Rendering map…</div>}
            {!busy && error && <div className="text-sm text-red-600">{error}</div>}
            {!busy && !error && imgUrl && <img src={imgUrl} alt="Job map reference" className="w-full h-auto" data-testid="ase-map-reference-img" />}
            <Button type="button" size="sm" variant="outline" onClick={() => setTick((t) => t + 1)} disabled={busy} className="absolute top-2 right-2 h-7 px-2 bg-white/90" title="Re-render map" data-testid="ase-map-reference-refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="rounded border border-zinc-200 bg-white p-3 max-h-[420px] overflow-y-auto" data-testid="ase-span-reference-list">
            <div className="text-xs font-mono uppercase tracking-wide text-zinc-500 mb-2">Span Measurements ({spanTexts.length})</div>
            {spanTexts.length === 0 ? (
              <div className="text-sm text-zinc-400">No spans drawn on this job yet.</div>
            ) : (
              <ol className="space-y-1 text-sm font-mono text-zinc-800">
                {spanTexts.map((t, i) => (
                  <li key={i} className="flex gap-2"><span className="text-orange-700 font-bold w-6 flex-shrink-0 text-right">{i + 1}.</span><span>{t}</span></li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
