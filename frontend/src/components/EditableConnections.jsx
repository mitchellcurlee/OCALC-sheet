import React, { useState, useCallback, useMemo } from "react";
import { Polyline, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";

/**
 * EditableConnections - Allows users to drag line endpoints to different items
 * 
 * Props:
 * - connections: Array of connection objects
 * - items: Array of all connectable items (poles + underground) with {id, pos, type, label}
 * - onConnectionUpdate: Callback when a connection endpoint is moved
 * - onConnectionDelete: Callback when a connection is deleted
 * - editMode: Boolean - whether editing is enabled
 * - showStationNumbers: Boolean - show station labels
 * - stationNumbers: Object mapping item IDs to station strings
 */
const EditableConnections = ({
  connections,
  items,
  onConnectionUpdate,
  onConnectionDelete,
  editMode,
  connectionColors = { aerial: "#ef4444", underground: "#22c55e", custom: "#8b5cf6" }
}) => {
  const [draggingEndpoint, setDraggingEndpoint] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [hoveredItem, setHoveredItem] = useState(null);

  // Create a map of item IDs to their positions
  const itemPositions = useMemo(() => {
    const map = {};
    items.forEach(item => {
      map[item.id] = { pos: item.pos, type: item.type, label: item.label || item.id };
    });
    return map;
  }, [items]);

  // Handle map events for dragging
  useMapEvents({
    mousemove: (e) => {
      if (draggingEndpoint) {
        setDragPosition([e.latlng.lat, e.latlng.lng]);
        
        // Check if hovering over any item
        const nearestItem = findNearestItem(e.latlng, items, 50); // 50 pixel threshold
        setHoveredItem(nearestItem);
      }
    },
    mouseup: () => {
      if (draggingEndpoint && hoveredItem) {
        // Update the connection
        onConnectionUpdate(draggingEndpoint.connectionId, {
          [`${draggingEndpoint.endpoint}_item_id`]: hoveredItem.id,
          [`${draggingEndpoint.endpoint}_item_type`]: hoveredItem.type
        });
      }
      setDraggingEndpoint(null);
      setDragPosition(null);
      setHoveredItem(null);
    }
  });

  // Find nearest item to a latlng point (within pixel threshold)
  const findNearestItem = (latlng, items, pixelThreshold) => {
    // This is a simplified version - in practice you'd convert to pixels
    let nearest = null;
    let minDist = Infinity;
    
    items.forEach(item => {
      const dist = Math.sqrt(
        Math.pow(latlng.lat - item.pos[0], 2) + 
        Math.pow(latlng.lng - item.pos[1], 2)
      );
      // Approximate threshold in degrees (very rough)
      if (dist < 0.0005 && dist < minDist) {
        minDist = dist;
        nearest = item;
      }
    });
    
    return nearest;
  };

  // Endpoint handle icon
  const endpointIcon = (isActive) => L.divIcon({
    className: "connection-endpoint",
    html: `<div style="
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: ${isActive ? '#8b5cf6' : '#3b82f6'};
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      cursor: ${editMode ? 'grab' : 'default'};
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  // Snap indicator icon
  const snapIcon = L.divIcon({
    className: "snap-indicator",
    html: `<div style="
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(139, 92, 246, 0.3);
      border: 3px solid #8b5cf6;
      animation: pulse 0.5s ease-in-out infinite alternate;
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  return (
    <>
      {connections.map(conn => {
        const fromPos = itemPositions[conn.from_item_id]?.pos;
        const toPos = itemPositions[conn.to_item_id]?.pos;
        
        if (!fromPos || !toPos) return null;
        
        // If this endpoint is being dragged, use drag position
        const displayFromPos = draggingEndpoint?.connectionId === conn.id && draggingEndpoint?.endpoint === 'from' 
          ? dragPosition || fromPos 
          : fromPos;
        const displayToPos = draggingEndpoint?.connectionId === conn.id && draggingEndpoint?.endpoint === 'to'
          ? dragPosition || toPos
          : toPos;
        
        const color = connectionColors[conn.connection_type] || connectionColors.custom;
        const isDragging = draggingEndpoint?.connectionId === conn.id;
        
        return (
          <React.Fragment key={conn.id}>
            {/* The connection line */}
            <Polyline
              positions={[displayFromPos, displayToPos]}
              pathOptions={{
                color: isDragging ? '#8b5cf6' : color,
                weight: isDragging ? 4 : 3,
                opacity: isDragging ? 0.8 : 0.7,
                dashArray: conn.connection_type === 'custom' ? '5, 5' : undefined
              }}
            />
            
            {/* Draggable endpoint handles (only in edit mode) */}
            {editMode && (
              <>
                {/* From endpoint */}
                <Marker
                  position={displayFromPos}
                  icon={endpointIcon(isDragging && draggingEndpoint?.endpoint === 'from')}
                  draggable={true}
                  eventHandlers={{
                    dragstart: () => {
                      setDraggingEndpoint({ connectionId: conn.id, endpoint: 'from' });
                    },
                    drag: (e) => {
                      setDragPosition([e.target.getLatLng().lat, e.target.getLatLng().lng]);
                      const nearest = findNearestItem(e.target.getLatLng(), items, 50);
                      setHoveredItem(nearest);
                    },
                    dragend: (e) => {
                      if (hoveredItem && hoveredItem.id !== conn.from_item_id) {
                        onConnectionUpdate(conn.id, {
                          from_item_id: hoveredItem.id,
                          from_item_type: hoveredItem.type
                        });
                      }
                      setDraggingEndpoint(null);
                      setDragPosition(null);
                      setHoveredItem(null);
                    }
                  }}
                />
                
                {/* To endpoint */}
                <Marker
                  position={displayToPos}
                  icon={endpointIcon(isDragging && draggingEndpoint?.endpoint === 'to')}
                  draggable={true}
                  eventHandlers={{
                    dragstart: () => {
                      setDraggingEndpoint({ connectionId: conn.id, endpoint: 'to' });
                    },
                    drag: (e) => {
                      setDragPosition([e.target.getLatLng().lat, e.target.getLatLng().lng]);
                      const nearest = findNearestItem(e.target.getLatLng(), items, 50);
                      setHoveredItem(nearest);
                    },
                    dragend: (e) => {
                      if (hoveredItem && hoveredItem.id !== conn.to_item_id) {
                        onConnectionUpdate(conn.id, {
                          to_item_id: hoveredItem.id,
                          to_item_type: hoveredItem.type
                        });
                      }
                      setDraggingEndpoint(null);
                      setDragPosition(null);
                      setHoveredItem(null);
                    }
                  }}
                />
              </>
            )}
          </React.Fragment>
        );
      })}
      
      {/* Snap indicator when hovering over an item */}
      {hoveredItem && draggingEndpoint && (
        <Marker
          position={hoveredItem.pos}
          icon={snapIcon}
          interactive={false}
        />
      )}
      
      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          from { transform: scale(1); opacity: 1; }
          to { transform: scale(1.3); opacity: 0.7; }
        }
      `}</style>
    </>
  );
};

export default EditableConnections;
