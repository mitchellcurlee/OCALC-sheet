import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

// Single "lat, lng" input (e.g. "30.04576436068295, -95.59152540980482").
// Splits into separate latitude/longitude values for storage/exports.
export const parseCoords = (raw) => {
  const tokens = String(raw || "").split(/[,\s]+/).filter(Boolean);
  return { lat: tokens[0] || "", lng: tokens[1] || "" };
};

export const CoordinateInput = ({ latitude, longitude, onChange, className = "", testId = "coordinate-input" }) => {
  const joined = [latitude, longitude].filter((v) => v !== "" && v != null).join(", ");
  const [text, setText] = useState(joined);

  useEffect(() => {
    const parsed = parseCoords(text);
    if (parsed.lat !== String(latitude ?? "") || parsed.lng !== String(longitude ?? "")) {
      setText(joined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setText(raw);
    const { lat, lng } = parseCoords(raw);
    onChange(lat, lng);
  };

  return (
    <Input
      type="text"
      value={text}
      onChange={handleChange}
      placeholder="30.04576436068295, -95.59152540980482"
      className={className || "h-10 bg-white border-zinc-300 text-zinc-900 font-mono"}
      data-testid={testId}
    />
  );
};

export default CoordinateInput;
