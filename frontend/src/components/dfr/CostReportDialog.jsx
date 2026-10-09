import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DollarSign, Loader2, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
const shiftDays = (iso, days) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const jobKey = (r) => (r.job_id || `${r.job}|${r.job_address}`).toLowerCase();

export const CostReportDialog = ({ open, onOpenChange, currentDate }) => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(null);
  const [rates, setRates] = useState(null);
  const [sel, setSel] = useState({});       // key -> { include, job_fee }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = currentDate || new Date().toISOString().slice(0, 10);
    setTo(base);
    setFrom(shiftDays(base, -6));
    setRows(null);
    setResult(null);
  }, [open, currentDate]);

  const loadRows = async () => {
    if (!from || !to) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await axios.get("/field-reports/cost-report/rows", { params: { date_from: from, date_to: to } });
      setRows(data.rows || []);
      setRates(data.rates || null);
      // every row included; the $75 job fee defaults ON for the first time a job appears, OFF for repeats of that job
      const seen = new Set();
      const next = {};
      (data.rows || []).forEach((r) => {
        const k = jobKey(r);
        next[r.key] = { include: true, job_fee: !seen.has(k) };
        seen.add(k);
      });
      setSel(next);
    } catch { toast.error("Could not load job rows"); }
    finally { setLoading(false); }
  };

  const chosen = useMemo(() => (rows || []).filter((r) => sel[r.key]?.include), [rows, sel]);
  const dupKeys = useMemo(() => {
    const c = {};
    (rows || []).forEach((r) => { c[jobKey(r)] = (c[jobKey(r)] || 0) + 1; });
    return new Set(Object.keys(c).filter((k) => c[k] > 1));
  }, [rows]);

  const payload = () => ({ date_from: from, date_to: to, lines: chosen.map((r) => ({ ...r, job_fee: !!sel[r.key]?.job_fee })) });

  const generate = async () => {
    if (!chosen.length) return toast.error("Select at least one job");
    setBusy(true);
    try { setResult((await axios.post("/field-reports/cost-report", payload())).data); }
    catch { toast.error("Could not generate the cost report"); }
    finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await axios.post("/field-reports/cost-report", payload(), { params: { format: "xlsx" }, responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = `Cost_Report_${from}_to_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { toast.error("Download failed"); }
    finally { setBusy(false); }
  };

  const setAll = (include) => setSel((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, include }])));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="cost-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-600" />Cost Report</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {rates ? `$${rates.job_fee} per job (toggle per row) · $${rates.per_pole.toFixed(2)} per pole · $${rates.per_mile} per mile · $${rates.per_foot} per ft over ${rates.free_feet.toLocaleString()} ft`
              : "Pick a date range, choose the jobs to include, then generate the pay breakdown."}
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-zinc-600">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 mt-1" data-testid="cost-from" /></label>
              <label className="text-xs text-zinc-600">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 mt-1" data-testid="cost-to" /></label>
              <Button onClick={loadRows} disabled={loading || !from || !to} className="h-9 text-xs" data-testid="cost-load-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load jobs"}
              </Button>
              {rows && rows.length > 0 && (
                <div className="ml-auto flex gap-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAll(true)} data-testid="cost-select-all">All</Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAll(false)} data-testid="cost-select-none">None</Button>
                </div>
              )}
            </div>

            {rows && rows.length === 0 && <p className="text-sm text-zinc-500" data-testid="cost-empty">No job rows on your reports between those dates.</p>}

            {rows && rows.length > 0 && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs" data-testid="cost-pick-table">
                  <thead className="bg-zinc-100 text-zinc-600">
                    <tr>
                      <th className="p-2 text-left w-10">Incl.</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Job</th>
                      <th className="p-2 text-left">Address</th>
                      <th className="p-2 text-right">Poles</th>
                      <th className="p-2 text-right">Miles</th>
                      <th className="p-2 text-right">Footage</th>
                      <th className="p-2 text-center">$75 Job fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const s = sel[r.key] || {};
                      const dup = dupKeys.has(jobKey(r));
                      return (
                        <tr key={r.key} className={`border-t ${s.include ? "" : "opacity-50"}`} data-testid={`cost-row-${i}`}>
                          <td className="p-2"><Checkbox checked={!!s.include} onCheckedChange={(v) => setSel((p) => ({ ...p, [r.key]: { ...p[r.key], include: !!v } }))} data-testid={`cost-include-${i}`} /></td>
                          <td className="p-2 whitespace-nowrap">{r.date}</td>
                          <td className="p-2 font-medium">{r.job || "—"}{dup && <span className="ml-1 text-[10px] text-amber-600 font-normal" data-testid={`cost-dup-${i}`}>repeat</span>}</td>
                          <td className="p-2 text-zinc-600 max-w-[260px] truncate" title={r.job_address}>{r.job_address}</td>
                          <td className="p-2 text-right">{num(r.poles)}</td>
                          <td className="p-2 text-right">{num(r.miles)}</td>
                          <td className="p-2 text-right">{num(r.footage)}</td>
                          <td className="p-2 text-center"><Switch checked={!!s.job_fee} disabled={!s.include} onCheckedChange={(v) => setSel((p) => ({ ...p, [r.key]: { ...p[r.key], job_fee: !!v } }))} data-testid={`cost-jobfee-${i}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rows && rows.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500" data-testid="cost-selected-count">{chosen.length} of {rows.length} jobs selected</span>
                <Button onClick={generate} disabled={busy || !chosen.length} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="cost-generate-btn">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><DollarSign className="w-4 h-4 mr-1" />Generate Cost Report</>}
                </Button>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-3" data-testid="cost-result">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setResult(null)} data-testid="cost-back-btn"><ArrowLeft className="w-4 h-4 mr-1" />Back to selection</Button>
              <span className="text-xs text-zinc-500">{from} to {to} · {result.lines.length} job{result.lines.length === 1 ? "" : "s"}</span>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs" data-testid="cost-result-table">
                <thead className="bg-zinc-900 text-white">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Job</th>
                    <th className="p-2 text-right">Job fee</th>
                    <th className="p-2 text-right">Poles</th>
                    <th className="p-2 text-right">Pole pay</th>
                    <th className="p-2 text-right">Miles</th>
                    <th className="p-2 text-right">Mileage pay</th>
                    <th className="p-2 text-right">Footage</th>
                    <th className="p-2 text-right">Ft over 1000</th>
                    <th className="p-2 text-right">Footage pay</th>
                    <th className="p-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l, i) => (
                    <tr key={`${l.key}-${i}`} className="border-t" data-testid={`cost-line-${i}`}>
                      <td className="p-2 whitespace-nowrap">{l.date}</td>
                      <td className="p-2"><div className="font-medium">{l.job || "—"}</div><div className="text-[10px] text-zinc-500 truncate max-w-[220px]">{l.job_address}</div></td>
                      <td className="p-2 text-right">{l.job_fee_amount ? usd(l.job_fee_amount) : <span className="text-zinc-400">—</span>}</td>
                      <td className="p-2 text-right">{num(l.poles)}</td>
                      <td className="p-2 text-right">{usd(l.pole_pay)}</td>
                      <td className="p-2 text-right">{num(l.miles)}</td>
                      <td className="p-2 text-right">{usd(l.mile_pay)}</td>
                      <td className="p-2 text-right">{num(l.footage)}</td>
                      <td className="p-2 text-right">{num(l.excess_feet)}</td>
                      <td className="p-2 text-right">{usd(l.foot_pay)}</td>
                      <td className="p-2 text-right font-semibold" data-testid={`cost-line-total-${i}`}>{usd(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-emerald-50 font-semibold">
                  <tr className="border-t-2 border-emerald-600">
                    <td className="p-2" colSpan={2}>TOTAL</td>
                    <td className="p-2 text-right">{usd(result.subtotals.job_fee_amount)}</td>
                    <td className="p-2" />
                    <td className="p-2 text-right">{usd(result.subtotals.pole_pay)}</td>
                    <td className="p-2" />
                    <td className="p-2 text-right">{usd(result.subtotals.mile_pay)}</td>
                    <td className="p-2" colSpan={2} />
                    <td className="p-2 text-right">{usd(result.subtotals.foot_pay)}</td>
                    <td className="p-2 text-right text-emerald-700 text-sm" data-testid="cost-grand-total">{usd(result.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end">
              <Button onClick={download} disabled={busy} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="cost-download-btn">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileSpreadsheet className="w-4 h-4 mr-1" />Download Excel</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
