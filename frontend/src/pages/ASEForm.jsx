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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowLeft, Save, FileSpreadsheet, Loader2, ClipboardList, Users, FileOutput, Camera } from "lucide-react";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { ASEPhotoField } from "@/components/ASEPhotoField";

const BLANK = "__BLANK__";

// Dropdown options from ASE Excel template SOURCE and data sheets - EXACT match
const ASE_OPTIONS = {
  yesNo: ["YES", "NO"],
  yesNoNA: ["YES", "NO", "N/A"],
  
  // Site Visit Type (from data sheet)
  siteVisitType: ["RB", "SITE SURVEY"],
  
  // Occupancy Types (from SOURCE sheet Column C)
  occupancyTypes: [
    "RETAIL", "INDUSTRIAL", "OFFICE", "SPORTS", "GOVERNMENT", 
    "LAND", "MULTI-FAMILY", "HEALTHCARE", "STRIP MALL", "SPECIALTY"
  ],
  
  // Owner/Tenant (from data sheet Column C)
  ownerTenant: ["BUILDING OWNER", "TENANT"],
  
  // Equipment Mounting (from SOURCE sheet Column D) - also used for NTE Placement
  equipmentMounting: [
    "POLE", "PEDESTAL", "OUTSIDE WALL MOUNT", "INSIDE WALL MOUNT", 
    "H-Frame", "RACK", "DESK MOUNT(WALL MOUNT)", "HOFFMAN BOX"
  ],
  
  // Power Configuration (from SOURCE sheet Column E)
  powerConfiguration: ["AC SINGLE", "AC DUAL", "DC SINGLE", "DC DUAL"],
  
  // Power Type (from data sheet Column E)
  powerType: ["AC", "DC", "DUEL POWER SUPPLY"],
  
  // Construction Type (from SOURCE sheet Column F)  
  constructionType: ["CONSTRUCTION", "REMODEL", "CWOTS", "CONSTRUCTION TRAILER", "CELL SITE", "N/A"],
  
  // Terminal Location (from data sheet Column F)
  terminalLocation: ["NEW", "EXISTING"],
  
  // Mounting Wall (from data sheet Column D)
  mountingWall: ["BACKBOARD", "RACK"],
  
  // Fiber Terminal Placement - includes HOFFMAN BOX
  fiberTerminalPlacement: ["Terminal", "Elsewhere", "POLE", "H-Frame", "RACK", "HOFFMAN BOX"],
  
  // NTE Location
  nteLocation: ["Terminal", "Another Location"],
  
  // Timeframe
  timeframe: ["Limited to Weekdays", "Weekdays Only", "Weekends Available", "24/7 Access"],
  
  // Site Readiness (from SVCL Output formulas)
  siteReadiness: [
    "No Site requirements - ready for fiber and/or equipment",
    "Site requirements needed for ONLY equipment",
    "Site Requirements are needed for fiber & equipment, or fiber only"
  ],
  
  // Qualified Equipment
  qualifiedEquipment: ["None Found", "CIENA 3930 OR EQUIVALENT RAD", "CIENA 3931", "CIENA 3903X OR EQUIVALENT RAD"],
  
  // Employees (from SOURCE sheet Column A)
  employees: [
    "COCHISE NAVA Cochise.Nava@BYERS.com (832) 540-0027",
    "MITCHELL CURLEE Mitchell.Curlee@BYERS.COM (936) 689-7042",
    "Jared Monroe Jared.Monroe@BYERS.COM (832) 316-6907",
    "John Sydow John.Sydow@BYERS.COM (832) 422-0577",
    "John Maier John.Maier@BYERS.COM (281) 216-7017",
    "Stan Duke stan.duke@byers.com 225-933-8017",
    "Luis Ramirez luis.ramirez@byers.com 361-389-5324",
    "Jacob Adrianson 936-235-9850 Jacob.Adrianson@byers.com",
    "Juan Arias juan.arias@byers.com 929-641-2663",
    "Carlos Sanchez carlos.sanchez@byers.com 281-202-8344",
    "Steveland Horton 713-306-1975 steveland.horton@byers.com"
  ],
};

// Section component for consistent styling
const Section = ({ title, children, className = "" }) => (
  <div className={`bg-white border border-zinc-200 rounded-lg p-4 sm:p-5 ${className}`}>
    <h2 className="font-mono text-sm sm:text-base font-bold text-zinc-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
      <div className="w-1 h-5 bg-blue-600"></div>
      {title}
    </h2>
    {children}
  </div>
);

// Styled input with fill indicator
const StyledInput = ({ filled, ...props }) => (
  <Input 
    {...props} 
    className={`font-mono text-sm h-10 ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}
  />
);

// Styled textarea with fill indicator
const StyledTextarea = ({ filled, ...props }) => (
  <Textarea 
    {...props} 
    className={`font-mono text-sm ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}
  />
);

