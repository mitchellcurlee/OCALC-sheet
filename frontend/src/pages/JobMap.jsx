import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import domtoimage from "dom-to-image-more";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Zap, AlertTriangle, Crosshair, ChevronDown, FileImage, Files, Edit3, Save, X, StickyNote, Ruler, Camera, Hash, Link2, Move, Palette, Plus, Map as MapIcon, GripVertical, Upload, Trash2 } from "lucide-react";
import SpanReorderList from "@/components/SpanReorderList";
import { computeRoute, fmtFeet, feetToStation, markerLabel, downloadPoleMapImage, downloadSegmentedMapPages, downloadMapPdfPages, ugWithGps, undergroundAbbr, computeUgConnectors, computeConnectionPairs, computeStationSegFeet, UNDERGROUND_TYPES, isAerialAttr, resolvePairAerial } from "@/lib/poleMapImage";
import { ExportDestinationDialog } from "@/components/ExportDestinationDialog";
import { CLOUD_EXPORT_LABELS, uploadExportToCloud } from "@/lib/cloudExports";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EditableRoute from "@/components/EditableRoute";
import MapAnnotations from "@/components/MapAnnotations";

const MAP_AERIAL_ADD_TYPES = ["Loop", "Aerial Splice", "Power", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head"];

const MARKER_COLOR_CHOICES = ["#dc2626", "#2563eb", "#16a34a", "#39ff14", "#ea580c", "#ff6600", "#9333ea", "#facc15"];

// Camera/upload buttons in map quick-edit popups: photos go to the item's unsorted gallery
const PopupPhotoAdder = ({ endpoint, item, onSaved }) => {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const urls = [];
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await axios.post("/upload-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
        urls.push(res.data.url);
      } catch {
        toast.error(`Failed to upload ${f.name}`);
      }
    }
    if (urls.length) {
      try {
        const res = await axios.put(endpoint, { staged_photos: [...(item.staged_photos || []), ...urls] });
        onSaved(res.data);
        toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} added — sort them in the full form`);
      } catch {
        toast.error("Failed to save photos");
      }
    }
    setBusy(false);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} data-testid="popup-camera-input" />
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} data-testid="popup-upload-input" />
        <Button size="sm" variant="outline" disabled={busy} className="flex-1 h-7 text-xs bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100" onClick={() => camRef.current?.click()} data-testid="popup-camera-btn">
          <Camera className="w-3.5 h-3.5 mr-1" />{busy ? "Uploading…" : "Camera"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} className="flex-1 h-7 text-xs bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100" onClick={() => fileRef.current?.click()} data-testid="popup-upload-btn">
          <Upload className="w-3.5 h-3.5 mr-1" />Photos
        </Button>
        {(item.staged_photos?.length || 0) > 0 && (
          <span className="text-[10px] font-mono text-zinc-500 whitespace-nowrap" data-testid="popup-staged-count">{item.staged_photos.length} unsorted</span>
        )}
      </div>
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!item.auto_label_unsorted}
          onChange={async (e) => {
            const v = e.target.checked;
            try {
              const res = await axios.put(endpoint, { auto_label_unsorted: v });
              onSaved(res.data);
              toast.success(v ? "Unsorted photos will be auto-labeled with this item's name" : "Auto-label off — photos saved as Unsorted");
            } catch (err) {
              toast.error("Failed to update auto-label");
            }
          }}
          className="accent-sky-600 w-3.5 h-3.5"
          data-testid="popup-autolabel-toggle"
        />
        <span className="text-[10px] text-sky-800">Auto-label unsorted photos with item name</span>
      </label>
    </div>
  );
};

// Inline quick-edit + marker color picker shown inside underground attribute popups
const UgPopupEditor = ({ item, defaultColor, onSaved, onDeleted }) => {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label || "");
  const [fid, setFid] = useState(item.fid || "");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/underground/${item.id}`);
      toast.success("Moved to Deleted Items — restore it anytime from the trash folder");
      onDeleted?.(item.id);
    } catch (e) {
      toast.error("Failed to delete item");
      setDeleting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`/underground/${item.id}`, { label, fid });
      onSaved(res.data);
      toast.success("Attribute updated");
      setEditing(false);
    } catch (e) {
      toast.error("Failed to update attribute");
    } finally {
      setSaving(false);
    }
  };

  const setColor = async (hex) => {
    try {
      const res = await axios.put(`/underground/${item.id}`, { marker_color: hex });
      onSaved(res.data);
      toast.success("Marker color updated");
    } catch (e) {
      toast.error("Failed to update color");
    }
  };

  const setClass = async (val) => {
    try {
      const res = await axios.put(`/underground/${item.id}`, { aerial_override: val });
      onSaved(res.data);
      toast.success(`Marked as ${val === "aerial" ? "Aerial" : val === "neutral" ? "Neutral" : "Underground"}`);
    } catch (e) {
      toast.error("Failed to update type");
    }
  };
  const isNeutral = item.aerial_override === "neutral";
  const effAerial = !isNeutral && isAerialAttr(item);
  const neutralAllowed = ["Point of Intersection", "FBT", "NTE", "Pullbox", "Aerial PI", "Aerial FBT", "Aerial NTE"].includes(item.type);

  const inputCls = "w-full h-7 px-2 text-xs border border-zinc-300 rounded bg-white text-zinc-900";
  // Button and form both stay mounted (CSS toggle): unmounting the clicked element mid-click detaches it from the DOM, breaking Leaflet's popup click detection and closing the popup
  return (
    <div className="mt-2 border-t border-zinc-200 pt-2 space-y-2">
      <PopupPhotoAdder endpoint={`/underground/${item.id}`} item={item} onSaved={onSaved} />
      <div className={editing ? "space-y-1.5" : "hidden"} data-testid={`ug-quickedit-form-${item.id}`}>
        <div>
          <label className="text-[10px] text-zinc-400 uppercase">Label / ID</label>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} data-testid="ug-label-input" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-400 uppercase">FID</label>
          <input className={inputCls} value={fid} onChange={(e) => setFid(e.target.value)} data-testid="ug-fid-input" />
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving} onClick={save} data-testid="ug-quickedit-save">{saving ? "Saving…" : "Save"}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-zinc-100 border-zinc-300 text-zinc-900" onClick={() => setEditing(false)} data-testid="ug-quickedit-cancel">Cancel</Button>
        </div>
      </div>
      <Button size="sm" variant="outline" className={`w-full h-7 text-xs bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900 ${editing ? "hidden" : ""}`} onClick={() => setEditing(true)} data-testid={`ug-quickedit-btn-${item.id}`}>Quick Edit Label/FID</Button>
      <div>
        <div className="text-[10px] text-zinc-400 uppercase mb-1">Attribute Type</div>
        <div className="flex gap-1.5" data-testid={`ug-class-row-${item.id}`}>
          <Button size="sm" onClick={() => setClass("aerial")} className={`flex-1 h-7 text-xs ${effAerial ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-zinc-100 border border-zinc-300 text-zinc-900 hover:bg-zinc-200"}`} data-testid={`ug-class-aerial-${item.id}`}>Aerial</Button>
          <Button size="sm" onClick={() => setClass("underground")} className={`flex-1 h-7 text-xs ${!isNeutral && !effAerial ? "bg-green-600 hover:bg-green-700 text-white" : "bg-zinc-100 border border-zinc-300 text-zinc-900 hover:bg-zinc-200"}`} data-testid={`ug-class-ug-${item.id}`}>Underground</Button>
          {neutralAllowed && (
            <Button size="sm" onClick={() => setClass("neutral")} title="Pass-through: connected spans take their type from the other end" className={`flex-1 h-7 text-xs ${isNeutral ? "bg-zinc-600 hover:bg-zinc-700 text-white" : "bg-zinc-100 border border-zinc-300 text-zinc-900 hover:bg-zinc-200"}`} data-testid={`ug-class-neutral-${item.id}`}>Neutral</Button>
          )}
        </div>
      </div>
      <div>
        <div className="text-[10px] text-zinc-400 uppercase mb-1">Marker Color</div>
        <div className="flex gap-1.5" data-testid={`ug-color-row-${item.id}`}>
          {MARKER_COLOR_CHOICES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hex)}
              className={`w-5 h-5 rounded-full border-2 ${(item.marker_color || defaultColor) === hex ? "border-zinc-900 ring-2 ring-offset-1 ring-zinc-400" : "border-white shadow"}`}
              style={{ backgroundColor: hex }}
              data-testid={`ug-color-${hex.replace("#", "")}`}
            />
          ))}
        </div>
      </div>
      <div className={confirmDel ? "space-y-1.5" : "hidden"} data-testid={`ug-delete-confirm-${item.id}`}>
        <div className="text-[11px] text-red-700 font-semibold">Delete this item? It moves to Deleted Items (restorable).</div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs bg-red-600 hover:bg-red-700 text-white" disabled={deleting} onClick={doDelete} data-testid={`ug-delete-yes-${item.id}`}>{deleting ? "Deleting…" : "Yes, delete"}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-zinc-100 border-zinc-300 text-zinc-900" onClick={() => setConfirmDel(false)} data-testid={`ug-delete-cancel-${item.id}`}>Cancel</Button>
        </div>
      </div>
      <Button size="sm" variant="outline" className={`w-full h-7 text-xs bg-red-50 border-red-300 text-red-700 hover:bg-red-100 ${confirmDel ? "hidden" : ""}`} onClick={() => setConfirmDel(true)} data-testid={`ug-delete-btn-${item.id}`}>
        <Trash2 className="w-3.5 h-3.5 mr-1" />Delete Item
      </Button>
    </div>
  );
};

// Inline quick-edit + marker color picker shown inside the pole popup
const PolePopupEditor = ({ pole, onSaved, onDeleted }) => {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(pole.pole_number || "");
  const [cls, setCls] = useState(pole.pole_class || "");
  const [size, setSize] = useState(pole.pole_size || "");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/poles/${pole.id}`);
      toast.success("Pole moved to Deleted Items — restore it anytime from the trash folder");
      onDeleted?.(pole.id);
    } catch (e) {
      toast.error("Failed to delete pole");
      setDeleting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`/poles/${pole.id}`, { pole_number: num, pole_class: cls, pole_size: size });
      onSaved(res.data);
      toast.success("Pole updated");
      setEditing(false);
    } catch (e) {
      toast.error("Failed to update pole");
    } finally {
      setSaving(false);
    }
  };

  const setColor = async (hex) => {
    try {
      const res = await axios.put(`/poles/${pole.id}`, { marker_color: hex });
      onSaved(res.data);
      toast.success("Marker color updated");
    } catch (e) {
      toast.error("Failed to update color");
    }
  };

  const inputCls = "w-full h-7 px-2 text-xs border border-zinc-300 rounded bg-white text-zinc-900";
  // Button and form both stay mounted (CSS toggle) — see UgPopupEditor note
  return (
    <div className="mt-2 border-t border-zinc-200 pt-2 space-y-2">
      <PopupPhotoAdder endpoint={`/poles/${pole.id}`} item={pole} onSaved={onSaved} />
      <div className={editing ? "space-y-1.5" : "hidden"} data-testid={`pole-quickedit-form-${pole.id}`}>
        <div>
          <label className="text-[10px] text-zinc-400 uppercase">Pole Number</label>
          <input className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} data-testid="pole-num-input" />
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1">
            <label className="text-[10px] text-zinc-400 uppercase">Class</label>
            <input className={inputCls} value={cls} onChange={(e) => setCls(e.target.value)} data-testid="pole-class-input" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-zinc-400 uppercase">Size (ft)</label>
            <input className={inputCls} value={size} onChange={(e) => setSize(e.target.value)} data-testid="pole-size-input" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving} onClick={save} data-testid="pole-quickedit-save">{saving ? "Saving…" : "Save"}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-zinc-100 border-zinc-300 text-zinc-900" onClick={() => setEditing(false)} data-testid="pole-quickedit-cancel">Cancel</Button>
        </div>
      </div>
      <Button size="sm" variant="outline" className={`w-full h-7 text-xs bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900 ${editing ? "hidden" : ""}`} onClick={() => setEditing(true)} data-testid={`pole-quickedit-btn-${pole.id}`}>Quick Edit #/Class/Size</Button>
      <div>
        <div className="text-[10px] text-zinc-400 uppercase mb-1">Marker Color</div>
        <div className="flex gap-1.5" data-testid={`pole-color-row-${pole.id}`}>
          {MARKER_COLOR_CHOICES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hex)}
              className={`w-5 h-5 rounded-full border-2 ${(pole.marker_color || "#dc2626") === hex ? "border-zinc-900 ring-2 ring-offset-1 ring-zinc-400" : "border-white shadow"}`}
              style={{ backgroundColor: hex }}
              data-testid={`pole-color-${hex.replace("#", "")}`}
            />
          ))}
        </div>
      </div>
      <div className={confirmDel ? "space-y-1.5" : "hidden"} data-testid={`pole-delete-confirm-${pole.id}`}>
        <div className="text-[11px] text-red-700 font-semibold">Delete this pole? It moves to Deleted Items (restorable).</div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs bg-red-600 hover:bg-red-700 text-white" disabled={deleting} onClick={doDelete} data-testid={`pole-delete-yes-${pole.id}`}>{deleting ? "Deleting…" : "Yes, delete"}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-zinc-100 border-zinc-300 text-zinc-900" onClick={() => setConfirmDel(false)} data-testid={`pole-delete-cancel-${pole.id}`}>Cancel</Button>
        </div>
      </div>
      <Button size="sm" variant="outline" className={`w-full h-7 text-xs bg-red-50 border-red-300 text-red-700 hover:bg-red-100 ${confirmDel ? "hidden" : ""}`} onClick={() => setConfirmDel(true)} data-testid={`pole-delete-btn-${pole.id}`}>
        <Trash2 className="w-3.5 h-3.5 mr-1" />Delete Pole
      </Button>
    </div>
  );
};

// Captures a single map tap while placing a new attribute
const PlaceAttributeHandler = ({ onPlace }) => {
  useMapEvents({ click: (e) => onPlace(e.latlng) });
  return null;
};

// Path color options
const PATH_COLORS = {
  blue: { name: "Blue", hex: "#2563eb" },
  green: { name: "Green", hex: "#16a34a" },
  orange: { name: "Orange", hex: "#ea580c" },
  purple: { name: "Purple", hex: "#9333ea" },
  yellow: { name: "Yellow", hex: "#facc15" },
  red: { name: "Red", hex: "#dc2626" },
};

// Default colors
const DEFAULT_AERIAL_COLOR = "blue";
const DEFAULT_UNDERGROUND_COLOR = "green";

// Format riser height from decimal feet to feet'inches"
const formatRiserHeight = (value) => {
  if (!value || value === "") return "";
  const v = parseFloat(value);
  if (Number.isNaN(v)) return String(value);
  let feet = Math.floor(v);
  let inches = Math.round((v - feet) * 12);
  if (inches === 12) { feet += 1; inches = 0; }
  return `${feet}' ${inches}"`;
};

