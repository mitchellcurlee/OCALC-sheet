import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { EMPLOYEE_NAMES } from "@/components/ase/ASEFormConstants";
import { newRow, todayISO } from "@/lib/dfr";

export default function DailyFieldReport() {
  const { jobId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get("date") || todayISO();
  const [jobs, setJobs] = useState([]);
  const [report, setReport] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveTimer = useRef(null);
  const reportRef = useRef(null);
  reportRef.current = report;

  // Load jobs + today's report (create if missing), ensure a row for this job
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const jobsRes = await axios.get("/jobs");
        const jobList = jobsRes.data || [];
        if (cancelled) return;
        setJobs(jobList);
        const list = (await axios.get(`/field-reports?date=${date}`)).data || [];
        let rep = list[0];
        if (!rep) rep = (await axios.post("/field-reports", { date, fielder: "", rows: [], track: [] })).data;
        rep.rows = rep.rows || []; rep.track = rep.track || [];
        const job = jobList.find((j) => j.id === jobId);
        if (job && !rep.rows.some((r) => r.job_id === jobId)) {
          rep.rows = [...rep.rows, { ...newRow(job), date, fielder: rep.fielder || "" }];
          rep = (await axios.put(`/field-reports/${rep.id}`, rep)).data;
        }
        if (cancelled) return;
        setReport(rep);
        setActiveRowId((rep.rows.find((r) => r.job_id === jobId) || rep.rows[rep.rows.length - 1])?.id || null);
      } catch (e) { toast.error(e.response?.data?.detail || "Could not load the Daily Field Report"); }
    })();
    return () => { cancelled = true; };
  }, [jobId, date]);

  const persist = useCallback(async () => {
    const rep = reportRef.current;
    if (!rep) return;
    setSaving(true);
    try { await axios.put(`/field-reports/${rep.id}`, { date: rep.date, fielder: rep.fielder, rows: rep.rows, track: rep.track }); setDirty(false); }
    catch { toast.error("Save failed — will retry"); }
    finally { setSaving(false); }
  }, []);

  const update = (fn) => {
    setReport((prev) => { const next = fn(prev); reportRef.current = next; return next; });
    setDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 1200);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const changeRow = (row) => update((r) => ({ ...r, rows: r.rows.map((x) => (x.id === row.id ? row : x)) }));
  const removeRow = (id) => { if (!window.confirm("Remove this row?")) return; update((r) => ({ ...r, rows: r.rows.filter((x) => x.id !== id), track: r.track.filter((p) => p.row_id !== id) })); };
  const pickJob = (rowId, jid) => { const job = jobs.find((j) => j.id === jid); changeRow({ ...report.rows.find((x) => x.id === rowId), job_id: jid, job: job?.name || "", sow: job?.job_type || "", job_type: job?.job_type || "", job_address: job?.location || "" }); };
  const addRow = () => { const row = { ...newRow(null), date: report.date, fielder: report.fielder || "" }; update((r) => ({ ...r, rows: [...r.rows, row] })); setActiveRowId(row.id); };
  const onTrack = (pt, clearRowId) => update((r) => ({ ...r, track: pt ? [...r.track, pt] : r.track.filter((p) => p.row_id !== clearRowId) }));
  // Next row for one-tap continuation: first later row without GPS, else a new row; it starts at "arrived"
  const startNextRow = (nowIso) => {
    const rep = reportRef.current;
    const idx = rep.rows.findIndex((r) => r.id === activeRowId);
    let target = rep.rows.slice(idx + 1).find((r) => !r.gps?.travel_start);
    let rows = rep.rows;
    if (!target) { target = { ...newRow(null), date: rep.date, fielder: rep.fielder || "" }; rows = [...rows, target]; }
    const gps = { travel_start: nowIso, arrived: nowIso };
    rows = rows.map((r) => (r.id === target.id ? { ...r, gps } : r));
    update((r) => ({ ...r, rows }));
    setActiveRowId(target.id);
    return { ...target, gps, index: rows.findIndex((r) => r.id === target.id) };
  };
  const setFielder = (v) => update((r) => ({ ...r, fielder: v, rows: r.rows.map((x) => (x.fielder ? x : { ...x, fielder: v })) }));
  const changeDate = (d) => { if (!d) return; clearTimeout(saveTimer.current); persist().then(() => setParams({ date: d })); };

  const exportXlsx = async () => {
    try {
      await persist();
      const res = await axios.get(`/field-reports/${report.id}/export/xlsx`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `Daily_Field_Report_${report.date}.xlsx`; a.click();
      toast.success("Excel downloaded");
    } catch { toast.error("Export failed"); }
  };

  const activeRow = useMemo(() => report?.rows.find((r) => r.id === activeRowId) || null, [report, activeRowId]);
  const rowIndex = report ? report.rows.findIndex((r) => r.id === activeRowId) : -1;

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
        <TravelTracker report={report} activeRow={activeRow} rowIndex={rowIndex} onTrack={onTrack} onRowChange={changeRow} onStartNext={startNextRow} />
        <DFRTable rows={report.rows} jobs={jobs} employees={EMPLOYEE_NAMES} onChangeRow={changeRow} onRemoveRow={removeRow} onPickJob={pickJob} activeRowId={activeRowId} onActivate={setActiveRowId} />
        <Button onClick={addRow} variant="outline" className="h-10 text-xs bg-white border-zinc-300" data-testid="dfr-add-row-btn"><Plus className="w-4 h-4 mr-1" />Add job row</Button>
      </main>
      <MyReportsDialog open={historyOpen} onOpenChange={setHistoryOpen} currentDate={report.date} onPick={(d) => { setHistoryOpen(false); changeDate(d); }} />
      <TravelMapDialog open={mapOpen} onOpenChange={setMapOpen} report={report} jobs={jobs} employees={EMPLOYEE_NAMES} />
    </div>
  );
}
