import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileSpreadsheet, Loader2, Plus, Route, Save, ClipboardList, History } from "lucide-react";
import { DFRTable } from "@/components/dfr/DFRTable";
import { TravelTracker } from "@/components/dfr/TravelTracker";
import { TravelMapDialog } from "@/components/dfr/TravelMapDialog";
import { MyReportsDialog } from "@/components/dfr/MyReportsDialog";
import { HomeAddress } from "@/components/dfr/HomeAddress";
import { useDailyReport } from "@/components/dfr/useDailyReport";
import { EMPLOYEE_NAMES } from "@/components/ase/ASEFormConstants";
import { newRow, todayISO, jobLabel } from "@/lib/dfr";

export default function DailyFieldReport() {
  const { jobId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get("date") || todayISO();
  const [mapOpen, setMapOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [home, setHome] = useState(null);
  const { jobs, report, saving, dirty, activeRowId, setActiveRowId, persist, update, changeRow, onTrack, startNextRow, activeRow, rowIndex } = useDailyReport({ jobId, date });

  useEffect(() => { axios.get("/field-reports/home").then((r) => setHome(r.data)).catch(() => setHome({ address: "", lat: null, lng: null })); }, []);

  const removeRow = (id) => { if (!window.confirm("Remove this row?")) return; update((r) => ({ ...r, rows: r.rows.filter((x) => x.id !== id), track: r.track.filter((p) => p.row_id !== id) })); };
  const moveRow = (id, dir) => update((r) => {
    const i = r.rows.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= r.rows.length) return r;
    const rows = [...r.rows]; [rows[i], rows[j]] = [rows[j], rows[i]];
    return { ...r, rows };
  });
  const reorderRows = (fromId, toId) => update((r) => {
    const from = r.rows.findIndex((x) => x.id === fromId), to = r.rows.findIndex((x) => x.id === toId);
    if (from < 0 || to < 0) return r;
    const rows = [...r.rows]; const [m] = rows.splice(from, 1); rows.splice(to, 0, m);
    return { ...r, rows };
  });
  const pickJob = (rowId, jid) => { const job = jobs.find((j) => j.id === jid); changeRow({ ...report.rows.find((x) => x.id === rowId), job_id: jid, job: jobLabel(job), sow: job?.job_type || "", job_type: job?.job_type || "", job_address: job?.location || "" }); };
  const addRow = () => { const row = { ...newRow(null), date: report.date, fielder: report.fielder || "" }; update((r) => ({ ...r, rows: [...r.rows, row] })); setActiveRowId(row.id); };
  const setFielder = (v) => update((r) => ({ ...r, fielder: v, rows: r.rows.map((x) => (x.fielder ? x : { ...x, fielder: v })) }));
  const changeDate = (d) => { if (!d) return; persist().then(() => setParams({ date: d })); };

  const exportXlsx = async () => {
    try {
      await persist();
      const res = await axios.get(`/field-reports/${report.id}/export/xlsx`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `Daily_Field_Report_${report.date}.xlsx`; a.click();
      toast.success("Excel downloaded");
    } catch { toast.error("Export failed"); }
  };

  if (!report) return <div className="min-h-screen bg-industrial-bg flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>;

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="dfr-page">
      <header className="bg-zinc-900 text-white px-4 py-3">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center gap-3">
          <Button size="icon" variant="ghost" className="text-zinc-300 hover:text-white hover:bg-zinc-800" onClick={() => navigate(`/jobs/${jobId}`)} data-testid="dfr-back"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="font-heading text-lg font-bold uppercase tracking-tight flex items-center gap-2"><ClipboardList className="w-5 h-5" />Daily Field Report</h1>
            <p className="text-[11px] font-mono text-zinc-400">{report.rows.length} job row{report.rows.length !== 1 ? "s" : ""} · {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <label className="text-[10px] font-mono uppercase text-zinc-400">Date</label>
            <Input type="date" value={report.date} onChange={(e) => changeDate(e.target.value)} className="h-9 w-40 bg-zinc-800 border-zinc-700 text-white" data-testid="dfr-report-date" />
            <label className="text-[10px] font-mono uppercase text-zinc-400">Fielder</label>
            <select value={report.fielder || ""} onChange={(e) => setFielder(e.target.value)} className="h-9 bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-2" data-testid="dfr-report-fielder">
              <option value="">Select…</option>
              {EMPLOYEE_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button onClick={() => setHistoryOpen(true)} variant="outline" className="h-9 text-xs bg-zinc-800 border-zinc-600 text-white hover:bg-zinc-700" data-testid="dfr-my-reports-btn"><History className="w-4 h-4 mr-1" />My Reports</Button>
            <Button onClick={() => setMapOpen(true)} className="h-9 text-xs bg-orange-600 hover:bg-orange-700 text-white" data-testid="dfr-travel-map-btn"><Route className="w-4 h-4 mr-1" />Travel Map</Button>
            <Button onClick={exportXlsx} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="dfr-export-xlsx-btn"><FileSpreadsheet className="w-4 h-4 mr-1" />Export to Excel</Button>
            <Button onClick={persist} variant="outline" className="h-9 text-xs bg-zinc-800 border-zinc-600 text-white hover:bg-zinc-700" data-testid="dfr-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}</Button>
          </div>
        </div>
      </header>
      <main className="max-w-[1500px] mx-auto p-3 space-y-3">
        {home && <HomeAddress home={home} onChange={setHome} />}
        <TravelTracker report={report} activeRow={activeRow} rowIndex={rowIndex} onTrack={onTrack} onRowChange={changeRow} onStartNext={startNextRow} />
        <DFRTable rows={report.rows} jobs={jobs} employees={EMPLOYEE_NAMES} onChangeRow={changeRow} onRemoveRow={removeRow} onPickJob={pickJob} onMoveRow={moveRow} onReorder={reorderRows} activeRowId={activeRowId} onActivate={setActiveRowId} />
        <Button onClick={addRow} variant="outline" className="h-10 text-xs bg-white border-zinc-300" data-testid="dfr-add-row-btn"><Plus className="w-4 h-4 mr-1" />Add job row</Button>
      </main>
      <MyReportsDialog open={historyOpen} onOpenChange={setHistoryOpen} currentDate={report.date} onPick={(d) => { setHistoryOpen(false); changeDate(d); }} />
      <TravelMapDialog open={mapOpen} onOpenChange={setMapOpen} report={report} jobs={jobs} employees={EMPLOYEE_NAMES} onRowChange={changeRow} home={home} onHomeChange={setHome} />
    </div>
  );
}