// Dropdown select component
const DropdownSelect = ({ value, onChange, options, placeholder = "Select...", filled }) => (
  <Select value={value || BLANK} onValueChange={(v) => onChange(v === BLANK ? "" : v)}>
    <SelectTrigger className={`h-10 font-mono text-sm ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={BLANK}>{placeholder}</SelectItem>
      {options.map(opt => (
        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

// Yes/No Select
const YesNoSelect = ({ value, onChange, filled }) => (
  <DropdownSelect value={value} onChange={onChange} options={ASE_OPTIONS.yesNo} placeholder="Select..." filled={filled} />
);

// Yes/No/NA Select
const YesNoNASelect = ({ value, onChange, filled }) => (
  <DropdownSelect value={value} onChange={onChange} options={ASE_OPTIONS.yesNoNA} placeholder="Select..." filled={filled} />
);

// Field row component
const FieldRow = ({ label, children, note, wide = false }) => (
  <div className={wide ? "col-span-1 sm:col-span-2" : ""}>
    <Label className="text-xs font-mono text-zinc-600 uppercase tracking-wide mb-1.5 block">
      {label}
      {note && <span className="text-zinc-400 ml-1 normal-case">({note})</span>}
    </Label>
    {children}
  </div>
);

// Helper to check if field has value
const isFilled = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
};

const ASEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [underground, setUnderground] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [formData, setFormData] = useState({
    // ========== ASE CKLIST TAB ==========
    // Employee Info
    employee_info: "",
    date_of_site_visit: "",
    
    // Address Section
    address: "",
    mpoe_address: "",
    suite_bldg: "",
    
    // BIDI RETROFIT
    bidi_retrofit_qualify: "",
    bidi_spoke_to: "",
    bidi_agreed_date: "",
    bidi_timeframe: "",
    bidi_access_notes: "",
    
    // ACCESS/CUSTOMER INFORMATION
    access_contact: "",
    building_owner_contact: "",
    site_walked_with: "",
    access_notes: "",
    
    // BUILDING CHARACTERISTICS
    occupancy_type: "",
    number_of_floors: "",
    number_of_business_units: "",
    how_many_dmarcs: "",
    additional_dmarcs_location: "",
    proposed_nte_common_space: "",
    
    // FIBER ATTRIBUTES
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
    terminal_rack_bay: "",
    terminal_rack_shelf: "",
    
    // NTE – EQUIPMENT ATTRIBUTES
    existing_nte: "",
    nte_placement: "",
    nte_active_ports: "",
    nte_clli: "",
    nte_at_terminal: "",
    nte_location_description: "",
    nte_lat_long: "",
    nte_floor: "",
    nte_mounting_wall: "",
    nte_rack_bay: "",
    nte_rack_shelf: "",
    equipment_power_config: "",
    distance_fbt_to_nte: "",
    distance_nte_to_it: "",
    it_same_floor_as_nte: "",
    ceiling_height: "",
    
    // EF OFFER
    ef_needed: "",
    ef_qualified: "",
    ef_disqualification_reason: "",
    owner_or_tenant: "",
    spf_required: "",
    spf_contact: "",
    placing_conduit_length: "",
    
    // EF REQUIREMENTS table
    buried_pvc: "NO",
    buried_pvc_length: "",
    buried_innerduct: "NO",
    buried_innerduct_length: "",
    need_emt: "NO",
    emt_length: "",
    need_plenum: "NO",
    plenum_length: "",
    need_core_drill: "NO",
    core_drill_qty: "",
    need_eyebolt: "NO",
    need_pullbox: "NO",
    pullbox_qty: "",
    need_hoffman_box: "NO",
    hoffman_box_qty: "",
    need_backboard: "NO",
    backboard_qty: "",
    need_outlet: "NO",
    need_groundbar: "NO",
    groundbar_qty: "",
    
    // ADDITIONAL INFO
    nearest_fiber_lat_long: "",
    starting_tie_in_measurements: "",
    nearest_fiber_fid: "",
    path_of_approach: "",
    soc_pole_line_start: "",
    soc_pole_line_end: "",
    soc_start_lat_long: "",
    soc_end_lat_long: "",
    proposed_pole_bldg_height: "",
    site_requirements_provided: "",
    pipelines_vicinity: "",
    pipelines_path: "",
    railroads_vicinity: "",
    railroads_path: "",
    row_measurements: "",
    other_notes: "",
    
    // Photo fields for sections
    address_photos: [],
    access_customer_photos: [],
    building_characteristics_photos: [],
    soc_start_photos: [],
    soc_end_photos: [],
    pole_line_start_photos: [],
    pole_line_end_photos: [],
    fbt_photos: [],
    nte_photos: [],
    mpoe_photos: [],
    
    // Mark Ups
    markup_photos: [],
    
    // ========== COORDINATOR INPUT TAB ==========
    assigned_att_eng: "",
    nearest_fiber_fid_missing: "",
    fbt_fid_missing: "",
    possible_permits: "",
    additional_sow_notes: "",
    
    // ========== SVCL OUTPUT TAB (auto-calculated but editable) ==========
    // Site & Order
    building_contact: "",
    building_contact_email: "",
    sow_notes: "",
    
    // Site Visit
    type_of_site_visit: "",
    qualified_equipment: "",
    
    // Building info (calculated)
    multi_tenant: "",
    number_of_tenants: "",
    building_demarcation: "",
    disable_nte_auto_assignment: "",
    
    // Fiber Attributes output
    fiber_terminal_location: "",
    fiber_terminal_floor_out: "",
    fiber_terminal_aisle: "",
    fiber_terminal_bay_out: "",
    fiber_terminal_shelf_out: "",
    
    // NTE Equipment output
    equipment_environment: "",
    equipment_location: "",
    equipment_mounting: "",
    equipment_power_config_out: "",
    equipment_floor: "",
    equipment_aisle: "",
    equipment_bay: "",
    equipment_shelf: "",
    
    // Multi Tenant Eligibility
    multi_tenant_eligibility: "",
    customer_handoff_panel_location: "",
    est_fiber_drop_length: "",
    router_same_floor: "",
    router_within_300ft: "",
    ceiling_height_ok: "",
    
    // Site Requirements
    site_readiness_evaluation: "",
    ef_qualified_out: "",
    customer_ef_aware: "",
    end_user_acceptance: "",
    ef_owner_tenant: "",
    ef_conduit_length: "",
    other_requirements: "",
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fetchJobAndASE = useCallback(async () => {
    try {
      const [jobRes, aseRes, polesRes, undergroundRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/ase-data`),
        axios.get(`/jobs/${jobId}/poles`),
        axios.get(`/jobs/${jobId}/underground`)
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data || []);
      setUnderground(undergroundRes.data || []);
      
      if (aseRes.data.ase_data) {
        setFormData(prev => ({ ...prev, ...aseRes.data.ase_data }));
      }
      
      // Auto-populate from job data
      const jobData = jobRes.data;
      const polesData = polesRes.data || [];
      const ugData = undergroundRes.data || [];
      
      setFormData(prev => {
        const updated = { ...prev };
        
        // Address from job
        if (!updated.address && jobData.location) {
          updated.address = jobData.location;
        }
        
        // Pole coordinates
        if (polesData.length > 0) {
          const firstPole = polesData[0];
          const lastPole = polesData[polesData.length - 1];
          
          if (!updated.soc_pole_line_start && firstPole.latitude && firstPole.longitude) {
            updated.soc_pole_line_start = `${firstPole.latitude}, ${firstPole.longitude}`;
          }
          if (!updated.soc_pole_line_end && lastPole.latitude && lastPole.longitude) {
            updated.soc_pole_line_end = `${lastPole.latitude}, ${lastPole.longitude}`;
          }
          
          // Starting measurements from first pole
          if (!updated.starting_tie_in_measurements && firstPole) {
            const measurements = [];
            if (firstPole.span1_direction && firstPole.span1_distance) {
              measurements.push(`Span 1: ${firstPole.span1_direction} - ${firstPole.span1_distance} ft`);
            }
            if (firstPole.span2_direction && firstPole.span2_distance) {
              measurements.push(`Span 2: ${firstPole.span2_direction} - ${firstPole.span2_distance} ft`);
            }
            if (measurements.length > 0) {
              updated.starting_tie_in_measurements = measurements.join("; ");
            }
          }
          
          // Proposed pole and building
          if (!updated.proposed_pole_bldg_height && polesData.length > 0) {
            const poleNumbers = polesData.map(p => p.pole_number).filter(Boolean).join(", ");
            if (poleNumbers) {
              updated.proposed_pole_bldg_height = `Poles: ${poleNumbers}`;
            }
          }
        }
        
        // Underground items - with photo attachment
        ugData.forEach(item => {
          // Get photos from item (handle both single photo and photos array)
          const itemPhotos = item.photos || (item.photo ? [item.photo] : []);
          
          if (item.type === 'FBT' || item.type === 'FBT/NTE') {
            if (!updated.fiber_terminal_lat_long && item.latitude && item.longitude) {
              updated.fiber_terminal_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            if (!updated.existing_fiber_terminal) updated.existing_fiber_terminal = "YES";
            // Attach FBT photos
            if (itemPhotos.length > 0 && (!updated.fbt_photos || updated.fbt_photos.length === 0)) {
              updated.fbt_photos = itemPhotos;
            }
          }
          if (item.type === 'NTE' || item.type === 'FBT/NTE') {
            if (!updated.nte_lat_long && item.latitude && item.longitude) {
              updated.nte_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            if (!updated.existing_nte) updated.existing_nte = "YES";
            // Attach NTE photos
            if (itemPhotos.length > 0 && (!updated.nte_photos || updated.nte_photos.length === 0)) {
              updated.nte_photos = itemPhotos;
            }
          }
          if (item.type === 'SOC Start') {
            if (!updated.soc_start_lat_long && item.latitude && item.longitude) {
              updated.soc_start_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            // Attach SOC Start photos
            if (itemPhotos.length > 0 && (!updated.soc_start_photos || updated.soc_start_photos.length === 0)) {
              updated.soc_start_photos = itemPhotos;
            }
          }
          if (item.type === 'SOC End') {
            if (!updated.soc_end_lat_long && item.latitude && item.longitude) {
              updated.soc_end_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            // Attach SOC End photos
            if (itemPhotos.length > 0 && (!updated.soc_end_photos || updated.soc_end_photos.length === 0)) {
              updated.soc_end_photos = itemPhotos;
            }
          }
          if (item.type === 'MPOE') {
            if (!updated.mpoe_address && item.notes) {
              updated.mpoe_address = item.notes;
            }
            // Attach MPOE photos
            if (itemPhotos.length > 0 && (!updated.mpoe_photos || updated.mpoe_photos.length === 0)) {
              updated.mpoe_photos = itemPhotos;
            }
          }
          if (item.type === 'Hoffman Box' && !updated.need_hoffman_box) {
            updated.need_hoffman_box = "YES";
          }
        });
        
        // Attach pole photos to pole line start/end
        if (polesData.length > 0) {
          const firstPole = polesData[0];
          const lastPole = polesData[polesData.length - 1];
          
          // First pole photos for pole line start
          const firstPolePhotos = firstPole.photos || (firstPole.photo ? [firstPole.photo] : []);
          if (firstPolePhotos.length > 0 && (!updated.pole_line_start_photos || updated.pole_line_start_photos.length === 0)) {
            updated.pole_line_start_photos = firstPolePhotos;
          }
          
          // Last pole photos for pole line end
          const lastPolePhotos = lastPole.photos || (lastPole.photo ? [lastPole.photo] : []);
          if (lastPolePhotos.length > 0 && (!updated.pole_line_end_photos || updated.pole_line_end_photos.length === 0)) {
            updated.pole_line_end_photos = lastPolePhotos;
          }
        }
        
        // Path of approach
        if (!updated.path_of_approach && ugData.length > 0) {
          const pathItems = ugData.map(item => item.label ? `${item.type} (${item.label})` : item.type).join(" → ");
          if (pathItems) {
            updated.path_of_approach = `Underground path: ${pathItems}`;
          }
        }
        
        // Auto-calculate SVCL Output fields
        // Multi-tenant based on business units
        if (updated.number_of_business_units) {
          const units = parseInt(updated.number_of_business_units) || 0;
          updated.multi_tenant = units > 1 ? "YES" : "NO";
          updated.number_of_tenants = updated.number_of_business_units;
        }
        
        // Building demarcation
        if (updated.how_many_dmarcs) {
          const dmarcs = parseInt(updated.how_many_dmarcs) || 0;
          updated.building_demarcation = dmarcs === 1 ? "Single MPOE/Terminal" : "Multiple MPOE/Terminal";
        }
        
        // Building contact from access contact
        if (!updated.building_contact && updated.building_owner_contact) {
          updated.building_contact = updated.building_owner_contact;
        }
        
        // ========== COLLECT ALL JOB PHOTOS FOR MARK UPS GALLERY ==========
        // Only auto-populate if markup_photos is empty (don't overwrite user edits)
        if (!updated.markup_photos || updated.markup_photos.length === 0) {
          const allJobPhotos = [];
          
          // Collect photos from all poles
          polesData.forEach(pole => {
            // Main pole photo
            if (pole.photo) allJobPhotos.push(pole.photo);
            if (pole.photos && Array.isArray(pole.photos)) {
              allJobPhotos.push(...pole.photos);
            }
            // Birthmark photos
            if (pole.birthmark_photos && Array.isArray(pole.birthmark_photos)) {
              allJobPhotos.push(...pole.birthmark_photos);
            }
            // MGNV photos
            if (pole.mgnv_photos && Array.isArray(pole.mgnv_photos)) {
              allJobPhotos.push(...pole.mgnv_photos);
            }
            // Anchor photos
            if (pole.anchor_photos && Array.isArray(pole.anchor_photos)) {
              allJobPhotos.push(...pole.anchor_photos);
            }
            // HOA photos
            if (pole.hoa_photos && Array.isArray(pole.hoa_photos)) {
              allJobPhotos.push(...pole.hoa_photos);
            }
          });
          
          // Collect photos from all underground items
          ugData.forEach(item => {
            if (item.photo) allJobPhotos.push(item.photo);
            if (item.photos && Array.isArray(item.photos)) {
              allJobPhotos.push(...item.photos);
            }
          });
          
          // Remove duplicates and empty values
          const uniquePhotos = [...new Set(allJobPhotos.filter(p => p && typeof p === 'string'))];
          
          if (uniquePhotos.length > 0) {
            updated.markup_photos = uniquePhotos;
          }
        }
        
        return updated;
      });
      
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/jobs/${jobId}/ase-data`, { ase_data: formData });
      toast.success("ASE data saved");
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await axios.put(`/jobs/${jobId}/ase-data`, { ase_data: formData });
      const response = await axios.get(`/jobs/${jobId}/export/ase`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ASE_${job?.job_number || jobId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("ASE Excel exported");
    } catch (error) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/jobs/${jobId}`} className="p-2 hover:bg-zinc-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-heading text-lg sm:text-xl font-bold">ASE SITE WALK SURVEY</h1>
              <p className="text-xs text-zinc-500 font-mono">{job?.job_number} • {job?.job_type}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} variant="outline" size="sm" data-testid="save-ase-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Save</span>
            </Button>
            <Button onClick={handleExport} disabled={exporting} size="sm" data-testid="export-ase-btn">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Export</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-6" data-testid="ase-form">
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono bg-white p-3 rounded-lg border border-zinc-200">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            Filled
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-amber-400"></span>
            Not Filled
          </span>
        </div>
        
        {/* 3-Tab Structure - EXACT match to Excel */}
        <Tabs defaultValue="ase-cklist" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-zinc-100 p-1 rounded-lg h-auto">
            <TabsTrigger 
              value="ase-cklist" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700 py-2"
              data-testid="tab-ase-cklist"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="text-xs sm:text-sm">ASE CKLIST</span>
            </TabsTrigger>
            <TabsTrigger 
              value="coordinator-input" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-green-700 py-2"
              data-testid="tab-coordinator-input"
            >
              <Users className="w-4 h-4" />
              <span className="text-xs sm:text-sm">Coordinator Input</span>
            </TabsTrigger>
            <TabsTrigger 
              value="svcl-output" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-purple-700 py-2"
              data-testid="tab-svcl-output"
            >
              <FileOutput className="w-4 h-4" />
              <span className="text-xs sm:text-sm">SVCL Output</span>
            </TabsTrigger>
          </TabsList>

          {/* ========== TAB 1: ASE CKLIST ========== */}
          <TabsContent value="ase-cklist" className="space-y-4" data-testid="content-ase-cklist">
            
            {/* Employee Info */}
            <Section title="Employee Info">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Employee Info">
                  <DropdownSelect value={formData.employee_info} onChange={(v) => handleChange("employee_info", v)} options={ASE_OPTIONS.employees} filled={isFilled(formData.employee_info)} />
                </FieldRow>
                <FieldRow label="Date of site visit">
                  <StyledInput type="date" value={formData.date_of_site_visit} onChange={(e) => handleChange("date_of_site_visit", e.target.value)} filled={isFilled(formData.date_of_site_visit)} />
                </FieldRow>
              </div>
            </Section>

            {/* Address Section */}
            <Section title="Address">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Address" wide>
                  <StyledInput value={formData.address} onChange={(e) => handleChange("address", e.target.value)} filled={isFilled(formData.address)} />
                </FieldRow>
                <FieldRow label="MPOE Address">
                  <StyledInput value={formData.mpoe_address} onChange={(e) => handleChange("mpoe_address", e.target.value)} filled={isFilled(formData.mpoe_address)} />
                </FieldRow>
                <FieldRow label="Suite &/or bldg #">
                  <StyledInput value={formData.suite_bldg} onChange={(e) => handleChange("suite_bldg", e.target.value)} filled={isFilled(formData.suite_bldg)} />
                </FieldRow>
              </div>
              {/* Address Photos */}
              <div className="mt-4 pt-4 border-t border-zinc-200">
                <ASEPhotoField 
                  label="Address Photos" 
                  photos={formData.address_photos || []} 
                  onChange={(v) => handleChange("address_photos", v)} 
                />
              </div>
            </Section>

            {/* BIDI RETROFIT */}
            <Section title="BIDI RETROFIT">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Does this qualify for BIDI Retrofit?">
                  <YesNoSelect value={formData.bidi_retrofit_qualify} onChange={(v) => handleChange("bidi_retrofit_qualify", v)} filled={isFilled(formData.bidi_retrofit_qualify)} />
                </FieldRow>
                <FieldRow label="Did you speak to regarding Retrofit work?">
                  <StyledInput value={formData.bidi_spoke_to} onChange={(e) => handleChange("bidi_spoke_to", e.target.value)} filled={isFilled(formData.bidi_spoke_to)} />
                </FieldRow>
                <FieldRow label="What date was agreed to?" note="Limited to Weekdays">
                  <StyledInput type="date" value={formData.bidi_agreed_date} onChange={(e) => handleChange("bidi_agreed_date", e.target.value)} filled={isFilled(formData.bidi_agreed_date)} />
                </FieldRow>
                <FieldRow label="What timeframe?">
                  <DropdownSelect value={formData.bidi_timeframe} onChange={(v) => handleChange("bidi_timeframe", v)} options={ASE_OPTIONS.timeframe} filled={isFilled(formData.bidi_timeframe)} />
                </FieldRow>
                <FieldRow label="BIDI Access Notes/Special Instructions" wide>
                  <StyledTextarea value={formData.bidi_access_notes} onChange={(e) => handleChange("bidi_access_notes", e.target.value)} rows={2} filled={isFilled(formData.bidi_access_notes)} />
                </FieldRow>
              </div>
            </Section>

            {/* ACCESS/CUSTOMER INFORMATION */}
            <Section title="ACCESS/CUSTOMER INFORMATION">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Access contact name & phone/email" wide>
                  <StyledInput value={formData.access_contact} onChange={(e) => handleChange("access_contact", e.target.value)} filled={isFilled(formData.access_contact)} />
                </FieldRow>
                <FieldRow label="Building Owner name & phone/email" wide>
                  <StyledInput value={formData.building_owner_contact} onChange={(e) => handleChange("building_owner_contact", e.target.value)} filled={isFilled(formData.building_owner_contact)} />
                </FieldRow>
                <FieldRow label="Who did you walk the site with?">
                  <StyledInput value={formData.site_walked_with} onChange={(e) => handleChange("site_walked_with", e.target.value)} filled={isFilled(formData.site_walked_with)} />
                </FieldRow>
                <FieldRow label="Access Notes/Special Instructions" wide>
                  <StyledTextarea value={formData.access_notes} onChange={(e) => handleChange("access_notes", e.target.value)} rows={2} filled={isFilled(formData.access_notes)} />
                </FieldRow>
              </div>
              {/* Access/Customer Photos */}
              <div className="mt-4 pt-4 border-t border-zinc-200">
                <ASEPhotoField 
                  label="Access/Customer Photos" 
                  photos={formData.access_customer_photos || []} 
                  onChange={(v) => handleChange("access_customer_photos", v)} 
                />
              </div>
            </Section>

            {/* BUILDING CHARACTERISTICS */}
            <Section title="BUILDING CHARACTERISTICS">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Occupancy Type">
                  <DropdownSelect value={formData.occupancy_type} onChange={(v) => handleChange("occupancy_type", v)} options={ASE_OPTIONS.occupancyTypes} filled={isFilled(formData.occupancy_type)} />
                </FieldRow>
                <FieldRow label="Number of Floors">
                  <StyledInput type="number" value={formData.number_of_floors} onChange={(e) => handleChange("number_of_floors", e.target.value)} filled={isFilled(formData.number_of_floors)} />
                </FieldRow>
                <FieldRow label="Number of business units">
                  <StyledInput type="number" value={formData.number_of_business_units} onChange={(e) => handleChange("number_of_business_units", e.target.value)} filled={isFilled(formData.number_of_business_units)} />
                </FieldRow>
                <FieldRow label="How many DMARCs?">
                  <StyledInput type="number" value={formData.how_many_dmarcs} onChange={(e) => handleChange("how_many_dmarcs", e.target.value)} filled={isFilled(formData.how_many_dmarcs)} />
                </FieldRow>
                <FieldRow label="If additional DMARCs, where are they?">
                  <StyledInput value={formData.additional_dmarcs_location} onChange={(e) => handleChange("additional_dmarcs_location", e.target.value)} filled={isFilled(formData.additional_dmarcs_location)} />
                </FieldRow>
                <FieldRow label="Is the proposed NTE in a common space and can serve multiple tenants?" wide>
                  <YesNoSelect value={formData.proposed_nte_common_space} onChange={(v) => handleChange("proposed_nte_common_space", v)} filled={isFilled(formData.proposed_nte_common_space)} />
                </FieldRow>
              </div>
              {/* Building Characteristics Photos */}
              <div className="mt-4 pt-4 border-t border-zinc-200">
                <ASEPhotoField 
                  label="Building Characteristics Photos" 
                  photos={formData.building_characteristics_photos || []} 
                  onChange={(v) => handleChange("building_characteristics_photos", v)} 
                />
              </div>
            </Section>

            {/* FIBER ATTRIBUTES */}
            <Section title="FIBER ATTRIBUTES">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Existing INC">
                  <YesNoSelect value={formData.existing_inc} onChange={(v) => handleChange("existing_inc", v)} filled={isFilled(formData.existing_inc)} />
                </FieldRow>
                <FieldRow label="INC required">
                  <YesNoSelect value={formData.inc_required} onChange={(v) => handleChange("inc_required", v)} filled={isFilled(formData.inc_required)} />
                </FieldRow>
                <FieldRow label="Existing Fiber Terminal">
                  <YesNoSelect value={formData.existing_fiber_terminal} onChange={(v) => handleChange("existing_fiber_terminal", v)} filled={isFilled(formData.existing_fiber_terminal)} />
                </FieldRow>
                <FieldRow label="FIBER TERMINAL placement">
                  <DropdownSelect value={formData.fiber_terminal_placement} onChange={(v) => handleChange("fiber_terminal_placement", v)} options={ASE_OPTIONS.fiberTerminalPlacement} filled={isFilled(formData.fiber_terminal_placement)} />
                </FieldRow>
                <FieldRow label="Fiber Terminal LAT/LONG">
                  <StyledInput value={formData.fiber_terminal_lat_long} onChange={(e) => handleChange("fiber_terminal_lat_long", e.target.value)} filled={isFilled(formData.fiber_terminal_lat_long)} placeholder="Auto-filled from Underground" />
                </FieldRow>
                <FieldRow label="Fiber Terminal FID">
                  <StyledInput value={formData.fiber_terminal_fid} onChange={(e) => handleChange("fiber_terminal_fid", e.target.value)} filled={isFilled(formData.fiber_terminal_fid)} />
                </FieldRow>
                <FieldRow label="Active ports" note="FOR EXISTING">
                  <StyledInput value={formData.fiber_active_ports} onChange={(e) => handleChange("fiber_active_ports", e.target.value)} filled={isFilled(formData.fiber_active_ports)} />
                </FieldRow>
                <FieldRow label="Fiber Reading" note="FOR EXISTING">
                  <StyledInput value={formData.fiber_reading} onChange={(e) => handleChange("fiber_reading", e.target.value)} filled={isFilled(formData.fiber_reading)} />
                </FieldRow>
                <FieldRow label="Describe existing / proposed terminal location" wide>
                  <StyledTextarea value={formData.terminal_location_description} onChange={(e) => handleChange("terminal_location_description", e.target.value)} rows={2} filled={isFilled(formData.terminal_location_description)} />
                </FieldRow>
                <FieldRow label="Floor #">
                  <StyledInput value={formData.terminal_floor} onChange={(e) => handleChange("terminal_floor", e.target.value)} filled={isFilled(formData.terminal_floor)} />
                </FieldRow>
                <FieldRow label="Mounting Wall">
                  <DropdownSelect value={formData.terminal_mounting_wall} onChange={(v) => handleChange("terminal_mounting_wall", v)} options={ASE_OPTIONS.mountingWall} filled={isFilled(formData.terminal_mounting_wall)} />
                </FieldRow>
                <FieldRow label="Rack Bay" note="IF APPLICABLE">
                  <StyledInput value={formData.terminal_rack_bay} onChange={(e) => handleChange("terminal_rack_bay", e.target.value)} filled={isFilled(formData.terminal_rack_bay)} />
                </FieldRow>
                <FieldRow label="Rack Shelf" note="IF APPLICABLE">
                  <StyledInput value={formData.terminal_rack_shelf} onChange={(e) => handleChange("terminal_rack_shelf", e.target.value)} filled={isFilled(formData.terminal_rack_shelf)} />
                </FieldRow>
              </div>
            </Section>

            {/* NTE – EQUIPMENT ATTRIBUTES */}
            <Section title="NTE – EQUIPMENT ATTRIBUTES">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Existing NTE">
                  <YesNoSelect value={formData.existing_nte} onChange={(v) => handleChange("existing_nte", v)} filled={isFilled(formData.existing_nte)} />
                </FieldRow>
                <FieldRow label="NTE Placement">
                  <DropdownSelect value={formData.nte_placement} onChange={(v) => handleChange("nte_placement", v)} options={ASE_OPTIONS.equipmentMounting} filled={isFilled(formData.nte_placement)} />
                </FieldRow>
                <FieldRow label="Active ports" note="FOR EXISTING">
                  <StyledInput value={formData.nte_active_ports} onChange={(e) => handleChange("nte_active_ports", e.target.value)} filled={isFilled(formData.nte_active_ports)} />
                </FieldRow>
                <FieldRow label="CLLI" note="FOR EXISTING">
                  <StyledInput value={formData.nte_clli} onChange={(e) => handleChange("nte_clli", e.target.value)} filled={isFilled(formData.nte_clli)} />
                </FieldRow>
                <FieldRow label="NTE at Terminal or in another location?">
                  <DropdownSelect value={formData.nte_at_terminal} onChange={(v) => handleChange("nte_at_terminal", v)} options={ASE_OPTIONS.nteLocation} filled={isFilled(formData.nte_at_terminal)} />
                </FieldRow>
                <FieldRow label="Describe existing / proposed NTE location" wide>
                  <StyledTextarea value={formData.nte_location_description} onChange={(e) => handleChange("nte_location_description", e.target.value)} rows={2} filled={isFilled(formData.nte_location_description)} />
                </FieldRow>
                <FieldRow label="NTE LAT/LONG">
                  <StyledInput value={formData.nte_lat_long} onChange={(e) => handleChange("nte_lat_long", e.target.value)} filled={isFilled(formData.nte_lat_long)} placeholder="Auto-filled from Underground" />
                </FieldRow>
                <FieldRow label="Floor #">
                  <StyledInput value={formData.nte_floor} onChange={(e) => handleChange("nte_floor", e.target.value)} filled={isFilled(formData.nte_floor)} />
                </FieldRow>
                <FieldRow label="Mounting Wall">
                  <DropdownSelect value={formData.nte_mounting_wall} onChange={(v) => handleChange("nte_mounting_wall", v)} options={ASE_OPTIONS.mountingWall} filled={isFilled(formData.nte_mounting_wall)} />
                </FieldRow>
                <FieldRow label="Rack Bay" note="IF APPLICABLE">
                  <StyledInput value={formData.nte_rack_bay} onChange={(e) => handleChange("nte_rack_bay", e.target.value)} filled={isFilled(formData.nte_rack_bay)} />
                </FieldRow>
                <FieldRow label="Rack Shelf" note="IF APPLICABLE">
                  <StyledInput value={formData.nte_rack_shelf} onChange={(e) => handleChange("nte_rack_shelf", e.target.value)} filled={isFilled(formData.nte_rack_shelf)} />
                </FieldRow>
                <FieldRow label="Equipment Power Configuration">
                  <DropdownSelect value={formData.equipment_power_config} onChange={(v) => handleChange("equipment_power_config", v)} options={ASE_OPTIONS.powerConfiguration} filled={isFilled(formData.equipment_power_config)} />
                </FieldRow>
                <FieldRow label="Distance From FBT to NTE">
                  <StyledInput value={formData.distance_fbt_to_nte} onChange={(e) => handleChange("distance_fbt_to_nte", e.target.value)} filled={isFilled(formData.distance_fbt_to_nte)} />
                </FieldRow>
                <FieldRow label="Distance from NTE to Customer IT space">
                  <StyledInput value={formData.distance_nte_to_it} onChange={(e) => handleChange("distance_nte_to_it", e.target.value)} filled={isFilled(formData.distance_nte_to_it)} />
                </FieldRow>
                <FieldRow label="Is Customer IT space on same floor as NTE?">
                  <YesNoSelect value={formData.it_same_floor_as_nte} onChange={(v) => handleChange("it_same_floor_as_nte", v)} filled={isFilled(formData.it_same_floor_as_nte)} />
                </FieldRow>
                <FieldRow label="Ceiling Height">
                  <StyledInput value={formData.ceiling_height} onChange={(e) => handleChange("ceiling_height", e.target.value)} filled={isFilled(formData.ceiling_height)} placeholder="e.g., 10'" />
                </FieldRow>
              </div>
            </Section>

            {/* EF OFFER */}
            <Section title="EF OFFER">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="EF NEEDED">
                  <YesNoSelect value={formData.ef_needed} onChange={(v) => handleChange("ef_needed", v)} filled={isFilled(formData.ef_needed)} />
                </FieldRow>
                <FieldRow label="EF Qualified">
                  <YesNoSelect value={formData.ef_qualified} onChange={(v) => handleChange("ef_qualified", v)} filled={isFilled(formData.ef_qualified)} />
                </FieldRow>
                <FieldRow label="EF disqualification reason" wide>
                  <StyledInput value={formData.ef_disqualification_reason} onChange={(e) => handleChange("ef_disqualification_reason", e.target.value)} filled={isFilled(formData.ef_disqualification_reason)} />
                </FieldRow>
                <FieldRow label="Is the Customer Building Owner or Tenant?">
                  <DropdownSelect value={formData.owner_or_tenant} onChange={(v) => handleChange("owner_or_tenant", v)} options={ASE_OPTIONS.ownerTenant} filled={isFilled(formData.owner_or_tenant)} />
                </FieldRow>
                <FieldRow label="SPF Required?">
                  <YesNoSelect value={formData.spf_required} onChange={(v) => handleChange("spf_required", v)} filled={isFilled(formData.spf_required)} />
                </FieldRow>
                <FieldRow label="SPF contact name & phone/email" wide>
                  <StyledInput value={formData.spf_contact} onChange={(e) => handleChange("spf_contact", e.target.value)} filled={isFilled(formData.spf_contact)} />
                </FieldRow>
                <FieldRow label="Are we placing conduit and how long?" wide>
                  <StyledInput value={formData.placing_conduit_length} onChange={(e) => handleChange("placing_conduit_length", e.target.value)} filled={isFilled(formData.placing_conduit_length)} />
                </FieldRow>
              </div>
            </Section>

            {/* EF REQUIREMENTS Table */}
            <Section title="EF REQUIREMENTS">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs font-mono font-bold text-zinc-600 border-b pb-2 uppercase">
                  <span>Requirement</span>
                  <span>YES/NO</span>
                  <span>QTTY</span>
                </div>
                {[
                  { label: "Do we need a buried PVC pipe?", key: "buried_pvc", qtyKey: "buried_pvc_length", qtyLabel: "Length" },
                  { label: "Do we need buried innerduct on customer property?", key: "buried_innerduct", qtyKey: "buried_innerduct_length", qtyLabel: "Length" },
                  { label: "Do we need EMT? (metallic bldg pipe)", key: "need_emt", qtyKey: "emt_length", qtyLabel: "Length" },
                  { label: "Do we need plastic building duct/pipe (Plenum)?", key: "need_plenum", qtyKey: "plenum_length", qtyLabel: "Length" },
                  { label: "Do we need a core drill?", key: "need_core_drill", qtyKey: "core_drill_qty", qtyLabel: "QTTY" },
                  { label: "Do we need an eye-bolt / weatherhead?", key: "need_eyebolt", qtyKey: null },
                  { label: "Do we need a Pullbox?", key: "need_pullbox", qtyKey: "pullbox_qty", qtyLabel: "QTTY" },
                  { label: "Do we need a Hoffman box?", key: "need_hoffman_box", qtyKey: "hoffman_box_qty", qtyLabel: "QTTY" },
                  { label: "Do we need a backboard?", key: "need_backboard", qtyKey: "backboard_qty", qtyLabel: "QTTY" },
                  { label: "Do we need an outlet?", key: "need_outlet", qtyKey: null },
                  { label: "Do we need a groundbar?", key: "need_groundbar", qtyKey: "groundbar_qty", qtyLabel: "QTTY" },
                ].map((item) => (
                  <div key={item.key} className="grid grid-cols-3 gap-2 items-center py-2 border-b border-zinc-100">
                    <span className="text-xs font-mono text-zinc-700">{item.label}</span>
                    <YesNoSelect value={formData[item.key]} onChange={(v) => handleChange(item.key, v)} filled={isFilled(formData[item.key])} />
                    {item.qtyKey ? (
                      <StyledInput 
                        value={formData[item.qtyKey] || ""} 
                        onChange={(e) => handleChange(item.qtyKey, e.target.value)} 
                        placeholder={item.qtyLabel}
                        filled={isFilled(formData[item.qtyKey])}
                        className="text-xs"
                      />
                    ) : (
                      <span className="text-zinc-400 text-xs">—</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {/* ADDITIONAL INFO */}
            <Section title="ADDITIONAL INFO">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Nearest fiber Lat/Long">
                  <StyledInput value={formData.nearest_fiber_lat_long} onChange={(e) => handleChange("nearest_fiber_lat_long", e.target.value)} filled={isFilled(formData.nearest_fiber_lat_long)} />
                </FieldRow>
                <FieldRow label="Starting FH / MH / POLE tie in measurements">
                  <StyledInput value={formData.starting_tie_in_measurements} onChange={(e) => handleChange("starting_tie_in_measurements", e.target.value)} filled={isFilled(formData.starting_tie_in_measurements)} />
                </FieldRow>
                <FieldRow label="Nearest fiber FID">
                  <StyledInput value={formData.nearest_fiber_fid} onChange={(e) => handleChange("nearest_fiber_fid", e.target.value)} filled={isFilled(formData.nearest_fiber_fid)} />
                </FieldRow>
                <FieldRow label="Describe path of approach, include SOC length" wide>
                  <StyledTextarea value={formData.path_of_approach} onChange={(e) => handleChange("path_of_approach", e.target.value)} rows={2} filled={isFilled(formData.path_of_approach)} />
                </FieldRow>
                
                {/* POLE LINE START with photos */}
                <div>
                  <FieldRow label="POLE LINE START Lat/Long" note="IF PLACING AERIAL">
                    <StyledInput value={formData.soc_pole_line_start} onChange={(e) => handleChange("soc_pole_line_start", e.target.value)} filled={isFilled(formData.soc_pole_line_start)} />
                  </FieldRow>
                  {(formData.pole_line_start_photos?.length > 0) && (
                    <div className="mt-2">
                      <ASEPhotoField 
                        label="" 
                        photos={formData.pole_line_start_photos || []} 
                        onChange={(v) => handleChange("pole_line_start_photos", v)} 
                        compact
                      />
                    </div>
                  )}
                </div>
                
                {/* POLE LINE END with photos */}
                <div>
                  <FieldRow label="POLE LINE END Lat/Long" note="IF PLACING AERIAL">
                    <StyledInput value={formData.soc_pole_line_end} onChange={(e) => handleChange("soc_pole_line_end", e.target.value)} filled={isFilled(formData.soc_pole_line_end)} />
                  </FieldRow>
                  {(formData.pole_line_end_photos?.length > 0) && (
                    <div className="mt-2">
                      <ASEPhotoField 
                        label="" 
                        photos={formData.pole_line_end_photos || []} 
                        onChange={(v) => handleChange("pole_line_end_photos", v)} 
                        compact
                      />
                    </div>
                  )}
                </div>
                
                {/* SOC START with photos */}
                <div>
                  <FieldRow label="SOC START Lat/Long">
                    <StyledInput value={formData.soc_start_lat_long} onChange={(e) => handleChange("soc_start_lat_long", e.target.value)} filled={isFilled(formData.soc_start_lat_long)} />
                  </FieldRow>
                  {(formData.soc_start_photos?.length > 0) && (
                    <div className="mt-2">
                      <ASEPhotoField 
                        label="" 
                        photos={formData.soc_start_photos || []} 
                        onChange={(v) => handleChange("soc_start_photos", v)} 
                        compact
                      />
                    </div>
                  )}
                </div>
                
                {/* SOC END with photos */}
                <div>
                  <FieldRow label="SOC END Lat/Long">
                    <StyledInput value={formData.soc_end_lat_long} onChange={(e) => handleChange("soc_end_lat_long", e.target.value)} filled={isFilled(formData.soc_end_lat_long)} />
                  </FieldRow>
                  {(formData.soc_end_photos?.length > 0) && (
                    <div className="mt-2">
                      <ASEPhotoField 
                        label="" 
                        photos={formData.soc_end_photos || []} 
                        onChange={(v) => handleChange("soc_end_photos", v)} 
                        compact
                      />
                    </div>
                  )}
                </div>
                
                <FieldRow label="Proposed POLE and BLDG Height of Attachment" note="IF PLACING AERIAL">
                  <StyledInput value={formData.proposed_pole_bldg_height} onChange={(e) => handleChange("proposed_pole_bldg_height", e.target.value)} filled={isFilled(formData.proposed_pole_bldg_height)} />
                </FieldRow>
                <FieldRow label="What Site Requirements are already provided?" wide>
                  <StyledTextarea value={formData.site_requirements_provided} onChange={(e) => handleChange("site_requirements_provided", e.target.value)} rows={2} filled={isFilled(formData.site_requirements_provided)} />
                </FieldRow>
                <FieldRow label="Are there any pipelines in the vicinity?">
                  <YesNoSelect value={formData.pipelines_vicinity} onChange={(v) => handleChange("pipelines_vicinity", v)} filled={isFilled(formData.pipelines_vicinity)} />
                </FieldRow>
                <FieldRow label="Are there any pipelines in the path?">
                  <YesNoSelect value={formData.pipelines_path} onChange={(v) => handleChange("pipelines_path", v)} filled={isFilled(formData.pipelines_path)} />
                </FieldRow>
                <FieldRow label="Are there any railroads in the vicinity?">
                  <YesNoSelect value={formData.railroads_vicinity} onChange={(v) => handleChange("railroads_vicinity", v)} filled={isFilled(formData.railroads_vicinity)} />
                </FieldRow>
                <FieldRow label="Are there any railroads in the Path?">
                  <YesNoSelect value={formData.railroads_path} onChange={(v) => handleChange("railroads_path", v)} filled={isFilled(formData.railroads_path)} />
                </FieldRow>
                <FieldRow label="ROW width, pole-pole, clear inside path measurements, BB dimension picture gathered?" wide>
                  <StyledTextarea value={formData.row_measurements} onChange={(e) => handleChange("row_measurements", e.target.value)} rows={2} filled={isFilled(formData.row_measurements)} />
                </FieldRow>
                <FieldRow label="Is there anything else we must know?" wide>
                  <StyledTextarea value={formData.other_notes} onChange={(e) => handleChange("other_notes", e.target.value)} rows={2} filled={isFilled(formData.other_notes)} />
                </FieldRow>
              </div>
            </Section>

            {/* Mark Ups */}
            <Section title="MARK UPS">
              <PhotoMarkupEditor 
                photos={formData.markup_photos || []} 
                onChange={(v) => handleChange("markup_photos", v)}
                label="Mark Ups"
              />
              <p className="text-xs text-zinc-500 mt-2">
                Upload photos and add annotations using the in-app editor.
              </p>
            </Section>
          </TabsContent>

          {/* ========== TAB 2: COORDINATOR INPUT ========== */}
          <TabsContent value="coordinator-input" className="space-y-4" data-testid="content-coordinator-input">
            <Section title="Coordinator Input">
              <div className="grid grid-cols-1 gap-4">
                <FieldRow label="AT&T Engineer" wide>
                  <StyledInput value={formData.assigned_att_eng} onChange={(e) => handleChange("assigned_att_eng", e.target.value)} filled={isFilled(formData.assigned_att_eng)} />
                </FieldRow>
                <FieldRow label="Nearest Fiber FID if Missing" wide>
                  <StyledInput value={formData.nearest_fiber_fid_missing} onChange={(e) => handleChange("nearest_fiber_fid_missing", e.target.value)} filled={isFilled(formData.nearest_fiber_fid_missing)} />
                </FieldRow>
                <FieldRow label="FBT FID if Missing" wide>
                  <StyledInput value={formData.fbt_fid_missing} onChange={(e) => handleChange("fbt_fid_missing", e.target.value)} filled={isFilled(formData.fbt_fid_missing)} />
                </FieldRow>
                <FieldRow label="Possible Permits" wide>
                  <StyledTextarea value={formData.possible_permits} onChange={(e) => handleChange("possible_permits", e.target.value)} rows={3} filled={isFilled(formData.possible_permits)} />
                </FieldRow>
                <FieldRow label="Additional SOW notes" wide>
                  <StyledTextarea value={formData.additional_sow_notes} onChange={(e) => handleChange("additional_sow_notes", e.target.value)} rows={4} filled={isFilled(formData.additional_sow_notes)} />
                </FieldRow>
              </div>
            </Section>
          </TabsContent>

          {/* ========== TAB 3: SVCL OUTPUT ========== */}
          <TabsContent value="svcl-output" className="space-y-4" data-testid="content-svcl-output">
            
            {/* Site & Order */}
            <Section title="Site & Order">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Building Contact">
                  <StyledInput value={formData.building_contact} onChange={(e) => handleChange("building_contact", e.target.value)} filled={isFilled(formData.building_contact)} placeholder={formData.building_owner_contact || ""} />
                </FieldRow>
                <FieldRow label="Building Contact Email">
                  <StyledInput value={formData.building_contact_email} onChange={(e) => handleChange("building_contact_email", e.target.value)} filled={isFilled(formData.building_contact_email)} />
                </FieldRow>
                <FieldRow label="SOW Notes" wide>
                  <StyledTextarea value={formData.sow_notes} onChange={(e) => handleChange("sow_notes", e.target.value)} rows={3} filled={isFilled(formData.sow_notes)} />
                </FieldRow>
              </div>
            </Section>

            {/* Site Visit */}
            <Section title="Site Visit">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Date of Site Visit">
                  <StyledInput type="date" value={formData.date_of_site_visit} readOnly filled={isFilled(formData.date_of_site_visit)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Type of Site Visit">
                  <DropdownSelect value={formData.type_of_site_visit} onChange={(v) => handleChange("type_of_site_visit", v)} options={ASE_OPTIONS.siteVisitType} filled={isFilled(formData.type_of_site_visit)} />
                </FieldRow>
                <FieldRow label="Qualified Equipment">
                  <DropdownSelect value={formData.qualified_equipment} onChange={(v) => handleChange("qualified_equipment", v)} options={ASE_OPTIONS.qualifiedEquipment} filled={isFilled(formData.qualified_equipment)} />
                </FieldRow>
                <FieldRow label="Occupancy Type">
                  <StyledInput value={formData.occupancy_type} readOnly filled={isFilled(formData.occupancy_type)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Multi-Tenant">
                  <StyledInput value={isFilled(formData.number_of_business_units) ? (parseInt(formData.number_of_business_units) > 1 ? "YES" : "NO") : ""} readOnly filled={isFilled(formData.number_of_business_units)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Number of Tenants">
                  <StyledInput value={formData.number_of_business_units} readOnly filled={isFilled(formData.number_of_business_units)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Number of Floors in Building">
                  <StyledInput value={formData.number_of_floors} readOnly filled={isFilled(formData.number_of_floors)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Building Demarcation">
                  <StyledInput value={isFilled(formData.how_many_dmarcs) ? (parseInt(formData.how_many_dmarcs) === 1 ? "Single MPOE/Terminal" : "Multiple MPOE/Terminal") : ""} readOnly filled={isFilled(formData.how_many_dmarcs)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Disable NTE Auto-Assignment">
                  <StyledInput value={isFilled(formData.number_of_business_units) ? (parseInt(formData.number_of_business_units) > 1 ? "NO" : "YES") : ""} readOnly filled={isFilled(formData.number_of_business_units)} className="bg-zinc-50" />
                </FieldRow>
              </div>
            </Section>

            {/* Fiber Attributes Output */}
            <Section title="Fiber Attributes">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Existing INC">
                  <StyledInput value={formData.existing_inc} readOnly filled={isFilled(formData.existing_inc)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Fiber Riser (INC) required?">
                  <StyledInput value={formData.inc_required} readOnly filled={isFilled(formData.inc_required)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Existing Fiber Terminal">
                  <StyledInput value={formData.existing_fiber_terminal} readOnly filled={isFilled(formData.existing_fiber_terminal)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Fiber Terminal location">
                  <StyledInput value={formData.fiber_terminal_placement} readOnly filled={isFilled(formData.fiber_terminal_placement)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Fiber Terminal Floor">
                  <StyledInput value={formData.terminal_floor} readOnly filled={isFilled(formData.terminal_floor)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Fiber Terminal Aisle">
                  <StyledInput value={formData.terminal_mounting_wall} readOnly filled={isFilled(formData.terminal_mounting_wall)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Fiber Terminal Bay">
                  <StyledInput value={formData.terminal_rack_bay || "00"} readOnly filled className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Fiber Terminal Shelf">
                  <StyledInput value={formData.terminal_rack_shelf || "00"} readOnly filled className="bg-zinc-50" />
                </FieldRow>
              </div>
            </Section>

            {/* NTE Equipment Attributes Output */}
            <Section title="NTE Equipment Attributes">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Equipment Environment">
                  <StyledInput value={formData.nte_placement} readOnly filled={isFilled(formData.nte_placement)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment location">
                  <StyledInput value={isFilled(formData.nte_at_terminal) ? (formData.nte_at_terminal === "Terminal" ? "COMMON AREA/MPOE" : "SUITE") : ""} readOnly filled={isFilled(formData.nte_at_terminal)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment Mounting">
                  <StyledInput value={formData.nte_placement} readOnly filled={isFilled(formData.nte_placement)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment Power Configuration">
                  <StyledInput value={formData.equipment_power_config} readOnly filled={isFilled(formData.equipment_power_config)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment Floor">
                  <StyledInput value={formData.nte_floor} readOnly filled={isFilled(formData.nte_floor)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment Aisle">
                  <StyledInput value={formData.nte_mounting_wall} readOnly filled={isFilled(formData.nte_mounting_wall)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment Bay">
                  <StyledInput value={formData.nte_rack_bay || "00"} readOnly filled className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Equipment Shelf">
                  <StyledInput value={formData.nte_rack_shelf || "00"} readOnly filled className="bg-zinc-50" />
                </FieldRow>
              </div>
            </Section>

            {/* Multi Tenant Eligibility */}
            <Section title="Multi Tenant Eligibility (MTEI)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Multi-Tenant Eligibility">
                  <StyledInput value={isFilled(formData.proposed_nte_common_space) ? (formData.proposed_nte_common_space === "YES" ? "YES" : "NO") : ""} readOnly filled={isFilled(formData.proposed_nte_common_space)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Customer Handoff Panel Location">
                  <StyledInput value={formData.customer_handoff_panel_location} onChange={(e) => handleChange("customer_handoff_panel_location", e.target.value)} filled={isFilled(formData.customer_handoff_panel_location)} placeholder={isFilled(formData.nte_at_terminal) ? (formData.nte_at_terminal === "Terminal" ? "COMMON AREA/MPOE" : "SUITE") : ""} />
                </FieldRow>
                <FieldRow label="Est. Fiber Drop Length" note="MIN 10'">
                  <StyledInput value={formData.est_fiber_drop_length} onChange={(e) => handleChange("est_fiber_drop_length", e.target.value)} filled={isFilled(formData.est_fiber_drop_length)} placeholder={formData.distance_fbt_to_nte || ""} />
                </FieldRow>
                <FieldRow label="Router on Same Floor">
                  <StyledInput value={formData.it_same_floor_as_nte} readOnly filled={isFilled(formData.it_same_floor_as_nte)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Router Within 300 (ft)">
                  <StyledInput value={formData.distance_nte_to_it} readOnly filled={isFilled(formData.distance_nte_to_it)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Ceiling Height">
                  <StyledInput value={isFilled(formData.ceiling_height) ? (parseInt(formData.ceiling_height) < 10 ? "YES" : "NO") : ""} readOnly filled={isFilled(formData.ceiling_height)} className="bg-zinc-50" />
                </FieldRow>
              </div>
            </Section>

            {/* Site Requirements */}
            <Section title="Site Requirements">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Site Readiness Evaluation" wide>
                  <DropdownSelect value={formData.site_readiness_evaluation} onChange={(v) => handleChange("site_readiness_evaluation", v)} options={ASE_OPTIONS.siteReadiness} filled={isFilled(formData.site_readiness_evaluation)} />
                </FieldRow>
                <FieldRow label="EF Qualified">
                  <StyledInput value={formData.ef_qualified} readOnly filled={isFilled(formData.ef_qualified)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Customer EF Aware">
                  <YesNoSelect value={formData.customer_ef_aware} onChange={(v) => handleChange("customer_ef_aware", v)} filled={isFilled(formData.customer_ef_aware)} />
                </FieldRow>
                <FieldRow label="End User Acceptance">
                  <StyledInput value={isFilled(formData.ef_qualified) ? (formData.ef_qualified === "NO" ? "No - EF Offer Not Accepted" : "Yes - EF Offer Accepted") : ""} readOnly filled={isFilled(formData.ef_qualified)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="EF Owner or Tenant">
                  <StyledInput value={formData.owner_or_tenant} readOnly filled={isFilled(formData.owner_or_tenant)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="EF Conduit Length">
                  <StyledInput value={formData.placing_conduit_length} readOnly filled={isFilled(formData.placing_conduit_length)} className="bg-zinc-50" />
                </FieldRow>
                <FieldRow label="Other Requirements" wide>
                  <StyledTextarea 
                    value={isFilled(formData.employee_info) ? `NOTE: FOR ANY QUESTIONS CONCERNING YOUR SITE VISIT REQUIREMENTS IN THIS LETTER PLEASE CONTACT: ${formData.employee_info}` : ""} 
                    readOnly 
                    rows={2} 
                    filled={isFilled(formData.employee_info)} 
                    className="bg-zinc-50" 
                  />
                </FieldRow>
              </div>
            </Section>
          </TabsContent>
        </Tabs>

        {/* Save/Export buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving} variant="outline" className="h-11 px-6">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
          <Button onClick={handleExport} disabled={exporting} className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            ASE Export
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ASEForm;
