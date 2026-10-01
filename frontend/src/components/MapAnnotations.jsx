import { useState, useCallback } from "react";
import { Marker, Polyline, Popup, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

// Calculate distance in feet between two latlngs
const distanceFeet = (p1, p2) => {
  const R = 6371000;
  const lat1 = (p1[0] * Math.PI) / 180;
  const lat2 = (p2[0] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((p2[1] - p1[1]) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 3.28084;
};

// Note marker icon
const noteIcon = (color = "#f59e0b") => L.divIcon({
  className: "map-note-marker",
  html: `<div style="background:${color};border:2px solid #fff;border-radius:4px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,.4);cursor:pointer;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Measurement endpoint icon
const measureEndIcon = (color = "#f59e0b") => L.divIcon({
  className: "measure-endpoint",
  html: `<div style="background:${color};border:2px solid #fff;border-radius:50%;width:12px;height:12px;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:move;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Distance label for measurements
const measureLabel = (distance, color = "#f59e0b") => L.divIcon({
  className: "measure-label",
  html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:10px;padding:2px 8px;font:700 11px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4);">${Math.round(distance)} ft</div>`,
  iconSize: [60, 20],
  iconAnchor: [30, 10],
});

/**
 * MapAnnotations component - handles rendering and editing of map annotations
 */
export const MapAnnotations = ({
  annotations = [],
  editMode = false,
  addingType = null, // "note" or "measurement"
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  showAllNotes = false, // pin every note's text open beside its marker
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [measureStart, setMeasureStart] = useState(null);

  // Handle map clicks when adding annotations
  useMapEvents({
    click: (e) => {
      if (!editMode || !addingType) return;
      
      const { lat, lng } = e.latlng;
      
      if (addingType === "note") {
        onAnnotationAdd?.({
          type: "note",
          latitude: lat,
          longitude: lng,
          text: "New note",
        });
      } else if (addingType === "measurement") {
        if (!measureStart) {
          setMeasureStart([lat, lng]);
        } else {
          onAnnotationAdd?.({
            type: "measurement",
            latitude: measureStart[0],
            longitude: measureStart[1],
            end_latitude: lat,
            end_longitude: lng,
            text: "",
          });
          setMeasureStart(null);
        }
      }
    },
  });

  // Handle note text edit
  const handleSaveNote = useCallback((annotation) => {
    onAnnotationUpdate?.(annotation.id, { text: editText });
    setEditingId(null);
    setEditText("");
  }, [editText, onAnnotationUpdate]);

  // Handle marker drag
  const handleDragEnd = useCallback((annotation, e, isEndPoint = false) => {
    const { lat, lng } = e.target.getLatLng();
    if (isEndPoint) {
      onAnnotationUpdate?.(annotation.id, { end_latitude: lat, end_longitude: lng });
    } else {
      onAnnotationUpdate?.(annotation.id, { latitude: lat, longitude: lng });
    }
  }, [onAnnotationUpdate]);

  return (
    <>
      {/* Temporary measurement line while adding */}
      {measureStart && (
        <Marker
          position={measureStart}
          icon={measureEndIcon("#22c55e")}
          interactive={false}
        />
      )}

      {/* Render all annotations */}
      {annotations.map((ann) => {
        if (ann.type === "note") {
          return (
            <Marker
              key={ann.id}
              position={[ann.latitude, ann.longitude]}
              icon={noteIcon(ann.color)}
              draggable={editMode}
              eventHandlers={{
                dragend: (e) => handleDragEnd(ann, e),
              }}
            >
              {showAllNotes && (
                <Tooltip permanent direction="right" offset={[12, 0]} className="map-note-tooltip" interactive={false}>
                  <span data-testid={`note-pinned-${ann.id}`}>{ann.text || "No text"}</span>
                </Tooltip>
              )}
              <Popup>
                <div className="min-w-[150px]">
                  {editingId === ann.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Enter note..."
                        className="text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveNote(ann)} className="flex-1 h-7 text-xs">Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="flex-1 h-7 text-xs">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-zinc-900 mb-2">{ann.text || "No text"}</p>
                      {editMode && (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => { setEditingId(ann.id); setEditText(ann.text || ""); }}
                            className="flex-1 h-7 text-xs"
                          >
                            Edit
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => onAnnotationDelete?.(ann.id)}
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        } else if (ann.type === "measurement" && ann.end_latitude && ann.end_longitude) {
          const startPos = [ann.latitude, ann.longitude];
          const endPos = [ann.end_latitude, ann.end_longitude];
          const midPos = [(startPos[0] + endPos[0]) / 2, (startPos[1] + endPos[1]) / 2];
          const distance = ann.distance_ft || distanceFeet(startPos, endPos);
          
          return (
            <div key={ann.id}>
              {/* Measurement line */}
              <Polyline
                positions={[startPos, endPos]}
                pathOptions={{
                  color: ann.color || "#f59e0b",
                  weight: 3,
                  dashArray: "6, 6",
                }}
              />
              {/* Start point */}
              <Marker
                position={startPos}
                icon={measureEndIcon(ann.color)}
                draggable={editMode}
                eventHandlers={{
                  dragend: (e) => handleDragEnd(ann, e, false),
                }}
              />
              {/* End point */}
              <Marker
                position={endPos}
                icon={measureEndIcon(ann.color)}
                draggable={editMode}
                eventHandlers={{
                  dragend: (e) => handleDragEnd(ann, e, true),
                }}
              />
              {/* Distance label */}
              <Marker
                position={midPos}
                icon={measureLabel(distance, ann.color)}
                interactive={editMode}
              >
                {editMode && (
                  <Popup>
                    <div className="min-w-[100px]">
                      <p className="text-sm font-mono font-bold text-zinc-900 mb-2">{Math.round(distance)} ft</p>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => onAnnotationDelete?.(ann.id)}
                        className="w-full h-7 text-xs"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </Popup>
                )}
              </Marker>
            </div>
          );
        }
        return null;
      })}
    </>
  );
};

export default MapAnnotations;
