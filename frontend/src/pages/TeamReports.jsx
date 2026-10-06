import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/useGoBack";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileSpreadsheet, Loader2, Users, Search } from "lucide-react";
import { fmtHrs, todayISO } from "@/lib/dfr";
import { DFR_HEADERS } from "@/components/dfr/DFRTable";
import { HomeButton } from "@/components/HomeButton";

const COLS = ["date", "job", "market", "sow", "job_type", "job_address", "fielder", "travel_hrs", "work_hrs", "return_hrs", "miles", "footage", "poles", "computer_hrs", "status", "comments"];
const TOTAL_KEYS = ["travel_hrs", "work_hrs", "return_hrs", "miles", "footage", "poles", "computer_hrs"];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

/** Admin: every fielder's Daily Field Report rows for a date range, with totals + Excel export. */
export default function TeamReports() {
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayISO());
  const [fielder, setFielder] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData((await axios.get("/field-reports/team", { params: { date_from: from, date_to: to } })).data); }
    catch (e) { toast.error(e.response?.data?.detail || "Could not load team reports"); if (e.response?.status === 403) navigate("/"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = (data?.rows || []).filter((r) => !fielder || r.report_fielder === fielder);
  const totals = Object.fromEntries(TOTAL_KEYS.map((k) => [k, rows.reduce((s, r) => s + (parseFloat(r[k]) || 0), 0)]));

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const res = await axios.get("/field-reports/team/export", { params: { date_from: from, date_to: to }, responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `Team_Field_Report_${from}_to_${to}.xlsx`; a.click();
      toast.success("Team report downloaded");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="team-reports-page">
      <header className="bg-zinc-900 text-white px-3 py-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="text-zinc-300 hover:text-white hover:bg-zinc-800" data-testid="team-reports-back"><ArrowLeft className="w-5 h-5" /></Button>
        <HomeButton className="text-zinc-300 hover:text-white hover:bg-zinc-800" />
        <h1 className="font-heading text-base sm:text-lg font-black uppercase tracking-tight flex items-center gap-2"><Users className="w-5 h-5 text-orange-400" />Team Daily Field Reports</h1>
        <span className="text-[11px] text-zinc-400 font-mono">admins &amp; supervisors · all fielders</span>
      </header>
      <main className="max-w-[1500px] mx-auto p-3 space-y-3">
        <div className="bg-white border border-zinc-300 rounded p-3 flex flex-wrap items-end gap-3" data-testid="team-reports-filters">
          <label className="text-xs text-zinc-600 space-y-1"><span className="font-mono uppercase text-[10px]">From</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 bg-zinc-50" data-testid="team-from" /></label>
          <label className="text-xs text-zinc-600 space-y-1"><span className="font-mono uppercase text-[10px]">To</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 bg-zinc-50" data-testid="team-to" /></label>
          <Button type="button" onClick={load} disabled={loading} className="h-9 text-xs bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="team-load-btn">{loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}Load</Button>
          <label className="text-xs text-zinc-600 space-y-1"><span className="font-mono uppercase text-[10px]">Fielder</span>
            <select value={fielder} onChange={(e) => setFielder(e.target.value)} className="h-9 border border-zinc-300 rounded px-2 bg-zinc-50 text-sm block" data-testid="team-fielder-filter">
              <option value="">All fielders ({data?.fielders?.length || 0})</option>
              {(data?.fielders || []).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <Button type="button" onClick={exportXlsx} disabled={exporting || !rows.length} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white ml-auto" data-testid="team-export-btn">{exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}Export to Excel</Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" data-testid="team-totals">
          {[["Travel hrs", fmtHrs(totals.travel_hrs)], ["Work hrs", fmtHrs(totals.work_hrs)], ["Return hrs", fmtHrs(totals.return_hrs)], ["Miles", Math.round(totals.miles)], ["Footage", Math.round(totals.footage)], ["Poles", Math.round(totals.poles)], ["Computer hrs", fmtHrs(totals.computer_hrs)]].map(([l, v]) => (
            <div key={l} className="bg-white border border-zinc-300 rounded px-3 py-2"><div className="text-[10px] font-mono uppercase text-zinc-500">{l}</div><div className="text-lg font-bold text-zinc-900" data-testid={`team-total-${l.split(" ")[0].toLowerCase()}`}>{v}</div></div>
          ))}
        </div>
        <div className="overflow-x-auto border border-zinc-300 rounded bg-white">
          <table className="min-w-max border-collapse text-xs" data-testid="team-table">
            <thead><tr className="bg-black text-white">{DFR_HEADERS.map((h) => <th key={h} className="border border-zinc-700 px-2 py-2 font-bold text-[11px] whitespace-pre-line text-center max-w-[110px]">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.report_id}-${r.id}`} className={i % 2 ? "bg-white" : "bg-zinc-100"} data-testid={`team-row-${i}`}>
                  {COLS.map((k) => <td key={k} className={`border border-zinc-300 px-2 py-1 ${["job_address", "comments", "status"].includes(k) ? "text-left max-w-[260px] whitespace-pre-wrap" : "text-center"}`}>{r[k] ?? ""}</td>)}
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-yellow-100 font-bold" data-testid="team-totals-row">
                  {COLS.map((k) => <td key={k} className="border-t-2 border-b-2 border-zinc-800 border-x border-zinc-300 px-2 py-1 text-center">{k === "date" ? "TOTALS" : TOTAL_KEYS.includes(k) ? (["miles", "footage", "poles"].includes(k) ? Math.round(totals[k]) : fmtHrs(totals[k])) : ""}</td>)}
                </tr>
              )}
              {!loading && rows.length === 0 && <tr><td colSpan={COLS.length} className="text-center text-zinc-500 py-8">No report rows for this range{fielder ? ` from ${fielder}` : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
