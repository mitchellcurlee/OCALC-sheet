import { useMemo } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, RotateCcw, FileDown } from "lucide-react";
import { toast } from "sonner";

import { buildSiteRequirementsText } from "./efRequirements";

const YES_NO_KEYS = ["existing_fiber_terminal", "existing_nte", "pipelines_vicinity", "railroads_vicinity"];

export const buildSowNotesText = (f) => {
  const g = (k, d = "") => (f[k] ? String(f[k]) : YES_NO_KEYS.includes(k) ? "NO" : d);
  const efReq = g("site_requirements_provided") || buildSiteRequirementsText(f);
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
    `EF REQUIREMENTS: ${efReq}`,
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
