import { useMemo } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, RotateCcw, FileDown } from "lucide-react";
import { toast } from "sonner";

const EF_ITEMS = [
  ["BURIED PVC", "buried_pvc", "buried_pvc_provided", "buried_pvc_length", "FT"],
  ["BURIED INNERDUCT", "buried_innerduct", "buried_innerduct_provided", "buried_innerduct_length", "FT"],
  ["EMT", "need_emt", "need_emt_provided", "emt_length", "FT"],
  ["PLENUM", "need_plenum", "need_plenum_provided", "plenum_length", "FT"],
  ["CORE DRILL", "need_core_drill", "need_core_drill_provided", "core_drill_qty", "QTY"],
  ["EYE-BOLT/WEATHERHEAD", "need_eyebolt", "need_eyebolt_provided", null, null],
  ["PULLBOX", "need_pullbox", "need_pullbox_provided", "pullbox_qty", "QTY"],
  ["HOFFMAN BOX", "need_hoffman_box", "need_hoffman_box_provided", "hoffman_box_qty", "QTY"],
  ["BACKBOARD", "need_backboard", "need_backboard_provided", "backboard_qty", "QTY"],
  ["OUTLET", "need_outlet", "need_outlet_provided", null, null],
  ["GROUNDBAR", "need_groundbar", "need_groundbar_provided", "groundbar_qty", "QTY"],
];

const yes = (v) => ["YES", "TRUE", "Y"].includes(String(v || "").trim().toUpperCase());

const labelWithQty = (f, label, qtyKey, unit) => {
  const v = qtyKey ? String(f[qtyKey] || "").trim() : "";
  if (!v) return label;
  return unit === "FT" ? `${label} (${v} FT)` : `${label} (QTY ${v})`;
};

const YES_NO_KEYS = ["existing_fiber_terminal", "existing_nte", "pipelines_vicinity", "railroads_vicinity"];

export const buildSowNotesText = (f) => {
  const g = (k, d = "") => (f[k] ? String(f[k]) : YES_NO_KEYS.includes(k) ? "NO" : d);
  const inPlace = g("site_requirements_provided") || EF_ITEMS.filter(([, , pk]) => yes(f[pk])).map(([l]) => l).join(", ");
  const needed = EF_ITEMS.filter(([, k]) => yes(f[k])).map(([l, , , qk, u]) => labelWithQty(f, l, qk, u)).join(", ");
  const lines = [
    `ASSIGNED ATT ENG: ${g("assigned_att_eng")}`,
    `SITE WALKED BY: ${g("employee_info")}`,
    `SITE WALKED WITH: ${g("site_walked_with")}`,
    `ACCESS CONTACT: ${g("access_contact")}`,
    `SPF NEEDED: ${g("spf_required")}`,
    ``,
    `SPF CONTACT: ${g("spf_contact")}`,
    ``,
    `FIBER AT SITE: ${g("existing_fiber_terminal")}`,
    `LAT/LONG OF THE EXISITNG/NEW FBT: ${g("fiber_terminal_lat_long")}`,
    `PROPOSED LOCATION: ${g("terminal_location_description") || g("fiber_terminal_placement")}`,
    `PATH OF APPROACH: ${g("path_of_approach")}`,
    `NEAREST FIBER FID: ${g("nearest_fiber_fid")}`,
    `LAT/LONG OF NEAREST FIBER: ${g("nearest_fiber_lat_long")}`,
    `POLE LINE START: ${g("soc_pole_line_start", "N/A")}`,
    `POLE LINE END: ${g("soc_pole_line_end", "N/A")}`,
    `SOC START: ${g("soc_start_lat_long", "0")}`,
    `SOC END: ${g("soc_end_lat_long", "0")}`,
    `EF REQUIREMENTS: `,
    `IN PLACE ${inPlace}`,
    `NEEDED ${needed}`,
    `EXISTING NTE/EMTS @SITE: ${g("existing_nte")}`,
    `PROPOSED EQUIPMENT LOCATION: ${g("nte_location_description")}  LAT/LONG: ${g("nte_lat_long")}`,
    `PROPOSED EQUIPMENT: CIENA 3903X OR EQUIVALENT RAD`,
    `PIPELINES IN VICINITY: ${g("pipelines_vicinity")}`,
    `RAILROADS IN VICINITY: ${g("railroads_vicinity")}`,
    `PERMITS NEEDED: ${g("possible_permits")}`,
    `OTHER INFO: ${[g("other_notes"), g("additional_sow_notes")].filter(Boolean).join(" ")}`,
  ];
  return lines.join("\n");
};

export default function ASESOWNotesTab({ formData, handleChange }) {
  const { jobId } = useParams();
  const autoText = useMemo(() => buildSowNotesText(formData), [formData]);
  const isEdited = Boolean(formData.sow_notes_override);
  const text = isEdited ? formData.sow_notes_override : autoText;
  const downloadWord = async () => {
    try {
      const res = await axios.post(`/jobs/${jobId}/export/sow-docx`, { text }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SOW_Notes.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("SOW Notes Word file downloaded");
    } catch (e) {
      toast.error("Word download failed");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("SOW Notes copied to clipboard");
    } catch (e) {
      toast.error("Copy failed — select the text manually");
    }
  };
  const resetToAuto = () => {
    handleChange("sow_notes_override", "");
    toast.success("SOW Notes reset to auto-generated");
  };
  return (
    <div className="space-y-3" data-testid="sow-notes-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
          {isEdited ? "Edited manually — your version is used in the export" : "Auto-generated from the ASE form — edit freely; your changes are kept"}
        </p>
        <div className="flex items-center gap-2">
          {isEdited && (
            <Button onClick={resetToAuto} variant="outline" size="sm" className="text-amber-700 border-amber-300" data-testid="reset-sow-notes-btn">
              <RotateCcw className="w-4 h-4 mr-2" /> Reset to auto
            </Button>
          )}
          <Button onClick={copy} variant="outline" size="sm" data-testid="copy-sow-notes-btn">
            <Copy className="w-4 h-4 mr-2" /> Copy
          </Button>
          <Button onClick={downloadWord} variant="outline" size="sm" className="text-blue-700 border-blue-300" data-testid="download-sow-word-btn">
            <FileDown className="w-4 h-4 mr-2" /> Download as Word (.docx)
          </Button>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => handleChange("sow_notes_override", e.target.value)}
        rows={30}
        className={`bg-white rounded-lg p-4 text-sm font-mono text-zinc-800 leading-6 min-h-[480px] ${isEdited ? "border-amber-400" : "border-zinc-300"}`}
        data-testid="sow-notes-text"
      />
      <p className="text-xs text-zinc-400 font-mono">Typing switches to manual mode (auto-fill pauses). "Reset to auto" regenerates from the checklist. Remember to Save.</p>
    </div>
  );
}
