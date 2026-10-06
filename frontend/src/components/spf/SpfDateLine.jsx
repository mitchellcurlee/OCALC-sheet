import { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const toDisplayDate = (v) => {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return format(new Date(`${v}T00:00:00`), "MM/dd/yyyy");
  return v;
};

const parseTyped = (v) => {
  for (const f of ["MM/dd/yyyy", "M/d/yyyy", "yyyy-MM-dd", "MM-dd-yyyy"]) {
    const d = parse(v || "", f, new Date());
    if (isValid(d)) return d;
  }
  return undefined;
};

/** Typeable date line with a calendar picker (SPF form). Value is stored as MM/DD/YYYY text. */
export const SpfDateLine = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const date = parseTyped(value);
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="spf-line-date">
      <span className="text-sm font-semibold text-zinc-800 whitespace-nowrap">Date:</span>
      <div className="flex items-end w-64">
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="MM/DD/YYYY" className="h-8 bg-white border-0 border-b-2 border-zinc-500 rounded-none px-1 text-sm focus-visible:ring-0" data-testid="spf-date" />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-blue-600" aria-label="Pick a date" data-testid="spf-date-calendar-btn"><CalendarIcon className="w-4 h-4" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-white" align="start">
            <CalendarPicker mode="single" selected={date} defaultMonth={date} onSelect={(d) => { if (d) onChange(format(d, "MM/dd/yyyy")); setOpen(false); }} initialFocus />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
