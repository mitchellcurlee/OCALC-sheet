import { useState } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Polygon, Polyline, Popup, Tooltip, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Move } from "lucide-react";

export const AREA_STYLE = {
  polygon: { color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.25, weight: 2 },
  da: { color: "#dc2626", fillColor: "#ef4444", fillOpacity: 0.25, weight: 2 },
};
export const AREA_LABEL = { polygon: "Polygon", da: "DA" };
const handleIcon = (color) => L.divIcon({ className: "area-corner-handle", html: `<div style="width:14px;height:14px;border-radius:9999px;background:#fff;border:3px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:grab"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });

/** Collects vertices while an area is being drawn (click adds a point). */
const AreaDrawHandler = ({ onPoint }) => {
  useMapEvents({ click: (e) => onPoint([e.latlng.lat, e.latlng.lng]) });
  return null;
};

/**
 * Blue "Polygon" and red "DA" areas on the interactive map (stored as annotations with `points`).
 * Each type can be hidden/shown like a layer; DA areas show their label centred inside the boundary.
 */
export const MapAreas = ({ annotations, drawing, draftPoints, onDraftPoint, show, editable, onUpdate, onDelete }) => {
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [reshapeId, setReshapeId] = useState(null); // area whose corners are draggable
  const areas = annotations.filter((a) => (a.type === "polygon" || a.type === "da") && Array.isArray(a.points) && a.points.length >= 3 && show[a.type]);

  return (
    <>
      {drawing && <AreaDrawHandler onPoint={onDraftPoint} />}
      {drawing && draftPoints.length > 0 && (
        <>
          {draftPoints.length >= 3
            ? <Polygon positions={draftPoints} pathOptions={{ ...AREA_STYLE[drawing], dashArray: "6 4" }} />
            : <Polyline positions={draftPoints} pathOptions={{ ...AREA_STYLE[drawing], dashArray: "6 4" }} />}
          {draftPoints.map((p, i) => <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: "#fff", fillColor: AREA_STYLE[drawing].color, fillOpacity: 1, weight: 2 }} />)}
        </>
      )}
      {areas.map((a) => (
        <Polygon key={a.id} positions={a.points} pathOptions={AREA_STYLE[a.type]} eventHandlers={{ click: (e) => { if (drawing) return; e.originalEvent?.stopPropagation?.(); } }}>
          {a.type === "da" && a.text && (
            <Tooltip permanent direction="center" className="da-area-label" interactive={false}><span data-testid={`da-label-${a.id}`}>{a.text}</span></Tooltip>
          )}
          {!drawing && (
            <Popup>
              <div className="min-w-[160px] space-y-2" data-testid={`area-popup-${a.id}`}>
                <div className="text-xs font-mono uppercase font-bold" style={{ color: AREA_STYLE[a.type].color }}>{AREA_LABEL[a.type]}{a.text ? ` · ${a.text}` : ""}</div>
                {editable && a.type === "da" && (
                  editId === a.id ? (
                    <div className="flex gap-1">
                      <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="h-7 text-xs" placeholder="DA label e.g. 1234PB" data-testid={`area-label-input-${a.id}`} />
                      <Button size="sm" className="h-7 text-xs bg-sky-600 text-white" onClick={() => { onUpdate(a.id, { text: editText.trim() }); setEditId(null); }} data-testid={`area-label-save-${a.id}`}>Save</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => { setEditId(a.id); setEditText(a.text || ""); }} data-testid={`area-label-edit-${a.id}`}>{a.text ? "Edit label" : "Add label"}</Button>
                  )
                )}
                {editable && (
                  <Button size="sm" variant="outline" className={`h-7 text-xs w-full ${reshapeId === a.id ? "bg-sky-600 text-white border-sky-600" : ""}`} onClick={() => setReshapeId(reshapeId === a.id ? null : a.id)} data-testid={`area-reshape-${a.id}`}><Move className="w-3 h-3 mr-1" />{reshapeId === a.id ? "Done reshaping" : "Reshape corners"}</Button>
                )}
                {editable && (
                  <Button size="sm" variant="outline" className="h-7 text-xs w-full border-red-300 text-red-600" onClick={() => { if (window.confirm(`Delete this ${AREA_LABEL[a.type]}?`)) onDelete(a.id); }} data-testid={`area-delete-${a.id}`}><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
                )}
              </div>
            </Popup>
          )}
        </Polygon>
      ))}
      {/* Draggable corner handles for the area being reshaped */}
      {!drawing && editable && areas.filter((a) => a.id === reshapeId).map((a) => a.points.map((p, i) => (
        <Marker key={`${a.id}-${i}`} position={p} icon={handleIcon(AREA_STYLE[a.type].color)} draggable zIndexOffset={3000}
          eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); const pts = a.points.map((q, k) => (k === i ? [ll.lat, ll.lng] : q)); const c = pts.reduce((acc, q) => [acc[0] + q[0] / pts.length, acc[1] + q[1] / pts.length], [0, 0]); onUpdate(a.id, { points: pts, latitude: c[0], longitude: c[1] }); } }}
          data-testid={`area-corner-${a.id}-${i}`} />
      )))}
    </>
  );
};

export default MapAreas;
