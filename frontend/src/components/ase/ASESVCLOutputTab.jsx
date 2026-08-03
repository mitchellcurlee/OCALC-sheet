import { Section, StyledInput, StyledTextarea, DropdownSelect, YesNoSelect, FieldRow, isFilled } from "./ASEFormHelpers";
import { ASE_OPTIONS } from "./ASEFormConstants";

const ASESVCLOutputTab = ({ formData, handleChange }) => {
  return (
    <div className="space-y-4" data-testid="content-svcl-output">
      {/* Site & Order */}
      <Section title="Site & Order">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Building Contact">
            <StyledInput value={formData.building_contact} onChange={(e) => handleChange("building_contact", e.target.value)} filled={isFilled(formData.building_contact)} placeholder={formData.building_owner_contact || ""} />
          </FieldRow>
          <FieldRow label="Building Contact Email">
            <StyledInput value={formData.building_contact_email} onChange={(e) => handleChange("building_contact_email", e.target.value)} filled={isFilled(formData.building_contact_email)} />
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
            <StyledInput value={formData.multi_tenant || ""} readOnly filled={isFilled(formData.multi_tenant)} className="bg-zinc-50" />
          </FieldRow>
          <FieldRow label="Number of Tenants">
            <StyledInput value={formData.number_of_tenants || ""} readOnly filled={isFilled(formData.number_of_tenants)} className="bg-zinc-50" />
          </FieldRow>
          <FieldRow label="Number of Floors in Building">
            <StyledInput value={formData.number_of_floors} readOnly filled={isFilled(formData.number_of_floors)} className="bg-zinc-50" />
          </FieldRow>
          <FieldRow label="Building Demarcation">
            <StyledInput value={isFilled(formData.how_many_dmarcs) ? (parseInt(formData.how_many_dmarcs) === 1 ? "Single MPOE/Terminal" : "Multiple MPOE/Terminal") : ""} readOnly filled={isFilled(formData.how_many_dmarcs)} className="bg-zinc-50" />
          </FieldRow>
          <FieldRow label="Disable NTE Auto-Assignment">
            <StyledInput value={formData.disable_nte_auto_assign || ""} readOnly filled={isFilled(formData.disable_nte_auto_assign)} className="bg-zinc-50" />
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
            <YesNoSelect value={formData.multi_tenant_eligibility || ""} onChange={(v) => handleChange("multi_tenant_eligibility", v)} filled={isFilled(formData.multi_tenant_eligibility)} data-testid="mtei-eligibility-select" />
          </FieldRow>
          <FieldRow label="Customer Handoff Panel Location">
            <StyledInput value={formData.customer_handoff_panel_location} onChange={(e) => handleChange("customer_handoff_panel_location", e.target.value)} filled={isFilled(formData.customer_handoff_panel_location)} placeholder={isFilled(formData.nte_at_terminal) ? (formData.nte_at_terminal === "Terminal" ? "COMMON AREA/MPOE" : "SUITE") : ""} />
          </FieldRow>
          <FieldRow label="Est. Fiber Drop Length" note="MIN 10'">
            <StyledInput value={formData.est_fiber_drop_length} onChange={(e) => handleChange("est_fiber_drop_length", e.target.value)} filled={isFilled(formData.est_fiber_drop_length)} placeholder={formData.distance_fbt_to_nte || ""} />
          </FieldRow>
          <FieldRow label="Router on Same Floor">
            <YesNoSelect value={formData.router_on_same_floor || ""} onChange={(v) => handleChange("router_on_same_floor", v)} filled={isFilled(formData.router_on_same_floor)} data-testid="mtei-router-floor-select" />
          </FieldRow>
          <FieldRow label="Router Within 300 (ft)">
            <StyledInput value={formData.router_within_300ft || ""} onChange={(e) => handleChange("router_within_300ft", e.target.value)} filled={isFilled(formData.router_within_300ft)} placeholder="Notes / distance" data-testid="mtei-router-300-input" />
          </FieldRow>
          <FieldRow label="Ceiling Height">
            <StyledInput value={formData.ceiling_height || ""} onChange={(e) => handleChange("ceiling_height", e.target.value)} filled={isFilled(formData.ceiling_height)} />
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
              value={(isFilled(formData.site_id) || isFilled(formData.employee_info)) ? `NOTE: FOR ANY QUESTIONS CONCERNING YOUR SITE VISIT REQUIREMENTS IN THIS LETTER PLEASE CONTACT: REFERENCE SITE ID ${formData.site_id || ""} ${formData.employee_info || ""}`.trim() : ""} 
              readOnly 
              rows={2} 
              filled={isFilled(formData.site_id) || isFilled(formData.employee_info)} 
              className="bg-zinc-50" 
            />
          </FieldRow>
        </div>
      </Section>
    </div>
  );
};

export default ASESVCLOutputTab;
