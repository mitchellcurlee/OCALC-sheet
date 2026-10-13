import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

export const PATH_DIRECTIONS = ["In", "Over", "Up", "Down", "North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];

const toRows = (item) => (item?.path_measurements || []).map((m) => ({ direction: m.direction || "In", feet: m.feet?.toString() || "", rel: m.rel || "to", to: m.to || "" }));

// Edit the path measurements of a pole / underground attribute straight from the map (same rows as the forms)
export const PathMeasurementDialog = ({ item, itemType, itemName, targetOptions = [], onOpenChange, onSaved }) => {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(toRows(item)); }, [item]);
  const open = !!item;

  const set = (i, k, v) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const total = rows.reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);

  const save = async () => {
    const clean = rows
      .filter((m) => m.direction && m.feet !== "" && Number.isFinite(parseFloat(m.feet)))
      .map((m) => ({ direction: m.direction, feet: parseFloat(m.feet), rel: m.rel || "to", to: m.to }));
    setSaving(true);
    try {
      await axios.put(`/${itemType === "pole" ? "poles" : "underground"}/${item.id}`, { path_measurements: clean });
      toast.success(clean.length ? "Path measurements updated" : "Path measurements removed");
      onSaved?.();
      onOpenChange(false);
    } catch { toast.error("Could not save path measurements"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl z-[1100]" data-testid="path-measurement-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">Path measurements — {itemName}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">Direction + footage rows, each measured to or from a target (e.g. Up 2 ft, Over 3 ft to FBT). Changes update the map list, stations and exports.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-xs text-zinc-500" data-testid="path-dialog-empty">No path rows — add one below or Save to clear the path.</p>}
          {rows.map((m, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap" data-testid={`path-dialog-row-${i}`}>
              <Select value={m.direction} onValueChange={(v) => set(i, "direction", v)}>
                <SelectTrigger className="h-10 w-32 bg-white border-emerald-300" data-testid={`path-dialog-direction-${i}`}><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300 z-[1200]">{PATH_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
              <div className="relative w-24">
                <Input type="number" inputMode="decimal" min="0" step="any" value={m.feet} onChange={(e) => set(i, "feet", e.target.value)} placeholder="0" className="h-10 bg-white border-emerald-300 pr-8" data-testid={`path-dialog-feet-${i}`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">ft</span>
              </div>
              <Select value={m.rel || "to"} onValueChange={(v) => set(i, "rel", v)}>
                <SelectTrigger className="h-10 w-24 bg-white border-emerald-300 font-mono text-xs" data-testid={`path-dialog-rel-${i}`}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300 z-[1200]"><SelectItem value="to">to</SelectItem><SelectItem value="from">from</SelectItem></SelectContent>
              </Select>
              <Select value={m.to || "__blank__"} onValueChange={(v) => set(i, "to", v === "__blank__" ? "" : v)}>
                <SelectTrigger className="h-10 flex-1 min-w-[130px] bg-white border-emerald-300" data-testid={`path-dialog-to-${i}`}><SelectValue placeholder="Target…" /></SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300 z-[1200] max-h-60">
                  <SelectItem value="__blank__"><span className="text-zinc-400">— blank —</span></SelectItem>
                  {targetOptions.map((t, ti) => <SelectItem key={`${t}-${ti}`} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} size="icon" variant="ghost" className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`path-dialog-remove-${i}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button type="button" size="sm" variant="outline" className="h-8 bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => setRows((p) => [...p, { direction: "In", feet: "", rel: "to", to: "" }])} data-testid="path-dialog-add"><Plus className="w-4 h-4 mr-1" />Add row</Button>
            <span className="text-xs font-mono text-emerald-700" data-testid="path-dialog-total">{total > 0 ? `${total} ft total` : ""}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="path-dialog-cancel">Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="path-dialog-save">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />Save</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
