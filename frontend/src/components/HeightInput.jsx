import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Feet/Inches dropdown height selector.
// Stores/returns a decimal-feet value as a string (e.g. 35.5 for 35' 6").
const FEET_OPTIONS = Array.from({ length: 51 }, (_, i) => i); // 0-50
const INCH_OPTIONS = Array.from({ length: 12 }, (_, i) => i); // 0-11

const decimalToFeetInches = (value) => {
  if (value === "" || value === null || value === undefined) return { feet: "", inches: "" };
  const v = parseFloat(value);
  if (Number.isNaN(v)) return { feet: "", inches: "" };
  let feet = Math.floor(v);
  let inches = Math.round((v - feet) * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet: String(feet), inches: String(inches) };
};

const feetInchesToDecimal = (feet, inches) => {
  const f = feet === "" ? 0 : parseInt(feet, 10);
  const i = inches === "" ? 0 : parseInt(inches, 10);
  if (feet === "" && inches === "") return "";
  return String(Math.round((f + i / 12) * 10000) / 10000);
};

export const HeightInput = ({ value, onChange, label = "Height", testId, compact = false }) => {
  const { feet, inches } = decimalToFeetInches(value);

  const handleFeet = (f) => onChange(feetInchesToDecimal(f, inches));
  const handleInches = (i) => onChange(feetInchesToDecimal(feet, i));

  const triggerCls = "h-9 bg-white border-zinc-300 text-zinc-900 text-sm";

  return (
    <div className="space-y-1">
      <Label className="text-xs font-mono text-zinc-500">{label}</Label>
      <div className="flex gap-1">
        <Select value={feet} onValueChange={handleFeet}>
          <SelectTrigger className={triggerCls} data-testid={testId ? `${testId}-feet` : undefined}>
            <SelectValue placeholder="ft" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
            {FEET_OPTIONS.map((f) => (
              <SelectItem key={f} value={String(f)}>{f}{"'"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={inches} onValueChange={handleInches}>
          <SelectTrigger className={triggerCls} data-testid={testId ? `${testId}-inches` : undefined}>
            <SelectValue placeholder="in" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
            {INCH_OPTIONS.map((i) => (
              <SelectItem key={i} value={String(i)}>{i}{'"'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

// Format a decimal-feet value for read-only display (e.g. 35' 6")
export const formatHeight = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const v = parseFloat(value);
  if (Number.isNaN(v)) return String(value);
  let feet = Math.floor(v);
  let inches = Math.round((v - feet) * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet}' ${inches}"`;
};

export default HeightInput;
