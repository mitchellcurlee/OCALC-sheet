import { useEffect, useRef, useState, useCallback } from "react";
import { useMap, Polyline, Marker, CircleMarker, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Waypoint marker (draggable dot on the line)
const waypointIcon = L.divIcon({
  className: "route-waypoint",
  html: `<div style="background:#2563eb;border:2px solid #fff;border-radius:50%;width:10px;height:10px;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:move;"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Midpoint marker (click to add waypoint)
const midpointIcon = L.divIcon({
  className: "route-midpoint",
  html: `<div style="background:#93c5fd;border:2px solid #2563eb;border-radius:50%;width:8px;height:8px;opacity:0.7;cursor:pointer;"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

// Calculate midpoint between two coordinates
const getMidpoint = (p1, p2) => [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

// Calculate bearing/angle between two points (in degrees)
const getBearing = (p1, p2) => {
  const dLng = (p2[1] - p1[1]) * Math.PI / 180;
  const lat1 = p1[0] * Math.PI / 180;
  const lat2 = p2[0] * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// Get offset position perpendicular to the line for smart label placement
const getOffsetMidpoint = (p1, p2, offsetPixels = 20) => {
  const mid = getMidpoint(p1, p2);
  const bearing = getBearing(p1, p2);
  // Offset perpendicular to the line (90 degrees)
  const perpAngle = (bearing + 90) * Math.PI / 180;
  // Convert pixel offset to approximate lat/lng offset
  const latOffset = Math.cos(perpAngle) * offsetPixels * 0.000008;
  const lngOffset = Math.sin(perpAngle) * offsetPixels * 0.00001;
  return [mid[0] + latOffset, mid[1] + lngOffset];
};

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

/**
 * EditableRoute component - renders an editable polyline segment
 * 
 * Props:
 * - startPos: [lat, lng] starting position
 * - endPos: [lat, lng] ending position  
 * - waypoints: array of {lat, lng} intermediate points
 * - segmentId: unique identifier for this segment
 * - onWaypointsChange: callback when waypoints are modified
 * - editMode: boolean - whether editing is enabled
 * - color: line color
 */
export const EditableRoute = ({ 
  startPos, 
  endPos, 
  waypoints = [], 
  segmentId,
  onWaypointsChange,
  editMode = false,
  color = "#2563eb",
  weight = 4,
  showDistance = true,
  isAfterMPOE = false
}) => {
  const [localWaypoints, setLocalWaypoints] = useState(waypoints);
  const [isDragging, setIsDragging] = useState(false);
  
  // Update local state when props change
  useEffect(() => {
    setLocalWaypoints(waypoints);
  }, [waypoints]);

  // Build full path including start, waypoints, and end
  const fullPath = [
    startPos,
    ...localWaypoints.map(wp => [wp.lat, wp.lng]),
    endPos
  ];

  // Calculate total distance
  const totalDistance = fullPath.reduce((sum, point, i) => {
    if (i === 0) return 0;
    return sum + distanceFeet(fullPath[i - 1], point);
  }, 0);

  // Handle waypoint drag
  const handleWaypointDrag = useCallback((index, newPos) => {
    const updated = [...localWaypoints];
    updated[index] = { lat: newPos.lat, lng: newPos.lng };
    setLocalWaypoints(updated);
  }, [localWaypoints]);

  // Handle waypoint drag end - save to parent
  const handleWaypointDragEnd = useCallback((index, newPos) => {
    const updated = [...localWaypoints];
    updated[index] = { lat: newPos.lat, lng: newPos.lng };
    setLocalWaypoints(updated);
    setIsDragging(false);
    if (onWaypointsChange) {
      onWaypointsChange(segmentId, updated);
    }
  }, [localWaypoints, onWaypointsChange, segmentId]);

  // Handle adding a new waypoint at midpoint
  const handleAddWaypoint = useCallback((afterIndex, position) => {
    const updated = [...localWaypoints];
    // afterIndex is the index in fullPath, so we need to adjust for waypoints array
    // fullPath[0] = start, fullPath[1...n] = waypoints, fullPath[n+1] = end
    const waypointIndex = afterIndex; // Insert after this position in waypoints
    updated.splice(waypointIndex, 0, { lat: position[0], lng: position[1] });
    setLocalWaypoints(updated);
    if (onWaypointsChange) {
      onWaypointsChange(segmentId, updated);
    }
  }, [localWaypoints, onWaypointsChange, segmentId]);

  // Handle removing a waypoint (double-click)
  const handleRemoveWaypoint = useCallback((index) => {
    const updated = localWaypoints.filter((_, i) => i !== index);
    setLocalWaypoints(updated);
    if (onWaypointsChange) {
      onWaypointsChange(segmentId, updated);
    }
  }, [localWaypoints, onWaypointsChange, segmentId]);

  // Calculate midpoint label position - offset from line to avoid pole markers
  const midpoint = getMidpoint(startPos, endPos);
  const midpointWithWaypoints = localWaypoints.length > 0 
    ? getMidpoint(fullPath[Math.floor(fullPath.length / 2)], fullPath[Math.floor(fullPath.length / 2) + 1] || fullPath[Math.floor(fullPath.length / 2)])
    : midpoint;
  
  // Use offset midpoint to avoid overlapping with pole markers
  const labelPosition = getOffsetMidpoint(
    localWaypoints.length > 0 ? fullPath[Math.floor(fullPath.length / 2)] : startPos,
    localWaypoints.length > 0 ? (fullPath[Math.floor(fullPath.length / 2) + 1] || fullPath[Math.floor(fullPath.length / 2)]) : endPos,
    25 // offset in pixels - increased to make arrow more visible
  );
  
  // Calculate direction from label to the actual line midpoint for the orange arrow
  const actualMidpoint = localWaypoints.length > 0 
    ? fullPath[Math.floor(fullPath.length / 2)]
    : midpoint;

  return (
    <>
      {/* Main polyline */}
      <Polyline
        positions={fullPath}
        pathOptions={{
          color: editMode ? "#1d4ed8" : color,
          weight: editMode ? weight + 1 : weight,
          opacity: 0.9,
          dashArray: editMode ? "8, 4" : null,
        }}
      />

      {/* Distance label - positioned offset from line */}
      {showDistance && totalDistance > 0 && (
        <>
          {/* Orange dotted arrow line from label to the actual line */}
          <Polyline
            positions={[labelPosition, actualMidpoint]}
            pathOptions={{
              color: "#f97316",
              weight: 2,
              dashArray: "4, 3",
              opacity: 0.9,
            }}
          />
          {/* Orange dot at the end of the arrow (on the line) */}
          <CircleMarker
            center={actualMidpoint}
            radius={4}
            pathOptions={{
              color: "#f97316",
              fillColor: "#f97316",
              fillOpacity: 1,
              weight: 0,
            }}
          />
          {/* Distance label pill */}
          <Marker
            position={labelPosition}
            icon={L.divIcon({
              className: "distance-label",
              html: `<div style="background:rgba(255,255,255,0.95);border:2px solid ${isAfterMPOE ? '#dc2626' : color};border-radius:12px;padding:3px 10px;font:700 12px/1.2 ui-monospace,monospace;color:${isAfterMPOE ? '#991b1b' : '#1e40af'};white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.25);pointer-events:none;">${Math.round(totalDistance)} ft</div>`,
              iconSize: [70, 24],
              iconAnchor: [35, 12],
            })}
            interactive={false}
            zIndexOffset={800}
          />
        </>
      )}

      {/* Edit mode: show waypoints and midpoints */}
      {editMode && (
        <>
          {/* Existing waypoints (draggable) */}
          {localWaypoints.map((wp, index) => (
            <Marker
              key={`wp-${segmentId}-${index}`}
              position={[wp.lat, wp.lng]}
              icon={waypointIcon}
              draggable={true}
              eventHandlers={{
                dragstart: () => setIsDragging(true),
                drag: (e) => handleWaypointDrag(index, e.target.getLatLng()),
                dragend: (e) => handleWaypointDragEnd(index, e.target.getLatLng()),
                dblclick: () => handleRemoveWaypoint(index),
              }}
              zIndexOffset={1000}
            />
          ))}

          {/* Midpoints (click to add waypoint) */}
          {fullPath.slice(0, -1).map((point, index) => {
            const nextPoint = fullPath[index + 1];
            const mid = getMidpoint(point, nextPoint);
            return (
              <Marker
                key={`mid-${segmentId}-${index}`}
                position={mid}
                icon={midpointIcon}
                eventHandlers={{
                  click: () => handleAddWaypoint(index, mid),
                }}
                zIndexOffset={900}
              />
            );
          })}
        </>
      )}
    </>
  );
};

export default EditableRoute;
