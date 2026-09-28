import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, FolderInput, Loader2 } from "lucide-react";
import { undergroundAbbr } from "@/lib/poleMapImage";

export const galleryItemLabel = (it) => {
  if (!it) return "";
  if (it._type === "pole") {
    const n = String(it.pole_number || "");
    return /^\d/.test(n) ? `P${n}` : (n || "Pole");
  }
  return `${undergroundAbbr(it.type)}${it.label && it.label !== it.type ? ` ${it.label}` : ""}`;
};

export const JobPhotoAssignDialog = ({ open, onOpenChange, items, count, busy, onConfirm }) => {
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((it) => `${galleryItemLabel(it)} ${it.address || ""}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  const toggle = (key) => setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const close = (o) => { if (!o) { setPicked([]); setQ(""); } onOpenChange(o); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg bg-white" aria-describedby={undefined} data-testid="gallery-assign-dialog">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><FolderInput className="w-4 h-4" />Assign {count} photo{count > 1 ? "s" : ""} to…</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-zinc-500">Pick one or more poles / underground items. Photos land in that item's unsorted Photo Gallery, where you can sort them into categories.</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by number, type, or address" className="h-9 text-sm bg-zinc-50" data-testid="gallery-assign-filter" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="text-xs text-zinc-400 col-span-2">No items match.</p>}
          {filtered.map((it) => {
            const key = `${it._type}:${it.id}`;
            const active = picked.includes(key);
            return (
              <Button key={key} type="button" variant="outline" size="sm" onClick={() => toggle(key)}
                className={`justify-start h-auto min-h-9 py-1.5 text-xs border ${active ? "bg-sky-100 border-sky-400 text-sky-900 hover:bg-sky-100" : "bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-sky-50 hover:border-sky-300"}`}
                data-testid={`gallery-assign-item-${it.id}`}>
                <span className={`mr-2 inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-sm border ${active ? "bg-sky-600 border-sky-600 text-white" : "border-zinc-300 bg-white"}`}>{active && <Check className="w-3 h-3" />}</span>
                <span className="text-left leading-tight">
                  <span className="font-semibold">{galleryItemLabel(it)}</span>
                  {it.address && <span className="block text-[10px] text-zinc-500 font-normal">{it.address}</span>}
                </span>
              </Button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs bg-zinc-50 border-zinc-300 text-zinc-700" onClick={() => close(false)} data-testid="gallery-assign-cancel">Cancel</Button>
          <Button type="button" size="sm" disabled={!picked.length || busy} className="h-9 text-xs bg-sky-600 hover:bg-sky-700 text-white" onClick={async () => { await onConfirm(picked); close(false); }} data-testid="gallery-assign-confirm">
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}Assign{picked.length > 0 && ` to ${picked.length} item${picked.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobPhotoAssignDialog;
