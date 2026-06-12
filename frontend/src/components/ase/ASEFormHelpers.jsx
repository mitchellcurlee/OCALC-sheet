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
import { ASE_OPTIONS, BLANK } from "./ASEFormConstants";

// Section component for consistent styling
export const Section = ({ title, children, className = "" }) => (
  <div className={`bg-white border border-zinc-200 rounded-lg p-4 sm:p-5 ${className}`}>
    <h2 className="font-mono text-sm sm:text-base font-bold text-zinc-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
      <div className="w-1 h-5 bg-blue-600"></div>
      {title}
    </h2>
    {children}
  </div>
);

// Styled input with fill indicator
export const StyledInput = ({ filled, ...props }) => (
  <Input 
    {...props} 
    className={`font-mono text-sm h-10 ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'} ${props.className || ''}`}
  />
);

// Styled textarea with fill indicator
export const StyledTextarea = ({ filled, ...props }) => (
  <Textarea 
    {...props} 
    className={`font-mono text-sm ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'} ${props.className || ''}`}
  />
);

// Dropdown select component
export const DropdownSelect = ({ value, onChange, options, placeholder = "Select...", filled }) => (
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
export const YesNoSelect = ({ value, onChange, filled }) => (
  <DropdownSelect value={value} onChange={onChange} options={ASE_OPTIONS.yesNo} placeholder="Select..." filled={filled} />
);

// Yes/No/NA Select
export const YesNoNASelect = ({ value, onChange, filled }) => (
  <DropdownSelect value={value} onChange={onChange} options={ASE_OPTIONS.yesNoNA} placeholder="Select..." filled={filled} />
);

// Field row component
export const FieldRow = ({ label, children, note, wide = false }) => (
  <div className={wide ? "col-span-1 sm:col-span-2" : ""}>
    <Label className="text-xs font-mono text-zinc-600 uppercase tracking-wide mb-1.5 block">
      {label}
      {note && <span className="text-zinc-400 ml-1 normal-case">({note})</span>}
    </Label>
    {children}
  </div>
);

// Helper to check if field has value
export const isFilled = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
};
