import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Radio, ChevronUp, ChevronDown } from "lucide-react";
import { MARKETS, HOUR_OPTIONS, MILE_OPTIONS, fmtHrs } from "@/lib/dfr";
import { JOB_TYPES } from "@/lib/jobTypes";

export const DFR_HEADERS = [
  "Date", "Job", "Market", "SOW", "Job Type", "Job Address", "Fielder at Site", "Travel to site (hrs)", "Work @job (hrs)",
  "Return to Home/next Site (hrs)", "Total miles driven", "Job footage (ft)", "# Poles", "Time on computer for Job", "Status", "Comments",
];

const Sel = ({ value, options, onChange, testId, placeholder = "—" }) => (
  <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-8 w-full bg-transparent text-xs text-center border border-transparent focus:border-sky-500 focus:bg-white rounded outline-none" data-testid={testId}>
    <option value="">{placeholder}</option>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const Txt = ({ value, onChange, testId, className = "", type = "text" }) => (
  <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`h-8 text-xs bg-transparent border-transparent focus:border-sky-500 focus:bg-white rounded px-1 ${className}`} data-testid={testId} />
);

const rowValues = (row) => [row.date, row.job, row.market, row.sow, row.job_type, row.job_address, row.fielder, fmtHrs(row.travel_hrs), fmtHrs(row.work_hrs), fmtHrs(row.return_hrs), row.miles, row.footage, row.poles, fmtHrs(row.computer_hrs), row.status, row.comments];

