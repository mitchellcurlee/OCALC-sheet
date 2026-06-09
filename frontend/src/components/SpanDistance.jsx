import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Span distance selector built from two dropdowns that combine into a total:
//   hundreds (0-10) * 100 + remainder (0-99)  e.g. 2 + 50 => 250 ft
const HUNDREDS_OPTIONS = Array.from({ length: 11 }, (_, i) => i); // 0-10
const REMAINDER_OPTIONS = Array.from({ length: 100 }, (_, i) => i); // 0-99

const splitValue = (value) => {
  if (value === "" || value === null || value === undefined) return { hundreds: "", remainder: "" };
  const v = parseInt(parseFloat(value), 10);
  if (Number.isNaN(v)) return { hundreds: "", remainder: "" };
  const hundreds = Math.floor(v / 100);
  const remainder = v % 100;
  return { hundreds: hundreds ? String(hundreds) : "", remainder: String(remainder) };
};

const combine = (hundreds, remainder) => {
  if (hundreds === "" && remainder === "") return "";
  const h = hundreds === "" ? 0 : parseInt(hundreds, 10);
  const r = remainder === "" ? 0 : parseInt(remainder, 10);
  return String(h * 100 + r);
};

export const SpanDistance = ({ value, onChange, label = "Distance (ft)", testId }) => {
  const { hundreds, remainder } = splitValue(value);

  const handleHundreds = (h) => onChange(combine(h, remainder));
  const handleRemainder = (r) => onChange(combine(hundreds, r));

  const triggerCls = "h-9 bg-white border-zinc-300 text-zinc-900 text-sm";

  return (
    <div className="space-y-1">
      <Label className="text-xs font-mono text-zinc-500">{label}</Label>
      <div className="flex items-center gap-1">
        <Select value={hundreds} onValueChange={handleHundreds}>
          <SelectTrigger className={triggerCls} data-testid={testId ? `${testId}-hundreds` : undefined}>
            <SelectValue placeholder="0" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
            {HUNDREDS_OPTIONS.map((h) => (
              <SelectItem key={h} value={String(h)}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={remainder} onValueChange={handleRemainder}>
          <SelectTrigger className={triggerCls} data-testid={testId ? `${testId}-remainder` : undefined}>
            <SelectValue placeholder="00" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
            {REMAINDER_OPTIONS.map((r) => (
              <SelectItem key={r} value={String(r)}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default SpanDistance;
