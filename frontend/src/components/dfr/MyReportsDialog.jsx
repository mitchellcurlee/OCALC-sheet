import { useEffect, useState } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History, Loader2, CalendarPlus } from "lucide-react";
import { fmtHrs } from "@/lib/dfr";

const sumHrs = (r) => ["travel_hrs", "work_hrs", "return_hrs", "computer_hrs"].reduce((s, k) => s + (parseFloat(r[k]) || 0), 0);

export const MyReportsDialog = ({ open, onOpenChange, currentDate, onPick }) => {
  const [reports, setReports] = useState(null);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setReports(null);
    axios.get("/field-reports").then((r) => setReports(r.data || [])).catch(() => setReports([]));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white z-[1300]" aria-describedby={undefined} data-testid="dfr-my-reports-dialog">
        <DialogHeader><DialogTitle className="text-sm font-mono uppercase flex items-center gap-2"><History className="w-4 h-4" />My Daily Field Reports</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9 bg-zinc-50" data-testid="dfr-history-new-date" />
          <Button type="button" disabled={!newDate} onClick={() => onPick(newDate)} className="h-9 text-xs bg-zinc-900 hover:bg-zinc-800 text-white whitespace-nowrap" data-testid="dfr-history-open-date"><CalendarPlus className="w-4 h-4 mr-1" />Open / start date</Button>
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
