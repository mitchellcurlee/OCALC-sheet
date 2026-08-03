// ASE Form dropdown options from ASE Excel template SOURCE and data sheets - EXACT match
export const BLANK = "__BLANK__";

export const ASE_OPTIONS = {
  yesNo: ["YES", "NO"],
  yesNoNA: ["YES", "NO", "N/A"],
  
  // EF Needed options
  efNeeded: [
    "(NOT NEEDED) No Site Requirements- ready for fiber and/or equipment",
    "(NEED FOR NTE ONLY) Site requirements needed for ONLY equipment",
    "(NEED FOR TERMINAL ONLY/TERMINAL & NTE) Site Requirements are needed for fiber & equipment, or fiber only"
  ],
  
  // Site Visit Type (from data sheet)
  siteVisitType: ["RB", "SITE SURVEY", "PHYSICAL"],
  
  // Occupancy Types (from SOURCE sheet Column C)
  occupancyTypes: [
    "RETAIL", "INDUSTRIAL", "OFFICE", "SPORTS", "GOVERNMENT", 
    "LAND", "MULTI-FAMILY", "HEALTHCARE", "STRIP MALL", "SPECIALTY"
  ],
  
  // Owner/Tenant (from data sheet Column C)
  ownerTenant: ["BUILDING OWNER", "TENANT"],
  
  // Power Configuration (from SOURCE sheet Column E)
  powerConfiguration: ["AC SINGLE", "AC DUAL", "DC SINGLE", "DC DUAL"],
  
  // Power Type (from data sheet Column E)
  powerType: ["AC", "DC", "DUEL POWER SUPPLY"],
  
  // Construction Type / EF Disqualification Reason (from SOURCE sheet Column F)  
  efDisqualificationReason: ["CONSTRUCTION", "SPECIAL CONSTRUCTION", "REMODEL", "CWOTS", "CONSTRUCTION TRAILER", "CELL SITE", "OVER 1000FT", "N/A"],
  
  // Terminal Location (from data sheet Column F)
  terminalLocation: ["NEW", "EXISTING"],
  
  // Mounting Wall - directions (removed BACKBOARD)
  mountingWall: ["NORTH", "SOUTH", "EAST", "WEST", "RACK", "PED"],
  
  // NTE Mounting Wall - includes Desk Mount
  nteMountingWall: ["NORTH", "SOUTH", "EAST", "WEST", "RACK", "DESK MOUNT"],
  
  // Fiber Terminal Placement - updated options
  fiberTerminalPlacement: ["INSIDE WALL MOUNT", "OUTSIDE WALL MOUNT", "RACK", "PEDESTAL", "H-FRAME", "HOFFMAN BOX", "POLE"],
  
  // NTE Placement - updated options  
  ntePlacement: ["INSIDE WALL MOUNT", "OUTSIDE WALL MOUNT", "RACK", "H-FRAME", "HOFFMAN BOX", "DESK MOUNT (WALL MOUNT)"],
  
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
  
  // SPF Required options
  spfRequired: ["NO", "Yes, Pending Approval", "Yes, Approved"],
  
  // Conduit length options
  conduitLength: ["NONE", "Under 1000ft", "Over 1000ft"],
  
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

// Initial form data state
export const INITIAL_FORM_DATA = {
  // ========== ASE CKLIST TAB ==========
  // Employee Info
  employee_info: "",
  date_of_site_visit: "",
  site_id: "",
  
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
  number_of_tenants: "",
  how_many_dmarcs: "",
  additional_dmarcs_location: "",
  proposed_nte_common_space: "",
  multi_tenant: "",
  disable_nte_auto_assign: "",
  multi_tenant_eligibility: "",
  router_on_same_floor: "",
  router_within_300ft: "",
  
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
  buried_pvc_provided: false,
  buried_innerduct_provided: false,
  need_emt_provided: false,
  need_plenum_provided: false,
  need_core_drill_provided: false,
  need_eyebolt_provided: false,
  need_pullbox_provided: false,
  need_hoffman_box_provided: false,
  need_backboard_provided: false,
  need_outlet_provided: false,
  need_groundbar_provided: false,
  
  // ADDITIONAL INFO
  nearest_fiber_lat_long: "",
  pedestal_fiber_as_fbt: "",
  fbt_attribute_source: "",
  nte_attribute_source: "",
  starting_tie_in_measurements: "",
  nearest_fiber_fid: "",
  path_of_approach: "",
  path_of_approach_format: "footage",
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
  sow_notes_override: "",
  qualified_equipment: "",
  
  // Building info (calculated) - Note: multi_tenant, number_of_tenants defined in BUILDING CHARACTERISTICS
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
  
  // Multi Tenant Eligibility - Note: multi_tenant_eligibility, router_within_300ft defined in BUILDING CHARACTERISTICS
  customer_handoff_panel_location: "",
  est_fiber_drop_length: "",
  router_same_floor: "",
  ceiling_height_ok: "",
  
  // Site Requirements
  site_readiness_evaluation: "",
  ef_qualified_out: "",
  customer_ef_aware: "",
  end_user_acceptance: "",
  ef_owner_tenant: "",
  ef_conduit_length: "",
  other_requirements: "",
};
