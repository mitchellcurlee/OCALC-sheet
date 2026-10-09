import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useGoBack } from "@/lib/useGoBack";
import { HomeButton } from "@/components/HomeButton";
import { ArrowLeft, DollarSign, Loader2, RotateCcw, Save, ShieldAlert } from "lucide-react";

const FIELDS = [
  { key: "job_fee", label: "Per job", hint: "Flat fee paid once per job row (toggle per row in the Cost Report)", prefix: "$", step: "0.01" },
  { key: "per_pole", label: "Per pole", hint: "Multiplied by the # Poles on the job", prefix: "$", step: "0.01" },
  { key: "per_mile", label: "Per mile", hint: "Multiplied by Total miles driven", prefix: "$", step: "0.01" },
  { key: "per_foot", label: "Per foot of footage", hint: "Only footage above the free footage below is paid", prefix: "$", step: "0.01" },
  { key: "free_feet", label: "Free footage (ft)", hint: "Footage up to this amount is not paid — e.g. 1,500 ft at 1,000 free pays 500 ft", prefix: "", step: "1" },
];

const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function AdminCostRates() {
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const { isAdmin, loading: authLoading } = useAuth();
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    axios.get("/settings/cost-rates").then((r) => {
      setDefaults(r.data.defaults);
      const loaded = Object.fromEntries(Object.entries(r.data.rates).map(([k, v]) => [k, String(v)]));
      setForm((p) => p ?? loaded); // never clobber values the admin already started typing
    }).catch(() => toast.error("Could not load rates"));
  }, [authLoading, isAdmin]);

  const save = async () => {
    const body = {};
    for (const f of FIELDS) {
      const v = parseFloat(form[f.key]);
      if (!Number.isFinite(v) || v < 0) return toast.error(`${f.label}: enter a number of 0 or more`);
      body[f.key] = v;
    }
    setSaving(true);
    try {
      const r = await axios.put("/settings/cost-rates", body);
      setForm(Object.fromEntries(Object.entries(r.data.rates).map(([k, v]) => [k, String(v)])));
      toast.success("Rates saved — new cost reports use them immediately");
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (!authLoading && !isAdmin) {
    return <div className="min-h-screen bg-industrial-bg flex items-center justify-center p-6"><div className="industrial-card p-6 text-center" data-testid="cost-rates-denied"><ShieldAlert className="w-10 h-10 mx-auto text-red-600" /><p className="mt-3 text-sm text-zinc-700">Admin access required.</p><Button className="mt-4 bg-red-600 hover:bg-red-700 text-white" onClick={() => navigate("/")}>Back to jobs</Button></div></div>;
  }

  const example = form && (() => {
    const r = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, parseFloat(v) || 0]));
    const excess = Math.max(0, 1500 - r.free_feet);
    return { fee: r.job_fee, poles: 4 * r.per_pole, miles: 20 * r.per_mile, feet: excess * r.per_foot, excess };
  })();

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="cost-rates-page">
      <header className="bg-zinc-900 text-white px-4 py-3 flex items-center gap-3">
        <Button size="icon" variant="ghost" className="text-zinc-300 hover:text-white hover:bg-zinc-800" onClick={goBack} data-testid="cost-rates-back"><ArrowLeft className="w-5 h-5" /></Button>
        <HomeButton className="text-zinc-300 hover:text-white hover:bg-zinc-800" />
        <div>
          <h1 className="font-heading text-lg font-bold uppercase tracking-tight flex items-center gap-2"><DollarSign className="w-5 h-5" />Cost Report Rates</h1>
          <p className="text-[11px] font-mono text-zinc-400">Pay rules used by Daily Reports → Generate Cost Report</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {!form && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>}
        {form && (
          <>
            <div className="industrial-card p-4 space-y-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-2 sm:items-center">
                  <label htmlFor={`rate-${f.key}`} className="text-sm font-medium text-zinc-800">{f.label}</label>
                  <div>
                    <div className="relative">
                      {f.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">{f.prefix}</span>}
                      <Input id={`rate-${f.key}`} type="number" min="0" step={f.step} inputMode="decimal" value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} className={`bg-white h-10 ${f.prefix ? "pl-7" : ""}`} data-testid={`rate-${f.key}`} />
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">{f.hint}{defaults && <span className="font-mono"> · default {f.prefix}{defaults[f.key]}</span>}</p>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-200">
                <Button onClick={save} disabled={saving} className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="rates-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />Save rates</>}</Button>
                <Button variant="outline" className="h-10 bg-white border-zinc-300" onClick={() => defaults && setForm(Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, String(v)])))} data-testid="rates-reset-btn"><RotateCcw className="w-4 h-4 mr-1" />Reset to defaults</Button>
              </div>
            </div>
            <div className="industrial-card p-4 text-sm text-zinc-700" data-testid="rates-example">
              <p className="font-medium text-zinc-900 mb-1">Example — one job with 4 poles, 20 miles and 1,500 ft:</p>
              <p className="font-mono text-xs leading-6">
                job fee {usd(example.fee)} + poles {usd(example.poles)} + mileage {usd(example.miles)} + footage ({example.excess.toLocaleString()} ft over) {usd(example.feet)} = <span className="font-bold text-emerald-700" data-testid="rates-example-total">{usd(example.fee + example.poles + example.miles + example.feet)}</span>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
