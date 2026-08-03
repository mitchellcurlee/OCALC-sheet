import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
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

// Collapsible Section component
export const CollapsibleSection = ({ title, children, className = "", defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className={`bg-white border border-zinc-200 rounded-lg ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-50 transition-colors rounded-lg"
      >
        <h2 className="font-mono text-sm sm:text-base font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-wide">
          <div className="w-1 h-5 bg-blue-600"></div>
          {title}
        </h2>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-zinc-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-zinc-500" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          {children}
        </div>
      )}
    </div>
  );
};

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
export const DropdownSelect = ({ value, onChange, options, placeholder = "Select...", filled, ...rest }) => (
  <Select value={value || BLANK} onValueChange={(v) => onChange(v === BLANK ? "" : v)}>
    <SelectTrigger className={`h-10 font-mono text-sm ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`} {...rest}>
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
export const YesNoSelect = ({ value, onChange, filled, ...rest }) => (
  <DropdownSelect value={value} onChange={onChange} options={ASE_OPTIONS.yesNo} placeholder="Select..." filled={filled} {...rest} />
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

// Calendar date picker field (value: "YYYY-MM-DD" string)
export const DatePickerField = ({ value, onChange, filled, testId }) => {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T00:00:00`) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-testid={testId}
          className={`h-10 w-full justify-start font-mono text-sm font-normal ${filled ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}
        >
          <CalendarIcon className="w-4 h-4 mr-2 text-zinc-500" />
          {date ? format(date, "MM/dd/yyyy") : <span className="text-zinc-400">Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white" align="start">
        <CalendarPicker
          mode="single"
          selected={date}
          onSelect={(d) => { if (d) onChange(format(d, "yyyy-MM-dd")); setOpen(false); }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
};
