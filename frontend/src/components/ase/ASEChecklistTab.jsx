import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Section, CollapsibleSection, StyledInput, StyledTextarea, DropdownSelect, YesNoSelect, FieldRow, isFilled, DatePickerField } from "./ASEFormHelpers";
import { Switch } from "@/components/ui/switch";
import { ASE_OPTIONS } from "./ASEFormConstants";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { ASEPhotoField } from "@/components/ASEPhotoField";
import MarkupTab from "@/components/MarkupTab";

const ASEChecklistTab = ({ formData, handleChange, poles = [], underground = [], onRegeneratePath }) => {
  // All job attributes (poles + underground) with GPS, in job-page order
  const attributeOptions = useMemo(() => {
    const items = [];
    underground.forEach((u) => {
      if (u.latitude && u.longitude) {
        items.push({ label: `${u.type}${u.label ? ` ${u.label}` : ""}`, coords: `${u.latitude}, ${u.longitude}`, sort: u.sort_order ?? 9999 });
      }
    });
    poles.forEach((p) => {
      if (p.latitude && p.longitude) {
        items.push({ label: `Pole ${p.pole_number || "?"}`, coords: `${p.latitude}, ${p.longitude}`, sort: p.sort_order ?? 9999 });
      }
    });
    items.sort((a, b) => a.sort - b.sort);
    const seen = {};
    items.forEach((it) => {
      seen[it.label] = (seen[it.label] || 0) + 1;
      if (seen[it.label] > 1) it.label = `${it.label} (${seen[it.label]})`;
    });
    return items;
  }, [poles, underground]);

  // Auto-populate Nearest fiber Lat/Long with the FIRST item on the attributes list
  useEffect(() => {
    if (attributeOptions.length > 0 && !formData.nearest_fiber_lat_long) {
      handleChange("nearest_fiber_lat_long", attributeOptions[0].coords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributeOptions]);

  // Auto-populate Nearest fiber FID from the attribute with Primary FID toggled on
  const fidWarnedRef = useRef(false);
  const fidSetRef = useRef(false);
  useEffect(() => {
    const primaries = underground
      .filter((u) => u.primary_fid && u.fid)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    if (primaries.length === 0) return;
    if (primaries.length > 1 && !fidWarnedRef.current) {
      fidWarnedRef.current = true;
      toast.warning(`Multiple attributes have Primary FID on: ${primaries.map((u) => `${u.type}${u.label ? ` ${u.label}` : ""}`).join(", ")}. Using ${primaries[0].type}${primaries[0].label ? ` ${primaries[0].label}` : ""} (first in job order).`);
    }
    if (!formData.nearest_fiber_fid) {
      handleChange("nearest_fiber_fid", primaries[0].fid);
      if (!fidSetRef.current) {
        fidSetRef.current = true;
        toast.success(`Nearest fiber FID set from ${primaries[0].type}${primaries[0].label ? ` ${primaries[0].label}` : ""} (Primary FID)`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underground]);

  // Auto-populate SOC Start/End and Pole Line Start/End Lat/Long from toggled attributes/poles
  useEffect(() => {
    const socStart = underground.find((u) => u.soc_start && u.latitude && u.longitude);
    if (socStart && !formData.soc_start_lat_long) handleChange("soc_start_lat_long", `${socStart.latitude}, ${socStart.longitude}`);
    const socEnd = underground.find((u) => u.soc_end && u.latitude && u.longitude);
    if (socEnd && !formData.soc_end_lat_long) handleChange("soc_end_lat_long", `${socEnd.latitude}, ${socEnd.longitude}`);
    const plStart = poles.find((p) => p.pole_line_start && p.latitude && p.longitude);
    if (plStart && !formData.soc_pole_line_start) handleChange("soc_pole_line_start", `${plStart.latitude}, ${plStart.longitude}`);
    const plEnd = poles.find((p) => p.pole_line_end && p.latitude && p.longitude);
    if (plEnd && !formData.soc_pole_line_end) handleChange("soc_pole_line_end", `${plEnd.latitude}, ${plEnd.longitude}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poles, underground]);

  // EF Requirements: "Provided" toggle → "What Site Requirements are already provided?" sync
  const handleEfProvidedToggle = (item, checked) => {
    handleChange(`${item.key}_provided`, checked);
    const current = formData.site_requirements_provided || "";
    const parts = current.split(";").map((s) => s.trim()).filter(Boolean).filter((s) => s !== item.shortName);
    if (checked) parts.push(item.shortName);
    handleChange("site_requirements_provided", parts.join("; "));
  };

  // Fiber Pedestal -> FBT toggle
  const handlePedestalFbtToggle = (v) => {
    handleChange("pedestal_fiber_as_fbt", v);
    if (v === "YES") {
      const ped = underground.find(
        (u) => u.type === "Pedestal" && String(u.material_type || "").toLowerCase().includes("fiber")
      );
      if (ped && ped.latitude && ped.longitude) {
        handleChange("fiber_terminal_placement", "PEDESTAL");
        handleChange("fiber_terminal_lat_long", `${ped.latitude}, ${ped.longitude}`);
        toast.success(`FBT set from Fiber Pedestal${ped.label ? ` ${ped.label}` : ""}`);
      } else {
        toast.warning("No Fiber Pedestal with GPS coordinates found in this job");
      }
    }
  };

  const applyAttributeCoords = (sourceField, targetField) => (label) => {
    handleChange(sourceField, label);
    const item = attributeOptions.find((o) => o.label === label);
    if (item) {
      handleChange(targetField, item.coords);
      toast.success(`Coordinates set from ${item.label}`);
    }
  };

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
            <DatePickerField value={formData.date_of_site_visit} onChange={(v) => handleChange("date_of_site_visit", v)} filled={isFilled(formData.date_of_site_visit)} testId="date-of-site-visit-picker" />
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

      {/* BIDI RETROFIT - Collapsible */}
      <CollapsibleSection title="BIDI RETROFIT" defaultOpen={false}>
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
      </CollapsibleSection>

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
          <FieldRow label="Fiber Pedestal as FBT?" note="AUTO-FILLS PLACEMENT + LAT/LONG">
            <div data-testid="pedestal-fiber-as-fbt-select">
              <YesNoSelect value={formData.pedestal_fiber_as_fbt} onChange={handlePedestalFbtToggle} filled={isFilled(formData.pedestal_fiber_as_fbt)} />
            </div>
          </FieldRow>
          <FieldRow label="FIBER TERMINAL placement">
            <DropdownSelect value={formData.fiber_terminal_placement} onChange={(v) => handleChange("fiber_terminal_placement", v)} options={ASE_OPTIONS.fiberTerminalPlacement} filled={isFilled(formData.fiber_terminal_placement)} />
          </FieldRow>
          <FieldRow label="Fiber Terminal LAT/LONG">
            <StyledInput value={formData.fiber_terminal_lat_long} onChange={(e) => handleChange("fiber_terminal_lat_long", e.target.value)} filled={isFilled(formData.fiber_terminal_lat_long)} placeholder="Auto-filled from Underground" />
          </FieldRow>
          <FieldRow label="Populate from Job Attribute" note="SETS FBT LAT/LONG">
            <div data-testid="fbt-attribute-select">
              <DropdownSelect value={formData.fbt_attribute_source} onChange={applyAttributeCoords("fbt_attribute_source", "fiber_terminal_lat_long")} options={attributeOptions.map((o) => o.label)} placeholder="Select attribute..." filled={isFilled(formData.fbt_attribute_source)} />
            </div>
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

      {/* NTE – EQUIPMENT ATTRIBUTES - Collapsible */}
      <CollapsibleSection title="NTE - EQUIPMENT ATTRIBUTES" defaultOpen={true}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Existing NTE">
            <YesNoSelect value={formData.existing_nte} onChange={(v) => handleChange("existing_nte", v)} filled={isFilled(formData.existing_nte)} />
          </FieldRow>
          <FieldRow label="NTE Placement">
            <DropdownSelect value={formData.nte_placement} onChange={(v) => handleChange("nte_placement", v)} options={ASE_OPTIONS.ntePlacement} filled={isFilled(formData.nte_placement)} />
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
          <FieldRow label="Populate from Job Attribute" note="SETS NTE LAT/LONG">
            <div data-testid="nte-attribute-select">
              <DropdownSelect value={formData.nte_attribute_source} onChange={applyAttributeCoords("nte_attribute_source", "nte_lat_long")} options={attributeOptions.map((o) => o.label)} placeholder="Select attribute..." filled={isFilled(formData.nte_attribute_source)} />
            </div>
          </FieldRow>
          <FieldRow label="Floor #">
            <StyledInput value={formData.nte_floor} onChange={(e) => handleChange("nte_floor", e.target.value)} filled={isFilled(formData.nte_floor)} />
          </FieldRow>
          <FieldRow label="Mounting Wall">
            <DropdownSelect value={formData.nte_mounting_wall} onChange={(v) => handleChange("nte_mounting_wall", v)} options={ASE_OPTIONS.nteMountingWall} filled={isFilled(formData.nte_mounting_wall)} />
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
      </CollapsibleSection>

      {/* EF OFFER */}
      <Section title="EF OFFER">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="EF NEEDED" wide>
            <DropdownSelect value={formData.ef_needed} onChange={(v) => handleChange("ef_needed", v)} options={ASE_OPTIONS.efNeeded} filled={isFilled(formData.ef_needed)} />
          </FieldRow>
          <FieldRow label="EF Qualified">
            <YesNoSelect value={formData.ef_qualified} onChange={(v) => handleChange("ef_qualified", v)} filled={isFilled(formData.ef_qualified)} />
          </FieldRow>
          <FieldRow label="EF disqualification reason" wide>
            <DropdownSelect value={formData.ef_disqualification_reason} onChange={(v) => handleChange("ef_disqualification_reason", v)} options={ASE_OPTIONS.efDisqualificationReason} filled={isFilled(formData.ef_disqualification_reason)} />
          </FieldRow>
          <FieldRow label="Is the Customer Building Owner or Tenant?">
            <DropdownSelect value={formData.owner_or_tenant} onChange={(v) => handleChange("owner_or_tenant", v)} options={ASE_OPTIONS.ownerTenant} filled={isFilled(formData.owner_or_tenant)} />
          </FieldRow>
          <FieldRow label="SPF Required?">
            <DropdownSelect value={formData.spf_required} onChange={(v) => handleChange("spf_required", v)} options={ASE_OPTIONS.spfRequired} filled={isFilled(formData.spf_required)} />
          </FieldRow>
          <FieldRow label="SPF contact name & phone/email" wide>
            <StyledInput value={formData.spf_contact} onChange={(e) => handleChange("spf_contact", e.target.value)} filled={isFilled(formData.spf_contact)} />
          </FieldRow>
          <FieldRow label="Are we placing conduit and how long?" wide>
            <DropdownSelect value={formData.placing_conduit_length} onChange={(v) => handleChange("placing_conduit_length", v)} options={ASE_OPTIONS.conduitLength} filled={isFilled(formData.placing_conduit_length)} />
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
            { label: "Do we need a buried PVC pipe?", key: "buried_pvc", qtyKey: "buried_pvc_length", qtyLabel: "Length", shortName: "Buried PVC pipe" },
            { label: "Do we need buried innerduct on customer property?", key: "buried_innerduct", qtyKey: "buried_innerduct_length", qtyLabel: "Length", shortName: "Buried innerduct" },
            { label: "Do we need EMT? (metallic bldg pipe)", key: "need_emt", qtyKey: "emt_length", qtyLabel: "Length", shortName: "EMT" },
            { label: "Do we need plastic building duct/pipe (Plenum)?", key: "need_plenum", qtyKey: "plenum_length", qtyLabel: "Length", shortName: "Plenum duct/pipe" },
            { label: "Do we need a core drill?", key: "need_core_drill", qtyKey: "core_drill_qty", qtyLabel: "QTTY", shortName: "Core drill" },
            { label: "Do we need an eye-bolt / weatherhead?", key: "need_eyebolt", qtyKey: null, shortName: "Eye-bolt / weatherhead" },
            { label: "Do we need a Pullbox?", key: "need_pullbox", qtyKey: "pullbox_qty", qtyLabel: "QTTY", shortName: "Pullbox" },
            { label: "Do we need a Hoffman box?", key: "need_hoffman_box", qtyKey: "hoffman_box_qty", qtyLabel: "QTTY", shortName: "Hoffman box" },
            { label: "Do we need a backboard?", key: "need_backboard", qtyKey: "backboard_qty", qtyLabel: "QTTY", shortName: "Backboard" },
            { label: "Do we need an outlet?", key: "need_outlet", qtyKey: null, shortName: "Outlet" },
            { label: "Do we need a groundbar?", key: "need_groundbar", qtyKey: "groundbar_qty", qtyLabel: "QTTY", shortName: "Groundbar" },
          ].map((item) => (
            <div key={item.key} className="grid grid-cols-4 gap-2 items-center py-2 border-b border-zinc-100">
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
              <label className="flex items-center gap-2 justify-end cursor-pointer" title="Add to 'What Site Requirements are already provided?'">
                <Switch
                  checked={formData[`${item.key}_provided`] === true}
                  onCheckedChange={(v) => handleEfProvidedToggle(item, v)}
                  data-testid={`ef-provided-${item.key}`}
                />
                <span className="text-[10px] font-mono uppercase text-zinc-500">Provided</span>
              </label>
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
            {onRegeneratePath && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] uppercase text-zinc-400">Measurements:</span>
                <button
                  type="button"
                  onClick={() => onRegeneratePath("footage")}
                  title="Rebuild from the map using footage (e.g. P1 to P2 = 365 ft)"
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors ${(formData.path_of_approach_format || "footage") === "footage" ? "bg-orange-600 border-orange-600 text-white" : "bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200"}`}
                  data-testid="poa-format-footage"
                >Footage</button>
                <button
                  type="button"
                  onClick={() => onRegeneratePath("stations")}
                  title="Rebuild from the map using station numbers (e.g. P1 0+00 to P2 3+65)"
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors ${formData.path_of_approach_format === "stations" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200"}`}
                  data-testid="poa-format-stations"
                >Station #'s</button>
              </div>
            )}
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

      {/* Mark Ups with Underground Attributes */}
      <Section title="MARK UPS">
        <MarkupTab
          photos={formData.markup_photos || []}
          onPhotosChange={(v) => handleChange("markup_photos", v)}
          poles={poles}
          underground={underground}
          label="Mark Ups"
          showUnderground={true}
        />
      </Section>
    </div>
  );
};

export default ASEChecklistTab;
