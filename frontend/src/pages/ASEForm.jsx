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
import { ArrowLeft, Save, FileSpreadsheet, Loader2, CheckCircle2, Camera, ClipboardList, Users, FileOutput } from "lucide-react";
import { MultiPhotoUpload } from "@/components/MultiPhotoUpload";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";

const BLANK = "__BLANK__";

// Dropdown options from ASE Excel template - Complete set
const ASE_OPTIONS = {
  yesNo: ["Yes", "No"],
  yesNoNA: ["Yes", "No", "N/A"],
  
  // Occupancy Types
  occupancyTypes: [
    "OFFICE", "RETAIL", "INDUSTRIAL", "HEALTHCARE", "GOVERNMENT", 
    "MULTI-FAMILY", "STRIP MALL", "SPORTS", "SPECIALTY", "LAND", 
    "CONSTRUCTION TRAILER", "Multi-Tenant", "COMMERCIAL"
  ],
  
  // Owner/Tenant
  ownerTenant: ["BUILDING OWNER", "TENANT"],
  
  // Equipment Environment  
  equipmentEnvironment: ["AC", "DC", "AC DUAL", "DC DUAL"],
  
  // Equipment Mounting
  equipmentMounting: [
    "OUTSIDE WALL MOUNT", "INSIDE WALL MOUNT", "DESK MOUNT(WALL MOUNT)", 
    "RACK", "PEDESTAL - (PSTL)", "HOFFMAN BOX", "H-FRAME"
  ],
  
  // Fiber Terminal Placement
  fiberTerminalPlacement: ["Terminal", "Elsewhere", "POLE", "HOFFMAN BOX", "H-FRAME"],
  
  // Mounting Wall
  mountingWall: ["Wall", "EXISTING", "NEW"],
  
  // Site Readiness
  siteReadiness: [
    "Site requirements needed for ONLY equipment",
    "No Site requirements - ready for fiber and/or equipment"
  ],
  
  // EF Conduit Length
  efConduitLength: ["UNDER 1000'", "OVER 1000'"],
  
  // EF Requirements
  efRequirements: ["IN PLACE", "NEEDED"],
  
  // Proposed Equipment
  proposedEquipment: ["CIENA 3903X OR EQUIVALENT", "RAD", "N/A"],
  
  // Type of Site Visit
  siteVisitType: ["Physical Qualified Equipment", "None Found"],
  
  // Ceiling Height
  ceilingHeight: ["UNDER 1000'", "OVER 1000'", "8'", "10'", "12'", "15'", "20'+"],
  
  // Timeframe
  timeframe: ["Limited to Weekdays", "Weekdays Only", "Weekends Available", "24/7 Access"],
  
  // NTE Location
  nteLocation: ["NTE at Terminal", "Another Location"],
  
  // Existing/New Location
  existingNewLocation: ["EXISTING", "NEW", "N/A"],
  
  // Router Floor
  routerFloor: ["Yes - Same Floor", "No - Different Floor"],
  
  // Router Distance
  routerDistance: ["Within 300'", "Over 300'"],
};

// Section component for consistent styling
const Section = ({ title, children, filledCount, totalCount }) => (
  <div className="industrial-card p-4 sm:p-5">
    <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-blue-600"></div>
        {title}
      </div>
      {totalCount > 0 && (
        <span className={`text-xs font-mono px-2 py-1 rounded ${
          filledCount === totalCount 
            ? 'bg-green-100 text-green-700' 
            : 'bg-amber-100 text-amber-700'
        }`}>
          {filledCount}/{totalCount} filled
        </span>
      )}
    </h2>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

// Field row component with fill status indicator
const FieldRow = ({ label, children, wide = false, filled = false }) => (
  <div className={`space-y-1 ${wide ? 'col-span-2' : ''}`}>
    <Label className={`text-xs font-mono uppercase flex items-center gap-1 ${
      filled ? 'text-green-600' : 'text-amber-600'
    }`}>
      {filled ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
      )}
      {label}
    </Label>
    {children}
  </div>
);

// Styled Input with fill status
const StyledInput = ({ value, onChange, className = "", ...props }) => (
  <Input 
    value={value} 
    onChange={onChange} 
    className={`h-10 border-zinc-300 ${
      value ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
    } ${className}`}
    {...props}
  />
);

// Styled Textarea with fill status  
const StyledTextarea = ({ value, onChange, className = "", ...props }) => (
  <Textarea 
    value={value} 
    onChange={onChange} 
    className={`border-zinc-300 ${
      value ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
    } ${className}`}
    {...props}
  />
);

// Field row with optional photo upload
const FieldRowWithPhoto = ({ label, children, wide = false, filled = false, photos = [], onPhotosChange, photoLabel }) => (
  <div className={`space-y-1 ${wide ? 'col-span-2' : ''}`}>
    <div className="flex items-center justify-between">
      <Label className={`text-xs font-mono uppercase flex items-center gap-1 ${
        filled ? 'text-green-600' : 'text-amber-600'
      }`}>
        {filled ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
        )}
        {label}
      </Label>
      {onPhotosChange && (
        <div className="flex items-center gap-1">
          <MultiPhotoUpload 
            label={photoLabel || label} 
            value={photos} 
            onChange={onPhotosChange}
            testId={`photo-${label.toLowerCase().replace(/\s+/g, '-')}`}
            compact
          />
        </div>
      )}
    </div>
    {children}
  </div>
);

