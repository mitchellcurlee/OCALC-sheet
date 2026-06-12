import { Section, StyledInput, StyledTextarea, DropdownSelect, YesNoSelect, FieldRow, isFilled } from "./ASEFormHelpers";
import { ASE_OPTIONS } from "./ASEFormConstants";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { ASEPhotoField } from "@/components/ASEPhotoField";

const ASEChecklistTab = ({ formData, handleChange }) => {
  return (
    <div className="space-y-4" data-testid="content-ase-cklist">
      {/* Employee Info */}
      <Section title="Employee Info">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FieldRow label="Site ID">
            <StyledInput value={formData.site_id} onChange={(e) => handleChange("site_id", e.target.value)} filled={isFilled(formData.site_id)} placeholder="Enter Site ID" />
          </FieldRow>
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
          <FieldRow label="Number of Tenants">
            <StyledInput type="number" value={formData.number_of_tenants} onChange={(e) => handleChange("number_of_tenants", e.target.value)} filled={isFilled(formData.number_of_tenants)} />
          </FieldRow>
          <FieldRow label="Multi Tenant">
            <YesNoSelect value={formData.multi_tenant} onChange={(v) => handleChange("multi_tenant", v)} filled={isFilled(formData.multi_tenant)} />
          </FieldRow>
          <FieldRow label="Disable NTE Auto-Assign">
            <YesNoSelect value={formData.disable_nte_auto_assign} onChange={(v) => handleChange("disable_nte_auto_assign", v)} filled={isFilled(formData.disable_nte_auto_assign)} />
          </FieldRow>
          <FieldRow label="Multi Tenant Eligibility">
            <YesNoSelect value={formData.multi_tenant_eligibility} onChange={(v) => handleChange("multi_tenant_eligibility", v)} filled={isFilled(formData.multi_tenant_eligibility)} />
          </FieldRow>
          <FieldRow label="Router on Same Floor">
            <YesNoSelect value={formData.router_on_same_floor} onChange={(v) => handleChange("router_on_same_floor", v)} filled={isFilled(formData.router_on_same_floor)} />
          </FieldRow>
          <FieldRow label="Router Within 300ft">
            <YesNoSelect value={formData.router_within_300ft} onChange={(v) => handleChange("router_within_300ft", v)} filled={isFilled(formData.router_within_300ft)} />
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
      <Section title="NTE - EQUIPMENT ATTRIBUTES">
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
                <span className="text-zinc-400 text-xs">-</span>
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
    </div>
  );
};

export default ASEChecklistTab;
