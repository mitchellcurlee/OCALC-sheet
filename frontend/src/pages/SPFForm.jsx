import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileDown, Loader2, Save, FileSignature } from "lucide-react";
import { useGoBack } from "@/lib/useGoBack";
import { SignaturePad } from "@/components/SignaturePad";
import { SpfDateLine, toDisplayDate } from "@/components/spf/SpfDateLine";
import { OperatorNameSelect } from "@/components/spf/OperatorNameSelect";
import { format } from "date-fns";

const Line = ({ label, k, data, set, wide }) => (
  <div className="flex flex-wrap items-end gap-2" data-testid={`spf-line-${k}`}>
    <span className="text-sm font-semibold text-zinc-800 whitespace-nowrap">{label}</span>
    <Input value={data[k] || ""} onChange={(e) => set(k, e.target.value)} className={`h-8 bg-white border-0 border-b-2 border-zinc-500 rounded-none px-1 text-sm focus-visible:ring-0 ${wide ? "flex-1 min-w-[260px]" : "w-64"}`} data-testid={`spf-${k}`} />
  </div>
);

/** SPF Form — Right of Entry Agreement (System Permission Form) with typeable lines + signatures → PDF. */
export default function SPFForm() {
  const { jobId } = useParams();
  const goBack = useGoBack(`/jobs/${jobId}`);
  const [text, setText] = useState(null);
  const [job, setJob] = useState(null);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const timer = useRef(null);
  const dataRef = useRef(null);
  dataRef.current = data;

  useEffect(() => {
    (async () => {
      try {
        const [t, j, d, ase1, ase2] = await Promise.all([axios.get("/spf-text"), axios.get(`/jobs/${jobId}`), axios.get(`/jobs/${jobId}/spf-data`), axios.get(`/jobs/${jobId}/ase-data`).catch(() => ({ data: {} })), axios.get(`/jobs/${jobId}/ase2-data`).catch(() => ({ data: {} }))]);
        setText(t.data); setJob(j.data);
        const a1 = ase1.data?.ase_data || ase1.data || {}; const a2 = ase2.data || {};
        const v = { ...d.data };
        const fill = (k, val) => { if (!v[k] && val) v[k] = val; };
        v.date = toDisplayDate(v.date);
        fill("date", format(new Date(), "MM/dd/yyyy")); fill("operator", "AT&T"); fill("premises", j.data.location);
        fill("owner", a2.owner_contact || a1.building_owner_contact || j.data.description);
        fill("owner_name_title", a2.owner_contact || a1.building_owner_contact);
        fill("operator_name_title", (j.data.employee_info || "").split(" ").slice(0, 2).join(" "));
        setData(v);
      } catch (e) { toast.error(e.response?.data?.detail || "Could not load SPF form"); }
    })();
  }, [jobId]);

  const persist = useCallback(async () => {
    if (!dataRef.current) return;
    setSaving(true);
    try { await axios.put(`/jobs/${jobId}/spf-data`, { data: dataRef.current }); } catch { toast.error("Save failed"); } finally { setSaving(false); }
  }, [jobId]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); persist(); } }, [persist]); // flush pending autosave on leave
  const set = (k, val) => { setData((p) => ({ ...p, [k]: val })); clearTimeout(timer.current); timer.current = setTimeout(() => { timer.current = null; persist(); }, 1000); };

  const exportPdf = async () => {
    setExporting(true);
    try {
      clearTimeout(timer.current); await persist();
      const res = await axios.get(`/jobs/${jobId}/export/spf`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `SPF_Right_of_Entry_${job?.site_id || job?.name || "Job"}.pdf`; a.click();
      toast.success("SPF form PDF downloaded");
    } catch { toast.error("Export failed"); } finally { setExporting(false); }
  };

  if (!text || !data) return <div className="min-h-screen flex items-center justify-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading SPF form…</div>;

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="spf-page">
      <header className="bg-white border-b border-zinc-300 sticky top-0 z-20 px-3 py-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="text-zinc-600" data-testid="spf-back-btn"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="basis-full sm:basis-0 sm:flex-1 min-w-0 order-last sm:order-none">
          <h1 className="font-heading text-base sm:text-lg font-black uppercase tracking-tight flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600" />SPF Form — Right of Entry Agreement</h1>
          <p className="text-[11px] text-zinc-500 font-mono truncate">{job?.name}{job?.site_id ? ` • ${job.site_id}` : ""} · {saving ? "Saving…" : "Saved"}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { clearTimeout(timer.current); persist(); }} className="h-9 text-xs" data-testid="spf-save-btn"><Save className="w-4 h-4 mr-1" />Save</Button>
        <Button type="button" onClick={exportPdf} disabled={exporting} className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white" data-testid="spf-export-btn">{exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}Export PDF</Button>
      </header>
      <main className="max-w-3xl mx-auto p-4">
        <article className="bg-white border border-zinc-300 shadow-sm p-6 sm:p-10 space-y-4 text-[13px] leading-relaxed text-zinc-900" data-testid="spf-document">
          <img src="/att-logo.jpeg" alt="AT&T" className="h-8 mx-auto block" data-testid="spf-att-logo" />
          <h2 className="text-center font-bold text-base tracking-wide">{text.title}</h2>
          {text.intro.map((p, i) => <p key={i}>{p}</p>)}
          <div className="space-y-3 pt-2">
            <SpfDateLine value={data.date} onChange={(v) => set("date", v)} />
            <Line label="Parties: OPERATOR (AT&T) –" k="operator" data={data} set={set} />
            <Line label="OWNER –" k="owner" data={data} set={set} wide />
            <Line label="PREMISES (address) –" k="premises" data={data} set={set} wide />
          </div>
          <ul className="list-disc pl-6 space-y-2 pt-2">{text.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6">
            {[["owner", "OWNER"], ["operator", "OPERATOR"]].map(([k, title]) => (
              <div key={k} className="space-y-2" data-testid={`spf-sign-${k}`}>
                <div className="font-bold">{title}</div>
                <div className="flex items-start gap-2"><span className="text-sm font-semibold mt-1">By:</span><div className="flex-1"><SignaturePad value={data[`${k}_signature`] || ""} onChange={(v) => set(`${k}_signature`, v)} testId={`spf-signature-${k}`} /></div></div>
                {k === "operator"
                  ? <OperatorNameSelect value={data.operator_name_title || ""} onChange={(v) => set("operator_name_title", v)} />
                  : <Input value={data[`${k}_name_title`] || ""} onChange={(e) => set(`${k}_name_title`, e.target.value)} placeholder="Printed Name/Title" className="h-8 bg-white border-0 border-b-2 border-zinc-500 rounded-none px-1 text-sm focus-visible:ring-0" data-testid={`spf-${k}_name_title`} />}
                <div className="text-[11px] text-zinc-500 italic">Printed Name/Title</div>
              </div>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}
