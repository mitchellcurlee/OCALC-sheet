import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, FileSpreadsheet, Loader2 } from "lucide-react";

const BLANK = "__BLANK__";

// Section component for consistent styling
const Section = ({ title, children }) => (
  <div className="industrial-card p-4 sm:p-5">
    <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
      <div className="w-1 h-5 bg-blue-600"></div>
      {title}
    </h2>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

// Field row component
const FieldRow = ({ label, children, wide = false }) => (
  <div className={`space-y-1 ${wide ? 'col-span-2' : ''}`}>
    <Label className="text-xs font-mono text-zinc-500 uppercase">{label}</Label>
    {children}
  </div>
);

const ASEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // ASE Form Data
  const [formData, setFormData] = useState({
    // Employee Info
    date_of_site_visit: "",
    att_engineer: "",
    site_walked_by: "",
    site_walked_with: "",
    
    // Address Info
    address: "",
    mpoe_address: "",
    suite_bldg: "",
    
    // Access/Customer Information
    access_contact: "",
    building_owner_contact: "",
    spf_required: "",
    spf_contact: "",
    access_notes: "",
    
    // Building Characteristics
    occupancy_type: "",
    number_of_floors: "",
    number_of_business_units: "",
    how_many_dmarcs: "",
    additional_dmarcs_location: "",
    owner_or_tenant: "",
    multi_tenant: "",
    ceiling_height: "",
    
    // Fiber Attributes
    existing_inc: "",
    inc_required: "",
    existing_fiber_terminal: "",
    fiber_terminal_placement: "",
    fiber_terminal_lat_long: "",
    fiber_terminal_fid: "",
    fiber_active_ports: "",
    fiber_reading: "",
    terminal_location_description: "",
    terminal_floor: "",
    terminal_mounting_wall: "",
    terminal_rack_bay_shelf: "",
    nearest_fiber_lat_long: "",
    nearest_fiber_fid: "",
    
    // NTE Equipment Attributes
    existing_nte: "",
    nte_placement: "",
    nte_active_ports: "",
    nte_clli: "",
    nte_at_terminal: "",
    nte_location_description: "",
    nte_lat_long: "",
    nte_floor: "",
    nte_mounting_wall: "",
    nte_rack_bay_shelf: "",
    equipment_power_config: "",
    distance_fbt_to_nte: "",
    distance_nte_to_it: "",
    it_same_floor_as_nte: "",
    
    // Path of Approach
    path_of_approach: "",
    starting_tie_in_measurements: "",
    soc_pole_line_start: "",
    soc_pole_line_end: "",
    soc_start_lat_long: "",
    soc_end_lat_long: "",
    
    // EF Offer/Requirements
    ef_offer: "",
    ef_needed: "",
    ef_qualified: "",
    ef_disqualification_reason: "",
    placing_conduit_length: "",
    
    // EF Requirements Detail
    buried_pvc: "",
    buried_pvc_length: "",
    buried_innerduct: "",
    buried_innerduct_length: "",
    need_emt: "",
    emt_length: "",
    need_plenum: "",
    plenum_length: "",
    need_core_drill: "",
    core_drill_qty: "",
    need_eyebolt: "",
    need_pullbox: "",
    pullbox_qty: "",
    need_hoffman_box: "",
    need_backboard: "",
    backboard_qty: "",
    need_outlet: "",
    need_groundbar: "",
    groundbar_qty: "",
    
    // Site Requirements
    site_readiness_evaluation: "",
    site_requirements_provided: "",
    grounding_system: "",
    building_power_source: "",
    
    // Additional Info
    pipelines_vicinity: "",
    pipelines_path: "",
    railroads_vicinity: "",
    railroads_path: "",
    possible_permits: "",
    row_measurements: "",
    other_notes: "",
    additional_sow_notes: "",
  });

  const fetchJobAndASE = useCallback(async () => {
    try {
      const [jobRes, aseRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/ase-data`)
      ]);
      setJob(jobRes.data);
      if (aseRes.data.ase_data) {
        setFormData(prev => ({ ...prev, ...aseRes.data.ase_data }));
      }
    } catch (error) {
      toast.error("Failed to load job");
      navigate("/jobs");
    } finally {
      setLoading(false);
    }
  }, [jobId, navigate]);

  useEffect(() => {
    fetchJobAndASE();
  }, [fetchJobAndASE]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value === BLANK ? "" : value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/jobs/${jobId}/ase-data`, formData);
      toast.success("ASE data saved successfully!");
    } catch (error) {
      toast.error("Failed to save ASE data");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Save first, then export
      await axios.put(`/jobs/${jobId}/ase-data`, formData);
      
      const response = await axios.get(`/jobs/${jobId}/export/ase`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${job?.name || "Job"}_ASE_Export.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("ASE Export downloaded!");
    } catch (error) {
      toast.error("Failed to export ASE data");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  const YesNoSelect = ({ value, onChange, testId }) => (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid={testId}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent className="bg-zinc-50 border-zinc-300">
        <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
        <SelectItem value="Yes">Yes</SelectItem>
        <SelectItem value="No">No</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="ase-form">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link to={`/jobs/${jobId}`}>
                <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-heading text-lg sm:text-xl font-bold text-zinc-900">
                  ASE Site Walk Survey
                </h1>
                <p className="text-xs text-zinc-500 font-mono">
                  {job?.name} • {job?.job_type || "OCALC"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                variant="outline"
                className="h-10 bg-zinc-100 border-zinc-300 hover:bg-zinc-200"
                data-testid="save-ase-btn"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
              <Button
                onClick={handleExport}
                disabled={exporting}
                className="h-10 bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="export-ase-btn"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                ASE Export
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Employee Info */}
        <Section title="EMPLOYEE INFO">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Date of Site Visit">
              <Input type="date" value={formData.date_of_site_visit} onChange={(e) => handleChange("date_of_site_visit", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="AT&T Engineer">
              <Input value={formData.att_engineer} onChange={(e) => handleChange("att_engineer", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Site Walked By">
              <Input value={formData.site_walked_by} onChange={(e) => handleChange("site_walked_by", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Site Walked With">
              <Input value={formData.site_walked_with} onChange={(e) => handleChange("site_walked_with", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* Address Information */}
        <Section title="ADDRESS INFORMATION">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Address" wide>
              <Input value={formData.address} onChange={(e) => handleChange("address", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="MPOE Address">
              <Input value={formData.mpoe_address} onChange={(e) => handleChange("mpoe_address", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Suite &/or Bldg #">
              <Input value={formData.suite_bldg} onChange={(e) => handleChange("suite_bldg", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* Access/Customer Information */}
        <Section title="ACCESS/CUSTOMER INFORMATION">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Access Contact Name & Phone/Email" wide>
              <Input value={formData.access_contact} onChange={(e) => handleChange("access_contact", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Building Owner Name & Phone/Email" wide>
              <Input value={formData.building_owner_contact} onChange={(e) => handleChange("building_owner_contact", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="SPF Required?">
              <YesNoSelect value={formData.spf_required} onChange={(v) => handleChange("spf_required", v)} />
            </FieldRow>
            <FieldRow label="SPF Contact Name & Phone/Email">
              <Input value={formData.spf_contact} onChange={(e) => handleChange("spf_contact", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Access Notes/Special Instructions" wide>
              <Textarea value={formData.access_notes} onChange={(e) => handleChange("access_notes", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
          </div>
        </Section>

        {/* Building Characteristics */}
        <Section title="BUILDING CHARACTERISTICS">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Occupancy Type">
              <Input value={formData.occupancy_type} onChange={(e) => handleChange("occupancy_type", e.target.value)} className="h-10 bg-white border-zinc-300" placeholder="Commercial/Residential/Mixed" />
            </FieldRow>
            <FieldRow label="Number of Floors">
              <Input value={formData.number_of_floors} onChange={(e) => handleChange("number_of_floors", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Number of Business Units">
              <Input value={formData.number_of_business_units} onChange={(e) => handleChange("number_of_business_units", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="How many DMARCs?">
              <Input value={formData.how_many_dmarcs} onChange={(e) => handleChange("how_many_dmarcs", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="If additional DMARCs, where are they?" wide>
              <Input value={formData.additional_dmarcs_location} onChange={(e) => handleChange("additional_dmarcs_location", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Is Customer Building Owner or Tenant?">
              <Select value={formData.owner_or_tenant || ""} onValueChange={(v) => handleChange("owner_or_tenant", v)}>
                <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300">
                  <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                  <SelectItem value="Owner">Owner</SelectItem>
                  <SelectItem value="Tenant">Tenant</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Multi-Tenant">
              <YesNoSelect value={formData.multi_tenant} onChange={(v) => handleChange("multi_tenant", v)} />
            </FieldRow>
            <FieldRow label="Ceiling Height">
              <Input value={formData.ceiling_height} onChange={(e) => handleChange("ceiling_height", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* Fiber Attributes */}
        <Section title="FIBER ATTRIBUTES">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Existing INC">
              <YesNoSelect value={formData.existing_inc} onChange={(v) => handleChange("existing_inc", v)} />
            </FieldRow>
            <FieldRow label="INC Required">
              <YesNoSelect value={formData.inc_required} onChange={(v) => handleChange("inc_required", v)} />
            </FieldRow>
            <FieldRow label="Existing Fiber Terminal">
              <YesNoSelect value={formData.existing_fiber_terminal} onChange={(v) => handleChange("existing_fiber_terminal", v)} />
            </FieldRow>
            <FieldRow label="Fiber Terminal Placement">
              <Input value={formData.fiber_terminal_placement} onChange={(e) => handleChange("fiber_terminal_placement", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Fiber Terminal LAT/LONG">
              <Input value={formData.fiber_terminal_lat_long} onChange={(e) => handleChange("fiber_terminal_lat_long", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Fiber Terminal FID">
              <Input value={formData.fiber_terminal_fid} onChange={(e) => handleChange("fiber_terminal_fid", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Active Ports">
              <Input value={formData.fiber_active_ports} onChange={(e) => handleChange("fiber_active_ports", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Fiber Reading">
              <Input value={formData.fiber_reading} onChange={(e) => handleChange("fiber_reading", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Describe Existing/Proposed Terminal Location" wide>
              <Textarea value={formData.terminal_location_description} onChange={(e) => handleChange("terminal_location_description", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="Terminal Floor #">
              <Input value={formData.terminal_floor} onChange={(e) => handleChange("terminal_floor", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Terminal Mounting Wall">
              <Input value={formData.terminal_mounting_wall} onChange={(e) => handleChange("terminal_mounting_wall", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Terminal Rack Bay/Shelf">
              <Input value={formData.terminal_rack_bay_shelf} onChange={(e) => handleChange("terminal_rack_bay_shelf", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Nearest Fiber Lat/Long">
              <Input value={formData.nearest_fiber_lat_long} onChange={(e) => handleChange("nearest_fiber_lat_long", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Nearest Fiber FID">
              <Input value={formData.nearest_fiber_fid} onChange={(e) => handleChange("nearest_fiber_fid", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* NTE Equipment Attributes */}
        <Section title="NTE - EQUIPMENT ATTRIBUTES">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Existing NTE">
              <YesNoSelect value={formData.existing_nte} onChange={(v) => handleChange("existing_nte", v)} />
            </FieldRow>
            <FieldRow label="NTE Placement">
              <Input value={formData.nte_placement} onChange={(e) => handleChange("nte_placement", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="NTE Active Ports">
              <Input value={formData.nte_active_ports} onChange={(e) => handleChange("nte_active_ports", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="NTE CLLI">
              <Input value={formData.nte_clli} onChange={(e) => handleChange("nte_clli", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="NTE at Terminal or Another Location?">
              <Input value={formData.nte_at_terminal} onChange={(e) => handleChange("nte_at_terminal", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Describe Existing/Proposed NTE Location" wide>
              <Textarea value={formData.nte_location_description} onChange={(e) => handleChange("nte_location_description", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="NTE LAT/LONG">
              <Input value={formData.nte_lat_long} onChange={(e) => handleChange("nte_lat_long", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="NTE Floor #">
              <Input value={formData.nte_floor} onChange={(e) => handleChange("nte_floor", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="NTE Mounting Wall">
              <Input value={formData.nte_mounting_wall} onChange={(e) => handleChange("nte_mounting_wall", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="NTE Rack Bay/Shelf">
              <Input value={formData.nte_rack_bay_shelf} onChange={(e) => handleChange("nte_rack_bay_shelf", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Equipment Power Configuration">
              <Input value={formData.equipment_power_config} onChange={(e) => handleChange("equipment_power_config", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Distance From FBT to NTE">
              <Input value={formData.distance_fbt_to_nte} onChange={(e) => handleChange("distance_fbt_to_nte", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Distance from NTE to Customer IT Space">
              <Input value={formData.distance_nte_to_it} onChange={(e) => handleChange("distance_nte_to_it", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Is Customer IT Space on Same Floor as NTE?">
              <YesNoSelect value={formData.it_same_floor_as_nte} onChange={(v) => handleChange("it_same_floor_as_nte", v)} />
            </FieldRow>
          </div>
        </Section>

        {/* Path of Approach */}
        <Section title="PATH OF APPROACH / MEASUREMENTS">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Path of Approach Description" wide>
              <Textarea value={formData.path_of_approach} onChange={(e) => handleChange("path_of_approach", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="Starting FH/MH/POLE Tie-in Measurements" wide>
              <Textarea value={formData.starting_tie_in_measurements} onChange={(e) => handleChange("starting_tie_in_measurements", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="SOC/POLE LINE START Lat/Long">
              <Input value={formData.soc_pole_line_start} onChange={(e) => handleChange("soc_pole_line_start", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="SOC/POLE LINE END Lat/Long">
              <Input value={formData.soc_pole_line_end} onChange={(e) => handleChange("soc_pole_line_end", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="SOC START Lat/Long">
              <Input value={formData.soc_start_lat_long} onChange={(e) => handleChange("soc_start_lat_long", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="SOC END Lat/Long">
              <Input value={formData.soc_end_lat_long} onChange={(e) => handleChange("soc_end_lat_long", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* EF Offer/Requirements */}
        <Section title="EF OFFER / REQUIREMENTS">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="EF Offer">
              <YesNoSelect value={formData.ef_offer} onChange={(v) => handleChange("ef_offer", v)} />
            </FieldRow>
            <FieldRow label="EF Needed">
              <YesNoSelect value={formData.ef_needed} onChange={(v) => handleChange("ef_needed", v)} />
            </FieldRow>
            <FieldRow label="EF Qualified">
              <YesNoSelect value={formData.ef_qualified} onChange={(v) => handleChange("ef_qualified", v)} />
            </FieldRow>
            <FieldRow label="EF Disqualification Reason">
              <Input value={formData.ef_disqualification_reason} onChange={(e) => handleChange("ef_disqualification_reason", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Are We Placing Conduit and How Long?" wide>
              <Input value={formData.placing_conduit_length} onChange={(e) => handleChange("placing_conduit_length", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* EF Requirements Detail */}
        <Section title="EF REQUIREMENTS - DETAIL">
          <div className="space-y-4">
            {[
              { label: "Do we need a buried PVC pipe?", key: "buried_pvc", qtyKey: "buried_pvc_length", qtyLabel: "Length" },
              { label: "Do we need buried innerduct on customer property?", key: "buried_innerduct", qtyKey: "buried_innerduct_length", qtyLabel: "Length" },
              { label: "Do we need EMT (metallic bldg pipe)?", key: "need_emt", qtyKey: "emt_length", qtyLabel: "Length" },
              { label: "Do we need plastic building duct/pipe (Plenum)?", key: "need_plenum", qtyKey: "plenum_length", qtyLabel: "Length" },
              { label: "Do we need a core drill?", key: "need_core_drill", qtyKey: "core_drill_qty", qtyLabel: "Qty" },
              { label: "Do we need an eye-bolt/weatherhead?", key: "need_eyebolt", qtyKey: null },
              { label: "Do we need a Pullbox?", key: "need_pullbox", qtyKey: "pullbox_qty", qtyLabel: "Qty" },
              { label: "Do we need a Hoffman box?", key: "need_hoffman_box", qtyKey: null },
              { label: "Do we need a backboard?", key: "need_backboard", qtyKey: "backboard_qty", qtyLabel: "Qty" },
              { label: "Do we need an outlet?", key: "need_outlet", qtyKey: null },
              { label: "Do we need a groundbar?", key: "need_groundbar", qtyKey: "groundbar_qty", qtyLabel: "Qty" },
            ].map((item) => (
              <div key={item.key} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end border-b border-zinc-200 pb-3">
                <div className="sm:col-span-1">
                  <Label className="text-xs font-mono text-zinc-500">{item.label}</Label>
                </div>
                <div className="sm:col-span-1">
                  <YesNoSelect value={formData[item.key]} onChange={(v) => handleChange(item.key, v)} />
                </div>
                {item.qtyKey && (
                  <div className="sm:col-span-1">
                    <Label className="text-xs font-mono text-zinc-500">{item.qtyLabel}</Label>
                    <Input value={formData[item.qtyKey] || ""} onChange={(e) => handleChange(item.qtyKey, e.target.value)} className="h-10 bg-white border-zinc-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Site Requirements */}
        <Section title="SITE REQUIREMENTS">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Site Readiness Evaluation" wide>
              <Textarea value={formData.site_readiness_evaluation} onChange={(e) => handleChange("site_readiness_evaluation", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="What Site Requirements are Already Provided?" wide>
              <Textarea value={formData.site_requirements_provided} onChange={(e) => handleChange("site_requirements_provided", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="Grounding System">
              <Input value={formData.grounding_system} onChange={(e) => handleChange("grounding_system", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="Building Power Source">
              <Input value={formData.building_power_source} onChange={(e) => handleChange("building_power_source", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
          </div>
        </Section>

        {/* Additional Information */}
        <Section title="ADDITIONAL INFORMATION">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Are there any pipelines in the vicinity?">
              <YesNoSelect value={formData.pipelines_vicinity} onChange={(v) => handleChange("pipelines_vicinity", v)} />
            </FieldRow>
            <FieldRow label="Are there any pipelines in the path?">
              <YesNoSelect value={formData.pipelines_path} onChange={(v) => handleChange("pipelines_path", v)} />
            </FieldRow>
            <FieldRow label="Are there any railroads in the vicinity?">
              <YesNoSelect value={formData.railroads_vicinity} onChange={(v) => handleChange("railroads_vicinity", v)} />
            </FieldRow>
            <FieldRow label="Are there any railroads in the path?">
              <YesNoSelect value={formData.railroads_path} onChange={(v) => handleChange("railroads_path", v)} />
            </FieldRow>
            <FieldRow label="Possible Permits" wide>
              <Input value={formData.possible_permits} onChange={(e) => handleChange("possible_permits", e.target.value)} className="h-10 bg-white border-zinc-300" />
            </FieldRow>
            <FieldRow label="ROW Width, Pole-Pole, Clear Inside Path Measurements" wide>
              <Textarea value={formData.row_measurements} onChange={(e) => handleChange("row_measurements", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="Is there anything else we must know?" wide>
              <Textarea value={formData.other_notes} onChange={(e) => handleChange("other_notes", e.target.value)} className="bg-white border-zinc-300" rows={2} />
            </FieldRow>
            <FieldRow label="Additional SOW Notes" wide>
              <Textarea value={formData.additional_sow_notes} onChange={(e) => handleChange("additional_sow_notes", e.target.value)} className="bg-white border-zinc-300" rows={3} />
            </FieldRow>
          </div>
        </Section>

        {/* Save/Export buttons at bottom */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="outline"
            className="h-11 px-6 bg-zinc-100 border-zinc-300 hover:bg-zinc-200"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            ASE Export
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ASEForm;
