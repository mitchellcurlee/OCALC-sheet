import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FileSpreadsheet, ChevronDown, ClipboardList, FileText, FileDown, Globe, FileUp, Share2, FileSignature } from "lucide-react";

/** Shared Export dropdown (Job Detail + interactive map). onAction(key) handles job_excel | sow_docx | permission_stamp | kmz | import_kml | share. */
export const JobExportMenu = ({ jobId, onAction, className = "", align = "end" }) => {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={`bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-800 text-sm ${className}`} data-testid="export-dropdown-btn">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export
          <ChevronDown className="w-4 h-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="bg-white border-zinc-200 w-52 z-[1400]">
        <DropdownMenuItem onClick={() => onAction("job_excel")} data-testid="export-btn" className="cursor-pointer">
          <FileSpreadsheet className="w-4 h-4 mr-2 text-zinc-600" />OCALC/JOB Export
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/field-report`)} data-testid="daily-field-report-btn" className="cursor-pointer font-semibold text-orange-700">
          <ClipboardList className="w-4 h-4 mr-2" />Daily Field Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/ase`)} data-testid="ase-form-btn" className="cursor-pointer">
          <FileText className="w-4 h-4 mr-2 text-blue-600" />ASE Form
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/ase2`)} data-testid="ase-form2-btn" className="cursor-pointer">
          <FileText className="w-4 h-4 mr-2 text-indigo-600" />ASE Form 2
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/spf`)} data-testid="spf-form-btn" className="cursor-pointer">
          <FileSignature className="w-4 h-4 mr-2 text-blue-700" />SPF Form (Right of Entry)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("sow_docx")} data-testid="sow-word-export-btn" className="cursor-pointer">
          <FileDown className="w-4 h-4 mr-2 text-blue-600" />SOW Notes (Word)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("permission_stamp")} data-testid="permission-stamp-export-btn" className="cursor-pointer">
          <FileDown className="w-4 h-4 mr-2 text-green-600" />Permission Stamp (Word)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("kmz")} data-testid="export-kmz-btn" className="cursor-pointer">
          <Globe className="w-4 h-4 mr-2 text-emerald-700" />Export KMZ (Google Earth)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("import_kml")} data-testid="import-kml-btn" className="cursor-pointer">
          <FileUp className="w-4 h-4 mr-2 text-emerald-700" />Import KML / KMZ
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("share")} data-testid="share-job-menu-btn" className="cursor-pointer border-t border-zinc-200 mt-1 pt-2">
          <Share2 className="w-4 h-4 mr-2 text-emerald-600" />Share This Job / Team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default JobExportMenu;
