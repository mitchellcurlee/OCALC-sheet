import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileDown, Loader2, Save, ClipboardCheck } from "lucide-react";
import { useGoBack } from "@/lib/useGoBack";
import { useAuth } from "@/context/AuthContext";
import { todayISO } from "@/lib/dfr";
import { parseHandoff, checklistFromHandoff } from "@/lib/handoffParse";
import { HandoffTab } from "@/components/ase2/HandoffTab";
import { CallScriptTab } from "@/components/ase2/CallScriptTab";
import { HomeButton } from "@/components/HomeButton";

const TABS = [["checklist", "Fielding Checklist"], ["handoff", "Handoff Site Details"], ["script", "Customer Call Script & Response"]];

const Field = ({ f, value, onChange }) => {
  const cls = "w-full h-9 px-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900";
  if (f.options) {
    return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={cls} data-testid={`ase2-${f.key}`}>
        <option value="">—</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (f.type === "textarea") return <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4} className="bg-white text-sm" data-testid={`ase2-${f.key}`} />;
  return <Input type={f.type === "date" ? "date" : "text"} value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-9 bg-white text-sm" data-testid={`ase2-${f.key}`} />;
};

const Section = ({ title, children }) => (
  <section className="bg-white border border-zinc-300 rounded overflow-hidden">
    <h2 className="bg-black text-white text-xs font-bold tracking-widest uppercase px-3 py-2">{title}</h2>
    <div className="divide-y divide-zinc-200">{children}</div>
  </section>
);

const Row = ({ label, note, children }) => (
  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-3 py-2 items-start">
    <div><div className="text-sm font-semibold text-zinc-800">{label}</div>{note && <div className="text-[11px] text-zinc-500 italic">{note}</div>}</div>
    <div>{children}</div>
  </div>
);

