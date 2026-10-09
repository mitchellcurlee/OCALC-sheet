import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { newRow, jobLabel } from "@/lib/dfr";

const blank = (date) => ({ id: null, date, fielder: "", rows: [], track: [] });

/**
 * Loads the user's Daily Field Report for a date and exposes debounced-save mutators.
 * autoRow=true (DFR page): creates the report + a row for jobId on load.
 * autoRow=false (Job Detail tracker): nothing is written until the first GPS tap; the job's row is a pending virtual row.
 */
export const useDailyReport = ({ jobId, date, job: givenJob = null, autoRow = true, onDateChanged = null }) => {
  const [jobs, setJobs] = useState([]);
  const [report, setReport] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const saveTimer = useRef(null);
  const reportRef = useRef(null);
  reportRef.current = report;
  const dateRef = useRef(date);
  dateRef.current = date;
  const onDateChangedRef = useRef(onDateChanged);
  onDateChangedRef.current = onDateChanged;
  const givenJobId = givenJob?.id;
  const pendingRow = useMemo(() => (givenJob ? { ...newRow(givenJob), date } : null), [givenJobId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    // already showing this day's (saved) report — e.g. after re-dating synced the URL — nothing to reload
    if (reportRef.current?.id && reportRef.current.date === date) return undefined;
    (async () => {
      try {
        const jobList = givenJob ? [givenJob] : (await axios.get("/jobs")).data || [];
        if (cancelled) return;
        setJobs(jobList);
        const list = (await axios.get(`/field-reports?date=${date}`)).data || [];
        // the list endpoint omits the GPS track — fetch the full document
        let rep = list[0] ? (await axios.get(`/field-reports/${list[0].id}`)).data : null;
        if (!rep) rep = autoRow ? (await axios.post("/field-reports", blank(date))).data : blank(date);
        rep.rows = rep.rows || []; rep.track = rep.track || [];
        // rows are labelled by Site ID — refresh labels of existing rows if the job's Site ID changed
        let relabel = false;
        rep.rows = rep.rows.map((r) => { const j = jobList.find((x) => x.id === r.job_id); const lbl = jobLabel(j); if (j && lbl && r.job !== lbl) { relabel = true; return { ...r, job: lbl }; } return r; });
        const job = jobList.find((j) => j.id === jobId);
        if (autoRow && job && !rep.rows.some((r) => r.job_id === jobId)) {
          rep.rows = [...rep.rows, { ...newRow(job), date, fielder: rep.fielder || "" }];
          relabel = true;
        }
        if (relabel && rep.id) rep = (await axios.put(`/field-reports/${rep.id}`, rep)).data;
        if (cancelled) return;
        setReport(rep);
        setActiveRowId((rep.rows.find((r) => r.job_id === jobId) || (autoRow ? rep.rows[rep.rows.length - 1] : null))?.id || null);
      } catch (e) { toast.error(e.response?.data?.detail || "Could not load the Daily Field Report"); }
    })();
    return () => { cancelled = true; };
  }, [jobId, date, givenJobId, autoRow]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async () => {
    let rep = reportRef.current;
    if (!rep) return;
    setSaving(true);
    try {
      if (!rep.id) {
        const created = (await axios.post("/field-reports", { date: rep.date, fielder: rep.fielder || "", rows: [], track: [] })).data;
        rep = { ...rep, id: created.id };
        reportRef.current = rep;
        setReport((p) => (p ? { ...p, id: created.id } : p));
      }
      const saved = (await axios.put(`/field-reports/${rep.id}`, { date: rep.date, fielder: rep.fielder, rows: rep.rows, track: rep.track })).data;
      // the server may move the report to the date its rows show
      if (saved?.date && saved.date !== reportRef.current?.date) {
        setReport((p) => { const n = p ? { ...p, date: saved.date } : p; reportRef.current = n; return n; });
      }
      if (saved?.date && saved.date !== dateRef.current) onDateChangedRef.current?.(saved.date);
      setDirty(false);
    } catch { toast.error("Save failed — will retry"); }
    finally { setSaving(false); }
  }, []);

  const update = useCallback((fn) => {
    setReport((prev) => { const next = fn(prev); reportRef.current = next; return next; });
    setDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 1200);
  }, [persist]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Header date change: re-date THIS report (and rows still on the old date) and save it.
  // Returns "conflict" when another report already owns that day (caller decides whether to open it).
  const redate = useCallback(async (d) => {
    const rep = reportRef.current;
    if (!rep || !d || d === rep.date) return "same";
    const list = (await axios.get(`/field-reports?date=${d}`)).data || [];
    if (list.some((x) => x.id !== rep.id)) return "conflict";
    const next = { ...rep, date: d, rows: rep.rows.map((r) => (!r.date || r.date === rep.date ? { ...r, date: d } : r)) };
    reportRef.current = next;
    setReport(next);
    clearTimeout(saveTimer.current);
    await persist();
    return "ok";
  }, [persist]);

  // upsert: a pending (virtual) row is appended on its first change
  const changeRow = useCallback((row) => {
    update((r) => (r.rows.some((x) => x.id === row.id)
      ? { ...r, rows: r.rows.map((x) => (x.id === row.id ? row : x)) }
      : { ...r, rows: [...r.rows, { ...row, fielder: row.fielder || r.fielder || "" }] }));
    setActiveRowId((cur) => cur || row.id);
  }, [update]);
  const onTrack = useCallback((pt, clearRowId) => update((r) => ({ ...r, track: pt ? [...r.track, pt] : r.track.filter((p) => p.row_id !== clearRowId) })), [update]);

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

  const existing = report?.rows.find((r) => r.id === activeRowId) || null;
  const activeRow = existing || (!autoRow && pendingRow && report && !report.rows.some((r) => r.job_id === jobId) ? pendingRow : null);
  const rowIndex = report ? (existing ? report.rows.findIndex((r) => r.id === activeRowId) : report.rows.length) : -1;

  return { jobs, report, saving, dirty, activeRowId, setActiveRowId, persist, update, changeRow, onTrack, startNextRow, activeRow, rowIndex, redate };
};
