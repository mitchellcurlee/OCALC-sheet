import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMPLOYEE_NAMES } from "@/components/ase/ASEFormConstants";

const OTHER = "__other__";
const lineCls = "h-8 bg-white border-0 border-b-2 border-zinc-500 rounded-none px-1 text-sm focus-visible:ring-0";

/** OPERATOR printed name — same employee list as Job Create, plus "Other / type manually". */
export const OperatorNameSelect = ({ value, onChange }) => {
  const isListed = EMPLOYEE_NAMES.includes(value);
  const manual = !!value && !isListed;
  return (
    <div className="space-y-1">
      <Select value={isListed ? value : manual ? OTHER : ""} onValueChange={(v) => onChange(v === OTHER ? " " : v)}>
        <SelectTrigger className={lineCls} data-testid="spf-operator_name_title-select"><SelectValue placeholder="Select employee" /></SelectTrigger>
        <SelectContent className="bg-white">
          {EMPLOYEE_NAMES.map((n) => <SelectItem key={n} value={n} data-testid={`spf-operator-option-${n.replace(/\s+/g, "-").toLowerCase()}`}>{n}</SelectItem>)}
          <SelectItem value={OTHER} data-testid="spf-operator-option-other">Other / type manually</SelectItem>
        </SelectContent>
      </Select>
      {manual && <Input autoFocus value={value.trim()} onChange={(e) => onChange(e.target.value || " ")} placeholder="Printed Name/Title" className={lineCls} data-testid="spf-operator_name_title" />}
    </div>
  );
};