/** ASE Form 2 — mirrors the "ASE Site Visit - Blank Template" workbook (Fielding Checklist + Handoff Site Details). */
export default function ASEForm2() {
  const { jobId } = useParams();
  const goBack = useGoBack(`/jobs/${jobId}`);
  const { user } = useAuth();
  const [schema, setSchema] = useState(null);
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
        const [sc, j, d, ase1] = await Promise.all([axios.get("/ase2-schema"), axios.get(`/jobs/${jobId}`), axios.get(`/jobs/${jobId}/ase2-data`), axios.get(`/jobs/${jobId}/ase-data`).catch(() => ({ data: {} }))]);
        setSchema(sc.data); setJob(j.data);
        const a1 = ase1.data?.ase_data || ase1.data || {};
        const v = { ...d.data };
        // Auto-populate (same rules as ASE Form 1: only fill empty fields, never overwrite edits). Handoff paste wins over job info.
        const fill = (k, val) => { if (!v[k] && val) v[k] = val; };
        Object.entries(checklistFromHandoff(v)).forEach(([k, val]) => fill(k, val));
        fill("business_name", j.data.description); fill("business_name_2", j.data.description);
        fill("site_address", j.data.location); fill("site_address_2", j.data.location);
        fill("handoff_site_id", j.data.site_id); fill("handoff_address", j.data.location); fill("handoff_customer", j.data.description); fill("handoff_end_customer", j.data.description);
        fill("fielder", j.data.employee_info || user?.full_name || user?.name || user?.email);
        fill("visit_date", a1.date_of_site_visit || todayISO());
        fill("owner_contact", a1.building_owner_contact); fill("lcon_email", a1.building_contact_email);
        fill("contact_met", a1.building_contact || a1.access_contact); fill("handoff_lcon", a1.building_owner_contact);
        fill("lcon_name", (a1.building_owner_contact || "").split(/[,\d(]/)[0].trim());
        const phone = String(a1.building_owner_contact || "").match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        if (phone) fill("lcon_phone", phone[0]);
        setData(v);
      } catch (e) { toast.error(e.response?.data?.detail || "Could not load ASE Form 2"); }
    })();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async () => {
    if (!dataRef.current) return;
    setSaving(true);
    try { await axios.put(`/jobs/${jobId}/ase2-data`, { data: dataRef.current }); }
    catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  }, [jobId]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); persist(); } }, [persist]); // flush pending autosave on leave
  const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { timer.current = null; persist(); }, 1000); };
  const set = (k, val) => { setData((p) => ({ ...p, [k]: val })); schedule(); };
  // Paste of the award-info block: re-derive every handoff_* field, then fill checklist fields that are empty or still hold the job-derived auto-fill
  const onHandoffPaste = (raw) => {
    setData((p) => {
      const next = Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith("handoff_")));
      Object.assign(next, parseHandoff(raw, schema.handoff), { handoff_raw: raw });
      const auto = new Set([job?.description, job?.location].filter(Boolean));
      Object.entries(checklistFromHandoff(next)).forEach(([k, v]) => { if (!next[k] || auto.has(next[k])) next[k] = v; });
      return next;
    });
    schedule();
  };
  const applyHandoff = () => { setData((p) => ({ ...p, ...checklistFromHandoff(p) })); schedule(); toast.success("Fielding Checklist updated from Handoff Site Details"); };

  const exportXlsm = async () => {
    setExporting(true);
    try {
      clearTimeout(timer.current); await persist();
      const res = await axios.get(`/jobs/${jobId}/export/ase2`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `ASE_Site_Visit_${job?.site_id || job?.name || "Job"}.xlsm`; a.click();
      toast.success("ASE Form 2 downloaded (Excel template filled in)");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  if (!schema || !data) return <div className="min-h-screen flex items-center justify-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading ASE Form 2…</div>;
  const yn = (k) => (
    <div className="flex gap-3 text-sm">
      {["YES", "NO"].map((o) => <label key={o} className="inline-flex items-center gap-1 cursor-pointer"><input type="radio" name={k} checked={(data[k] || "") === o} onChange={() => set(k, o)} data-testid={`ase2-${k}-${o.toLowerCase()}`} />{o}</label>)}
      {data[k] && <button type="button" className="text-[11px] underline text-zinc-400" onClick={() => set(k, "")}>clear</button>}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="ase2-page">
      <header className="bg-white border-b border-zinc-300 sticky top-0 z-20 px-3 py-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="text-zinc-600" data-testid="ase2-back-btn"><ArrowLeft className="w-5 h-5" /></Button>
        <HomeButton />
        <div className="basis-full sm:basis-0 sm:flex-1 min-w-0 order-last sm:order-none">
          <h1 className="font-heading text-base sm:text-lg font-black uppercase tracking-tight flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-blue-600" />ASE Form 2 — Site Visit</h1>
          <p className="text-[11px] text-zinc-500 font-mono truncate">{job?.name}{job?.site_id ? ` • ${job.site_id}` : ""} · {saving ? "Saving…" : "Saved"}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { clearTimeout(timer.current); persist(); }} className="h-9 text-xs" data-testid="ase2-save-btn"><Save className="w-4 h-4 mr-1" />Save</Button>
        <Button type="button" onClick={exportXlsm} disabled={exporting} className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white" data-testid="ase2-export-btn">{exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}Export Excel (.xlsm)</Button>
      </header>
      <main className="max-w-5xl mx-auto p-3">
        <Tabs defaultValue="checklist" data-testid="ase2-tabs">
          <TabsList className="w-full justify-start overflow-x-auto bg-zinc-200 rounded-b-none h-auto p-1 gap-1">
            {TABS.map(([v, l]) => <TabsTrigger key={v} value={v} className="text-xs sm:text-sm px-3 py-1.5 whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:font-bold" data-testid={`ase2-tab-${v}`}>{l}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="checklist" className="mt-0 space-y-4 bg-zinc-200/60 p-2 sm:p-3 rounded-b" data-testid="ase2-tabpanel-checklist">
            {schema.sections.map((sec) => (
              <Section key={sec.title} title={sec.title}>
                {sec.fields.map((f) => <Row key={f.key} label={f.label} note={f.note}><Field f={f} value={data[f.key]} onChange={(v) => set(f.key, v)} /></Row>)}
                {sec.title === "ADDITIONAL NOTES" && schema.req_groups.map((g) => (
                  <div key={g.key} className="px-3 py-2 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                    <div><div className="text-sm font-semibold text-zinc-800">{g.label}</div><div className="text-[11px] text-zinc-500 italic">{g.note}</div></div>
                    <div className="space-y-1.5">{schema.req_items.map((it) => <div key={it.key} className="flex items-center justify-between gap-3 text-sm"><span>{it.label} -</span>{yn(`${g.key}_${it.key}`)}</div>)}</div>
                  </div>
                ))}
              </Section>
            ))}
          </TabsContent>
          <TabsContent value="handoff" className="mt-0 bg-zinc-200/60 p-2 sm:p-3 rounded-b" data-testid="ase2-tabpanel-handoff">
            <HandoffTab schema={schema} data={data} onPaste={onHandoffPaste} onApply={applyHandoff} />
          </TabsContent>
          <TabsContent value="script" className="mt-0 bg-zinc-200/60 p-2 sm:p-3 rounded-b" data-testid="ase2-tabpanel-script">
            <CallScriptTab script={schema.call_script} value={data.customer_response} onChange={(v) => set("customer_response", v)} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