export const DFRRow = ({ row, i, count, striped, jobs, employees, onChange, onRemove, onPickJob, onMove, active, onActivate, readOnly }) => {
  const set = (k) => (v) => onChange({ ...row, [k]: v });
  const auto = row.gps?.stop ? "bg-emerald-50/60" : "";
  if (readOnly) {
    return (
      <tr className={striped ? "bg-zinc-200/70" : "bg-white"} data-testid={`dfr-ro-row-${i}`}>
        {rowValues(row).map((v, ci) => <td key={ci} className={`border border-zinc-400 px-2 py-1.5 text-xs text-center ${ci === 6 || ci === 9 ? "border-r-2 border-r-black" : ""} ${ci === 5 || ci === 15 ? "text-left" : ""}`}>{v ?? ""}</td>)}
      </tr>
    );
  }
  const cells = [
    <Txt key="date" type="date" value={row.date} onChange={set("date")} testId={`dfr-date-${i}`} className="min-w-[120px]" />,
    <select key="job" value={row.job_id || ""} onChange={(e) => onPickJob(e.target.value)} className="h-8 w-full min-w-[110px] bg-transparent text-xs border border-transparent focus:border-sky-500 focus:bg-white rounded outline-none font-semibold" data-testid={`dfr-job-${i}`}>
      <option value="">{row.job || "— pick job —"}</option>
      {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
    </select>,
    <Sel key="market" value={row.market} options={MARKETS} onChange={set("market")} testId={`dfr-market-${i}`} />,
    <Sel key="sow" value={row.sow} options={JOB_TYPES.includes(row.sow) || !row.sow ? JOB_TYPES : [row.sow, ...JOB_TYPES]} onChange={set("sow")} testId={`dfr-sow-${i}`} />,
    <Sel key="jt" value={row.job_type} options={JOB_TYPES.includes(row.job_type) || !row.job_type ? JOB_TYPES : [row.job_type, ...JOB_TYPES]} onChange={set("job_type")} testId={`dfr-jobtype-${i}`} />,
    <Txt key="addr" value={row.job_address} onChange={set("job_address")} testId={`dfr-address-${i}`} className="min-w-[180px]" />,
    <Sel key="fielder" value={row.fielder} options={employees} onChange={set("fielder")} testId={`dfr-fielder-${i}`} placeholder="Select" />,
    <Sel key="travel" value={fmtHrs(row.travel_hrs)} options={HOUR_OPTIONS} onChange={set("travel_hrs")} testId={`dfr-travel-${i}`} />,
    <Sel key="work" value={fmtHrs(row.work_hrs)} options={HOUR_OPTIONS} onChange={set("work_hrs")} testId={`dfr-work-${i}`} />,
    <Sel key="return" value={fmtHrs(row.return_hrs)} options={HOUR_OPTIONS} onChange={set("return_hrs")} testId={`dfr-return-${i}`} />,
    <Sel key="miles" value={row.miles === "" || row.miles == null ? "" : String(Math.round(Number(row.miles)))} options={MILE_OPTIONS} onChange={set("miles")} testId={`dfr-miles-${i}`} />,
    <Txt key="footage" value={row.footage} onChange={set("footage")} testId={`dfr-footage-${i}`} className="text-center min-w-[70px]" />,
    <Txt key="poles" value={row.poles} onChange={set("poles")} testId={`dfr-poles-${i}`} className="text-center min-w-[55px]" />,
    <Sel key="computer" value={fmtHrs(row.computer_hrs)} options={HOUR_OPTIONS} onChange={set("computer_hrs")} testId={`dfr-computer-${i}`} />,
    <Txt key="status" value={row.status} onChange={set("status")} testId={`dfr-status-${i}`} className="min-w-[110px]" />,
    <Txt key="comments" value={row.comments} onChange={set("comments")} testId={`dfr-comments-${i}`} className="min-w-[220px]" />,
  ];
  return (
    <tr className={`${striped ? "bg-zinc-200/70" : "bg-white"} ${auto} ${active ? "outline outline-2 outline-sky-500 -outline-offset-2" : ""}`} data-testid={`dfr-row-${i}`}>
      {!readOnly && (
        <td className="border border-zinc-400 px-1 text-center whitespace-nowrap">
          <span className="inline-flex flex-col align-middle mr-0.5">
            <button type="button" disabled={i === 0} onClick={() => onMove(row.id, -1)} title="Move up" className="h-3.5 text-zinc-400 hover:text-sky-600 disabled:opacity-20" data-testid={`dfr-move-up-${i}`}><ChevronUp className="w-3.5 h-3.5" /></button>
            <button type="button" disabled={i === count - 1} onClick={() => onMove(row.id, 1)} title="Move down" className="h-3.5 text-zinc-400 hover:text-sky-600 disabled:opacity-20" data-testid={`dfr-move-down-${i}`}><ChevronDown className="w-3.5 h-3.5" /></button>
          </span>
          <button type="button" onClick={() => onActivate(row.id)} title="Use this row for GPS tracking" className={`inline-flex items-center justify-center w-6 h-6 rounded ${active ? "bg-sky-600 text-white" : "text-zinc-400 hover:text-sky-600"}`} data-testid={`dfr-track-row-${i}`}><Radio className="w-3.5 h-3.5" /></button>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-red-600" onClick={() => onRemove(row.id)} data-testid={`dfr-remove-row-${i}`}><Trash2 className="w-3.5 h-3.5" /></Button>
        </td>
      )}
      {cells.map((c, ci) => <td key={ci} className={`border border-zinc-400 p-0 ${ci === 6 || ci === 9 ? "border-r-2 border-r-black" : ""}`}>{c}</td>)}
    </tr>
  );
};

export const DFRTable = ({ rows, jobs, employees, onChangeRow, onRemoveRow, onPickJob, onMoveRow, activeRowId, onActivate, readOnly = false }) => (
  <div className="overflow-x-auto border-2 border-dashed border-emerald-500/60 rounded" data-testid="dfr-table-wrap">
    <table className={`min-w-max border-collapse text-xs ${readOnly ? "w-full" : ""}`} data-testid="dfr-table">
      <thead>
        <tr className="bg-black text-white">
          {!readOnly && <th className="border border-zinc-700 px-1 w-20" title="Reorder · track · remove" />}
          {DFR_HEADERS.map((h, i) => (
            <th key={h} className={`border border-zinc-700 px-2 py-3 font-bold text-[12px] leading-tight text-center align-middle whitespace-pre-line max-w-[90px] ${i === 6 || i === 9 ? "border-r-2 border-r-white/70" : ""} ${i === 15 ? "min-w-[220px]" : ""} ${i === 5 ? "min-w-[180px]" : ""}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <DFRRow key={row.id} row={row} i={i} count={rows.length} striped={i % 2 === 0} jobs={jobs} employees={employees} onChange={(r) => onChangeRow(r)} onRemove={onRemoveRow} onPickJob={(jobId) => onPickJob(row.id, jobId)} onMove={onMoveRow || (() => {})} active={activeRowId === row.id} onActivate={onActivate} readOnly={readOnly} />
        ))}
        {rows.length === 0 && <tr><td colSpan={17} className="text-center text-zinc-500 py-6 bg-white">No rows yet — add a job row below.</td></tr>}
      </tbody>
    </table>
  </div>
);

export default DFRTable;
