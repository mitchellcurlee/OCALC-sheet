import { Textarea } from "@/components/ui/textarea";

const Script = ({ title, text }) => (
  <div className="border border-zinc-300 rounded overflow-hidden">
    <div className="bg-zinc-800 text-white text-xs font-bold px-3 py-1.5">{title}</div>
    <p className="px-3 py-2 text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">{text}</p>
  </div>
);

/** Customer Call Script & Response tab — mirrors the workbook sheet. */
export const CallScriptTab = ({ script, value, onChange }) => (
  <section className="bg-white border border-zinc-300 rounded overflow-hidden" data-testid="ase2-callscript-tab">
    <h2 className="bg-black text-white text-xs font-bold tracking-widest uppercase px-3 py-2">Customer Call Script &amp; Response</h2>
    <div className="p-3 grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
      <div className="space-y-3">
        <Script title={script.reach_title} text={script.reach} />
        <div className="border border-zinc-300 rounded overflow-hidden">
          <div className="bg-zinc-800 text-white text-xs font-bold px-3 py-1.5">Customer Response:</div>
          <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={5} placeholder="Type notes here from customer discussion" className="bg-white text-sm border-0 rounded-none focus-visible:ring-0" data-testid="ase2-customer_response" />
        </div>
        <Script title={script.voicemail_title} text={script.voicemail} />
      </div>
      <div className="border border-zinc-300 rounded overflow-hidden h-fit">
        <div className="bg-zinc-800 text-white text-xs font-bold px-3 py-1.5">{script.typical_title}</div>
        <p className="px-3 py-2 text-xs italic text-zinc-400">—</p>
      </div>
    </div>
  </section>
);