// Small red dot for pole marker with label on the side
const poleIcon = (label, offsetDir = "right", color = "#dc2626") => {
  // offsetDir: "right", "left", "top", "bottom" for label placement
  const dotSize = 8; // Smaller dot
  const labelOffset = offsetDir === "right" ? "left: 18px;" : 
                      offsetDir === "left" ? "right: 18px;" :
                      offsetDir === "top" ? "bottom: 16px; left: 50%; transform: translateX(-50%);" :
                      "top: 16px; left: 50%; transform: translateX(-50%);";
  
  return L.divIcon({
    className: "pole-route-marker",
    html: `
      <div style="position:relative;">
        <div style="background:${color};border:1.5px solid #fff;border-radius:50%;width:${dotSize}px;height:${dotSize}px;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>
        <div style="position:absolute;${labelOffset}top:50%;transform:translateY(-50%);background:${color};color:#fff;border:1px solid #fff;border-radius:5px;padding:2px 5px;font:600 9px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3);">${label}</div>
      </div>
    `,
    iconSize: [dotSize, dotSize],
    iconAnchor: [dotSize / 2, dotSize / 2],
  });
};

// Pole marker with arrow pointing to the dot (for clustered poles)
const poleIconWithArrow = (label, arrowAngle, distance = 45, color = "#dc2626") => {
  const dotSize = 8; // Smaller dot
  const rad = (arrowAngle * Math.PI) / 180;
  const labelX = Math.cos(rad) * distance;
  const labelY = Math.sin(rad) * distance;
  
  return L.divIcon({
    className: "pole-route-marker-arrow",
    html: `
      <div style="position:relative;">
        <div style="background:${color};border:1.5px solid #fff;border-radius:50%;width:${dotSize}px;height:${dotSize}px;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>
        <svg style="position:absolute;left:${dotSize/2}px;top:${dotSize/2}px;overflow:visible;pointer-events:none;" width="1" height="1">
          <line x1="0" y1="0" x2="${labelX}" y2="${labelY}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2"/>
        </svg>
        <div style="position:absolute;left:${labelX + dotSize/2 - 20}px;top:${labelY + dotSize/2 - 10}px;background:${color};color:#fff;border:1px solid #fff;border-radius:5px;padding:2px 5px;font:600 9px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3);">${label}</div>
      </div>
    `,
    iconSize: [dotSize, dotSize],
    iconAnchor: [dotSize / 2, dotSize / 2],
  });
};

