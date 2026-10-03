import { useEffect, useState } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History, Loader2, CalendarPlus, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { fmtHrs } from "@/lib/dfr";

const sumHrs = (r) => ["travel_hrs", "work_hrs", "return_hrs", "computer_hrs"].reduce((s, k) => s + (parseFloat(r[k]) || 0), 0);

export const MyReportsDialog = ({ open, onOpenChange, currentDate, onPick }) => {
  const [reports, setReports] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReports(null);
    axios.get("/field-reports").then((r) => { const list = r.data || []; setReports(list); if (list.length) { setTo((t) => t || list[0].date); setFrom((f) => f || list[Math.min(list.length - 1, 6)].date); } }).catch(() => setReports([]));
  }, [open]);

  const exportRange = async () => {
    if (!from || !to) return;
    setExporting(true);
    try {
      const res = await axios.get("/field-reports/export/range", { params: { date_from: from, date_to: to }, responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `Daily_Field_Report_${from}_to_${to}.xlsx`; a.click();
      toast.success("Combined report downloaded");
    } catch (e) {
      let msg = "Export failed";
      try { msg = JSON.parse(await e.response?.data?.text())?.detail || msg; } catch { /* keep */ }
      toast.error(msg);
    } finally { setExporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white z-[1300]" aria-describedby={undefined} data-testid="dfr-my-reports-dialog">
        <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><History className="w-4 h-4" />My Daily Field Reports</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9 bg-zinc-50" data-testid="dfr-history-new-date" />
          <Button type="button" disabled={!newDate} onClick={() => onPick(newDate)} className="h-9 text-xs bg-zinc-900 hover:bg-zinc-800 text-white whitespace-nowrap" data-testid="dfr-history-open-date"><CalendarPlus className="w-4 h-4 mr-1" />Open / start date</Button>
        </div>
        <div className="border border-emerald-300 bg-emerald-50/60 rounded p-2 space-y-1.5" data-testid="dfr-range-export">
          <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-900 flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" />Combined report (several dates, one sheet with totals)</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 bg-white" data-testid="dfr-range-from" />
            <span className="text-xs text-zinc-500">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 bg-white" data-testid="dfr-range-to" />
            <Button type="button" disabled={!from || !to || exporting} onClick={exportRange} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white ml-auto" data-testid="dfr-range-export-btn">
              {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}Export to Excel
            </Button>
          </div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-zinc-200 border border-zinc-200 rounded" data-testid="dfr-history-list">
          {reports === null && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>}
          {reports?.length === 0 && <p className="text-xs text-zinc-500 text-center py-6">No reports yet.</p>}
          {reports?.map((r) => {
            const rows = r.rows || [];
            const hrs = rows.reduce((s, x) => s + sumHrs(x), 0);
            const miles = rows.reduce((s, x) => s + (parseFloat(x.miles) || 0), 0);
            const isCurrent = r.date === currentDate;
            return (
              <button key={r.id} type="button" onClick={() => onPick(r.date)} className={`w-full text-left px-3 py-2 hover:bg-sky-50 ${isCurrent ? "bg-sky-50/70" : "bg-white"}`} data-testid={`dfr-history-item-${r.date}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm text-zinc-900">{r.date}</span>
                  {isCurrent && <span className="text-[10px] font-mono px-1.5 rounded bg-sky-600 text-white">OPEN</span>}
                  <span className="ml-auto text-[11px] text-zinc-500">{rows.length} job{rows.length !== 1 ? "s" : ""} · {fmtHrs(hrs) || 0} h · {Math.round(miles)} mi</span>
                </div>
                <div className="text-xs text-zinc-600 truncate">{r.fielder ? `${r.fielder} · ` : ""}{rows.map((x) => x.job).filter(Boolean).join(", ") || "no jobs yet"}</div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MyReportsDialog;
