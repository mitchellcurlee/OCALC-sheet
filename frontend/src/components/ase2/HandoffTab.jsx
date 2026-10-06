import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ClipboardPaste, Wand2 } from "lucide-react";

/** Handoff Site Details tab — paste the whole "Site Visit Award Info" block; it is split into fields + auto-fills the checklist. */
export const HandoffTab = ({ schema, data, onPaste, onApply }) => {
  const parsedCount = schema.handoff.filter((h) => data[`handoff_${h.key}`]).length;
  return (
    <section className="bg-white border border-zinc-300 rounded overflow-hidden" data-testid="ase2-handoff-tab">
      <h2 className="bg-black text-white text-xs font-bold tracking-widest uppercase px-3 py-2">Copy and Paste of Site Visit Award Info</h2>
      <div className="p-3 space-y-3">
        <p className="text-xs text-zinc-600 flex items-center gap-1.5"><ClipboardPaste className="w-4 h-4 text-blue-600" />Paste the full award info block (Site ID, Common ID, ASR Number, … LCON). Each line is read automatically and the Fielding Checklist is filled from it.</p>
        <Textarea value={data.handoff_raw || ""} onChange={(e) => onPaste(e.target.value)} rows={16} placeholder={"Site ID: \nCommon ID: \nASR Number: \nPON: \nCRDD: \n\nSite Type: \n…\nLCON: \nSecondary LCON: "} className="bg-white text-sm font-mono" data-testid="ase2-handoff-paste" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-500" data-testid="ase2-handoff-parsed-count">{parsedCount} of {schema.handoff.length} lines recognized</span>
          <Button type="button" variant="outline" size="sm" onClick={onApply} disabled={!parsedCount} className="h-8 text-xs" data-testid="ase2-handoff-apply-btn"><Wand2 className="w-3.5 h-3.5 mr-1" />Re-apply to Fielding Checklist (overwrite)</Button>
        </div>
        {parsedCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 border-t border-zinc-200 pt-2" data-testid="ase2-handoff-parsed">
            {schema.handoff.map((h) => (
              <div key={h.key} className="flex gap-2 py-0.5 text-sm"><span className="w-32 shrink-0 text-zinc-500">{h.label}:</span><span className="font-medium text-zinc-900 break-all" data-testid={`ase2-handoff-${h.key}`}>{data[`handoff_${h.key}`] || <span className="text-zinc-300">—</span>}</span></div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
