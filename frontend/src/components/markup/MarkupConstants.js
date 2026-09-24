import { Square, Circle, ArrowRight, Minus, Triangle } from "lucide-react";

// Underground marker types - matches backend UNDERGROUND_TYPES exactly
export const UG_MARKERS = [
  { type: "HH", label: "Handhole", color: "#16a34a" },
  { type: "MH", label: "Manhole", color: "#16a34a" },
  { type: "BE", label: "Brooks Enclosure", color: "#16a34a" },
  { type: "FP", label: "Flowerpot", color: "#16a34a" },
  { type: "HB", label: "Hoffman Box", color: "#16a34a" },
  { type: "PED", label: "Pedestal", color: "#16a34a" },
  { type: "PI", label: "Point of Intersection", color: "#16a34a" },
  { type: "FBT", label: "FBT", color: "#2563eb" },
  { type: "NTE", label: "NTE", color: "#2563eb" },
  { type: "F/N", label: "FBT/NTE", color: "#2563eb" },
  { type: "PFP", label: "PFP", color: "#16a34a" },
  { type: "SOC-S", label: "SOC Start", color: "#f97316" },
  { type: "SOC-E", label: "SOC End", color: "#f97316" },
  { type: "RSR", label: "Riser", color: "#8b5cf6" },
  { type: "MPOE", label: "MPOE", color: "#dc2626" },
  { type: "EOP", label: "Edge of Pavement", color: "#64748b" },
  { type: "ROW", label: "Right of Way", color: "#64748b" },
  { type: "DW-S", label: "DW Start", color: "#0891b2" },
  { type: "DW-E", label: "DW End", color: "#0891b2" },
  { type: "UGP-S", label: "UG Path Start", color: "#0891b2" },
  { type: "UGP-E", label: "UG Path End", color: "#0891b2" },
  { type: "GAS", label: "Gas Line", color: "#eab308" },
  { type: "C", label: "Core", color: "#0f766e" },
  { type: "ST-S", label: "St. Start", color: "#1d4ed8" },
  { type: "ST-E", label: "St. End", color: "#b91c1c" },
  { type: "UGP", label: "Underground Path", color: "#0e7490" },
  { type: "AS", label: "Aerial Splice", color: "#2563eb" },
  { type: "LOOP", label: "Loop", color: "#2563eb" },
  { type: "PWR", label: "Power", color: "#dc2626" },
  { type: "X-Mes.", label: "X-Messenger", color: "#2563eb" },
  { type: "CULV", label: "Culvert", color: "#0891b2" },
  { type: "DR-S", label: "Drainage Start", color: "#0891b2" },
  { type: "DR-E", label: "Drainage End", color: "#0891b2" },
  { type: "EB", label: "Eyebolt", color: "#2563eb" },
  { type: "PB", label: "Pullbox", color: "#2563eb" },
  { type: "WH", label: "Weather Head", color: "#2563eb" },
  { type: "FDF", label: "FDF", color: "#2563eb" },
  { type: "GV", label: "Gas Valve", color: "#eab308" },
  { type: "GM", label: "Gas Meter", color: "#eab308" },
  { type: "FST", label: "FST", color: "#2563eb" },
  { type: "WMV", label: "Water Meter/Valve", color: "#0891b2" },
];

export const LINE_COLORS = [
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#9333ea" },
  { name: "Yellow", value: "#eab308" },
  { name: "Black", value: "#18181b" },
  { name: "White", value: "#ffffff" },
];

export const SHAPES = [
  { type: "rectangle", icon: Square, label: "Rectangle" },
  { type: "circle", icon: Circle, label: "Circle" },
  { type: "arrow", icon: ArrowRight, label: "Arrow" },
  { type: "line", icon: Minus, label: "Line" },
  { type: "triangle", icon: Triangle, label: "Triangle" },
];

// Calculate distance from point to line segment (for hit detection)
export const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
};

// Helper to get full photo URL
export const getPhotoUrl = (photo) => {
  if (!photo) return null;
  // Already a full URL
  if (photo.startsWith('http://') || photo.startsWith('https://')) {
    return photo;
  }
  // Data URL
  if (photo.startsWith('data:')) {
    return photo;
  }
  // Relative API path - prepend origin
  if (photo.startsWith('/api/')) {
    return `${window.location.origin}${photo}`;
  }
  // Other relative path
  return photo;
};