// Small direction arrow centered on the segment midpoint (BLUE for aerial)
const arrowIcon = (deg) =>
  L.divIcon({
    className: "seg-arrow",
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#2563eb;font-size:16px;line-height:1;transform:rotate(${deg}deg);">&#8593;</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

// Aerial footage pill with ORANGE dotted arrow pointing to segment (closer to span)
// Attribute types treated as AERIAL (blue) on the map
const AERIAL_ATTR_TYPES = new Set(["Loop", "Aerial Splice", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head", "Aerial NTE", "Aerial PI", "Aerial FBT"]);

const numberBadgeIcon = (num, color = "#ea580c", anchor = [13, 13]) =>
  L.divIcon({
    className: "measurement-number-badge",
    html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:9999px;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:700 13px/1 ui-monospace,monospace;box-shadow:0 1px 4px rgba(0,0,0,.5);padding:0 4px;">${num}</div>`,
    iconSize: [26, 26],
    iconAnchor: anchor,
  });

const labelIcon = (text, ox, oy, isAfterMPOE = false) => {
  // Use orange for the arrow/connector, keep pill colors based on MPOE status
  const arrowColor = "#f97316"; // Orange
  const pillBorder = isAfterMPOE ? "#dc2626" : "#2563eb";
  const pillText = isAfterMPOE ? "#991b1b" : "#1e40af";
  
  return L.divIcon({
    className: "seg-label",
    html: `
      <div style="position:relative;width:80px;height:30px;">
        <svg style="position:absolute;left:40px;top:15px;overflow:visible;pointer-events:none;" width="1" height="1">
          <line x1="0" y1="0" x2="${-ox}" y2="${-oy}" stroke="${arrowColor}" stroke-width="2" stroke-dasharray="4,3"/>
          <circle cx="${-ox}" cy="${-oy}" r="3" fill="${arrowColor}"/>
        </svg>
        <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid ${pillBorder};border-radius:11px;padding:2px 8px;font-family:ui-monospace,monospace;font-weight:700;font-size:11px;color:${pillText};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);">${text}</span>
      </div>
    `,
    iconSize: [80, 30],
    iconAnchor: [40 - ox, 15 - oy],
  });
};

// Underground item marker (colored square with abbreviation, RED for MPOE) - smaller
const ugIcon = (abbr, isRed = false, color = '#16a34a') =>
  L.divIcon({
    className: "ug-marker",
    html: `<div style="background:${isRed ? '#dc2626' : color};color:#fff;border:1.5px solid #fff;border-radius:3px;min-width:18px;height:18px;padding:0 3px;display:flex;align-items:center;justify-content:center;font:600 9px/1 ui-monospace,monospace;box-shadow:0 1px 3px rgba(0,0,0,.4);white-space:nowrap;">${abbr}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

// Underground connector distance label (colored or RED pill)
const ugConnectorLabel = (text, isRed = false, color = '#16a34a') =>
  L.divIcon({
    className: "ug-connector-label",
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><span style="background:#fff;border:1.5px solid ${isRed ? '#dc2626' : color};border-radius:11px;padding:2px 10px;font-family:ui-monospace,monospace;font-weight:700;font-size:11px;color:${isRed ? '#dc2626' : color};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);">${text}</span></div>`,
    iconSize: [100, 28],
    iconAnchor: [50, 14],
  });

const FitBounds = ({ points, disabled = false }) => {
  const map = useMap();
  const initialFitDone = useRef(false);
  useEffect(() => {
    // Only fit bounds on initial load, not during edits
    if (disabled || initialFitDone.current) return;
    if (points.length === 1) map.setView(points[0], 19);
    else if (points.length > 1) map.fitBounds(points, { padding: [60, 60], maxZoom: 20 });
    initialFitDone.current = true;
  }, [points, map, disabled]);
  return null;
};

const MapRefSetter = ({ mapRef }) => {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
};

// Draggable marker component for position edit mode
const DraggableMarker = ({ position, icon, children, draggable, onDragEnd, onDoubleClick, zIndexOffset = 0, autoOpen = false }) => {
  const markerRef = useRef(null);

  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => {
      try { markerRef.current?.openPopup(); } catch (e) { /* map may not be ready */ }
    }, 900);
    return () => clearTimeout(t);
  }, [autoOpen]);
  
  const eventHandlers = useMemo(() => ({
    dragend() {
      const marker = markerRef.current;
      if (marker && onDragEnd) {
        const newPos = marker.getLatLng();
        onDragEnd(newPos.lat, newPos.lng);
      }
    },
    dblclick(e) {
      if (onDoubleClick) {
        e.originalEvent.stopPropagation();
        onDoubleClick();
      }
    },
  }), [onDragEnd, onDoubleClick]);

  return (
    <Marker 
      position={position} 
      icon={icon} 
      draggable={draggable}
      eventHandlers={eventHandlers}
      ref={markerRef}
      zIndexOffset={zIndexOffset}
    >
      {children}
    </Marker>
  );
};

const JobMap = () => {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [underground, setUnderground] = useState([]);
  const [customRoutes, setCustomRoutes] = useState({});
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showStationNumbers, setShowStationNumbers] = useState(() => {
    try { return localStorage.getItem(`staToggle:${jobId}`) === '1'; } catch (e) { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(`staToggle:${jobId}`, showStationNumbers ? '1' : '0'); } catch (e) { /* ignore */ }
  }, [showStationNumbers, jobId]);
  const [editMode, setEditMode] = useState(false);
  // Map legend: hide/show + draggable position (persisted)
  const [legendVisible, setLegendVisible] = useState(() => {
    try { return localStorage.getItem('mapLegendVisible') !== '0'; } catch (e) { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('mapLegendVisible', legendVisible ? '1' : '0'); } catch (e) { /* ignore */ }
  }, [legendVisible]);
  const [legendPos, setLegendPos] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('mapLegendPos') || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null; } catch (e) { return null; }
  });
  const legendDragRef = useRef(null);
  const handleLegendPointerDown = useCallback((e) => {
    const box = e.currentTarget.closest('[data-testid="map-legend"]');
    const wrap = box?.offsetParent;
    if (!box || !wrap) return;
    e.preventDefault();
    const boxRect = box.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const origX = boxRect.left - wrapRect.left, origY = boxRect.top - wrapRect.top;
    const move = (ev) => {
      const x = Math.min(Math.max(origX + ev.clientX - startX, 0), wrapRect.width - boxRect.width);
      const y = Math.min(Math.max(origY + ev.clientY - startY, 0), wrapRect.height - boxRect.height);
      legendDragRef.current = { x, y };
      setLegendPos({ x, y });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { if (legendDragRef.current) localStorage.setItem('mapLegendPos', JSON.stringify(legendDragRef.current)); } catch (err) { /* ignore */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);
  const [placingType, setPlacingType] = useState(null); // "__pole__" | "__pole_terminal__" | underground type name
  const basemap = "esri";
  const [mapLayer, setMapLayer] = useState(() => {
    try { return localStorage.getItem('mapLayer') || 'aerial'; } catch (e) { return 'aerial'; }
  });
  const [spanReorder, setSpanReorder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  useEffect(() => {
    try { localStorage.setItem('mapLayer', mapLayer); } catch (e) { /* ignore */ }
  }, [mapLayer]);
  const navigate = useNavigate();
  const [connectionEditMode, setConnectionEditMode] = useState(false);
  const [selectedConn, setSelectedConn] = useState(null);
  const [reconnectSide, setReconnectSide] = useState(null);
  const [addingConn, setAddingConn] = useState(null);
  const [confirmDeleteConn, setConfirmDeleteConn] = useState(null);
  const [confirmResetLines, setConfirmResetLines] = useState(false);
  const [positionEditMode, setPositionEditMode] = useState(false);
  const [connections, setConnections] = useState([]);
  const [addingType, setAddingType] = useState(null); // "note" or "measurement"
  const [saving, setSaving] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);
  const [labelOffsets, setLabelOffsets] = useState({}); // Custom offsets for station labels { [itemId]: [latOffset, lngOffset] }
  const [measurementOffsets, setMeasurementOffsets] = useState({}); // Custom offsets for measurement labels { [segmentKey]: [latOffset, lngOffset] }
  const [aerialColor, setAerialColor] = useState(DEFAULT_AERIAL_COLOR); // Default color for aerial routes
  const [undergroundColor, setUndergroundColor] = useState(DEFAULT_UNDERGROUND_COLOR); // Default color for underground routes
  const [segmentColors, setSegmentColors] = useState({}); // Per-segment color overrides { [segmentKey]: colorKey }
  const [selectedSegment, setSelectedSegment] = useState(null); // Currently selected segment for color editing
  const [customLabelTexts, setCustomLabelTexts] = useState({}); // Custom text overrides { [labelId]: text }
  const [editingLabelId, setEditingLabelId] = useState(null); // Currently editing label ID
  const [editingLabelText, setEditingLabelText] = useState(""); // Text being edited
  const mapRef = useRef(null);
  // Focus an item after returning from its edit page (?focus=<itemId>)
  const focusItemId = searchParams.get("focus");
  useEffect(() => {
    if (!focusItemId) return;
    const target = poles.find((x) => x.id === focusItemId) || underground.find((x) => x.id === focusItemId);
    if (!target || target.latitude == null || target.longitude == null) return;
    const pos = [parseFloat(target.latitude), parseFloat(target.longitude)];
    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) return;
    const timers = [500, 1500].map((ms) => setTimeout(() => {
      const m = mapRef.current;
      if (m) m.setView(pos, Math.max(m.getZoom() || 0, 18));
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, [focusItemId, poles, underground]);
  const autoDownloadedRef = useRef(false);

  // Get the actual hex color for aerial and underground paths
  const aerialColorHex = PATH_COLORS[aerialColor]?.hex || PATH_COLORS.blue.hex;
  const undergroundColorHex = PATH_COLORS[undergroundColor]?.hex || PATH_COLORS.green.hex;
  
  // Get color for a specific segment (uses segment override or default)
  const getSegmentColor = useCallback((segmentKey, isAerial, isRed) => {
    if (isRed) return "#dc2626"; // Red for after MPOE
    if (segmentColors[segmentKey]) {
      return PATH_COLORS[segmentColors[segmentKey]]?.hex || (isAerial ? aerialColorHex : undergroundColorHex);
    }
    return isAerial ? aerialColorHex : undergroundColorHex;
  }, [segmentColors, aerialColorHex, undergroundColorHex]);
  
  // Handle segment click for color selection
  const handleSegmentClick = useCallback((segmentKey) => {
    if (editMode) {
      setSelectedSegment(segmentKey === selectedSegment ? null : segmentKey);
    }
  }, [editMode, selectedSegment]);
  
  // Apply color to selected segment
  const applyColorToSegment = useCallback((colorKey) => {
    if (selectedSegment) {
      setSegmentColors(prev => ({
        ...prev,
        [selectedSegment]: colorKey
      }));
    }
  }, [selectedSegment]);
  
  // Apply color to all aerial segments
  const applyColorToAllAerial = useCallback((colorKey) => {
    setAerialColor(colorKey);
    // Clear any segment-specific overrides for aerial segments
    setSegmentColors(prev => {
      const newColors = { ...prev };
      Object.keys(newColors).forEach(key => {
        // Remove aerial segment overrides (they don't contain 'ug-')
        if (!key.includes('ug-')) {
          delete newColors[key];
        }
      });
      return newColors;
    });
  }, []);
  
  // Apply color to all underground segments
  const applyColorToAllUnderground = useCallback((colorKey) => {
    setUndergroundColor(colorKey);
    // Clear any segment-specific overrides for underground segments
    setSegmentColors(prev => {
      const newColors = { ...prev };
      Object.keys(newColors).forEach(key => {
        // Remove underground segment overrides (they contain 'ug-')
        if (key.includes('ug-')) {
          delete newColors[key];
        }
      });
      return newColors;
    });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [jobRes, polesRes, ugRes, routesRes, annotationsRes, connectionsRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/poles`),
        axios.get(`/jobs/${jobId}/underground`),
        axios.get(`/jobs/${jobId}/routes`),
        axios.get(`/jobs/${jobId}/annotations`),
        axios.get(`/jobs/${jobId}/connections`),
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data);
      setUnderground(ugRes.data);
      setAnnotations(annotationsRes.data);
      setConnections(connectionsRes.data || []);
      
      // Convert routes array to a lookup object by segment key
      const routesLookup = {};
      routesRes.data.forEach(r => {
        const key = `${r.from_pole_id}-${r.to_pole_id}`;
        routesLookup[key] = r.waypoints || [];
      });
      setCustomRoutes(routesLookup);
    } catch (e) {
      toast.error("Failed to load job map data");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const combinedOrderItems = () => {
    const all = [...poles.map((p) => ({ ...p, _type: "pole" })), ...underground.map((u) => ({ ...u, _type: "underground" }))];
    all.sort((a, b) => {
      const oa = a.sort_order ?? Infinity, ob = b.sort_order ?? Infinity;
      if (oa !== ob) return oa - ob;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    return all;
  };

  const saveSpanOrder = async (items) => {
    setSavingOrder(true);
    try {
      await axios.put(`/jobs/${jobId}/reorder-items`, items.map((it, i) => ({ id: it.id, type: it._type, sort_order: i })));
      toast.success("Route order updated");
      setSpanReorder(false);
      await fetchData();
    } catch (e) {
      toast.error("Failed to save order");
    } finally {
      setSavingOrder(false);
    }
  };

  const saveSpanOrderSync = async (items) => {
    setSavingOrder(true);
    try {
      await axios.put(`/jobs/${jobId}/reorder-items`, items.map((it, i) => ({ id: it.id, type: it._type, sort_order: i })));
      // Rebuild default connections around the new order: keep only user-drawn custom lines
      const customs = connections
        .filter((c) => c.connection_type === "custom")
        .map((c) => ({ job_id: jobId, from_item_id: c.from_item_id, from_item_type: c.from_item_type, to_item_id: c.to_item_id, to_item_type: c.to_item_type, connection_type: c.connection_type, type_override: c.type_override || null, waypoints: c.waypoints || [] }));
      await axios.post(`/jobs/${jobId}/connections/bulk`, customs);
      const syncRes = await axios.post(`/jobs/${jobId}/sync-map-distances`);
      toast.success(`Order saved, lines synced${syncRes.data?.updated ? ` & ${syncRes.data.updated} distances updated` : ""}`);
      setSpanReorder(false);
      await fetchData();
    } catch (e) {
      toast.error("Failed to save and sync");
    } finally {
      setSavingOrder(false);
    }
  };


  const { route, missing, segments, totalFeet, totalRiserFeet, grandTotalFeet, usingManualSpans } = useMemo(() => computeRoute(poles), [poles]);
  const ug = useMemo(() => ugWithGps(underground), [underground]);
  const ugConnectors = useMemo(() => computeUgConnectors(route, ug), [route, ug]);
  const presentUg = useMemo(() => [...new Set(ug.map((u) => u.type))], [ug]);
  const linePoints = route.map((p) => p.pos);
  const allPoints = useMemo(() => [...linePoints, ...ug.map((u) => u.pos)], [linePoints, ug]);

  // Find MPOE sort_order to determine which items come AFTER the MPOE
  const mpoeIndex = useMemo(() => {
    // Find the MPOE in underground items by sort_order
    const mpoe = underground.find(u => u.type === "MPOE");
    if (!mpoe) return -1;
    
    // Get MPOE's sort_order
    const mpoeSortOrder = mpoe.sort_order ?? Infinity;
    return mpoeSortOrder;
  }, [underground]);
  
  // Determine which poles/segments are AFTER MPOE based on sort_order
  const isAfterMPOE = useMemo(() => {
    if (mpoeIndex === -1) {
      // No MPOE found - nothing is "after MPOE"
      return { poles: poles.map(() => false), segments: segments.map(() => false), underground: underground.map(() => false) };
    }
    
    // Items with sort_order > MPOE's sort_order are "after MPOE"
    return {
      poles: poles.map(p => (p.sort_order ?? Infinity) > mpoeIndex),
      segments: segments.map((seg, i) => {
        // A segment is "after MPOE" if its starting pole is after MPOE
        const startPole = route[i];
        return startPole ? (startPole.sort_order ?? Infinity) > mpoeIndex : false;
      }),
      underground: underground.map(u => {
        // Underground item itself - mark MPOE and items after as red
        const sortOrder = u.sort_order ?? Infinity;
        // MPOE itself stays green, only items AFTER MPOE are red
        return sortOrder > mpoeIndex;
      })
    };
  }, [mpoeIndex, poles, segments, route, underground]);

  // perpendicular screen offset for each segment label (alternating sides so
  // close-together measurements don't overlap each other or the markers)
  const segLabels = useMemo(
    () =>
      segments.map((seg, i) => {
        const r = (seg.deg * Math.PI) / 180;
        const side = i % 2 === 0 ? 1 : -1;
        const OFF = 24;
        return { ...seg, ox: Math.cos(r) * OFF * side, oy: Math.sin(r) * OFF * side };
      }),
    [segments]
  );

  // Calculate station numbers (cumulative distances) for all map items
  const stationNumbers = useMemo(() => {
    // Helper function to convert feet to station format
    const toStation = (feet) => {
      const total = Math.round(feet);
      const stations = Math.floor(total / 100);
      const remainder = total % 100;
      return `${stations}+${remainder.toString().padStart(2, '0')}`;
    };
    
    // Helper function to calculate distance in feet between two GPS coordinates
    const distanceFeet = (p1, p2) => {
      const R = 6371000;
      const lat1 = (p1[0] * Math.PI) / 180;
      const lat2 = (p2[0] * Math.PI) / 180;
      const dLat = lat2 - lat1;
      const dLng = ((p2[1] - p1[1]) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 3.28084;
    };
    
    // Build ordered list of all items by sort_order
    const allItems = [];
    
    // Add underground items (path measurements advance the chainage)
    ug.forEach(item => {
      allItems.push({
        id: item.id,
        type: 'underground',
        pos: item.pos,
        sortOrder: item.sort_order ?? Infinity,
        riserFeet: (item.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0)
      });
    });
    
    // Add poles
    route.forEach(pole => {
      allItems.push({
        id: pole.id,
        type: 'pole',
        pos: pole.pos,
        sortOrder: pole.sort_order ?? Infinity,
        riserFeet: (parseInt(pole.risers) || 0) * (parseFloat(pole.riser_height) || 0)
      });
    });
    
    // Sort by sort_order
    allItems.sort((a, b) => a.sortOrder - b.sortOrder);
    
    // Calculate cumulative station numbers (chainage uses actual span footage,
    // so stations match linear feet from the start of the path)
    const segFt = computeStationSegFeet(route, ug, connections, customRoutes);
    const stations = {};
    let runningDistance = 0;
    let prevItem = null;
    
    allItems.forEach(item => {
      if (prevItem) {
        const k = `${prevItem.id}->${item.id}`;
        const dist = segFt[k] !== undefined ? segFt[k] : distanceFeet(prevItem.pos, item.pos);
        runningDistance += dist;
      }
      stations[item.id] = toStation(runningDistance);
      if (item.riserFeet > 0) {
        runningDistance += item.riserFeet;
        stations[`${item.id}:out`] = toStation(runningDistance);
      }
      prevItem = item;
    });
    
    return stations;
  }, [route, ug, connections, customRoutes]);

  // Detect clustered poles and compute label offsets
  // A pole is "clustered" if another pole is within 100ft
  const poleDisplayInfo = useMemo(() => {
    const CLUSTER_THRESHOLD_FT = 100; // feet
    const info = route.map((p, i) => {
      // Check if any other pole is within threshold
      let isCluster = false;
      let nearbyCount = 0;
      
      route.forEach((other, j) => {
        if (i !== j) {
          const dist = Math.sqrt(
            Math.pow((p.pos[0] - other.pos[0]) * 364000, 2) + // rough ft conversion for lat
            Math.pow((p.pos[1] - other.pos[1]) * 288200, 2)   // rough ft conversion for lng at mid-latitudes
          );
          if (dist < CLUSTER_THRESHOLD_FT) {
            isCluster = true;
            nearbyCount++;
          }
        }
      });
      
      // Calculate arrow angle to spread labels around the cluster
      // Use index-based angle distribution for clustered poles
      const baseAngle = (i * 137.5) % 360; // golden angle for good distribution
      const labelAngle = isCluster ? baseAngle : null;
      
      // Determine simple label direction for non-clustered poles
      const labelDir = !isCluster ? (i % 2 === 0 ? "right" : "left") : null;
      
      return { ...p, isCluster, labelAngle, labelDir, nearbyCount };
    });
    return info;
  }, [route]);

  const recenter = () => {
    const m = mapRef.current;
    if (!m || allPoints.length === 0) return;
    if (allPoints.length === 1) m.setView(allPoints[0], 19);
    else m.fitBounds(allPoints, { padding: [60, 60], maxZoom: 20 });
  };

  // Handle waypoint changes for a segment
  const handleWaypointsChange = useCallback((segmentKey, waypoints) => {
    setCustomRoutes(prev => ({
      ...prev,
      [segmentKey]: waypoints
    }));
  }, []);

  // saveRouteEdits is declared later (after orderedSegments is defined) to avoid TDZ error.
  const saveRouteEditsRef = useRef(async () => {});
  const saveRouteEdits = useCallback(async () => {
    return saveRouteEditsRef.current();
  }, []);

  // Cancel edit mode and revert changes
  const cancelEditing = useCallback(() => {
    setEditMode(false);
    setAddingType(null);
    fetchData(); // Reload original data
  }, [fetchData]);

  // Annotation handlers
  const handleAnnotationAdd = useCallback(async (data) => {
    try {
      const response = await axios.post(`/jobs/${jobId}/annotations`, {
        ...data,
        job_id: jobId,
      });
      setAnnotations(prev => [...prev, response.data]);
      toast.success(data.type === "note" ? "Note added" : "Measurement added");
    } catch (e) {
      toast.error("Failed to add annotation");
    }
  }, [jobId]);

  const handleAnnotationUpdate = useCallback(async (annotationId, data) => {
    try {
      const response = await axios.put(`/jobs/${jobId}/annotations/${annotationId}`, data);
      setAnnotations(prev => prev.map(a => a.id === annotationId ? response.data : a));
    } catch (e) {
      toast.error("Failed to update annotation");
    }
  }, [jobId]);

  const handleAnnotationDelete = useCallback(async (annotationId) => {
    try {
      await axios.delete(`/jobs/${jobId}/annotations/${annotationId}`);
      setAnnotations(prev => prev.filter(a => a.id !== annotationId));
      toast.success("Annotation deleted");
    } catch (e) {
      toast.error("Failed to delete annotation");
    }
  }, [jobId]);

  // ======== POSITION EDIT MODE - Drag poles/underground items ========
  const handlePoleDragEnd = useCallback(async (poleId, newLat, newLng) => {
    try {
      // Update local state immediately for responsive UI
      setPoles(prev => prev.map(p => 
        p.id === poleId ? { ...p, latitude: newLat, longitude: newLng } : p
      ));
      
      // Save to backend
      await axios.put(`/poles/${poleId}`, {
        latitude: newLat,
        longitude: newLng
      });
      toast.success("Pole position updated");
    } catch (e) {
      toast.error("Failed to update pole position");
      fetchData(); // Revert on error
    }
  }, [fetchData]);

  const handleUndergroundDragEnd = useCallback(async (ugId, newLat, newLng) => {
    try {
      // Update local state immediately for responsive UI
      setUnderground(prev => prev.map(u => 
        u.id === ugId ? { ...u, latitude: newLat, longitude: newLng } : u
      ));
      
      // Save to backend
      await axios.put(`/underground/${ugId}`, {
        latitude: newLat,
        longitude: newLng
      });
      toast.success("Underground position updated");
    } catch (e) {
      toast.error("Failed to update underground position");
      fetchData(); // Revert on error
    }
  }, [jobId, fetchData]);

  // ======== STATION LABEL OFFSET MANAGEMENT ========
  // Load label offsets from localStorage on mount
  useEffect(() => {
    const savedOffsets = localStorage.getItem(`labelOffsets_${jobId}`);
    if (savedOffsets) {
      try {
        setLabelOffsets(JSON.parse(savedOffsets));
      } catch (e) {
        console.warn('Failed to load label offsets:', e);
      }
    }
    // Load measurement offsets
    const savedMeasurementOffsets = localStorage.getItem(`measurementOffsets_${jobId}`);
    if (savedMeasurementOffsets) {
      try {
        setMeasurementOffsets(JSON.parse(savedMeasurementOffsets));
      } catch (e) {
        console.warn('Failed to load measurement offsets:', e);
      }
    }
  }, [jobId]);

  // Save label offsets to localStorage when changed
  const saveLabelOffsets = useCallback((offsets) => {
    try {
      localStorage.setItem(`labelOffsets_${jobId}`, JSON.stringify(offsets));
    } catch (e) {
      console.warn('Failed to save label offsets:', e);
    }
  }, [jobId]);

  // Save measurement offsets to localStorage when changed
  const saveMeasurementOffsets = useCallback((offsets) => {
    try {
      localStorage.setItem(`measurementOffsets_${jobId}`, JSON.stringify(offsets));
    } catch (e) {
      console.warn('Failed to save measurement offsets:', e);
    }
  }, [jobId]);

  const handleLabelDragEnd = useCallback((itemId, basePos, newLat, newLng) => {
    // Calculate the offset from the base position
    const latOffset = newLat - basePos[0];
    const lngOffset = newLng - basePos[1];
    
    setLabelOffsets(prev => {
      const updated = { ...prev, [itemId]: [latOffset, lngOffset] };
      saveLabelOffsets(updated);
      return updated;
    });
    toast.success("Label position saved");
  }, [saveLabelOffsets]);

  // Handle measurement label drag end
  const handleMeasurementDragEnd = useCallback((segmentKey, basePos, newLat, newLng) => {
    const latOffset = newLat - basePos[0];
    const lngOffset = newLng - basePos[1];
    
    setMeasurementOffsets(prev => {
      const updated = { ...prev, [segmentKey]: [latOffset, lngOffset] };
      saveMeasurementOffsets(updated);
      return updated;
    });
    toast.success("Measurement position saved");
  }, [saveMeasurementOffsets]);

  // ======== CUSTOM LABEL TEXT MANAGEMENT ========
  // Load custom label texts from localStorage on mount
  useEffect(() => {
    const savedTexts = localStorage.getItem(`customLabelTexts_${jobId}`);
    if (savedTexts) {
      try {
        setCustomLabelTexts(JSON.parse(savedTexts));
      } catch (e) {
        console.warn('Failed to load custom label texts:', e);
      }
    }
  }, [jobId]);

  // Save custom label texts to localStorage
  const saveCustomLabelTexts = useCallback((texts) => {
    try {
      localStorage.setItem(`customLabelTexts_${jobId}`, JSON.stringify(texts));
    } catch (e) {
      console.warn('Failed to save custom label texts:', e);
    }
  }, [jobId]);

  // Handle double-click to edit label text
  const handleLabelDoubleClick = useCallback((labelId, defaultText) => {
    setEditingLabelId(labelId);
    setEditingLabelText(customLabelTexts[labelId] || defaultText);
  }, [customLabelTexts]);

  // Save edited label text
  const saveEditedLabelText = useCallback(() => {
    if (editingLabelId && editingLabelText.trim()) {
      setCustomLabelTexts(prev => {
        const updated = { ...prev, [editingLabelId]: editingLabelText.trim() };
        saveCustomLabelTexts(updated);
        return updated;
      });
      toast.success("Label text saved");
    }
    setEditingLabelId(null);
    setEditingLabelText("");
  }, [editingLabelId, editingLabelText, saveCustomLabelTexts]);

  // Cancel editing
  const cancelEditingLabel = useCallback(() => {
    setEditingLabelId(null);
    setEditingLabelText("");
  }, []);

  // Reset label to default text
  const resetLabelToDefault = useCallback((labelId) => {
    setCustomLabelTexts(prev => {
      const updated = { ...prev };
      delete updated[labelId];
      saveCustomLabelTexts(updated);
      return updated;
    });
    setEditingLabelId(null);
    setEditingLabelText("");
    toast.success("Label reset to default");
  }, [saveCustomLabelTexts]);

  // Get label text (custom or default)
  const getLabelText = useCallback((labelId, defaultText) => {
    return customLabelTexts[labelId] || defaultText;
  }, [customLabelTexts]);

  // Get label position for an item (base position + custom offset)
  const getLabelPosition = useCallback((itemId, basePos, existingLabels = []) => {
    // If user has set a custom offset, use that
    if (labelOffsets[itemId]) {
      const offset = labelOffsets[itemId];
      return [basePos[0] + offset[0], basePos[1] + offset[1]];
    }
    
    // Default offset patterns to try (in order of preference)
    const offsetPatterns = [
      [-0.00015, 0.00015],   // top-right (default)
      [-0.00018, -0.00015],  // top-left
      [0.00015, 0.00018],    // bottom-right
      [0.00018, -0.00018],   // bottom-left
      [-0.00025, 0.00008],   // far top-right
      [-0.00008, 0.00025],   // right
      [-0.00025, -0.00008],  // far top-left
      [0.00025, 0.00008],    // far bottom-right
    ];
    
    // Find a position that doesn't overlap with existing labels
    for (const offset of offsetPatterns) {
      const pos = [basePos[0] + offset[0], basePos[1] + offset[1]];
      if (!hasCollision(pos, existingLabels)) {
        return pos;
      }
    }
    
    // If all positions collide, use default
    return [basePos[0] + offsetPatterns[0][0], basePos[1] + offsetPatterns[0][1]];
  }, [labelOffsets]);

  // Get measurement label position (base position at midpoint + custom offset)
  // Each segment gets a unique default offset to prevent overlap
  const getMeasurementLabelPosition = useCallback((segmentKey, basePos, segmentIndex = 0, existingLabels = []) => {
    // If user has set a custom position, use that
    if (measurementOffsets[segmentKey]) {
      const offset = measurementOffsets[segmentKey];
      return [basePos[0] + offset[0], basePos[1] + offset[1]];
    }
    
    // Offset patterns based on segment index - spread out in different directions
    const offsetPatterns = [
      [-0.00020, 0.00025],   // top-right
      [0.00018, 0.00028],    // bottom-right  
      [-0.00025, -0.00020],  // top-left
      [0.00022, -0.00018],   // bottom-left
      [-0.00030, 0.00012],   // far top-right
      [0.00028, 0.00015],    // far bottom-right
      [-0.00012, 0.00030],   // right-top
      [0.00015, -0.00025],   // far bottom-left
    ];
    
    // Start with the pattern based on index
    const startIndex = segmentIndex % offsetPatterns.length;
    
    // Try patterns starting from the index-based one
    for (let i = 0; i < offsetPatterns.length; i++) {
      const patternIndex = (startIndex + i) % offsetPatterns.length;
      const offset = offsetPatterns[patternIndex];
      const pos = [basePos[0] + offset[0], basePos[1] + offset[1]];
      
      if (!hasCollision(pos, existingLabels)) {
        return pos;
      }
    }
    
    // If all positions collide, use the index-based default with extra offset
    const extraOffset = segmentIndex * 0.00008;
    const defaultOffset = offsetPatterns[startIndex];
    return [basePos[0] + defaultOffset[0] + extraOffset, basePos[1] + defaultOffset[1] + extraOffset];
  }, [measurementOffsets]);

  // Check if a position collides with any existing labels
  const hasCollision = useCallback((pos, existingLabels, threshold = 0.00012) => {
    for (const label of existingLabels) {
      const distance = Math.sqrt(
        Math.pow(pos[0] - label[0], 2) + Math.pow(pos[1] - label[1], 2)
      );
      if (distance < threshold) {
        return true;
      }
    }
    return false;
  }, []);

  // ======== CONNECTION MANAGEMENT ========
  // Initialize default connections based on sort_order (matching job page order)
  // Build the default chain connections from current item order (no guard)
  const buildDefaultConnections = useCallback(() => {
    // Combine all items (poles + underground) with their sort_order
    const allItems = [];
    
    // Add poles with sort_order
    route.forEach(p => {
      allItems.push({
        id: p.id,
        type: "pole",
        sort_order: p.sort_order ?? Infinity,
        pos: p.pos,
        start_path: p.start_path === true,
        end_path: p.end_path === true,
        standalone: p.standalone === true
      });
    });
    
    // Add underground items with sort_order
    ug.forEach(u => {
      allItems.push({
        id: u.id,
        type: "underground",
        sort_order: u.sort_order ?? Infinity,
        pos: u.pos,
        start_path: u.start_path === true,
        end_path: u.end_path === true,
        standalone: u.standalone === true
      });
    });
    
    // Sort by sort_order (matching job page display order)
    allItems.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return 0;
    });
    
    // Create connections between consecutive items
    const defaultConnections = [];
    for (let i = 0; i < allItems.length - 1; i++) {
      const fromItem = allItems[i];
      const toItem = allItems[i + 1];
      if (fromItem.end_path) continue;
      if (toItem.start_path) continue;
      if (fromItem.standalone || toItem.standalone) continue;
      
      // Determine connection type based on item types
      let connectionType = "custom";
      if (fromItem.type === "pole" && toItem.type === "pole") {
        connectionType = "aerial";
      } else if (fromItem.type === "underground" || toItem.type === "underground") {
        connectionType = "underground";
      }
      
      defaultConnections.push({
        job_id: jobId,
        from_item_id: fromItem.id,
        from_item_type: fromItem.type,
        to_item_id: toItem.id,
        to_item_type: toItem.type,
        connection_type: connectionType
      });
    }
    return defaultConnections;
  }, [jobId, route, ug]);

  const initializeConnections = useCallback(async () => {
    if (connections.length === 0) {
      const defaultConnections = buildDefaultConnections();
      if (defaultConnections.length > 0) {
        try {
          const response = await axios.post(`/jobs/${jobId}/connections/bulk`, defaultConnections);
          setConnections(response.data);
        } catch (e) {
          console.error("Failed to initialize connections:", e);
        }
      }
      return;
    }
    // SYNC: make every auto-drawn line a real, editable connection record
    try {
      const pairs = computeConnectionPairs(route, ug, connections);
      const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      const docKeys = new Set(connections.filter((c) => c.connection_type !== "removed").map((c) => pairKey(c.from_item_id, c.to_item_id)));
      const creates = pairs
        .filter((p) => !docKeys.has(pairKey(p.from.id, p.to.id)))
        .map((p) => ({
          job_id: jobId,
          from_item_id: p.from.id,
          from_item_type: p.from.type,
          to_item_id: p.to.id,
          to_item_type: p.to.type,
          connection_type: resolvePairAerial(p.from, p.to) ? "aerial" : "underground",
        }));
      // Old direct lines currently hidden because a NEW item sits between their endpoints
      // must be tombstoned, otherwise materializing the chain would make them reappear
      const itemSort = {};
      route.forEach((p) => { itemSort[p.id] = p.sort_order ?? Infinity; });
      ug.forEach((u) => { itemSort[u.id] = u.sort_order ?? Infinity; });
      const referenced = new Set();
      connections.forEach((c) => { referenced.add(c.from_item_id); referenced.add(c.to_item_id); });
      const unref = [...route, ...ug].filter((it) => it.standalone !== true && !referenced.has(it.id));
      const hidden = connections.filter((c) => {
        if (c.connection_type === "removed" || c.connection_type === "custom") return false;
        const fs = itemSort[c.from_item_id], ts = itemSort[c.to_item_id];
        if (fs === undefined || ts === undefined) return false;
        const lo = Math.min(fs, ts), hi = Math.max(fs, ts);
        return unref.some((it) => (it.sort_order ?? Infinity) > lo && (it.sort_order ?? Infinity) < hi);
      });
      if (creates.length === 0 && hidden.length === 0) return;
      await Promise.all([
        ...creates.map((c) => axios.post(`/jobs/${jobId}/connections`, c)),
        ...hidden.map((c) => axios.put(`/jobs/${jobId}/connections/${c.id}`, { connection_type: "removed" })),
      ]);
      const res = await axios.get(`/jobs/${jobId}/connections`);
      setConnections(res.data || []);
    } catch (e) {
      console.error("Failed to sync connections:", e);
    }
  }, [jobId, buildDefaultConnections, connections, route, ug]);

  // Update a connection endpoint
  const handleConnectionUpdate = useCallback(async (connectionId, updates) => {
    try {
      const response = await axios.put(`/jobs/${jobId}/connections/${connectionId}`, updates);
      setConnections(prev => prev.map(c => c.id === connectionId ? response.data : c));
      axios.post(`/jobs/${jobId}/sync-map-distances`).catch(() => {});
      toast.success("Connection updated");
    } catch (e) {
      toast.error("Failed to update connection");
    }
  }, [jobId]);

  // Delete a connection — mark as "removed" tombstone so the auto-chain doesn't redraw it
  const handleConnectionDelete = useCallback(async (connectionId) => {
    try {
      const response = await axios.put(`/jobs/${jobId}/connections/${connectionId}`, { connection_type: "removed" });
      setConnections(prev => prev.map(c => c.id === connectionId ? response.data : c));
      axios.post(`/jobs/${jobId}/sync-map-distances`).catch(() => {});
      toast.success("Line deleted");
    } catch (e) {
      toast.error("Failed to delete connection");
    }
  }, [jobId]);

  // Add a new connection
  const handleConnectionAdd = useCallback(async (fromItem, toItem) => {
    try {
      const response = await axios.post(`/jobs/${jobId}/connections`, {
        job_id: jobId,
        from_item_id: fromItem.id,
        from_item_type: fromItem.type,
        to_item_id: toItem.id,
        to_item_type: toItem.type,
        connection_type: "custom"
      });
      setConnections(prev => [...prev, response.data]);
      axios.post(`/jobs/${jobId}/sync-map-distances`).catch(() => {});
      toast.success("Connection added");
    } catch (e) {
      toast.error("Failed to add connection");
    }
  }, [jobId]);

  // Tap-to-reconnect: handle tapping a target item while moving an endpoint or adding a line
  const handleTargetTap = useCallback((item) => {
    if (addingConn) {
      if (!addingConn.from) {
        setAddingConn({ from: item });
        toast.info(`Start: ${item.label} — now tap the second item`);
      } else if (addingConn.from.id === item.id) {
        toast.error("Pick a different item for the second end");
      } else {
        handleConnectionAdd(addingConn.from, item);
        setAddingConn(null);
      }
      return;
    }
    if (!selectedConn || !reconnectSide) return;
    const conn = connections.find((c) => c.id === selectedConn);
    if (!conn) return;
    const otherId = reconnectSide === "from" ? conn.to_item_id : conn.from_item_id;
    const currentId = reconnectSide === "from" ? conn.from_item_id : conn.to_item_id;
    if (item.id === otherId) {
      toast.error("Both ends can't be the same item");
      return;
    }
    if (item.id === currentId) {
      toast.info("Already connected to that item");
      setReconnectSide(null);
      return;
    }
    handleConnectionUpdate(selectedConn, reconnectSide === "from"
      ? { from_item_id: item.id, from_item_type: item.type }
      : { to_item_id: item.id, to_item_type: item.type });
    setReconnectSide(null);
    setSelectedConn(null);
  }, [addingConn, selectedConn, reconnectSide, connections, handleConnectionAdd, handleConnectionUpdate]);

  // Reset connections to default (recomputed from current poles/underground)
  const resetConnections = useCallback(async () => {
    // Replace all connections with the freshly computed default chain in ONE bulk call
    try {
      const defaults = buildDefaultConnections();
      const response = await axios.post(`/jobs/${jobId}/connections/bulk`, defaults);
      setConnections(response.data);
      axios.post(`/jobs/${jobId}/sync-map-distances`).catch(() => {});
      toast.success("Lines reset to default");
    } catch (e) {
      toast.error("Failed to reset connections");
    }
  }, [jobId, buildDefaultConnections]);

  // All connectable items for the connection editor (sorted by sort_order)
  const allConnectableItems = useMemo(() => {
    const items = [];
    route.forEach(p => {
      items.push({
        id: p.id,
        pos: p.pos,
        type: "pole",
        label: p.pole_number ? `Pole ${p.pole_number}` : `Pole`,
        sort_order: p.sort_order ?? Infinity,
        start_path: p.start_path === true,
        end_path: p.end_path === true
      });
    });
    ug.forEach(u => {
      items.push({
        id: u.id,
        pos: u.pos,
        type: "underground",
        label: u.label && u.label !== u.type ? `${u.type} · ${u.label}` : (u.type || u.label),
        sort_order: u.sort_order ?? Infinity,
        start_path: u.start_path === true,
        end_path: u.end_path === true
      });
    });
    // Sort by sort_order to match job page order
    items.sort((a, b) => a.sort_order - b.sort_order);
    return items;
  }, [route, ug]);

  // Compute ordered segments based on sort_order (for default line rendering)
  // This replaces the old ugConnectors logic with proper sort_order-based connections
  const orderedSegments = useMemo(() => {
    // Combine all items with GPS coordinates
    const allItems = [];
    
    route.forEach(p => {
      allItems.push({
        id: p.id,
        type: "pole",
        pos: p.pos,
        sort_order: p.sort_order ?? Infinity,
        label: p.pole_number || 'Pole',
        end_path: p.end_path === true
      });
    });
    
    ug.forEach(u => {
      allItems.push({
        id: u.id,
        type: "underground",
        ugType: u.type,
        materialType: u.material_type || "",
        pos: u.pos,
        sort_order: u.sort_order ?? Infinity,
        label: u.label || u.type,
        end_path: u.end_path === true
      });
    });
    
    // Sort by sort_order (matching job page display order)
    allItems.sort((a, b) => a.sort_order - b.sort_order);
    
    // Pairs mirror the shared logic (custom connections, End Path breaks, standalone items)
    const pairs = computeConnectionPairs(route, ug, connections);
    
    const mpoeItem = allItems.find((item) => item.ugType === "MPOE");
    const mpoeOrder = mpoeItem ? mpoeItem.sort_order : null;
    
    // Create segments from pairs
    const segments = [];
    pairs.forEach((pr) => {
      const { from: fromItem, to: toItem } = pr;
      // Calculate distance
      const latDiff = (toItem.pos[0] - fromItem.pos[0]) * 364000;
      const lngDiff = (toItem.pos[1] - fromItem.pos[1]) * 288200;
      const distFt = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      
      // Calculate midpoint
      const mid = [
        (fromItem.pos[0] + toItem.pos[0]) / 2,
        (fromItem.pos[1] + toItem.pos[1]) / 2
      ];
      
      // Determine segment type and styling (neutral items inherit from the other end)
      const isAerial = pr.typeOverride ? pr.typeOverride === "aerial" : resolvePairAerial(fromItem, toItem);
      const hasUnderground = fromItem.type === "underground" || toItem.type === "underground";
      
      // Check if either item is MPOE or after MPOE
      const isAfterMPOE = mpoeOrder !== null && Math.min(fromItem.sort_order, toItem.sort_order) >= mpoeOrder;
      const isMPOE = fromItem.ugType === "MPOE" || toItem.ugType === "MPOE";
      
      segments.push({
        from: fromItem,
        to: toItem,
        fromPos: fromItem.pos,
        toPos: toItem.pos,
        mid,
        distFt,
        isAerial,
        hasUnderground,
        isRed: isMPOE || isAfterMPOE,
        isDirectBury: fromItem.materialType === "Direct Bury" || toItem.materialType === "Direct Bury",
        segmentType: isAerial ? "aerial" : "underground",
        manualMeasured: fromItem.type === "underground" && fromItem.hasPath === true
      });
    });
    
    return segments;
  }, [route, ug, connections]);


  // Wire the actual save implementation now that orderedSegments is available (fixes TDZ)
  useEffect(() => {
    saveRouteEditsRef.current = async () => {
      setSaving(true);
      try {
        const routesToSave = orderedSegments.map((seg) => ({
          job_id: jobId,
          from_pole_id: seg.from.id,
          to_pole_id: seg.to.id,
          waypoints: customRoutes[`${seg.from.id}-${seg.to.id}`] || [],
        }));
        await axios.post(`/jobs/${jobId}/routes/bulk`, routesToSave);
        toast.success("Route edits saved");
        setEditMode(false);
      } catch (e) {
        toast.error("Failed to save route edits");
      } finally {
        setSaving(false);
      }
    };
  }, [orderedSegments, customRoutes, jobId]);


  // Total path measurement footage (In/Over/Up/Down entries on attributes)
  const pathFeet = useMemo(
    () => underground.reduce((sum, u) => sum + (u.path_measurements || []).reduce((s, m) => s + (parseFloat(m.feet) || 0), 0), 0),
    [underground]
  );

  // Numbered station entries (badges + list) when Sta #'s toggle is on
  const stationEntries = useMemo(() => {
    const items = [];
    ug.forEach((u) => items.push({ id: u.id, pos: u.pos, sortOrder: u.sort_order ?? Infinity, name: `${undergroundAbbr(u.type)}${u.label ? `-${u.label}` : ""}` }));
    route.forEach((p) => items.push({ id: p.id, pos: p.pos, sortOrder: p.sort_order ?? Infinity, name: /^\d/.test(String(p.pole_number || "")) ? `P${p.pole_number}` : (p.pole_number || "Pole") }));
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    return items.map((it, idx) => ({ ...it, num: idx + 1, station: stationNumbers[it.id] }));
  }, [route, ug, stationNumbers]);
  const stationNumById = useMemo(() => Object.fromEntries(stationEntries.map((e) => [e.id, e.num])), [stationEntries]);

  // Display name for a segment endpoint (e.g. "P1", "HH HH-1")
  const segItemName = useCallback((item) => {
    if (item.type === "pole") {
      const n = String(item.label || "");
      return /^\d/.test(n) ? `P${n}` : (n || "Pole");
    }
    const abbr = undergroundAbbr(item.ugType);
    return item.label && item.label !== item.ugType ? `${abbr} ${item.label}` : abbr;
  }, []);

  // Distance for the list — follows custom waypoints on aerial segments (matches map pill)
  const segListDistance = useCallback((seg) => {
    const wps = customRoutes[`${seg.from.id}-${seg.to.id}`] || [];
    const path = [seg.fromPos, ...wps.map((w) => [w.lat, w.lng]), seg.toPos];
    const hav = (p1, p2) => {
      const R = 6371000;
      const la1 = (p1[0] * Math.PI) / 180, la2 = (p2[0] * Math.PI) / 180;
      const dLat = la2 - la1, dLng = ((p2[1] - p1[1]) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 3.28084;
    };
    return path.reduce((sum, p, k) => (k === 0 ? 0 : sum + hav(path[k - 1], p)), 0);
  }, [customRoutes]);

  // Total underground footage (segments that touch an underground item, per combined order)
  const ugFeet = useMemo(
    () => orderedSegments.reduce((sum, s) => sum + (s.segmentType === "underground" && !s.manualMeasured ? segListDistance(s) : 0), 0),
    [orderedSegments, segListDistance]
  );

  // Combined numbered measurement entries (spans + inline risers + inline path measurements, in route order)
  const { measurementEntries, spanNums } = useMemo(() => {
    const entries = [];
    const nums = {};
    const added = new Set();
    const pathAdded = new Set();
    const poleName = (label) => (/^\d/.test(String(label || "")) ? `P${label}` : (label || "Pole"));
    const riserInfo = (item) => {
      if (item.type !== "pole") return null;
      const p = route.find((x) => x.id === item.id);
      if (!p) return null;
      const c = parseInt(p.risers) || 0;
      const h = parseFloat(p.riser_height) || 0;
      return c > 0 && h > 0 ? { c, h } : null;
    };
    const pushRiser = (item, pos) => {
      const r = riserInfo(item);
      if (r && !added.has(item.id)) {
        added.add(item.id);
        entries.push({ kind: "riser", so: item.sort_order ?? Infinity, pos, itemId: item.id, text: `${poleName(item.label)} New Riser${r.c > 1 ? ` ×${r.c}` : ""} = ${fmtFeet(r.c * r.h)}` });
      }
    };
    const pathText = (u) => {
      const t = u.path_measurements.reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);
      return `${undergroundAbbr(u.type)}${u.label ? ` ${u.label}` : ""}: ${u.path_measurements.map((m) => `${m.direction} ${m.feet}ft${m.to ? ` to ${m.to}` : ""}`).join(", ")} = ${fmtFeet(t)}`;
    };
    const pushPath = (item, pos) => {
      if (item.type === "pole" || pathAdded.has(item.id)) return;
      const u = underground.find((x) => x.id === item.id);
      if (!u || !(u.path_measurements || []).length) return;
      pathAdded.add(item.id);
      entries.push({ kind: "path", so: item.sort_order ?? Infinity, pos, itemId: item.id, text: pathText(u) });
    };
    orderedSegments.forEach((seg, i) => {
      pushRiser(seg.from, seg.fromPos);
      pushPath(seg.from, seg.fromPos);
      if (!seg.manualMeasured) entries.push({ kind: "span", so: seg.from.sort_order ?? Infinity, segIndex: i, seg });
    });
    if (orderedSegments.length > 0) {
      const last = orderedSegments[orderedSegments.length - 1];
      pushRiser(last.to, last.toPos);
      pushPath(last.to, last.toPos);
    }
    // Poles with new risers not touched by any active segment (deleted lines,
    // standalone, single-pole jobs) — insert at their place in route order
    [...route]
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
      .filter((p) => !added.has(p.id))
      .forEach((p) => {
        const r = riserInfo({ type: "pole", id: p.id });
        if (!r) return;
        added.add(p.id);
        const so = p.sort_order ?? Infinity;
        const entry = { kind: "riser", so, pos: p.pos, itemId: p.id, text: `${poleName(p.pole_number)} New Riser${r.c > 1 ? ` ×${r.c}` : ""} = ${fmtFeet(r.c * r.h)}` };
        const idx = entries.findIndex((e) => (e.so ?? Infinity) > so);
        if (idx === -1) entries.push(entry);
        else entries.splice(idx, 0, entry);
      });
    // Items with path measurements not on the route chain (standalone or no GPS) —
    // insert at their respective place in route order using sort_order
    [...underground]
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
      .filter((u) => (u.path_measurements || []).length > 0 && !pathAdded.has(u.id))
      .forEach((u) => {
        pathAdded.add(u.id);
        const so = u.sort_order ?? Infinity;
        const entry = { kind: "path", so, pos: null, itemId: u.id, text: pathText(u) };
        const idx = entries.findIndex((e) => (e.so ?? Infinity) > so);
        if (idx === -1) entries.push(entry);
        else entries.splice(idx, 0, entry);
      });
    entries.forEach((e, idx) => {
      e.num = idx + 1;
      if (e.kind === "span") nums[e.segIndex] = e.num;
    });
    return { measurementEntries: entries, spanNums: nums };
  }, [orderedSegments, route, underground]);

  // Total aerial footage from ordered segments (includes Loop spans + waypoint routes)
  const aerialFeetTotal = useMemo(
    () => orderedSegments.reduce((sum, seg) => sum + (seg.segmentType === "aerial" && !seg.manualMeasured ? segListDistance(seg) : 0), 0),
    [orderedSegments, segListDistance]
  );

  // Compute all smart label positions with collision avoidance
  const computedLabelPositions = useMemo(() => {
    const positions = {
      measurements: {}, // segmentKey -> [lat, lng]
      stations: {},     // itemId -> [lat, lng]
    };
    const allLabels = []; // Track all label positions for collision detection
    
    // Offset patterns for measurements
    const measurementPatterns = [
      [-0.00022, 0.00028],   // top-right
      [0.00020, 0.00030],    // bottom-right  
      [-0.00028, -0.00022],  // top-left
      [0.00025, -0.00020],   // bottom-left
      [-0.00035, 0.00015],   // far top-right
      [0.00032, 0.00018],    // far bottom-right
      [-0.00015, 0.00035],   // right-top
      [0.00018, -0.00030],   // far bottom-left
    ];
    
    // Offset patterns for station labels
    const stationPatterns = [
      [-0.00018, 0.00020],   // top-right
      [-0.00020, -0.00018],  // top-left
      [0.00018, 0.00022],    // bottom-right
      [0.00020, -0.00020],   // bottom-left
      [-0.00028, 0.00012],   // far top-right
      [-0.00012, 0.00028],   // right
      [0.00028, 0.00012],    // far bottom-right
      [0.00012, -0.00025],   // far bottom-left
    ];
    
    const COLLISION_THRESHOLD = 0.00015;
    
    const hasCollision = (pos) => {
      for (const label of allLabels) {
        const dist = Math.sqrt(Math.pow(pos[0] - label[0], 2) + Math.pow(pos[1] - label[1], 2));
        if (dist < COLLISION_THRESHOLD) return true;
      }
      return false;
    };
    
    const findNonCollidingPos = (basePos, patterns, startIndex = 0) => {
      for (let i = 0; i < patterns.length; i++) {
        const idx = (startIndex + i) % patterns.length;
        const pos = [basePos[0] + patterns[idx][0], basePos[1] + patterns[idx][1]];
        if (!hasCollision(pos)) return pos;
      }
      // If all collide, add extra offset based on number of existing labels
      const extraOffset = allLabels.length * 0.00006;
      const defaultPattern = patterns[startIndex % patterns.length];
      return [basePos[0] + defaultPattern[0] + extraOffset, basePos[1] + defaultPattern[1] + extraOffset];
    };
    
    // First, compute measurement positions (only when station numbers are OFF)
    if (!showStationNumbers) {
      orderedSegments.forEach((seg, i) => {
        const segmentKey = `${seg.from.id}-${seg.to.id}`;
        
        // Check if user has custom offset
        if (measurementOffsets[segmentKey]) {
          const offset = measurementOffsets[segmentKey];
          const pos = [seg.mid[0] + offset[0], seg.mid[1] + offset[1]];
          positions.measurements[segmentKey] = pos;
          allLabels.push(pos);
        } else {
          const pos = findNonCollidingPos(seg.mid, measurementPatterns, i);
          positions.measurements[segmentKey] = pos;
          allLabels.push(pos);
        }
      });
    }
    
    // Then compute station label positions (when station numbers are ON)
    if (showStationNumbers) {
      // Process poles
      route.forEach((p, i) => {
        if (labelOffsets[p.id]) {
          const offset = labelOffsets[p.id];
          const pos = [p.pos[0] + offset[0], p.pos[1] + offset[1]];
          positions.stations[p.id] = pos;
          allLabels.push(pos);
        } else {
          const pos = findNonCollidingPos(p.pos, stationPatterns, i);
          positions.stations[p.id] = pos;
          allLabels.push(pos);
        }
      });
      
      // Process underground items
      ug.forEach((u, i) => {
        if (labelOffsets[u.id]) {
          const offset = labelOffsets[u.id];
          const pos = [u.pos[0] + offset[0], u.pos[1] + offset[1]];
          positions.stations[u.id] = pos;
          allLabels.push(pos);
        } else {
          const pos = findNonCollidingPos(u.pos, stationPatterns, i + route.length);
          positions.stations[u.id] = pos;
          allLabels.push(pos);
        }
      });
    }
    
    return positions;
  }, [orderedSegments, route, ug, showStationNumbers, measurementOffsets, labelOffsets]);

  // ======== END CONNECTION MANAGEMENT ========

  const downloadImage = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadPoleMapImage({ poles, job, showStops: false, underground, connections, routes: customRoutes, basemap });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, underground, connections, customRoutes, basemap]);

  const downloadSegmented = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadSegmentedMapPages({ poles, job, showStops: false, underground, connections, routes: customRoutes, targetFeet: 800, basemap });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, underground, connections, customRoutes, basemap]);

  // Export destination prompt (device vs app cloud) for map exports
  const [pendingMapExport, setPendingMapExport] = useState(null);
  const [mapExportBusy, setMapExportBusy] = useState(false);
  const runMapExport = async (dest) => {
    const type = pendingMapExport;
    setMapExportBusy(true);
    try {
      if (dest === "device") {
        if (type === "map_image") await downloadImage();
        else if (type === "map_pdf") await downloadMapPdfPages({ poles, job, underground, connections, routes: customRoutes, basemap, tileFeet: 1000 });
        else await downloadSegmented();
      } else {
        const opts = { poles, job, showStops: false, underground, connections, routes: customRoutes, basemap, returnBlob: true };
        const blob = type === "map_image"
          ? await downloadPoleMapImage(opts)
          : type === "map_pdf"
            ? await downloadMapPdfPages({ poles, job, underground, connections, routes: customRoutes, basemap, tileFeet: 1000, returnBlob: true })
            : await downloadSegmentedMapPages({ ...opts, targetFeet: 800 });
        if (!blob || typeof blob === "boolean") throw new Error("no blob");
        const filename = `${(job?.name || "job").replace(/[^a-z0-9-_]+/gi, "_")}${type === "map_image" ? "_pole_map.png" : type === "map_pdf" ? "_map_1000ft.pdf" : "_map_pages.zip"}`;
        await uploadExportToCloud(jobId, type, filename, blob);
        toast.success("Saved to app cloud — see Cloud Exports on the job page");
      }
      setPendingMapExport(null);
    } catch (e) {
      toast.error(dest === "cloud" ? "Cloud save failed" : "Export failed");
    } finally {
      setMapExportBusy(false);
    }
  };

  // Screenshot the visible map frame using dom-to-image-more - captures entire app frame
  const captureMapScreenshot = useCallback(async () => {
    setScreenshotting(true);
    try {
      // Find the entire page container to capture everything within the app frame
      const pageContainer = document.querySelector('[data-testid="job-map-page"]');
      if (!pageContainer) {
        toast.error("Page container not found");
        setScreenshotting(false);
        return;
      }

      toast.info("Capturing screenshot...");
      
      // Use dom-to-image-more which handles SVG/Canvas overlays better
      const dataUrl = await domtoimage.toPng(pageContainer, {
        quality: 1,
        bgcolor: "#ffffff",
        width: pageContainer.scrollWidth,
        height: pageContainer.scrollHeight,
        style: {
          // Ensure proper rendering
          transform: "none",
        },
        filter: (node) => {
          // Exclude some elements that might cause issues
          if (node.classList && node.classList.contains("leaflet-control-zoom")) {
            return false; // Exclude zoom controls from screenshot
          }
          return true;
        },
      });

      // Download the image
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${(job?.name || "map").replace(/[^a-z0-9-_]+/gi, "_")}_screenshot.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success("Screenshot saved!");
    } catch (e) {
      console.error("Screenshot error:", e);
      toast.error("Failed to capture screenshot. Try zooming out slightly.");
    } finally {
      setScreenshotting(false);
    }
  }, [job]);

  // Auto-download when opened with ?download=1 (e.g. from the Excel "Map Image" link)
  useEffect(() => {
    if (loading || autoDownloadedRef.current) return;
    if (searchParams.get("download") === "1" && allPoints.length > 0) {
      autoDownloadedRef.current = true;
      downloadImage();
    }
  }, [loading, searchParams, allPoints, downloadImage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  const center = allPoints.length ? allPoints[0] : [29.7604, -95.3698];

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="job-map-page">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-[1000]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to={`/jobs/${jobId}`}>
              <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900 h-9 w-9" data-testid="map-back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="w-9 h-9 bg-red-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm sm:text-lg font-bold tracking-tight uppercase text-zinc-900 leading-tight">
                {job?.name || "Job"} — Pole Map
              </h1>
              <p className="text-xs font-mono text-zinc-500" data-testid="map-measurements-summary">
                {route.length} pole(s){ug.length ? ` · ${ug.length} underground` : ""} · {fmtFeet(aerialFeetTotal)} aerial{ugFeet > 0 ? ` + ${fmtFeet(ugFeet)} underground` : ""}{totalRiserFeet > 0 ? ` + ${fmtFeet(totalRiserFeet)} new risers` : ""}{pathFeet > 0 ? ` + ${fmtFeet(pathFeet)} path` : ""} = {fmtFeet(aerialFeetTotal + totalRiserFeet + ugFeet + pathFeet)} total
                {usingManualSpans && <span className="ml-2 text-indigo-600">(Manual)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={recenter} disabled={allPoints.length === 0} variant="outline" className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="recenter-btn">
              <Crosshair className="w-4 h-4 mr-2" />
              Fit all
            </Button>
            <Button onClick={() => setMapLayer((v) => (v === "street" ? "aerial" : "street"))} aria-pressed={mapLayer === "street"} variant="outline" className={mapLayer === "street" ? "bg-emerald-600 border-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900"} data-testid="toggle-street-btn" title="Switch between aerial imagery and street map">
              <MapIcon className="w-4 h-4 mr-2" />
              {mapLayer === "street" ? "Street" : "Aerial"}
            </Button>
            <Button onClick={() => setShowStationNumbers((v) => !v)} disabled={route.length === 0 && ug.length === 0} aria-pressed={showStationNumbers} variant="outline" className={showStationNumbers ? "bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white" : "bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900"} data-testid="toggle-station-btn">
              <Hash className="w-4 h-4 mr-2" />
              Sta #{"'"}s
            </Button>
            <Button
              onClick={captureMapScreenshot}
              disabled={screenshotting || allPoints.length === 0}
              variant="outline"
              className="bg-purple-50 border-purple-300 hover:bg-purple-100 text-purple-700"
              data-testid="screenshot-btn"
              title="Capture visible map area"
            >
              {screenshotting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              Screenshot
            </Button>
            <Button 
              onClick={() => setPendingMapExport("map_image")}
              disabled={downloading || allPoints.length === 0} 
              className="bg-red-600 hover:bg-red-700 text-white" 
              data-testid="download-map-btn"
            >
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Download
            </Button>
            {/* Add attribute dropdown */}
            {!editMode && !connectionEditMode && !positionEditMode && !placingType && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="map-add-dropdown-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white z-[1100]">
                  <DropdownMenuItem onClick={() => { setPlacingType("__pole__"); toast.info("Tap the map where the Pole goes"); }} data-testid="map-add-pole" className="cursor-pointer font-medium">
                    Add Pole
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setPlacingType("__pole_terminal__"); toast.info("Tap the map where the Pole Terminal goes"); }} data-testid="map-add-pole-terminal" className="cursor-pointer font-medium">
                    Add Pole Terminal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer" data-testid="map-add-aerial-sub">Aerial Attribute</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52 bg-white z-[1100]">
                      {MAP_AERIAL_ADD_TYPES.map((t) => (
                        <DropdownMenuItem key={t} onClick={() => { setPlacingType(t); toast.info(`Tap the map where the ${t} goes`); }} data-testid={`map-add-${t}`} className="cursor-pointer">
                          {t}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer" data-testid="map-add-underground-sub">Underground Attribute</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52 max-h-72 overflow-y-auto bg-white z-[1100]">
                      {UNDERGROUND_TYPES.filter((t) => !MAP_AERIAL_ADD_TYPES.includes(t)).map((t) => (
                        <DropdownMenuItem key={t} onClick={() => { setPlacingType(t); toast.info(`Tap the map where the ${t} goes`); }} data-testid={`map-add-${t}`} className="cursor-pointer">
                          {t}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Edit mode toggle */}
            {!editMode && !connectionEditMode && !positionEditMode ? (
              <div className="flex gap-2">
                {/* Edit Map Dropdown Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={route.length === 0 && ug.length === 0}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="edit-map-dropdown-btn"
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit Map
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white z-[1100]">
                    <DropdownMenuLabel className="text-xs text-zinc-500 uppercase tracking-wider">Path Colors</DropdownMenuLabel>
                    
                    {/* Aerial Path Color */}
                    <div className="px-2 py-1.5">
                      <label className="text-xs text-zinc-600 mb-1 block">Aerial Path (All)</label>
                      <Select value={aerialColor} onValueChange={applyColorToAllAerial}>
                        <SelectTrigger className="h-8 text-sm" data-testid="aerial-color-select">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PATH_COLORS[aerialColor]?.hex }}></span>
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="z-[1200] bg-white">
                          {Object.entries(PATH_COLORS).map(([key, { name, hex }]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hex }}></span>
                                {name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Underground Path Color */}
                    <div className="px-2 py-1.5">
                      <label className="text-xs text-zinc-600 mb-1 block">Underground Path (All)</label>
                      <Select value={undergroundColor} onValueChange={applyColorToAllUnderground}>
                        <SelectTrigger className="h-8 text-sm" data-testid="underground-color-select">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PATH_COLORS[undergroundColor]?.hex }}></span>
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="z-[1200] bg-white">
                          {Object.entries(PATH_COLORS).map(([key, { name, hex }]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hex }}></span>
                                {name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-zinc-500 uppercase tracking-wider">Edit Actions</DropdownMenuLabel>
                    
                    <DropdownMenuItem
                      onClick={() => {
                        setPositionEditMode(true);
                        toast.info("Move Mode: drag any marker or text box to reposition it");
                      }}
                      className="cursor-pointer"
                      data-testid="edit-all-btn"
                    >
                      <Move className="w-4 h-4 mr-2" />
                      Move Items
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={() => {
                        setEditMode(true);
                        setConnectionEditMode(true);
                        initializeConnections();
                      }}
                      className="cursor-pointer"
                      data-testid="edit-lines-btn"
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit Lines & Connections
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={() => { 
                        setEditMode(true); 
                        setSelectedSegment(null);
                        toast.info("Click on any line segment to select it and change its color individually");
                      }}
                      className="cursor-pointer"
                      data-testid="edit-segment-colors-btn"
                    >
                      <Palette className="w-4 h-4 mr-2" />
                      Edit Individual Segment Colors
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={() => { setEditMode(true); setAddingType("note"); }}
                      className="cursor-pointer"
                      data-testid="dropdown-add-note-btn"
                    >
                      <StickyNote className="w-4 h-4 mr-2" />
                      Add Note
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={() => { setEditMode(true); setAddingType("measurement"); }}
                      className="cursor-pointer"
                      data-testid="dropdown-add-measurement-btn"
                    >
                      <Ruler className="w-4 h-4 mr-2" />
                      Add Measurement
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={() => setPendingMapExport("map_pages_zip")}
                      className="cursor-pointer border-t border-zinc-200"
                      data-testid="download-segmented"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download 800ft Pages (ZIP)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setPendingMapExport("map_pdf")}
                      className="cursor-pointer border-t border-zinc-200"
                      data-testid="download-pdf"
                    >
                      <Download className="w-4 h-4 mr-2 text-red-600" />
                      Download 1000ft Pages (PDF)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* Show current mode indicators */}
                {(editMode || positionEditMode || connectionEditMode) && !addingType && (
                  <span className="flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                    {positionEditMode && !editMode && !connectionEditMode
                      ? "Move Mode: Drag markers & text boxes to reposition"
                      : "Edit Mode: Drag markers, edit lines, reconnect items"}
                  </span>
                )}
                {addingType && (
                  <span className="flex items-center px-3 py-1 bg-amber-100 text-amber-800 rounded text-sm font-medium">
                    {addingType === "note" ? "Click map to add note" : "Click start point, then end point"}
                  </span>
                )}
                {/* Add measurement button while in edit mode */}
                {(editMode || positionEditMode || connectionEditMode) && !addingType && (
                  <Button
                    onClick={() => setAddingType("measurement")}
                    variant="outline"
                    className="bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-700"
                    data-testid="add-measurement-btn"
                  >
                    <Ruler className="w-4 h-4 mr-2" />
                    Add Measurement
                  </Button>
                )}
                {/* Add note button while in edit mode */}
                {(editMode || positionEditMode || connectionEditMode) && !addingType && (
                  <Button
                    onClick={() => setAddingType("note")}
                    variant="outline"
                    className="bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-700"
                    data-testid="add-note-edit-btn"
                  >
                    <StickyNote className="w-4 h-4 mr-2" />
                    Add Note
                  </Button>
                )}
                {/* Cancel adding type */}
                {addingType && (
                  <Button
                    onClick={() => setAddingType(null)}
                    variant="outline"
                    className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel Add
                  </Button>
                )}
                {/* Save/Done button */}
                <Button
                  onClick={() => {
                    saveRouteEdits();
                    setPositionEditMode(false);
                    setConnectionEditMode(false);
                    setSelectedConn(null);
                    setReconnectSide(null);
                    setAddingConn(null);
                    setAddingType(null);
                  }}
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="save-all-btn"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Done
                </Button>
                {/* Cancel all editing */}
                <Button
                  onClick={() => {
                    cancelEditing();
                    setPositionEditMode(false);
                    setConnectionEditMode(false);
                    setSelectedConn(null);
                    setReconnectSide(null);
                    setAddingConn(null);
                    setAddingType(null);
                  }}
                  disabled={saving}
                  variant="outline"
                  className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200"
                  data-testid="cancel-edit-btn"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {placingType && (
          <div className="flex items-center justify-between gap-3 bg-emerald-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium shadow" data-testid="placing-banner">
            <span>Tap the map where the {placingType === "__pole__" ? "Pole" : placingType === "__pole_terminal__" ? "Pole Terminal" : placingType} goes — the form will open with that location filled in</span>
            <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-zinc-900 hover:bg-zinc-100 border-0 shrink-0" onClick={() => setPlacingType(null)} data-testid="placing-cancel-btn">Cancel</Button>
          </div>
        )}
        {missing.length > 0 && (
          <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 rounded" data-testid="missing-gps-banner">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <span className="font-semibold">{missing.length} pole(s) missing GPS</span> and not shown on the map. Capture coordinates for:{" "}
              <span className="font-mono">{missing.join(", ")}</span>
            </div>
          </div>
        )}

        {route.length === 0 && ug.length === 0 ? (
          <div className="industrial-card p-8 text-center text-zinc-500">
            No poles or underground items with GPS coordinates yet. Add coordinates to see them on the map.
          </div>
        ) : (
          <div className="h-[70vh] border border-zinc-300 overflow-hidden rounded relative">
            {/* Universal edit mode indicator */}
            {(editMode || positionEditMode || connectionEditMode) && !selectedSegment && (
              <div className="absolute top-2 left-2 z-[1000] bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium shadow-lg max-w-md">
                <div className="font-semibold">{positionEditMode && !editMode && !connectionEditMode ? "Move Mode Active" : "Edit Mode Active"}</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {positionEditMode && !editMode && !connectionEditMode
                    ? "• Drag any pole or underground marker to move it • Drag measurement & label text boxes to reposition them • Saves automatically"
                    : "• Tap a connection line, then use the tools below to move / delete / add lines • Click line to change its color"}
                </div>
                {/* Connection tools (merged into this menu) */}
                {connectionEditMode && (() => {
                  const conn = connections.find((c) => c.id === selectedConn);
                  const connLabel = conn
                    ? `${allConnectableItems.find((i) => i.id === conn.from_item_id)?.label || "?"} → ${allConnectableItems.find((i) => i.id === conn.to_item_id)?.label || "?"}`
                    : null;
                  return (
                    <div className="mt-2 pt-2 border-t border-blue-400">
                      <div className="text-xs opacity-80 mb-1 uppercase tracking-wide font-semibold">Connections</div>
                      <div className="bg-white rounded-md p-2 text-zinc-900 space-y-2" data-testid="conn-edit-panel">
                        {addingConn ? (
                          <>
                            <div className="text-xs text-emerald-700 font-medium" data-testid="conn-panel-instruction">
                              {addingConn.from ? `Start: ${addingConn.from.label}. Now tap the SECOND item.` : "Tap the FIRST item to connect."}
                            </div>
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setAddingConn(null)} data-testid="conn-cancel-action-btn">Cancel</Button>
                          </>
                        ) : selectedConn && reconnectSide && conn ? (
                          <>
                            <div className="text-xs text-emerald-700 font-medium" data-testid="conn-panel-instruction">
                              Tap the item to connect the {reconnectSide === "from" ? "START" : "END"} of {connLabel} to.
                            </div>
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setReconnectSide(null)} data-testid="conn-cancel-action-btn">Cancel</Button>
                          </>
                        ) : selectedConn && conn ? (
                          <>
                            <div className="text-xs font-mono font-semibold" data-testid="conn-selected-label">{connLabel}</div>
                            {(() => {
                              const asPair = (id) => {
                                if (route.some((p) => p.id === id)) return { type: "pole" };
                                const f = ug.find((x) => x.id === id);
                                return f ? { type: "underground", ugType: f.type, aerialOverride: ["aerial", "underground", "neutral"].includes(f.aerial_override) ? f.aerial_override : null } : { type: "pole" };
                              };
                              const eff = conn.type_override || (resolvePairAerial(asPair(conn.from_item_id), asPair(conn.to_item_id)) ? "aerial" : "underground");
                              return (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className={`flex-1 h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 ${eff === "aerial" ? "bg-blue-100 ring-1 ring-blue-400 font-bold" : ""}`} onClick={() => handleConnectionUpdate(conn.id, { type_override: "aerial" })} data-testid="conn-type-aerial-btn">Aerial (blue)</Button>
                                  <Button size="sm" variant="outline" className={`flex-1 h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 ${eff === "underground" ? "bg-emerald-100 ring-1 ring-emerald-400 font-bold" : ""}`} onClick={() => handleConnectionUpdate(conn.id, { type_override: "underground" })} data-testid="conn-type-underground-btn">UG (green)</Button>
                                </div>
                              );
                            })()}
                            <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setReconnectSide("from")} data-testid="conn-move-start-btn">Move start (blue dot)</Button>
                            <Button size="sm" className="w-full h-8 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => setReconnectSide("to")} data-testid="conn-move-end-btn">Move end (red dot)</Button>
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => setConfirmDeleteConn(selectedConn)} data-testid="conn-delete-btn">Delete line</Button>
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setSelectedConn(null)} data-testid="conn-deselect-btn">Done with this line</Button>
                          </>
                        ) : (
                          <>
                            {connections.length > 0 && (
                              <Select value="" onValueChange={(v) => { if (v) { setSelectedConn(v); setReconnectSide(null); setAddingConn(null); } }}>
                                <SelectTrigger className="h-8 text-xs bg-white" data-testid="conn-picker-select">
                                  <SelectValue placeholder="Pick a line to edit…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60 z-[1200] bg-white">
                                  {connections.map((c) => {
                                    const f = allConnectableItems.find((i) => i.id === c.from_item_id);
                                    const t = allConnectableItems.find((i) => i.id === c.to_item_id);
                                    if (!f || !t || c.connection_type === 'removed') return null;
                                    return (
                                      <SelectItem key={c.id} value={c.id} data-testid={`conn-picker-item-${c.id}`}>
                                        {f.label} → {t.label}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setAddingConn({ from: null }); setSelectedConn(null); setReconnectSide(null); }} data-testid="conn-add-line-btn">+ Add line</Button>
                              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setConfirmResetLines(true)} data-testid="conn-reset-lines-btn">Reset lines</Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* Segment selector dropdown for easier selection */}
                {orderedSegments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-400">
                    <div className="text-xs opacity-80 mb-1">Or select segment from list:</div>
                    <Select value={selectedSegment || ""} onValueChange={(v) => v && setSelectedSegment(v)}>
                      <SelectTrigger className="h-7 text-xs bg-white text-zinc-900">
                        <SelectValue placeholder="Select a segment..." />
                      </SelectTrigger>
                      <SelectContent className="z-[1200] bg-white">
                        {orderedSegments.map((seg, i) => {
                          const segKey = `${seg.from.id}-${seg.to.id}`;
                          const segItemLabel = (it) => it.type === 'pole'
                            ? (it.label && it.label !== 'Pole' ? `Pole ${it.label}` : 'Pole')
                            : (it.ugType && it.label !== it.ugType ? `${it.ugType} · ${it.label}` : (it.ugType || it.label));
                          const fromLabel = segItemLabel(seg.from) || 'P' + (i+1);
                          const toLabel = segItemLabel(seg.to) || 'P' + (i+2);
                          return (
                            <SelectItem key={segKey} value={segKey}>
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getSegmentColor(segKey, seg.isAerial, seg.isRed) }}></span>
                                {fromLabel} → {toLabel} ({seg.isAerial ? 'Aerial' : 'Underground'})
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            
            {/* Selected segment color picker panel */}
            {selectedSegment && editMode && (
              <div className="absolute top-2 left-2 z-[1000] bg-white border border-zinc-300 rounded-lg shadow-lg p-3 min-w-[200px]" data-testid="segment-color-panel">
                <div className="font-semibold text-sm text-zinc-900 mb-2">Segment Color</div>
                <div className="text-xs text-zinc-500 mb-3">Click a color to apply to selected segment</div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.entries(PATH_COLORS).map(([key, { name, hex }]) => (
                    <button
                      key={key}
                      onClick={() => applyColorToSegment(key)}
                      className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                        segmentColors[selectedSegment] === key ? 'border-zinc-900 ring-2 ring-offset-1 ring-zinc-400' : 'border-white'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={name}
                      data-testid={`segment-color-${key}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Clear this segment's custom color
                      setSegmentColors(prev => {
                        const newColors = { ...prev };
                        delete newColors[selectedSegment];
                        return newColors;
                      });
                    }}
                    className="text-xs h-7"
                  >
                    Reset to Default
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedSegment(null)}
                    className="text-xs h-7"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
            
            {/* Label text editing modal */}
            {editingLabelId && (
              <div className="absolute top-2 left-2 z-[1001] bg-white border border-zinc-300 rounded-lg shadow-xl p-4 min-w-[280px]" data-testid="label-edit-modal">
                <div className="font-semibold text-sm text-zinc-900 mb-2">Edit Label Text</div>
                <div className="text-xs text-zinc-500 mb-3">Double-click any label to edit its text</div>
                <input
                  type="text"
                  value={editingLabelText}
                  onChange={(e) => setEditingLabelText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditedLabelText();
                    if (e.key === 'Escape') cancelEditingLabel();
                  }}
                  className="w-full px-3 py-2 border border-zinc-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  data-testid="label-edit-input"
                />
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={saveEditedLabelText}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resetLabelToDefault(editingLabelId)}
                    className="text-xs h-8"
                  >
                    Reset Default
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEditingLabel}
                    className="text-xs h-8"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <MapContainer 
              center={center} 
              zoom={18} 
              minZoom={3} 
              maxZoom={22} 
              zoomDelta={0.25}
              zoomSnap={0.25}
              wheelPxPerZoomLevel={120}
              scrollWheelZoom={true} 
              style={{ height: "100%", width: "100%" }} 
              className="z-0"
            >
              {mapLayer === "street" ? (
                <TileLayer key="osm" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
              ) : (
                <>
                <TileLayer key="esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
                <TileLayer key="esri-roads" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
                </>
              )}
              <FitBounds points={allPoints} disabled={editMode} />
              <MapRefSetter mapRef={mapRef} />
              {placingType && (
                <PlaceAttributeHandler
                  onPlace={(latlng) => {
                    const lat = latlng.lat.toFixed(6);
                    const lng = latlng.lng.toFixed(6);
                    const t = placingType;
                    setPlacingType(null);
                    if (t === "__pole__") {
                      navigate(`/jobs/${jobId}/add?lat=${lat}&lng=${lng}&from=map`);
                    } else if (t === "__pole_terminal__") {
                      navigate(`/jobs/${jobId}/add?terminal=true&lat=${lat}&lng=${lng}&from=map`);
                    } else {
                      navigate(`/jobs/${jobId}/underground/add?type=${encodeURIComponent(t)}&lat=${lat}&lng=${lng}&from=map`);
                    }
                  }}
                />
              )}
              
              {/* ALL SEGMENTS - rendered in sort_order (job page order) */}
              {orderedSegments.map((seg, i) => {
                const segmentKey = `${seg.from.id}-${seg.to.id}`;
                const isSelected = selectedSegment === segmentKey;
                const segmentColor = getSegmentColor(segmentKey, seg.isAerial, seg.isRed);
                // Use precomputed position with collision avoidance
                const measurementLabelPos = computedLabelPositions.measurements[segmentKey] || getMeasurementLabelPosition(segmentKey, seg.mid, i);
                
                // For aerial pole-to-pole segments, use EditableRoute with waypoints
                if (seg.isAerial) {
                  const waypoints = customRoutes[segmentKey] || [];
                  let badgePos = seg.mid;
                  if (waypoints.length > 0) {
                    const path = [seg.fromPos, ...waypoints.map((w) => [w.lat, w.lng]), seg.toPos];
                    const m = Math.floor(path.length / 2);
                    badgePos = path.length % 2 === 0
                      ? [(path[m - 1][0] + path[m][0]) / 2, (path[m - 1][1] + path[m][1]) / 2]
                      : path[m];
                  }
                  return (
                    <React.Fragment key={segmentKey}>
                      <EditableRoute
                        startPos={seg.fromPos}
                        endPos={seg.toPos}
                        waypoints={waypoints}
                        segmentId={segmentKey}
                        onWaypointsChange={handleWaypointsChange}
                        editMode={editMode}
                        color={segmentColor}
                        weight={isSelected ? 5 : 3}
                        showDistance={false}
                        isAfterMPOE={seg.isRed}
                        onClick={() => handleSegmentClick(segmentKey)}
                      />
                      {/* Numbered badge — measurement is in the list below the map */}
                      {!showStationNumbers && spanNums[i] != null && (
                        <Marker position={badgePos} icon={numberBadgeIcon(spanNums[i])} interactive={false} zIndexOffset={800} />
                      )}
                      {/* Selection highlight */}
                      {isSelected && (
                        <Polyline
                          positions={waypoints.length > 0 ? [seg.fromPos, ...waypoints, seg.toPos] : [seg.fromPos, seg.toPos]}
                          pathOptions={{ color: "#fff", weight: 8, opacity: 0.5 }}
                        />
                      )}
                    </React.Fragment>
                  );
                }
                
                // For segments involving underground items, use EditableRoute (dashed) with waypoints
                const ugWaypoints = customRoutes[segmentKey] || [];
                let ugBadgePos = seg.mid;
                if (ugWaypoints.length > 0) {
                  const path = [seg.fromPos, ...ugWaypoints.map((w) => [w.lat, w.lng]), seg.toPos];
                  const m = Math.floor(path.length / 2);
                  ugBadgePos = path.length % 2 === 0
                    ? [(path[m - 1][0] + path[m][0]) / 2, (path[m - 1][1] + path[m][1]) / 2]
                    : path[m];
                }
                return (
                  <React.Fragment key={segmentKey}>
                    <EditableRoute
                      startPos={seg.fromPos}
                      endPos={seg.toPos}
                      waypoints={ugWaypoints}
                      segmentId={segmentKey}
                      onWaypointsChange={handleWaypointsChange}
                      editMode={editMode}
                      color={segmentColor}
                      weight={isSelected ? 4 : 2.5}
                      dashed={true}
                      dashArray={seg.isDirectBury ? "2, 8" : null}
                      showDistance={false}
                      onClick={() => handleSegmentClick(segmentKey)}
                    />
                    {/* Selection highlight */}
                    {isSelected && (
                      <Polyline
                        positions={[seg.fromPos, ...ugWaypoints.map((w) => [w.lat, w.lng]), seg.toPos]}
                        pathOptions={{ color: "#fff", weight: 7, opacity: 0.5 }}
                      />
                    )}
                    {/* Numbered badge — click to see the distance */}
                    {!showStationNumbers && spanNums[i] != null && (
                      <Marker position={ugBadgePos} icon={numberBadgeIcon(spanNums[i])} zIndexOffset={800}>
                        <Popup>
                          <div className="text-sm font-mono" data-testid={`span-badge-popup-${spanNums[i]}`}>
                            {segItemName(seg.from)} to {segItemName(seg.to)} = {fmtFeet(segListDistance(seg))} (UG)
                          </div>
                        </Popup>
                      </Marker>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Riser number badges at their pole — click to see the measurement */}
              {!showStationNumbers && measurementEntries.filter((e) => e.kind === "riser" && e.pos).map((e) => (
                <Marker key={`riser-num-${e.num}`} position={e.pos} icon={numberBadgeIcon(e.num, "#7c3aed", [-6, 32])} zIndexOffset={800}>
                  <Popup><div className="text-sm font-mono" data-testid={`riser-badge-popup-${e.num}`}>{e.text}</div></Popup>
                </Marker>
              ))}

              {/* Path measurement number badges at their item — click to see the measurement */}
              {!showStationNumbers && measurementEntries.filter((e) => e.kind === "path" && e.pos).map((e) => (
                <Marker key={`path-num-${e.num}`} position={e.pos} icon={numberBadgeIcon(e.num, "#059669", [34, -8])} zIndexOffset={800}>
                  <Popup><div className="text-sm font-mono" data-testid={`path-badge-popup-${e.num}`}>{e.text}</div></Popup>
                </Marker>
              ))}
              
              {poleDisplayInfo.map((p, i) => {
                const poleLabel = markerLabel(p, i, false);
                // Show station number if enabled
                const stationLabel = showStationNumbers && stationNumbers[p.id] ? stationNumbers[p.id] : null;
                // Hide pole number label when station numbers are active
                const displayLabel = showStationNumbers ? "" : poleLabel;
                const icon = p.isCluster 
                  ? poleIconWithArrow(displayLabel, p.labelAngle, 45, p.marker_color || "#dc2626")
                  : poleIcon(displayLabel, p.labelDir, p.marker_color || "#dc2626");
                return (
                  <React.Fragment key={p.id}>
                    <DraggableMarker 
                      position={p.pos} 
                      icon={icon}
                      draggable={positionEditMode}
                      onDragEnd={(lat, lng) => handlePoleDragEnd(p.id, lat, lng)}
                      zIndexOffset={positionEditMode ? 1500 : 0}
                      autoOpen={focusItemId === p.id}
                    >
                      <Popup>
                        <div className="min-w-[180px] font-mono" data-testid={`pole-popup-${p.id}`}>
                          <div className="text-base font-bold text-zinc-900">{p.pole_number || "(unnumbered)"}</div>
                          {stationLabel && <div className="text-xs text-indigo-600 font-bold">Station: {stationLabel}</div>}
                          <div className="mt-1 text-xs text-zinc-600 space-y-0.5">
                            <div><span className="text-zinc-400">Size:</span> {p.pole_size ? `${p.pole_size}'` : "—"}</div>
                            <div><span className="text-zinc-400">Class:</span> {p.pole_class || "—"}</div>
                            <div><span className="text-zinc-400">Condition:</span> {p.condition || "—"}</div>
                            {p.risers && <div><span className="text-zinc-400">New Risers:</span> {p.risers}{p.riser_height ? ` @ ${formatRiserHeight(p.riser_height)}` : ""}</div>}
                          </div>
                          {!positionEditMode && (
                            <div className="mt-2 flex gap-2">
                              <Link to={`/jobs/${jobId}/view/${p.id}`} className="flex-1">
                                <Button size="sm" className="w-full h-8 bg-red-600 hover:bg-red-700 text-white" data-testid={`popup-view-${p.id}`}>Open</Button>
                              </Link>
                              <Link to={`/jobs/${jobId}/edit/${p.id}?from=map`} className="flex-1">
                                <Button size="sm" variant="outline" className="w-full h-8 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid={`popup-edit-${p.id}`}>Edit</Button>
                              </Link>
                            </div>
                          )}
                          {!positionEditMode && (
                            <PolePopupEditor
                              pole={p}
                              onSaved={(updated) => setPoles((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
                              onDeleted={(id) => {
                                setPoles((prev) => prev.filter((x) => x.id !== id));
                                axios.post(`/jobs/${jobId}/sync-map-distances`).catch(() => {});
                              }}
                            />
                          )}
                          {positionEditMode && (
                            <div className="mt-2 text-xs text-green-600 font-medium">Drag marker to reposition</div>
                          )}
                        </div>
                      </Popup>
                    </DraggableMarker>
                    {/* Station number badge — station value is in the list below the map */}
                    {stationLabel && (
                      <Marker position={p.pos} icon={numberBadgeIcon(stationNumById[p.id], "#4f46e5", [-6, 32])} interactive={false} zIndexOffset={850} />
                    )}
                  </React.Fragment>
                );
              })}
              {/* Direction arrows (only in non-edit mode) */}
              {!editMode && segLabels.map((s, i) => (
                <Marker key={`arr-${i}`} position={s.mid} icon={arrowIcon(s.deg)} interactive={false} />
              ))}
              {ug.map((u, ugIdx) => {
                const isMPOE = u.type === "MPOE";
                // Items AFTER MPOE should be red, MPOE itself stays red, items before stay green
                const ugIsAfterMPOE = isAfterMPOE.underground[ugIdx] || false;
                const isRed = isMPOE || ugIsAfterMPOE;
                const stationLabel = showStationNumbers && stationNumbers[u.id] ? stationNumbers[u.id] : null;
                // Loop / Aerial Splice are aerial attributes — render them blue
                const itemColor = u.marker_color || (u.aerial_override === "neutral" ? "#9333ea" : isAerialAttr(u) ? "#2563eb" : undergroundColorHex);
                // Hide underground type label when station numbers are active
                const ugDisplayLabel = showStationNumbers ? "" : undergroundAbbr(u.type);
                return (
                <React.Fragment key={u.id}>
                  <DraggableMarker 
                    position={u.pos} 
                    icon={ugIcon(ugDisplayLabel, isRed, itemColor)}
                    draggable={positionEditMode}
                    onDragEnd={(lat, lng) => handleUndergroundDragEnd(u.id, lat, lng)}
                    zIndexOffset={positionEditMode ? 1500 : 0}
                    autoOpen={focusItemId === u.id}
                  >
                    <Popup>
                      <div className="min-w-[170px] font-mono" data-testid={`ug-popup-${u.id}`}>
                        <div className="text-sm font-bold" style={{ color: isRed ? '#dc2626' : itemColor }}>{undergroundAbbr(u.type)} · {u.type}</div>
                        {stationLabel && <div className="text-xs text-indigo-600 font-bold">Station: {stationLabel}</div>}
                        {u.owner && <div className="text-xs text-amber-700 font-bold" data-testid={`ug-popup-owner-${u.id}`}>Owner: {u.owner}</div>}
                        {u.material_type && <div className="text-xs text-zinc-600" data-testid={`ug-popup-material-${u.id}`}>{u.material_type}</div>}
                        {u.label && <div className="text-xs text-zinc-600 mt-1">{u.label}</div>}
                        {u.notes && <div className="text-xs text-zinc-500 mt-1">{u.notes}</div>}
                        {!positionEditMode && (
                          <>
                            <Link to={`/jobs/${jobId}/underground/edit/${u.id}?from=map`}>
                              <Button size="sm" className="w-full h-8 mt-2 text-white" style={{ backgroundColor: isRed ? '#dc2626' : itemColor }} data-testid={`ug-edit-${u.id}`}>Edit</Button>
                            </Link>
                            <UgPopupEditor
                              item={u}
                              defaultColor={u.aerial_override === "neutral" ? "#9333ea" : isAerialAttr(u) ? "#2563eb" : undergroundColorHex}
                              onSaved={(updated) => setUnderground((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
                              onDeleted={(id) => {
                                setUnderground((prev) => prev.filter((x) => x.id !== id));
                                axios.post(`/jobs/${jobId}/sync-map-distances`).catch(() => {});
                              }}
                            />
                          </>
                        )}
                        {positionEditMode && (
                          <div className="mt-2 text-xs font-medium" style={{ color: undergroundColorHex }}>Drag marker to reposition</div>
                        )}
                      </div>
                    </Popup>
                  </DraggableMarker>
                  {/* Station number badge — station value is in the list below the map */}
                  {stationLabel && (
                    <Marker position={u.pos} icon={numberBadgeIcon(stationNumById[u.id], isRed ? "#dc2626" : "#4f46e5", [-6, 32])} interactive={false} zIndexOffset={850} />
                  )}
                </React.Fragment>
              )})}
              {/* Map annotations (notes and measurements) */}
              <MapAnnotations
                annotations={annotations}
                editMode={editMode || positionEditMode}
                addingType={addingType}
                onAnnotationAdd={handleAnnotationAdd}
                onAnnotationUpdate={handleAnnotationUpdate}
                onAnnotationDelete={handleAnnotationDelete}
              />
              {/* Connection edit mode - tap-to-reconnect */}
              {connectionEditMode && (
                <>
                  {/* Target indicators for all connectable items (tappable while choosing a target) */}
                  {allConnectableItems.map(item => {
                    const awaitingTarget = Boolean(addingConn) || Boolean(selectedConn && reconnectSide);
                    return (
                      <Marker
                        key={`target-${item.id}-${awaitingTarget ? "pick" : "idle"}`}
                        position={item.pos}
                        icon={L.divIcon({
                          className: "conn-target",
                          html: awaitingTarget
                            ? `<div style="width:34px;height:34px;border-radius:50%;background:rgba(34,197,94,0.25);border:3px solid #16a34a;cursor:pointer;animation:connPulse 1.2s infinite;"></div>`
                            : `<div style="width:28px;height:28px;border-radius:50%;background:rgba(139,92,246,0.15);border:2px dashed #8b5cf6;"></div>`,
                          iconSize: awaitingTarget ? [34, 34] : [28, 28],
                          iconAnchor: awaitingTarget ? [17, 17] : [14, 14]
                        })}
                        interactive={awaitingTarget}
                        zIndexOffset={awaitingTarget ? 1400 : 800}
                        eventHandlers={awaitingTarget ? {
                          click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            handleTargetTap(item);
                          }
                        } : undefined}
                      />
                    );
                  })}
                  
                  {/* Connection lines — tap a line to select it */}
                  {connections.map(conn => {
                    const fromItem = allConnectableItems.find(i => i.id === conn.from_item_id);
                    const toItem = allConnectableItems.find(i => i.id === conn.to_item_id);
                    
                    if (!fromItem || !toItem) return null;
                    if (conn.connection_type === 'removed') return null;
                    // Hide auto connections broken by a Start/End Path toggle
                    const earlierItem = fromItem.sort_order <= toItem.sort_order ? fromItem : toItem;
                    const laterItem = fromItem.sort_order <= toItem.sort_order ? toItem : fromItem;
                    if (conn.connection_type !== 'custom' && (earlierItem.end_path || laterItem.start_path)) return null;
                    
                    const lineColor = conn.connection_type === 'aerial' ? '#3b82f6' : 
                                      conn.connection_type === 'underground' ? '#22c55e' : '#8b5cf6';
                    const isSelected = selectedConn === conn.id;
                    
                    return (
                      <React.Fragment key={conn.id}>
                        {/* Connection line */}
                        <Polyline
                          positions={[fromItem.pos, toItem.pos]}
                          pathOptions={{
                            color: isSelected ? "#facc15" : lineColor,
                            weight: isSelected ? 7 : 4,
                            opacity: isSelected ? 1 : 0.8,
                            dashArray: conn.connection_type === 'custom' ? '8, 8' : undefined
                          }}
                          bubblingMouseEvents={false}
                          eventHandlers={{
                            click: (e) => {
                              L.DomEvent.stopPropagation(e);
                              setSelectedConn(conn.id);
                              setReconnectSide(null);
                              setAddingConn(null);
                            }
                          }}
                        />
                        {/* Wide invisible hit line for easy tapping */}
                        <Polyline
                          positions={[fromItem.pos, toItem.pos]}
                          pathOptions={{ color: "#000000", opacity: 0.001, weight: 26, className: "conn-hit-line" }}
                          interactive={true}
                          bubblingMouseEvents={false}
                          eventHandlers={{
                            click: (e) => {
                              L.DomEvent.stopPropagation(e);
                              setSelectedConn(conn.id);
                              setReconnectSide(null);
                              setAddingConn(null);
                            }
                          }}
                        />
                        {/* Endpoint dots (visual markers — reconnect via the panel) */}
                        <Marker
                          position={fromItem.pos}
                          interactive={false}
                          zIndexOffset={1100}
                          icon={L.divIcon({
                            className: "conn-endpoint-from",
                            html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.5);"></div>`,
                            iconSize: [14, 14],
                            iconAnchor: [7, 7]
                          })}
                        />
                        <Marker
                          position={toItem.pos}
                          interactive={false}
                          zIndexOffset={1100}
                          icon={L.divIcon({
                            className: "conn-endpoint-to",
                            html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.5);"></div>`,
                            iconSize: [14, 14],
                            iconAnchor: [7, 7]
                          })}
                        />
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </MapContainer>
            {legendVisible ? (
            <div
              className="absolute z-[500] bg-white/90 border border-zinc-200 rounded px-3 py-2 text-xs font-mono shadow max-w-[220px]"
              style={legendPos ? { left: legendPos.x, top: legendPos.y } : { bottom: 12, right: 12 }}
              data-testid="map-legend"
            >
              <div
                className="flex items-center justify-between gap-2 mb-1 cursor-move select-none touch-none"
                onPointerDown={handleLegendPointerDown}
                data-testid="legend-drag-handle"
              >
                <span className="font-bold text-zinc-700 flex items-center gap-1"><GripVertical className="w-3 h-3 text-zinc-400" />LEGEND</span>
                <button
                  type="button"
                  className="text-zinc-400 hover:text-zinc-700 -mr-1"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setLegendVisible(false)}
                  data-testid="legend-hide-btn"
                  title="Hide legend"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {route.length > 0 && (
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 border border-white inline-block flex-shrink-0"></span>Pole (Red)</div>
              )}
              {(poles.some((p) => p.marker_color === "#39ff14") || underground.some((u) => u.marker_color === "#39ff14")) && (
                <div className="flex items-center gap-2 mt-0.5" data-testid="legend-fst"><span className="w-3 h-3 rounded-full border border-white inline-block flex-shrink-0" style={{ backgroundColor: "#39ff14" }}></span>FST (Neon Green)</div>
              )}
              {(poles.some((p) => p.marker_color === "#ff6600") || underground.some((u) => u.marker_color === "#ff6600")) && (
                <div className="flex items-center gap-2 mt-0.5" data-testid="legend-fbt"><span className="w-3 h-3 rounded-full border border-white inline-block flex-shrink-0" style={{ backgroundColor: "#ff6600" }}></span>FBT (Neon Orange)</div>
              )}
              {underground.some((u) => u.aerial_override === "neutral") && (
                <div className="flex items-center gap-2 mt-0.5" data-testid="legend-neutral"><span className="w-3 h-3 rounded-full border border-white inline-block flex-shrink-0" style={{ backgroundColor: "#9333ea" }}></span>Neutral (Purple)</div>
              )}
              {orderedSegments.some((s) => s.isAerial) && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-4 h-0.5 inline-block flex-shrink-0" style={{ backgroundColor: aerialColorHex }}></span>Aerial Path ({PATH_COLORS[aerialColor]?.name})</div>
              )}
              {orderedSegments.some((s) => !s.isAerial) && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-3 h-3 border border-white inline-block flex-shrink-0" style={{ backgroundColor: undergroundColorHex }}></span>Underground ({PATH_COLORS[undergroundColor]?.name})</div>
              )}
              {orderedSegments.some((s) => s.isDirectBury) && (
                <div className="flex items-center gap-2 mt-0.5" data-testid="legend-direct-bury"><span className="w-4 inline-block flex-shrink-0 border-t-2 border-dotted" style={{ borderColor: undergroundColorHex }}></span>Direct Bury (dotted)</div>
              )}
              {annotations.filter(a => a.type === "note").length > 0 && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-3 h-3 bg-amber-500 border border-white rounded inline-block flex-shrink-0"></span>Note (Amber)</div>
              )}
              {annotations.filter(a => a.type === "measurement").length > 0 && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-4 h-0.5 bg-amber-500 inline-block flex-shrink-0" style={{borderStyle: 'dashed'}}></span>Measurement (Amber)</div>
              )}
              {presentUg.map((t) => (
                <div key={t} className="text-zinc-500 mt-0.5 ml-1"><span style={{ color: AERIAL_ATTR_TYPES.has(t) ? "#2563eb" : undergroundColorHex }} className="font-semibold">{undergroundAbbr(t)}</span> {t}{AERIAL_ATTR_TYPES.has(t) ? " (Aerial)" : ""}</div>
              ))}
            </div>
            ) : (
              <button
                type="button"
                onClick={() => setLegendVisible(true)}
                className="absolute bottom-3 right-3 z-[500] bg-white/90 border border-zinc-200 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-600 shadow hover:bg-white"
                data-testid="legend-show-btn"
                title="Show legend"
              >
                LEGEND
              </button>
            )}
          </div>
        )}

        {/* Numbered station list (when Sta #'s toggle on) */}
        {showStationNumbers && stationEntries.length > 0 && (
          <div className="industrial-card p-4 sm:p-5" data-testid="station-numbers-list">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
              <div className="w-1 h-5 bg-indigo-600"></div>
              STATION NUMBERS
            </h2>
            <ol className="space-y-1 font-mono text-sm text-zinc-800">
              {stationEntries.map((e) => (
                <li key={e.id} data-testid={`station-entry-${e.num}`}>
                  <span className="font-bold text-indigo-700">{e.num}.</span> {e.name} — Sta {e.station}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Numbered span measurements list */}
        {measurementEntries.length > 0 && (
          <div className="industrial-card p-4 sm:p-5" data-testid="span-measurements-list">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                <div className="w-1 h-5 bg-orange-500"></div>
                SPAN MEASUREMENTS
              </h2>
              {!spanReorder && (poles.length + underground.length) >= 2 && (
                <Button variant="outline" size="sm" onClick={() => setSpanReorder(true)} className="gap-1 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="span-reorder-btn">
                  <GripVertical className="w-4 h-4" /> Reorder
                </Button>
              )}
            </div>
            {spanReorder ? (
              <SpanReorderList initialItems={combinedOrderItems()} onSave={saveSpanOrder} onSaveSync={saveSpanOrderSync} onCancel={() => setSpanReorder(false)} saving={savingOrder} />
            ) : (
            <ol className="space-y-1 font-mono text-sm text-zinc-800">
              {measurementEntries.map((e) => (
                e.kind === "span" ? (
                  <li key={`entry-${e.num}`} data-testid={`span-measurement-${e.num}`}>
                    <span className="font-bold text-orange-700">{e.num}.</span> {segItemName(e.seg.from)}{showStationNumbers && (stationNumbers[`${e.seg.from.id}:out`] || stationNumbers[e.seg.from.id]) ? <span className="text-indigo-700"> {stationNumbers[`${e.seg.from.id}:out`] || stationNumbers[e.seg.from.id]}</span> : null} to {segItemName(e.seg.to)}{showStationNumbers && stationNumbers[e.seg.to.id] ? <span className="text-indigo-700"> {stationNumbers[e.seg.to.id]}</span> : null} = {fmtFeet(segListDistance(e.seg))}
                    {!e.seg.isAerial && <span className="text-emerald-700 text-xs ml-1">(UG)</span>}
                  </li>
                ) : e.kind === "riser" ? (
                  <li key={`entry-${e.num}`} data-testid={`riser-measurement-${e.num}`}>
                    <span className="font-bold text-violet-700">{e.num}.</span> {e.text}{showStationNumbers && e.itemId && stationNumbers[`${e.itemId}:out`] ? <span className="text-indigo-700"> ({stationNumbers[e.itemId]} to {stationNumbers[`${e.itemId}:out`]})</span> : null}
                  </li>
                ) : (
                  <li key={`entry-${e.num}`} data-testid={`path-measurement-${e.num}`}>
                    <span className="font-bold text-emerald-700">{e.num}.</span> {e.text}{showStationNumbers && e.itemId && stationNumbers[`${e.itemId}:out`] ? <span className="text-indigo-700"> ({stationNumbers[e.itemId]} to {stationNumbers[`${e.itemId}:out`]})</span> : null}
                  </li>
                )
              ))}
            </ol>
            )}
            <div className="mt-3 pt-3 border-t border-zinc-300 font-mono text-sm font-bold text-zinc-900" data-testid="span-measurements-total">
              Total: {fmtFeet(aerialFeetTotal)} aerial{ugFeet > 0 ? ` + ${fmtFeet(ugFeet)} underground` : ""}{totalRiserFeet > 0 ? ` + ${fmtFeet(totalRiserFeet)} new risers` : ""}{pathFeet > 0 ? ` + ${fmtFeet(pathFeet)} path` : ""} = {fmtFeet(aerialFeetTotal + totalRiserFeet + ugFeet + pathFeet)}
            </div>
          </div>
        )}
      </main>

      <ExportDestinationDialog
        open={!!pendingMapExport}
        onOpenChange={(v) => { if (!v) setPendingMapExport(null); }}
        label={CLOUD_EXPORT_LABELS[pendingMapExport] || ""}
        busy={mapExportBusy}
        onDevice={() => runMapExport("device")}
        onCloud={() => runMapExport("cloud")}
      />

      <AlertDialog open={!!confirmDeleteConn} onOpenChange={(o) => { if (!o) setConfirmDeleteConn(null); }}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete this line?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              The connection line will be removed from the map. You can re-add it with the "+ Add line" tool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900" data-testid="conn-delete-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleConnectionDelete(confirmDeleteConn); setSelectedConn(null); setConfirmDeleteConn(null); }} className="bg-red-600 hover:bg-red-700 text-white" data-testid="conn-delete-confirm-btn">Delete Line</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResetLines} onOpenChange={setConfirmResetLines}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Reset all lines?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This will delete ALL custom line edits and rebuild the default connections from the item order. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900" data-testid="reset-lines-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { resetConnections(); setConfirmResetLines(false); }} className="bg-red-600 hover:bg-red-700 text-white" data-testid="reset-lines-confirm-btn">Reset Lines</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JobMap;
