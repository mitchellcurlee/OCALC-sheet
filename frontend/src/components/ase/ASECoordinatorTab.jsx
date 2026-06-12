import { Section, StyledInput, StyledTextarea, FieldRow, isFilled } from "./ASEFormHelpers";

const ASECoordinatorTab = ({ formData, handleChange }) => {
  return (
    <div className="space-y-4" data-testid="content-coordinator-input">
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
    </div>
  );
};

export default ASECoordinatorTab;