// Dropdown select component with fill status
const DropdownSelect = ({ value, onChange, options, placeholder = "Select...", testId }) => (
  <Select value={value || ""} onValueChange={onChange}>
    <SelectTrigger 
      className={`h-10 border-zinc-300 text-zinc-900 ${
        value && value !== BLANK ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
      }`} 
      data-testid={testId}
    >
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
      <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
      {options.map((opt) => (
        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

// YesNo Select component
const YesNoSelect = ({ value, onChange, testId }) => (
  <Select value={value || ""} onValueChange={onChange}>
    <SelectTrigger 
      className={`h-10 border-zinc-300 text-zinc-900 ${
        value && value !== BLANK ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
      }`}
      data-testid={testId}
    >
      <SelectValue placeholder="Select..." />
    </SelectTrigger>
    <SelectContent className="bg-zinc-50 border-zinc-300">
      <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
      <SelectItem value="Yes">Yes</SelectItem>
      <SelectItem value="No">No</SelectItem>
    </SelectContent>
  </Select>
);

const ASEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [underground, setUnderground] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // ASE Form Data - Complete field set
  const [formData, setFormData] = useState({
    // Employee Info Section
    date_of_site_visit: "",
    assigned_att_eng: "",
    site_walked_by: "",
    site_walked_with: "",
    type_of_site_visit: "",
    
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
    limited_to_weekdays: "",
    timeframe: "",
    
    // BIDI Retrofit Section
    bidi_retrofit_qualify: "",
    bidi_spoke_to: "",
    bidi_agreed_date: "",
    bidi_access_notes: "",
    
    // Building Characteristics
    occupancy_type: "",
    number_of_floors: "",
    number_of_business_units: "",
    number_of_tenants: "",
    how_many_dmarcs: "",
    additional_dmarcs_location: "",
    owner_or_tenant: "",
    multi_tenant: "",
    ceiling_height: "",
    proposed_nte_common_space: "",
    
    // Fiber Attributes
    fiber_at_site: "",
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
    terminal_bay: "",
    terminal_shelf: "",
    nearest_fiber_lat_long: "",
    nearest_fiber_fid: "",
    fbt_fid_if_missing: "",
    
    // NTE Equipment Attributes
    existing_nte_emts_at_site: "",
    existing_nte: "",
    nte_placement: "",
    nte_active_ports: "",
    nte_clli: "",
    nte_ports_band_ava: "",
    nte_not_using_due_to: "",
    nte_at_terminal: "",
    nte_location_description: "",
    nte_lat_long: "",
    nte_floor: "",
    nte_mounting_wall: "",
    nte_rack_bay_shelf: "",
    nte_bay: "",
    nte_shelf: "",
    equipment_environment: "",
    equipment_mounting: "",
    equipment_power_config: "",
    distance_fbt_to_nte: "",
    distance_nte_to_it: "",
    it_same_floor_as_nte: "",
    router_within_300ft: "",
    proposed_equipment: "",
    proposed_equipment_location: "",
    proposed_equipment_lat_long: "",
    
    // Path of Approach
    path_of_approach: "",
    starting_tie_in_measurements: "",
    proposed_location: "",
    soc_pole_line_start: "",
    soc_pole_line_end: "",
    soc_start_lat_long: "",
    soc_end_lat_long: "",
    proposed_pole_and_bldg: "",
    
    // EF Offer/Requirements
    ef_requirements: "",
    ef_offer: "",
    ef_offer_accepted: "",
    ef_needed: "",
    ef_qualified: "",
    customer_ef_aware: "",
    end_user_acceptance: "",
    ef_disqualification_reason: "",
    placing_conduit_length: "",
    ef_conduit_length: "",
    
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
    hoffman_box_qty: "",
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
    
    // Multi Tenant Eligibility
    multi_tenant_eligibility: "",
    customer_handoff_panel_location: "",
    est_fiber_drop_length: "",
    
    // Additional Info
    pipelines_vicinity: "",
    pipelines_path: "",
    railroads_vicinity: "",
    railroads_path: "",
    possible_permits: "",
    row_measurements: "",
    other_notes: "",
    additional_sow_notes: "",
    site_order_sow_notes: "",
    
    // Multiple MPOE
    multiple_mpoe_terminal: "",
    
    // Photo fields - arrays of URLs
    address_photos: [],
    access_contact_photos: [],
    spf_contact_photos: [],
    existing_inc_photos: [],
    existing_fiber_terminal_photos: [],
    fiber_terminal_placement_photos: [],
    fiber_active_ports_photos: [],
    fiber_reading_photos: [],
    existing_nte_photos: [],
    nte_placement_photos: [],
    nte_clli_photos: [],
    nte_rack_bay_shelf_photos: [],
    equipment_power_config_photos: [],
    pole_line_start_photos: [],
    pole_line_end_photos: [],
    soc_start_photos: [],
    soc_end_photos: [],
    pipelines_vicinity_photos: [],
    pipelines_path_photos: [],
    railroads_vicinity_photos: [],
    railroads_path_photos: [],
    
    // Markup photos - for annotated photos
    markup_photos: [],
  });

  // Helper function to check if a field is filled
  const isFilled = (value) => {
    return value !== "" && value !== null && value !== undefined && value !== BLANK;
  };

  // Count filled fields in a section
  const countFilledFields = (fields) => {
    return fields.filter(f => isFilled(formData[f])).length;
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
      
      // Auto-populate fields from job data (poles and underground items)
      const jobData = jobRes.data;
      const polesData = polesRes.data || [];
      const ugData = undergroundRes.data || [];
      
      setFormData(prev => {
        const updated = { ...prev };
        
        // ========== ADDRESS / LOCATION ==========
        // Auto-fill address from job location if not set
        if (!updated.address && jobData.location) {
          updated.address = jobData.location;
        }
        
        // ========== POLE DATA ==========
        if (polesData.length > 0) {
          const firstPole = polesData[0];
          const lastPole = polesData[polesData.length - 1];
          
          // Pole line start/end coordinates
          if (!updated.soc_pole_line_start && firstPole.latitude && firstPole.longitude) {
            updated.soc_pole_line_start = `${firstPole.latitude}, ${firstPole.longitude}`;
          }
          if (!updated.soc_pole_line_end && lastPole.latitude && lastPole.longitude) {
            updated.soc_pole_line_end = `${lastPole.latitude}, ${lastPole.longitude}`;
          }
          
          // Calculate total span distance from poles
          let totalSpanDistance = 0;
          polesData.forEach(pole => {
            if (pole.span1_distance) totalSpanDistance += parseFloat(pole.span1_distance) || 0;
            if (pole.span2_distance) totalSpanDistance += parseFloat(pole.span2_distance) || 0;
            if (pole.span3_distance) totalSpanDistance += parseFloat(pole.span3_distance) || 0;
            if (pole.span4_distance) totalSpanDistance += parseFloat(pole.span4_distance) || 0;
          });
          
          // Auto-populate proposed pole and building info
          if (!updated.proposed_pole_and_bldg && polesData.length > 0) {
            const poleNumbers = polesData.map(p => p.pole_number).filter(Boolean).join(", ");
            if (poleNumbers) {
              updated.proposed_pole_and_bldg = `Poles: ${poleNumbers}`;
            }
          }
          
          // Count risers on poles
          const risersCount = polesData.filter(p => p.risers && parseInt(p.risers) > 0).length;
          
          // Calculate starting tie-in measurements from first pole spans
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
        }
        
        // ========== UNDERGROUND DATA ==========
        // Track counts of underground equipment
        const ugCounts = {
          handhole: 0,
          manhole: 0,
          pullbox: 0,
          hoffmanBox: 0,
          pedestal: 0,
          fbt: 0,
          nte: 0,
          riser: 0
        };
        
        ugData.forEach(item => {
          const itemType = item.type?.toLowerCase() || '';
          
          // Count equipment types
          if (itemType.includes('handhole')) ugCounts.handhole++;
          if (itemType.includes('manhole')) ugCounts.manhole++;
          if (itemType === 'pullbox' || itemType.includes('pullbox')) ugCounts.pullbox++;
          if (itemType.includes('hoffman')) ugCounts.hoffmanBox++;
          if (itemType.includes('pedestal')) ugCounts.pedestal++;
          if (itemType === 'riser') ugCounts.riser++;
          
          // FBT - Fiber Terminal data
          if (item.type === 'FBT' || item.type === 'FBT/NTE') {
            ugCounts.fbt++;
            if (!updated.fiber_terminal_lat_long && item.latitude && item.longitude) {
              updated.fiber_terminal_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            if (!updated.fiber_at_site) {
              updated.fiber_at_site = "Yes";
            }
            if (!updated.existing_fiber_terminal) {
              updated.existing_fiber_terminal = "Yes";
            }
            // Fiber terminal placement based on type
            if (!updated.fiber_terminal_placement && item.type === 'FBT') {
              updated.fiber_terminal_placement = "Terminal";
            }
            // Use notes as terminal location description
            if (!updated.terminal_location_description && item.notes) {
              updated.terminal_location_description = item.notes;
            }
          }
          
          // NTE - Network Termination Equipment data
          if (item.type === 'NTE' || item.type === 'FBT/NTE') {
            ugCounts.nte++;
            if (!updated.nte_lat_long && item.latitude && item.longitude) {
              updated.nte_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            if (!updated.existing_nte_emts_at_site) {
              updated.existing_nte_emts_at_site = "Yes";
            }
            if (!updated.existing_nte) {
              updated.existing_nte = "Yes";
            }
            // Use notes as NTE location description
            if (!updated.nte_location_description && item.notes) {
              updated.nte_location_description = item.notes;
            }
          }
          
          // SOC Start/End coordinates
          if (item.type === 'SOC Start') {
            if (!updated.soc_start_lat_long && item.latitude && item.longitude) {
              updated.soc_start_lat_long = `${item.latitude}, ${item.longitude}`;
            }
          }
          if (item.type === 'SOC End') {
            if (!updated.soc_end_lat_long && item.latitude && item.longitude) {
              updated.soc_end_lat_long = `${item.latitude}, ${item.longitude}`;
            }
          }
          
          // MPOE data
          if (item.type === 'MPOE') {
            if (!updated.mpoe_address && item.notes) {
              updated.mpoe_address = item.notes;
            }
            if (!updated.how_many_dmarcs) {
              updated.how_many_dmarcs = "1";
            }
          }
          
          // PFP - Primary Flexibility Point
          if (item.type === 'PFP') {
            if (!updated.nearest_fiber_lat_long && item.latitude && item.longitude) {
              updated.nearest_fiber_lat_long = `${item.latitude}, ${item.longitude}`;
            }
          }
          
          // Riser
          if (item.type === 'Riser') {
            if (!updated.proposed_equipment_lat_long && item.latitude && item.longitude) {
              updated.proposed_equipment_lat_long = `${item.latitude}, ${item.longitude}`;
            }
          }
          
          // Hoffman Box - auto-fill need_hoffman_box
          if (item.type === 'Hoffman Box') {
            if (!updated.need_hoffman_box) {
              updated.need_hoffman_box = "Yes";
            }
          }
          
          // Pedestal
          if (item.type === 'Pedestal') {
            if (!updated.equipment_mounting) {
              updated.equipment_mounting = "PEDESTAL - (PSTL)";
            }
          }
        });
        
        // Auto-fill EF requirements based on underground counts
        if (ugCounts.pullbox > 0 && !updated.need_pullbox) {
          updated.need_pullbox = "Yes";
          updated.pullbox_qty = String(ugCounts.pullbox);
        }
        if (ugCounts.hoffmanBox > 0 && !updated.need_hoffman_box) {
          updated.need_hoffman_box = "Yes";
          updated.hoffman_box_qty = String(ugCounts.hoffmanBox);
        }
        
        // ========== PATH OF APPROACH ==========
        // Generate path of approach description from underground items
        if (!updated.path_of_approach && ugData.length > 0) {
          const pathItems = ugData.map(item => {
            if (item.label) {
              return `${item.type} (${item.label})`;
            }
            return item.type;
          }).join(" → ");
          if (pathItems) {
            updated.path_of_approach = `Underground path: ${pathItems}`;
          }
        }
        
        // ========== PROPOSED LOCATION ==========
        // Generate proposed location from job and items
        if (!updated.proposed_location && jobData.location) {
          updated.proposed_location = jobData.location;
        }
        
        // ========== DISTANCE CALCULATIONS ==========
        // Calculate distance from FBT to NTE if both exist
        const fbtItem = ugData.find(i => i.type === 'FBT' || i.type === 'FBT/NTE');
        const nteItem = ugData.find(i => i.type === 'NTE' || (i.type === 'FBT/NTE' && fbtItem?.id !== i.id));
        
        if (fbtItem && nteItem && !updated.distance_fbt_to_nte) {
          if (fbtItem.latitude && fbtItem.longitude && nteItem.latitude && nteItem.longitude) {
            const dist = calculateDistance(
              fbtItem.latitude, fbtItem.longitude,
              nteItem.latitude, nteItem.longitude
            );
            if (dist > 0) {
              updated.distance_fbt_to_nte = `${Math.round(dist)} ft`;
            }
          }
        }
        
        // If FBT and NTE are same item (FBT/NTE), they're co-located
        if (ugData.some(i => i.type === 'FBT/NTE') && !updated.nte_at_terminal) {
          updated.nte_at_terminal = "Terminal";
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
  
  // Helper function to calculate distance between two GPS coordinates in feet
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 20902231; // Earth's radius in feet
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

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

  // Field groups for counting
  const employeeInfoFields = ['date_of_site_visit', 'assigned_att_eng', 'site_walked_by', 'site_walked_with', 'type_of_site_visit'];
  const addressFields = ['address', 'mpoe_address', 'suite_bldg'];
  const accessFields = ['access_contact', 'building_owner_contact', 'spf_required', 'spf_contact', 'access_notes', 'timeframe'];
  const bidiFields = ['bidi_retrofit_qualify', 'bidi_spoke_to', 'bidi_agreed_date', 'bidi_access_notes'];
  const buildingFields = ['occupancy_type', 'number_of_floors', 'number_of_business_units', 'how_many_dmarcs', 'additional_dmarcs_location', 'owner_or_tenant', 'multi_tenant', 'ceiling_height'];
  const fiberFields = ['fiber_at_site', 'existing_inc', 'inc_required', 'existing_fiber_terminal', 'fiber_terminal_placement', 'fiber_terminal_lat_long', 'fiber_terminal_fid', 'fiber_active_ports', 'fiber_reading', 'terminal_location_description', 'terminal_floor', 'terminal_mounting_wall', 'nearest_fiber_lat_long', 'nearest_fiber_fid'];
  const nteFields = ['existing_nte_emts_at_site', 'existing_nte', 'nte_placement', 'nte_active_ports', 'nte_clli', 'nte_at_terminal', 'nte_location_description', 'nte_lat_long', 'nte_floor', 'nte_mounting_wall', 'equipment_environment', 'equipment_mounting', 'equipment_power_config', 'distance_fbt_to_nte', 'distance_nte_to_it', 'it_same_floor_as_nte', 'proposed_equipment', 'proposed_equipment_location'];
  const pathFields = ['path_of_approach', 'starting_tie_in_measurements', 'proposed_location', 'soc_pole_line_start', 'soc_pole_line_end', 'soc_start_lat_long', 'soc_end_lat_long'];
  const efOfferFields = ['ef_requirements', 'ef_needed', 'ef_qualified', 'customer_ef_aware', 'ef_disqualification_reason', 'placing_conduit_length'];
  const efDetailFields = ['buried_pvc', 'buried_innerduct', 'need_emt', 'need_plenum', 'need_core_drill', 'need_eyebolt', 'need_pullbox', 'need_hoffman_box', 'need_backboard', 'need_outlet', 'need_groundbar'];
  const siteReqFields = ['site_readiness_evaluation', 'site_requirements_provided', 'grounding_system', 'building_power_source'];
  const additionalFields = ['pipelines_vicinity', 'pipelines_path', 'railroads_vicinity', 'railroads_path', 'possible_permits', 'row_measurements', 'other_notes', 'additional_sow_notes'];

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
        
        {/* 3-Tab Structure */}
        <Tabs defaultValue="ase-checklist" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-zinc-100 p-1 rounded-lg">
            <TabsTrigger 
              value="ase-checklist" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700"
              data-testid="tab-ase-checklist"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline" aria-hidden="true">ASE Cklist</span>
              <span className="sm:hidden" aria-hidden="true">Cklist</span>
              <span className="sr-only">ASE Checklist</span>
            </TabsTrigger>
            <TabsTrigger 
              value="coordinator-input" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-green-700"
              data-testid="tab-coordinator-input"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline" aria-hidden="true">Coordinator Input</span>
              <span className="sm:hidden" aria-hidden="true">Coord</span>
              <span className="sr-only">Coordinator Input</span>
            </TabsTrigger>
            <TabsTrigger 
              value="svcl-output" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-purple-700"
              data-testid="tab-svcl-output"
            >
              <FileOutput className="w-4 h-4" />
              <span className="hidden sm:inline" aria-hidden="true">SVCL Output</span>
              <span className="sm:hidden" aria-hidden="true">SVCL</span>
              <span className="sr-only">SVCL Output</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: ASE CHECKLIST */}
          <TabsContent value="ase-checklist" className="space-y-6" data-testid="content-ase-checklist">
            {/* Employee Info */}
            <Section title="EMPLOYEE INFO" filledCount={countFilledFields(employeeInfoFields)} totalCount={employeeInfoFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Date of Site Visit" filled={isFilled(formData.date_of_site_visit)}>
                  <StyledInput type="date" value={formData.date_of_site_visit} onChange={(e) => handleChange("date_of_site_visit", e.target.value)} />
                </FieldRow>
                <FieldRow label="Type of Site Visit" filled={isFilled(formData.type_of_site_visit)}>
                  <DropdownSelect value={formData.type_of_site_visit} onChange={(v) => handleChange("type_of_site_visit", v)} options={ASE_OPTIONS.siteVisitType} />
                </FieldRow>
                <FieldRow label="Assigned AT&T Engineer" filled={isFilled(formData.assigned_att_eng)}>
                  <StyledInput value={formData.assigned_att_eng} onChange={(e) => handleChange("assigned_att_eng", e.target.value)} />
                </FieldRow>
                <FieldRow label="Site Walked By" filled={isFilled(formData.site_walked_by)}>
                  <StyledInput value={formData.site_walked_by} onChange={(e) => handleChange("site_walked_by", e.target.value)} />
                </FieldRow>
                <FieldRow label="Site Walked With" filled={isFilled(formData.site_walked_with)}>
                  <StyledInput value={formData.site_walked_with} onChange={(e) => handleChange("site_walked_with", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* Address Information */}
            <Section title="ADDRESS INFORMATION" filledCount={countFilledFields(addressFields)} totalCount={addressFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRowWithPhoto label="Address" wide filled={isFilled(formData.address)} photos={formData.address_photos} onPhotosChange={(v) => handleChange("address_photos", v)}>
                  <StyledInput value={formData.address} onChange={(e) => handleChange("address", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRow label="MPOE Address" filled={isFilled(formData.mpoe_address)}>
                  <StyledInput value={formData.mpoe_address} onChange={(e) => handleChange("mpoe_address", e.target.value)} />
                </FieldRow>
                <FieldRow label="Suite &/or Bldg #" filled={isFilled(formData.suite_bldg)}>
                  <StyledInput value={formData.suite_bldg} onChange={(e) => handleChange("suite_bldg", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* Access/Customer Information */}
            <Section title="ACCESS/CUSTOMER INFORMATION" filledCount={countFilledFields(accessFields)} totalCount={accessFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRowWithPhoto label="Access Contact Name & Phone/Email" wide filled={isFilled(formData.access_contact)} photos={formData.access_contact_photos} onPhotosChange={(v) => handleChange("access_contact_photos", v)}>
                  <StyledInput value={formData.access_contact} onChange={(e) => handleChange("access_contact", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRow label="Building Owner Name & Phone/Email" wide filled={isFilled(formData.building_owner_contact)}>
                  <StyledInput value={formData.building_owner_contact} onChange={(e) => handleChange("building_owner_contact", e.target.value)} />
                </FieldRow>
                <FieldRow label="SPF Required?" filled={isFilled(formData.spf_required)}>
                  <YesNoSelect value={formData.spf_required} onChange={(v) => handleChange("spf_required", v)} />
                </FieldRow>
                <FieldRowWithPhoto label="SPF Contact Name & Phone/Email" filled={isFilled(formData.spf_contact)} photos={formData.spf_contact_photos} onPhotosChange={(v) => handleChange("spf_contact_photos", v)}>
                  <StyledInput value={formData.spf_contact} onChange={(e) => handleChange("spf_contact", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRow label="Timeframe / Access Hours" filled={isFilled(formData.timeframe)}>
                  <DropdownSelect value={formData.timeframe} onChange={(v) => handleChange("timeframe", v)} options={ASE_OPTIONS.timeframe} />
                </FieldRow>
                <FieldRow label="Access Notes/Special Instructions" wide filled={isFilled(formData.access_notes)}>
                  <StyledTextarea value={formData.access_notes} onChange={(e) => handleChange("access_notes", e.target.value)} rows={2} />
                </FieldRow>
              </div>
            </Section>

            {/* Building Characteristics */}
            <Section title="BUILDING CHARACTERISTICS" filledCount={countFilledFields(buildingFields)} totalCount={buildingFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Occupancy Type" filled={isFilled(formData.occupancy_type)}>
                  <DropdownSelect value={formData.occupancy_type} onChange={(v) => handleChange("occupancy_type", v)} options={ASE_OPTIONS.occupancyTypes} />
                </FieldRow>
                <FieldRow label="Number of Floors" filled={isFilled(formData.number_of_floors)}>
                  <StyledInput value={formData.number_of_floors} onChange={(e) => handleChange("number_of_floors", e.target.value)} />
                </FieldRow>
                <FieldRow label="Number of Business Units" filled={isFilled(formData.number_of_business_units)}>
                  <StyledInput value={formData.number_of_business_units} onChange={(e) => handleChange("number_of_business_units", e.target.value)} />
                </FieldRow>
                <FieldRow label="Number of Tenants" filled={isFilled(formData.number_of_tenants)}>
                  <StyledInput value={formData.number_of_tenants} onChange={(e) => handleChange("number_of_tenants", e.target.value)} />
                </FieldRow>
                <FieldRow label="How many DMARCs?" filled={isFilled(formData.how_many_dmarcs)}>
                  <StyledInput value={formData.how_many_dmarcs} onChange={(e) => handleChange("how_many_dmarcs", e.target.value)} />
                </FieldRow>
                <FieldRow label="If additional DMARCs, where are they?" filled={isFilled(formData.additional_dmarcs_location)}>
                  <StyledInput value={formData.additional_dmarcs_location} onChange={(e) => handleChange("additional_dmarcs_location", e.target.value)} />
                </FieldRow>
                <FieldRow label="Is Customer Building Owner or Tenant?" filled={isFilled(formData.owner_or_tenant)}>
                  <DropdownSelect value={formData.owner_or_tenant} onChange={(v) => handleChange("owner_or_tenant", v)} options={ASE_OPTIONS.ownerTenant} />
                </FieldRow>
                <FieldRow label="Multi-Tenant" filled={isFilled(formData.multi_tenant)}>
                  <YesNoSelect value={formData.multi_tenant} onChange={(v) => handleChange("multi_tenant", v)} />
                </FieldRow>
                <FieldRow label="Ceiling Height" filled={isFilled(formData.ceiling_height)}>
                  <DropdownSelect value={formData.ceiling_height} onChange={(v) => handleChange("ceiling_height", v)} options={ASE_OPTIONS.ceilingHeight} />
                </FieldRow>
                <FieldRow label="Is proposed NTE in a common space that can serve multiple tenants?" wide filled={isFilled(formData.proposed_nte_common_space)}>
                  <YesNoSelect value={formData.proposed_nte_common_space} onChange={(v) => handleChange("proposed_nte_common_space", v)} />
                </FieldRow>
              </div>
            </Section>

            {/* BIDI Retrofit */}
            <Section title="BIDI RETROFIT" filledCount={countFilledFields(bidiFields)} totalCount={bidiFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Does This Qualify for BIDI Retrofit?" filled={isFilled(formData.bidi_retrofit_qualify)}>
                  <YesNoSelect value={formData.bidi_retrofit_qualify} onChange={(v) => handleChange("bidi_retrofit_qualify", v)} />
                </FieldRow>
                <FieldRow label="Did you speak to regarding Retrofit work?" filled={isFilled(formData.bidi_spoke_to)}>
                  <StyledInput value={formData.bidi_spoke_to} onChange={(e) => handleChange("bidi_spoke_to", e.target.value)} />
                </FieldRow>
                <FieldRow label="What date was agreed to?" filled={isFilled(formData.bidi_agreed_date)}>
                  <StyledInput type="date" value={formData.bidi_agreed_date} onChange={(e) => handleChange("bidi_agreed_date", e.target.value)} />
                </FieldRow>
                <FieldRow label="BIDI Access Notes/Special Instructions" wide filled={isFilled(formData.bidi_access_notes)}>
                  <StyledTextarea value={formData.bidi_access_notes} onChange={(e) => handleChange("bidi_access_notes", e.target.value)} rows={2} />
                </FieldRow>
              </div>
            </Section>

            {/* Mark Ups Section with Photo Editor */}
            <Section title="MARK UPS" filledCount={formData.markup_photos?.length || 0} totalCount={1}>
              <PhotoMarkupEditor 
                photos={formData.markup_photos || []} 
                onChange={(v) => handleChange("markup_photos", v)}
                label="Mark Ups"
              />
              <p className="text-xs text-zinc-500 mt-2">
                Upload photos and add lines (multiple colors), underground markers, shapes, and text notes using the in-app editor.
              </p>
            </Section>
          </TabsContent>

          {/* TAB 2: COORDINATOR INPUT */}
          <TabsContent value="coordinator-input" className="space-y-6" data-testid="content-coordinator-input">
            {/* Fiber Attributes */}
            <Section title="FIBER ATTRIBUTES" filledCount={countFilledFields(fiberFields)} totalCount={fiberFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Fiber at Site?" filled={isFilled(formData.fiber_at_site)}>
                  <YesNoSelect value={formData.fiber_at_site} onChange={(v) => handleChange("fiber_at_site", v)} />
                </FieldRow>
                <FieldRowWithPhoto label="Existing INC" filled={isFilled(formData.existing_inc)} photos={formData.existing_inc_photos} onPhotosChange={(v) => handleChange("existing_inc_photos", v)}>
                  <YesNoSelect value={formData.existing_inc} onChange={(v) => handleChange("existing_inc", v)} />
                </FieldRowWithPhoto>
                <FieldRow label="INC Required" filled={isFilled(formData.inc_required)}>
                  <YesNoSelect value={formData.inc_required} onChange={(v) => handleChange("inc_required", v)} />
                </FieldRow>
                <FieldRowWithPhoto label="Existing Fiber Terminal" filled={isFilled(formData.existing_fiber_terminal)} photos={formData.existing_fiber_terminal_photos} onPhotosChange={(v) => handleChange("existing_fiber_terminal_photos", v)}>
                  <YesNoSelect value={formData.existing_fiber_terminal} onChange={(v) => handleChange("existing_fiber_terminal", v)} />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="Fiber Terminal Placement" filled={isFilled(formData.fiber_terminal_placement)} photos={formData.fiber_terminal_placement_photos} onPhotosChange={(v) => handleChange("fiber_terminal_placement_photos", v)}>
                  <DropdownSelect value={formData.fiber_terminal_placement} onChange={(v) => handleChange("fiber_terminal_placement", v)} options={ASE_OPTIONS.fiberTerminalPlacement} />
                </FieldRowWithPhoto>
                <FieldRow label="LAT/LONG of Existing/New FBT" filled={isFilled(formData.fiber_terminal_lat_long)}>
                  <StyledInput value={formData.fiber_terminal_lat_long} onChange={(e) => handleChange("fiber_terminal_lat_long", e.target.value)} placeholder="Auto-filled from Underground markers" />
                </FieldRow>
                <FieldRow label="Fiber Terminal FID" filled={isFilled(formData.fiber_terminal_fid)}>
                  <StyledInput value={formData.fiber_terminal_fid} onChange={(e) => handleChange("fiber_terminal_fid", e.target.value)} />
                </FieldRow>
                <FieldRow label="FBT FID if Missing" filled={isFilled(formData.fbt_fid_if_missing)}>
                  <StyledInput value={formData.fbt_fid_if_missing} onChange={(e) => handleChange("fbt_fid_if_missing", e.target.value)} />
                </FieldRow>
                <FieldRowWithPhoto label="Active Ports" filled={isFilled(formData.fiber_active_ports)} photos={formData.fiber_active_ports_photos} onPhotosChange={(v) => handleChange("fiber_active_ports_photos", v)}>
                  <StyledInput value={formData.fiber_active_ports} onChange={(e) => handleChange("fiber_active_ports", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="Fiber Reading" filled={isFilled(formData.fiber_reading)} photos={formData.fiber_reading_photos} onPhotosChange={(v) => handleChange("fiber_reading_photos", v)}>
                  <StyledInput value={formData.fiber_reading} onChange={(e) => handleChange("fiber_reading", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRow label="Describe Existing/Proposed Terminal Location" wide filled={isFilled(formData.terminal_location_description)}>
                  <StyledTextarea value={formData.terminal_location_description} onChange={(e) => handleChange("terminal_location_description", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRow label="Terminal Floor #" filled={isFilled(formData.terminal_floor)}>
                  <StyledInput value={formData.terminal_floor} onChange={(e) => handleChange("terminal_floor", e.target.value)} />
                </FieldRow>
                <FieldRow label="Mounting Wall" filled={isFilled(formData.terminal_mounting_wall)}>
                  <DropdownSelect value={formData.terminal_mounting_wall} onChange={(v) => handleChange("terminal_mounting_wall", v)} options={ASE_OPTIONS.mountingWall} />
                </FieldRow>
                <FieldRow label="Terminal Rack Bay/Shelf" filled={isFilled(formData.terminal_rack_bay_shelf)}>
                  <StyledInput value={formData.terminal_rack_bay_shelf} onChange={(e) => handleChange("terminal_rack_bay_shelf", e.target.value)} />
                </FieldRow>
                <FieldRow label="LAT/LONG of Nearest Fiber" filled={isFilled(formData.nearest_fiber_lat_long)}>
                  <StyledInput value={formData.nearest_fiber_lat_long} onChange={(e) => handleChange("nearest_fiber_lat_long", e.target.value)} />
                </FieldRow>
                <FieldRow label="Nearest Fiber FID" filled={isFilled(formData.nearest_fiber_fid)}>
                  <StyledInput value={formData.nearest_fiber_fid} onChange={(e) => handleChange("nearest_fiber_fid", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* NTE Equipment Attributes */}
            <Section title="NTE - EQUIPMENT ATTRIBUTES" filledCount={countFilledFields(nteFields)} totalCount={nteFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Existing NTE/EMTs @ Site?" filled={isFilled(formData.existing_nte_emts_at_site)}>
                  <YesNoSelect value={formData.existing_nte_emts_at_site} onChange={(v) => handleChange("existing_nte_emts_at_site", v)} />
                </FieldRow>
                <FieldRowWithPhoto label="Existing NTE" filled={isFilled(formData.existing_nte)} photos={formData.existing_nte_photos} onPhotosChange={(v) => handleChange("existing_nte_photos", v)}>
                  <YesNoSelect value={formData.existing_nte} onChange={(v) => handleChange("existing_nte", v)} />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="NTE Placement" filled={isFilled(formData.nte_placement)} photos={formData.nte_placement_photos} onPhotosChange={(v) => handleChange("nte_placement_photos", v)}>
                  <DropdownSelect value={formData.nte_placement} onChange={(v) => handleChange("nte_placement", v)} options={ASE_OPTIONS.existingNewLocation} />
                </FieldRowWithPhoto>
                <FieldRow label="NTE Active Ports" filled={isFilled(formData.nte_active_ports)}>
                  <StyledInput value={formData.nte_active_ports} onChange={(e) => handleChange("nte_active_ports", e.target.value)} />
                </FieldRow>
                <FieldRowWithPhoto label="NTE CLLI" filled={isFilled(formData.nte_clli)} photos={formData.nte_clli_photos} onPhotosChange={(v) => handleChange("nte_clli_photos", v)}>
                  <StyledInput value={formData.nte_clli} onChange={(e) => handleChange("nte_clli", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRow label="Ports/Band Available" filled={isFilled(formData.nte_ports_band_ava)}>
                  <StyledInput value={formData.nte_ports_band_ava} onChange={(e) => handleChange("nte_ports_band_ava", e.target.value)} />
                </FieldRow>
                <FieldRow label="Not Using Due To" filled={isFilled(formData.nte_not_using_due_to)}>
                  <StyledInput value={formData.nte_not_using_due_to} onChange={(e) => handleChange("nte_not_using_due_to", e.target.value)} />
                </FieldRow>
                <FieldRow label="NTE at Terminal or Another Location?" filled={isFilled(formData.nte_at_terminal)}>
                  <DropdownSelect value={formData.nte_at_terminal} onChange={(v) => handleChange("nte_at_terminal", v)} options={ASE_OPTIONS.nteLocation} />
                </FieldRow>
                <FieldRow label="Describe Existing/Proposed NTE Location" wide filled={isFilled(formData.nte_location_description)}>
                  <StyledTextarea value={formData.nte_location_description} onChange={(e) => handleChange("nte_location_description", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRow label="NTE LAT/LONG" filled={isFilled(formData.nte_lat_long)}>
                  <StyledInput value={formData.nte_lat_long} onChange={(e) => handleChange("nte_lat_long", e.target.value)} placeholder="Auto-filled from Underground markers" />
                </FieldRow>
                <FieldRow label="NTE Floor #" filled={isFilled(formData.nte_floor)}>
                  <StyledInput value={formData.nte_floor} onChange={(e) => handleChange("nte_floor", e.target.value)} />
                </FieldRow>
                <FieldRow label="NTE Mounting Wall" filled={isFilled(formData.nte_mounting_wall)}>
                  <DropdownSelect value={formData.nte_mounting_wall} onChange={(v) => handleChange("nte_mounting_wall", v)} options={ASE_OPTIONS.mountingWall} />
                </FieldRow>
                <FieldRowWithPhoto label="NTE Rack Bay/Shelf" filled={isFilled(formData.nte_rack_bay_shelf)} photos={formData.nte_rack_bay_shelf_photos} onPhotosChange={(v) => handleChange("nte_rack_bay_shelf_photos", v)}>
                  <StyledInput value={formData.nte_rack_bay_shelf} onChange={(e) => handleChange("nte_rack_bay_shelf", e.target.value)} />
                </FieldRowWithPhoto>
                <FieldRow label="Equipment Environment" filled={isFilled(formData.equipment_environment)}>
                  <DropdownSelect value={formData.equipment_environment} onChange={(v) => handleChange("equipment_environment", v)} options={ASE_OPTIONS.equipmentEnvironment} />
                </FieldRow>
                <FieldRow label="Equipment Mounting" filled={isFilled(formData.equipment_mounting)}>
                  <DropdownSelect value={formData.equipment_mounting} onChange={(v) => handleChange("equipment_mounting", v)} options={ASE_OPTIONS.equipmentMounting} />
                </FieldRow>
                <FieldRowWithPhoto label="Equipment Power Configuration" filled={isFilled(formData.equipment_power_config)} photos={formData.equipment_power_config_photos} onPhotosChange={(v) => handleChange("equipment_power_config_photos", v)}>
                  <DropdownSelect value={formData.equipment_power_config} onChange={(v) => handleChange("equipment_power_config", v)} options={ASE_OPTIONS.equipmentEnvironment} />
                </FieldRowWithPhoto>
                <FieldRow label="Distance From FBT to NTE" filled={isFilled(formData.distance_fbt_to_nte)}>
                  <StyledInput value={formData.distance_fbt_to_nte} onChange={(e) => handleChange("distance_fbt_to_nte", e.target.value)} />
                </FieldRow>
                <FieldRow label="Distance from NTE to Customer IT Space" filled={isFilled(formData.distance_nte_to_it)}>
                  <StyledInput value={formData.distance_nte_to_it} onChange={(e) => handleChange("distance_nte_to_it", e.target.value)} />
                </FieldRow>
                <FieldRow label="Is Customer IT Space on Same Floor as NTE?" filled={isFilled(formData.it_same_floor_as_nte)}>
                  <DropdownSelect value={formData.it_same_floor_as_nte} onChange={(v) => handleChange("it_same_floor_as_nte", v)} options={ASE_OPTIONS.routerFloor} />
                </FieldRow>
                <FieldRow label="Router Within 300ft?" filled={isFilled(formData.router_within_300ft)}>
                  <DropdownSelect value={formData.router_within_300ft} onChange={(v) => handleChange("router_within_300ft", v)} options={ASE_OPTIONS.routerDistance} />
                </FieldRow>
                <FieldRow label="Proposed Equipment" filled={isFilled(formData.proposed_equipment)}>
                  <DropdownSelect value={formData.proposed_equipment} onChange={(v) => handleChange("proposed_equipment", v)} options={ASE_OPTIONS.proposedEquipment} />
                </FieldRow>
                <FieldRow label="Proposed Equipment Location" filled={isFilled(formData.proposed_equipment_location)}>
                  <StyledInput value={formData.proposed_equipment_location} onChange={(e) => handleChange("proposed_equipment_location", e.target.value)} />
                </FieldRow>
                <FieldRow label="Proposed Equipment LAT/LONG" filled={isFilled(formData.proposed_equipment_lat_long)}>
                  <StyledInput value={formData.proposed_equipment_lat_long} onChange={(e) => handleChange("proposed_equipment_lat_long", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* Path of Approach */}
            <Section title="PATH OF APPROACH / MEASUREMENTS" filledCount={countFilledFields(pathFields)} totalCount={pathFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Path of Approach Description" wide filled={isFilled(formData.path_of_approach)}>
                  <StyledTextarea value={formData.path_of_approach} onChange={(e) => handleChange("path_of_approach", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRow label="Proposed Location" wide filled={isFilled(formData.proposed_location)}>
                  <StyledInput value={formData.proposed_location} onChange={(e) => handleChange("proposed_location", e.target.value)} />
                </FieldRow>
                <FieldRow label="Starting FH/MH/POLE Tie-in Measurements" wide filled={isFilled(formData.starting_tie_in_measurements)}>
                  <StyledTextarea value={formData.starting_tie_in_measurements} onChange={(e) => handleChange("starting_tie_in_measurements", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRowWithPhoto label="POLE LINE START Lat/Long" filled={isFilled(formData.soc_pole_line_start)} photos={formData.pole_line_start_photos} onPhotosChange={(v) => handleChange("pole_line_start_photos", v)}>
                  <StyledInput value={formData.soc_pole_line_start} onChange={(e) => handleChange("soc_pole_line_start", e.target.value)} placeholder="Auto-filled from Poles" />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="POLE LINE END Lat/Long" filled={isFilled(formData.soc_pole_line_end)} photos={formData.pole_line_end_photos} onPhotosChange={(v) => handleChange("pole_line_end_photos", v)}>
                  <StyledInput value={formData.soc_pole_line_end} onChange={(e) => handleChange("soc_pole_line_end", e.target.value)} placeholder="Auto-filled from Poles" />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="SOC START Lat/Long" filled={isFilled(formData.soc_start_lat_long)} photos={formData.soc_start_photos} onPhotosChange={(v) => handleChange("soc_start_photos", v)}>
                  <StyledInput value={formData.soc_start_lat_long} onChange={(e) => handleChange("soc_start_lat_long", e.target.value)} placeholder="Auto-filled from Underground markers" />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="SOC END Lat/Long" filled={isFilled(formData.soc_end_lat_long)} photos={formData.soc_end_photos} onPhotosChange={(v) => handleChange("soc_end_photos", v)}>
                  <StyledInput value={formData.soc_end_lat_long} onChange={(e) => handleChange("soc_end_lat_long", e.target.value)} placeholder="Auto-filled from Underground markers" />
                </FieldRowWithPhoto>
                <FieldRow label="Proposed Pole and Building" wide filled={isFilled(formData.proposed_pole_and_bldg)}>
                  <StyledInput value={formData.proposed_pole_and_bldg} onChange={(e) => handleChange("proposed_pole_and_bldg", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* EF Offer/Requirements */}
            <Section title="EF OFFER / REQUIREMENTS" filledCount={countFilledFields(efOfferFields)} totalCount={efOfferFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="EF Requirements" filled={isFilled(formData.ef_requirements)}>
                  <DropdownSelect value={formData.ef_requirements} onChange={(v) => handleChange("ef_requirements", v)} options={ASE_OPTIONS.efRequirements} />
                </FieldRow>
                <FieldRow label="EF Needed" filled={isFilled(formData.ef_needed)}>
                  <YesNoSelect value={formData.ef_needed} onChange={(v) => handleChange("ef_needed", v)} />
                </FieldRow>
                <FieldRow label="EF Qualified" filled={isFilled(formData.ef_qualified)}>
                  <YesNoSelect value={formData.ef_qualified} onChange={(v) => handleChange("ef_qualified", v)} />
                </FieldRow>
                <FieldRow label="Customer EF Aware" filled={isFilled(formData.customer_ef_aware)}>
                  <YesNoSelect value={formData.customer_ef_aware} onChange={(v) => handleChange("customer_ef_aware", v)} />
                </FieldRow>
                <FieldRow label="End User Acceptance" filled={isFilled(formData.end_user_acceptance)}>
                  <YesNoSelect value={formData.end_user_acceptance} onChange={(v) => handleChange("end_user_acceptance", v)} />
                </FieldRow>
                <FieldRow label="EF Disqualification Reason" wide filled={isFilled(formData.ef_disqualification_reason)}>
                  <StyledInput value={formData.ef_disqualification_reason} onChange={(e) => handleChange("ef_disqualification_reason", e.target.value)} />
                </FieldRow>
                <FieldRow label="Are We Placing Conduit and How Long?" wide filled={isFilled(formData.placing_conduit_length)}>
                  <StyledInput value={formData.placing_conduit_length} onChange={(e) => handleChange("placing_conduit_length", e.target.value)} />
                </FieldRow>
                <FieldRow label="EF Conduit Length Category" filled={isFilled(formData.ef_conduit_length)}>
                  <DropdownSelect value={formData.ef_conduit_length} onChange={(v) => handleChange("ef_conduit_length", v)} options={ASE_OPTIONS.efConduitLength} />
                </FieldRow>
              </div>
            </Section>

            {/* EF Requirements Detail */}
            <Section title="EF REQUIREMENTS - DETAIL" filledCount={countFilledFields(efDetailFields)} totalCount={efDetailFields.length}>
              <div className="space-y-4">
                {[
                  { label: "Do we need a buried PVC pipe?", key: "buried_pvc", qtyKey: "buried_pvc_length", qtyLabel: "Length" },
                  { label: "Do we need buried innerduct on customer property?", key: "buried_innerduct", qtyKey: "buried_innerduct_length", qtyLabel: "Length" },
                  { label: "Do we need EMT (metallic bldg pipe)?", key: "need_emt", qtyKey: "emt_length", qtyLabel: "Length" },
                  { label: "Do we need plastic building duct/pipe (Plenum)?", key: "need_plenum", qtyKey: "plenum_length", qtyLabel: "Length" },
                  { label: "Do we need a core drill?", key: "need_core_drill", qtyKey: "core_drill_qty", qtyLabel: "Qty" },
                  { label: "Do we need an eye-bolt/weatherhead?", key: "need_eyebolt", qtyKey: null },
                  { label: "Do we need a Pullbox?", key: "need_pullbox", qtyKey: "pullbox_qty", qtyLabel: "Qty" },
                  { label: "Do we need a Hoffman box?", key: "need_hoffman_box", qtyKey: "hoffman_box_qty", qtyLabel: "Qty" },
                  { label: "Do we need a backboard?", key: "need_backboard", qtyKey: "backboard_qty", qtyLabel: "Qty" },
                  { label: "Do we need an outlet?", key: "need_outlet", qtyKey: null },
                  { label: "Do we need a groundbar?", key: "need_groundbar", qtyKey: "groundbar_qty", qtyLabel: "Qty" },
                ].map((item) => (
                  <div key={item.key} className={`grid grid-cols-1 sm:grid-cols-3 gap-4 items-end border-b pb-3 ${
                    isFilled(formData[item.key]) ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'
                  } rounded-lg p-3`}>
                    <div className="sm:col-span-1">
                      <Label className={`text-xs font-mono ${isFilled(formData[item.key]) ? 'text-green-600' : 'text-amber-600'}`}>
                        {item.label}
                      </Label>
                    </div>
                    <div className="sm:col-span-1">
                      <YesNoSelect value={formData[item.key]} onChange={(v) => handleChange(item.key, v)} />
                    </div>
                    {item.qtyKey && (
                      <div className="sm:col-span-1">
                        <Label className="text-xs font-mono text-zinc-500">{item.qtyLabel}</Label>
                        <StyledInput value={formData[item.qtyKey] || ""} onChange={(e) => handleChange(item.qtyKey, e.target.value)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          </TabsContent>

          {/* TAB 3: SVCL OUTPUT */}
          <TabsContent value="svcl-output" className="space-y-6" data-testid="content-svcl-output">
            {/* Site Requirements */}
            <Section title="SITE REQUIREMENTS" filledCount={countFilledFields(siteReqFields)} totalCount={siteReqFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Site Readiness Evaluation" wide filled={isFilled(formData.site_readiness_evaluation)}>
                  <DropdownSelect value={formData.site_readiness_evaluation} onChange={(v) => handleChange("site_readiness_evaluation", v)} options={ASE_OPTIONS.siteReadiness} />
                </FieldRow>
                <FieldRow label="What Site Requirements are Already Provided?" wide filled={isFilled(formData.site_requirements_provided)}>
                  <StyledTextarea value={formData.site_requirements_provided} onChange={(e) => handleChange("site_requirements_provided", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRow label="Grounding System" filled={isFilled(formData.grounding_system)}>
                  <StyledInput value={formData.grounding_system} onChange={(e) => handleChange("grounding_system", e.target.value)} />
                </FieldRow>
                <FieldRow label="Building Power Source" filled={isFilled(formData.building_power_source)}>
                  <StyledInput value={formData.building_power_source} onChange={(e) => handleChange("building_power_source", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* Multi-Tenant Eligibility */}
            <Section title="MULTI TENANT ELIGIBILITY (MTEI)" filledCount={countFilledFields(['multi_tenant_eligibility', 'customer_handoff_panel_location', 'est_fiber_drop_length'])} totalCount={3}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Multi-Tenant Eligibility" filled={isFilled(formData.multi_tenant_eligibility)}>
                  <YesNoSelect value={formData.multi_tenant_eligibility} onChange={(v) => handleChange("multi_tenant_eligibility", v)} />
                </FieldRow>
                <FieldRow label="Customer Handoff Panel Location" filled={isFilled(formData.customer_handoff_panel_location)}>
                  <StyledInput value={formData.customer_handoff_panel_location} onChange={(e) => handleChange("customer_handoff_panel_location", e.target.value)} />
                </FieldRow>
                <FieldRow label="Est. Fiber Drop Length (MIN 10')" wide filled={isFilled(formData.est_fiber_drop_length)}>
                  <StyledInput value={formData.est_fiber_drop_length} onChange={(e) => handleChange("est_fiber_drop_length", e.target.value)} />
                </FieldRow>
              </div>
            </Section>

            {/* Additional Information */}
            <Section title="ADDITIONAL INFORMATION" filledCount={countFilledFields(additionalFields)} totalCount={additionalFields.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRowWithPhoto label="Are there any pipelines in the vicinity?" filled={isFilled(formData.pipelines_vicinity)} photos={formData.pipelines_vicinity_photos} onPhotosChange={(v) => handleChange("pipelines_vicinity_photos", v)}>
                  <YesNoSelect value={formData.pipelines_vicinity} onChange={(v) => handleChange("pipelines_vicinity", v)} />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="Are there any pipelines in the path?" filled={isFilled(formData.pipelines_path)} photos={formData.pipelines_path_photos} onPhotosChange={(v) => handleChange("pipelines_path_photos", v)}>
                  <YesNoSelect value={formData.pipelines_path} onChange={(v) => handleChange("pipelines_path", v)} />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="Are there any railroads in the vicinity?" filled={isFilled(formData.railroads_vicinity)} photos={formData.railroads_vicinity_photos} onPhotosChange={(v) => handleChange("railroads_vicinity_photos", v)}>
                  <YesNoSelect value={formData.railroads_vicinity} onChange={(v) => handleChange("railroads_vicinity", v)} />
                </FieldRowWithPhoto>
                <FieldRowWithPhoto label="Are there any railroads in the path?" filled={isFilled(formData.railroads_path)} photos={formData.railroads_path_photos} onPhotosChange={(v) => handleChange("railroads_path_photos", v)}>
                  <YesNoSelect value={formData.railroads_path} onChange={(v) => handleChange("railroads_path", v)} />
                </FieldRowWithPhoto>
                <FieldRow label="Permits Needed" wide filled={isFilled(formData.possible_permits)}>
                  <StyledInput value={formData.possible_permits} onChange={(e) => handleChange("possible_permits", e.target.value)} />
                </FieldRow>
                <FieldRow label="ROW Width, Pole-Pole, Clear Inside Path Measurements" wide filled={isFilled(formData.row_measurements)}>
                  <StyledTextarea value={formData.row_measurements} onChange={(e) => handleChange("row_measurements", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRow label="Other Info - Is there anything else we must know?" wide filled={isFilled(formData.other_notes)}>
                  <StyledTextarea value={formData.other_notes} onChange={(e) => handleChange("other_notes", e.target.value)} rows={2} />
                </FieldRow>
                <FieldRow label="Additional SOW Notes" wide filled={isFilled(formData.additional_sow_notes)}>
                  <StyledTextarea value={formData.additional_sow_notes} onChange={(e) => handleChange("additional_sow_notes", e.target.value)} rows={3} />
                </FieldRow>
                <FieldRow label="Site & Order SOW Notes" wide filled={isFilled(formData.site_order_sow_notes)}>
                  <StyledTextarea value={formData.site_order_sow_notes} onChange={(e) => handleChange("site_order_sow_notes", e.target.value)} rows={3} />
                </FieldRow>
              </div>
            </Section>

            {/* Multiple MPOE/Terminal */}
            <Section title="MULTIPLE MPOE / TERMINAL" filledCount={countFilledFields(['multiple_mpoe_terminal'])} totalCount={1}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="Multiple MPOE/Terminal?" filled={isFilled(formData.multiple_mpoe_terminal)}>
                  <YesNoSelect value={formData.multiple_mpoe_terminal} onChange={(v) => handleChange("multiple_mpoe_terminal", v)} />
                </FieldRow>
              </div>
            </Section>
          </TabsContent>
        </Tabs>

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
