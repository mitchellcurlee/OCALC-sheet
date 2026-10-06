import { useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Loader2, FileUp, Check, Trash2 } from "lucide-react";
import { UNDERGROUND_TYPES } from "@/lib/poleMapImage";

/** Export menu → Import KML/KMZ: upload → review placemarks (type per row) → create poles / attributes. */
export const KmlImportDialog = ({ open, onOpenChange, jobId, onImported }) => {
  const inputRef = useRef(null);
  const [items, setItems] = useState(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setItems(null); setFilename(""); };
  const close = (o) => { if (!o) reset(); onOpenChange(o); };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await axios.post(`/jobs/${jobId}/import/kml/parse`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setItems(r.data.items.map((it, i) => ({ ...it, _i: i, label: "" })));
      setFilename(r.data.filename || f.name);
      toast.success(`${r.data.count} placemark${r.data.count === 1 ? "" : "s"} found — review the types, then import`);
    } catch (err) { toast.error(err.response?.data?.detail || "Could not read that file"); }
    finally { setBusy(false); }
  };

  const setItem = (i, patch) => setItems((list) => list.map((it) => (it._i === i ? { ...it, ...patch } : it)));
  const setKind = (i, v) => setItem(i, v === "pole" ? { kind: "pole", type: "Pole" } : v === "address" ? { kind: "address", type: "Address" } : { kind: "underground", type: v });
  const kindValue = (it) => (it.kind === "pole" ? "pole" : it.kind === "address" ? "address" : it.type);

  const doImport = async () => {
    if (!items?.length) return;
    setBusy(true);
    try {
      const r = await axios.post(`/jobs/${jobId}/import/kml/create`, { items: items.map(({ _i, ...it }) => it) });
      toast.success(`Imported ${r.data.poles} pole${r.data.poles === 1 ? "" : "s"}, ${r.data.addresses || 0} address${(r.data.addresses || 0) === 1 ? "" : "es"} and ${r.data.underground} attribute${r.data.underground === 1 ? "" : "s"}`);
      onImported?.();
      close(false);
    } catch (err) { toast.error(err.response?.data?.detail || "Import failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl bg-white max-h-[90vh] overflow-y-auto" aria-describedby={undefined} data-testid="kml-import-dialog">
        <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><FileUp className="w-4 h-4 text-emerald-700" />Import KML / KMZ placemarks</DialogTitle></DialogHeader>
        <input ref={inputRef} type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" className="hidden" onChange={onFile} data-testid="kml-import-file" />
        {!items ? (
          <div className="border-2 border-dashed border-zinc-300 rounded p-8 text-center space-y-3" data-testid="kml-import-drop">
            <p className="text-sm text-zinc-600">Pick a Google Earth KML or KMZ. Each point placemark becomes a pole, an address (blue pin), a suite or an underground / aerial attribute at its GPS coordinates — guessed from its name (P + number = pole, HH/FH = handhole, MH = manhole, marker acronyms, street address = address, address + suite/unit = suite). Lines and polygons are skipped, and imported items are placed as standalone (not auto-connected) — connect them on the map when ready.</p>
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="kml-import-choose-btn">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Choose file
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="font-mono" data-testid="kml-import-filename">{filename}</span>
              <span>· {items.length} placemark{items.length === 1 ? "" : "s"} · {items.filter((i) => i.kind === "pole").length} poles, {items.filter((i) => i.kind === "address").length} addresses, {items.filter((i) => i.kind === "underground").length} attributes</span>
              <button type="button" className="underline ml-auto" onClick={() => inputRef.current?.click()} data-testid="kml-import-change-file">Different file</button>
            </div>
            <div className="border border-zinc-300 rounded overflow-x-auto">
              <table className="w-full text-xs" data-testid="kml-import-table">
                <thead className="bg-zinc-100 text-zinc-700 font-mono uppercase text-[10px]">
                  <tr><th className="px-2 py-1.5 text-left">Placemark</th><th className="px-2 py-1.5 text-left">Folder</th><th className="px-2 py-1.5 text-left">Create as</th><th className="px-2 py-1.5 text-left">Pole # / Label</th><th className="px-2 py-1.5 text-left">GPS</th><th /></tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it._i} className="border-t border-zinc-200" data-testid={`kml-import-row-${it._i}`}>
                      <td className="px-2 py-1 font-semibold" title={it.description}>{it.name}</td>
                      <td className="px-2 py-1 text-zinc-500">{it.folder}</td>
                      <td className="px-2 py-1">
                        <select value={kindValue(it)} onChange={(e) => setKind(it._i, e.target.value)} className="h-7 border border-zinc-300 rounded px-1 bg-white" data-testid={`kml-import-type-${it._i}`}>
                          <option value="pole">Pole</option>
                          <option value="address">Address (blue pin)</option>
                          {UNDERGROUND_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1"><Input value={it.label || ""} onChange={(e) => setItem(it._i, { label: e.target.value })} placeholder="(blank)" className="h-7 text-xs w-32" data-testid={`kml-import-label-${it._i}`} /></td>
                      <td className="px-2 py-1 font-mono text-zinc-500">{it.lat.toFixed(6)}, {it.lng.toFixed(6)}</td>
                      <td className="px-1 py-1"><button type="button" onClick={() => setItems((l) => l.filter((x) => x._i !== it._i))} className="text-zinc-400 hover:text-red-600" title="Skip this placemark" data-testid={`kml-import-skip-${it._i}`}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)} className="text-xs" data-testid="kml-import-cancel">Cancel</Button>
              <Button type="button" onClick={doImport} disabled={busy || !items.length} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" data-testid="kml-import-create-btn">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}Import {items.length} item{items.length === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default KmlImportDialog;
