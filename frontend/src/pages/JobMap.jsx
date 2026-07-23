import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import domtoimage from "dom-to-image-more";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Zap, AlertTriangle, Crosshair, ChevronDown, FileImage, Files, Edit3, Save, X, StickyNote, Ruler, Camera, Hash, Link2, Move, Palette } from "lucide-react";
import { computeRoute, fmtFeet, feetToStation, markerLabel, downloadPoleMapImage, downloadSegmentedMapPages, ugWithGps, undergroundAbbr, computeUgConnectors, computeConnectionPairs } from "@/lib/poleMapImage";
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
import EditableRoute from "@/components/EditableRoute";
import MapAnnotations from "@/components/MapAnnotations";

// Path color options
const PATH_COLORS = {
  blue: { name: "Blue", hex: "#2563eb" },
  green: { name: "Green", hex: "#16a34a" },
  orange: { name: "Orange", hex: "#ea580c" },
  purple: { name: "Purple", hex: "#9333ea" },
  yellow: { name: "Yellow", hex: "#ca8a04" },
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
const poleIcon = (label, offsetDir = "right") => {
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
        <div style="background:#dc2626;border:1.5px solid #fff;border-radius:50%;width:${dotSize}px;height:${dotSize}px;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>
        <div style="position:absolute;${labelOffset}top:50%;transform:translateY(-50%);background:#dc2626;color:#fff;border:1px solid #fff;border-radius:5px;padding:2px 5px;font:600 9px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3);">${label}</div>
      </div>
    `,
    iconSize: [dotSize, dotSize],
    iconAnchor: [dotSize / 2, dotSize / 2],
  });
};

// Pole marker with arrow pointing to the dot (for clustered poles)
const poleIconWithArrow = (label, arrowAngle, distance = 45) => {
  const dotSize = 8; // Smaller dot
  const rad = (arrowAngle * Math.PI) / 180;
  const labelX = Math.cos(rad) * distance;
  const labelY = Math.sin(rad) * distance;
  
  return L.divIcon({
    className: "pole-route-marker-arrow",
    html: `
      <div style="position:relative;">
        <div style="background:#dc2626;border:1.5px solid #fff;border-radius:50%;width:${dotSize}px;height:${dotSize}px;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>
        <svg style="position:absolute;left:${dotSize/2}px;top:${dotSize/2}px;overflow:visible;pointer-events:none;" width="1" height="1">
          <line x1="0" y1="0" x2="${labelX}" y2="${labelY}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3,2"/>
        </svg>
        <div style="position:absolute;left:${labelX + dotSize/2 - 20}px;top:${labelY + dotSize/2 - 10}px;background:#dc2626;color:#fff;border:1px solid #fff;border-radius:5px;padding:2px 5px;font:600 9px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3);">${label}</div>
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
const AERIAL_ATTR_TYPES = new Set(["Loop", "Aerial Splice"]);

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
const DraggableMarker = ({ position, icon, children, draggable, onDragEnd, onDoubleClick, zIndexOffset = 0 }) => {
  const markerRef = useRef(null);
  
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
  const [showStationNumbers, setShowStationNumbers] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [connectionEditMode, setConnectionEditMode] = useState(false);
  const [selectedConn, setSelectedConn] = useState(null);
  const [reconnectSide, setReconnectSide] = useState(null);
  const [addingConn, setAddingConn] = useState(null);
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
      const stations = Math.floor(feet / 100);
      const remainder = Math.round(feet % 100);
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
    
    // Add underground items
    ug.forEach(item => {
      allItems.push({
        id: item.id,
        type: 'underground',
        pos: item.pos,
        sortOrder: item.sort_order ?? Infinity
      });
    });
    
    // Add poles
    route.forEach(pole => {
      allItems.push({
        id: pole.id,
        type: 'pole',
        pos: pole.pos,
        sortOrder: pole.sort_order ?? Infinity
      });
    });
    
    // Sort by sort_order
    allItems.sort((a, b) => a.sortOrder - b.sortOrder);
    
    // Calculate cumulative station numbers
    const stations = {};
    let runningDistance = 0;
    let prevItem = null;
    
    allItems.forEach(item => {
      if (prevItem) {
        const dist = distanceFeet(prevItem.pos, item.pos);
        runningDistance += dist;
      }
      stations[item.id] = toStation(runningDistance);
      prevItem = item;
    });
    
    return stations;
  }, [route, ug]);

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

  // Save all route edits to the backend
  const saveRouteEdits = useCallback(async () => {
    setSaving(true);
    try {
      // Build route segments to save
      const routesToSave = [];
      for (let i = 0; i < route.length - 1; i++) {
        const fromPole = route[i];
        const toPole = route[i + 1];
        const key = `${fromPole.id}-${toPole.id}`;
        const waypoints = customRoutes[key] || [];
        
        routesToSave.push({
          job_id: jobId,
          from_pole_id: fromPole.id,
          to_pole_id: toPole.id,
          waypoints: waypoints
        });
      }
      
      await axios.post(`/jobs/${jobId}/routes/bulk`, routesToSave);
      toast.success("Route edits saved");
      setEditMode(false);
    } catch (e) {
      toast.error("Failed to save route edits");
    } finally {
      setSaving(false);
    }
  }, [route, customRoutes, jobId]);

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
  const initializeConnections = useCallback(async () => {
    // Only initialize if no custom connections exist
    if (connections.length > 0) return;
    
    // Combine all items (poles + underground) with their sort_order
    const allItems = [];
    
    // Add poles with sort_order
    route.forEach(p => {
      allItems.push({
        id: p.id,
        type: "pole",
        sort_order: p.sort_order ?? Infinity,
        pos: p.pos,
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
    
    if (defaultConnections.length > 0) {
      try {
        const response = await axios.post(`/jobs/${jobId}/connections/bulk`, defaultConnections);
        setConnections(response.data);
      } catch (e) {
        console.error("Failed to initialize connections:", e);
      }
    }
  }, [jobId, route, ug, connections.length]);

  // Update a connection endpoint
  const handleConnectionUpdate = useCallback(async (connectionId, updates) => {
    try {
      const response = await axios.put(`/jobs/${jobId}/connections/${connectionId}`, updates);
      setConnections(prev => prev.map(c => c.id === connectionId ? response.data : c));
      toast.success("Connection updated");
    } catch (e) {
      toast.error("Failed to update connection");
    }
  }, [jobId]);

  // Delete a connection
  const handleConnectionDelete = useCallback(async (connectionId) => {
    try {
      await axios.delete(`/jobs/${jobId}/connections/${connectionId}`);
      setConnections(prev => prev.filter(c => c.id !== connectionId));
      toast.success("Connection deleted");
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
    // Delete all and reinitialize
    try {
      await axios.post(`/jobs/${jobId}/connections/bulk`, []);
      setConnections([]);
      // Let next render trigger initialization
      setTimeout(() => {
        initializeConnections();
      }, 100);
    } catch (e) {
      toast.error("Failed to reset connections");
    }
  }, [jobId, initializeConnections]);

  // All connectable items for the connection editor (sorted by sort_order)
  const allConnectableItems = useMemo(() => {
    const items = [];
    route.forEach(p => {
      items.push({
        id: p.id,
        pos: p.pos,
        type: "pole",
        label: p.pole_number || `Pole`,
        sort_order: p.sort_order ?? Infinity,
        end_path: p.end_path === true
      });
    });
    ug.forEach(u => {
      items.push({
        id: u.id,
        pos: u.pos,
        type: "underground",
        label: u.label || u.type,
        sort_order: u.sort_order ?? Infinity,
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
    pairs.forEach(({ from: fromItem, to: toItem }) => {
      // Calculate distance
      const latDiff = (toItem.pos[0] - fromItem.pos[0]) * 364000;
      const lngDiff = (toItem.pos[1] - fromItem.pos[1]) * 288200;
      const distFt = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      
      // Calculate midpoint
      const mid = [
        (fromItem.pos[0] + toItem.pos[0]) / 2,
        (fromItem.pos[1] + toItem.pos[1]) / 2
      ];
      
      // Determine segment type and styling (Loop / Aerial Splice are aerial attributes)
      const aerialItem = (it) => it.type === "pole" || AERIAL_ATTR_TYPES.has(it.ugType);
      const isAerial = aerialItem(fromItem) && aerialItem(toItem);
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
        segmentType: isAerial ? "aerial" : "underground"
      });
    });
    
    return segments;
  }, [route, ug, connections]);

  // Total underground footage (segments that touch an underground item, per combined order)
  const ugFeet = useMemo(
    () => orderedSegments.reduce((sum, s) => sum + (s.segmentType === "underground" ? s.distFt : 0), 0),
    [orderedSegments]
  );

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
    if (!seg.isAerial) return seg.distFt;
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
        entries.push({ kind: "riser", num: entries.length + 1, pos, text: `${poleName(item.label)} Riser${r.c > 1 ? ` ×${r.c}` : ""} = ${fmtFeet(r.c * r.h)}` });
      }
    };
    const pathText = (u) => {
      const t = u.path_measurements.reduce((s, m) => s + (parseFloat(m.feet) || 0), 0);
      return `${undergroundAbbr(u.type)}${u.label ? ` ${u.label}` : ""}: ${u.path_measurements.map((m) => `${m.direction} ${m.feet}ft`).join(", ")} = ${fmtFeet(t)}`;
    };
    const pushPath = (item, pos) => {
      if (item.type === "pole" || pathAdded.has(item.id)) return;
      const u = underground.find((x) => x.id === item.id);
      if (!u || !(u.path_measurements || []).length) return;
      pathAdded.add(item.id);
      entries.push({ kind: "path", num: entries.length + 1, pos, text: pathText(u) });
    };
    orderedSegments.forEach((seg, i) => {
      pushRiser(seg.from, seg.fromPos);
      pushPath(seg.from, seg.fromPos);
      const num = entries.length + 1;
      nums[i] = num;
      entries.push({ kind: "span", num, seg });
    });
    if (orderedSegments.length > 0) {
      const last = orderedSegments[orderedSegments.length - 1];
      pushRiser(last.to, last.toPos);
      pushPath(last.to, last.toPos);
    }
    // Items with path measurements not on the route chain (e.g. no GPS) — append at end
    [...underground]
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
      .filter((u) => (u.path_measurements || []).length > 0 && !pathAdded.has(u.id))
      .forEach((u) => {
        pathAdded.add(u.id);
        entries.push({ kind: "path", num: entries.length + 1, pos: null, text: pathText(u) });
      });
    return { measurementEntries: entries, spanNums: nums };
  }, [orderedSegments, route, underground]);

  // Total aerial footage from ordered segments (includes Loop spans + waypoint routes)
  const aerialFeetTotal = useMemo(
    () => orderedSegments.reduce((sum, seg) => sum + (seg.segmentType === "aerial" ? segListDistance(seg) : 0), 0),
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
      await downloadPoleMapImage({ poles, job, showStops: false, underground, connections });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, underground, connections]);

  const downloadSegmented = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadSegmentedMapPages({ poles, job, showStops: false, underground, connections, targetFeet: 800 });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, underground, connections]);

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
                {route.length} pole(s){ug.length ? ` · ${ug.length} underground` : ""} · {fmtFeet(aerialFeetTotal)} aerial{ugFeet > 0 ? ` + ${fmtFeet(ugFeet)} underground` : ""}{totalRiserFeet > 0 ? ` + ${fmtFeet(totalRiserFeet)} risers` : ""}{pathFeet > 0 ? ` + ${fmtFeet(pathFeet)} path` : ""} = {fmtFeet(aerialFeetTotal + totalRiserFeet + ugFeet + pathFeet)} total
                {usingManualSpans && <span className="ml-2 text-indigo-600">(Manual)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={recenter} disabled={allPoints.length === 0} variant="outline" className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="recenter-btn">
              <Crosshair className="w-4 h-4 mr-2" />
              Fit all
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
              onClick={downloadImage}
              disabled={downloading || allPoints.length === 0} 
              className="bg-red-600 hover:bg-red-700 text-white" 
              data-testid="download-map-btn"
            >
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Download
            </Button>
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
                  <DropdownMenuContent align="end" className="w-56 bg-white">
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
                      onClick={downloadSegmented}
                      className="cursor-pointer border-t border-zinc-200"
                      data-testid="download-segmented"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download 800ft Pages (ZIP)
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
                    : "• Tap a connection line, then use the panel to move / delete / add lines • Click line to change its color"}
                </div>
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
                          const fromLabel = seg.from.pole_number || seg.from.type || 'P' + (i+1);
                          const toLabel = seg.to.pole_number || seg.to.type || 'P' + (i+2);
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
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} />
              <FitBounds points={allPoints} disabled={editMode} />
              <MapRefSetter mapRef={mapRef} />
              
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
                      {!showStationNumbers && (
                        <Marker position={badgePos} icon={numberBadgeIcon(spanNums[i] ?? i + 1)} interactive={false} zIndexOffset={800} />
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
                
                // For segments involving underground items, use dashed Polyline
                return (
                  <React.Fragment key={segmentKey}>
                    {/* Selection highlight */}
                    {isSelected && (
                      <Polyline
                        positions={[seg.fromPos, seg.toPos]}
                        pathOptions={{ color: "#fff", weight: 7, opacity: 0.5 }}
                      />
                    )}
                    {/* Invisible wider polyline for easier clicking */}
                    {editMode && (
                      <Polyline 
                        positions={[seg.fromPos, seg.toPos]} 
                        pathOptions={{ 
                          color: "transparent", 
                          weight: 25, 
                          opacity: 0,
                          bubblingMouseEvents: false
                        }}
                        eventHandlers={{
                          click: (e) => {
                            e.originalEvent.stopPropagation();
                            handleSegmentClick(segmentKey);
                          }
                        }}
                      />
                    )}
                    <Polyline 
                      positions={[seg.fromPos, seg.toPos]} 
                      pathOptions={{ 
                        color: segmentColor, 
                        weight: isSelected ? 4 : 2.5, 
                        dashArray: "6,4",
                        bubblingMouseEvents: false
                      }}
                      eventHandlers={{
                        click: (e) => {
                          e.originalEvent.stopPropagation();
                          handleSegmentClick(segmentKey);
                        }
                      }}
                    />
                    {/* Numbered badge — measurement is in the list below the map */}
                    {!showStationNumbers && (
                      <Marker position={seg.mid} icon={numberBadgeIcon(spanNums[i] ?? i + 1)} interactive={false} zIndexOffset={800} />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Riser number badges at their pole */}
              {!showStationNumbers && measurementEntries.filter((e) => e.kind === "riser" && e.pos).map((e) => (
                <Marker key={`riser-num-${e.num}`} position={e.pos} icon={numberBadgeIcon(e.num, "#7c3aed", [-6, 32])} interactive={false} zIndexOffset={800} />
              ))}

              {/* Path measurement number badges at their item */}
              {!showStationNumbers && measurementEntries.filter((e) => e.kind === "path" && e.pos).map((e) => (
                <Marker key={`path-num-${e.num}`} position={e.pos} icon={numberBadgeIcon(e.num, "#059669", [34, -8])} interactive={false} zIndexOffset={800} />
              ))}
              
              {poleDisplayInfo.map((p, i) => {
                const poleLabel = markerLabel(p, i, false);
                // Show station number if enabled
                const stationLabel = showStationNumbers && stationNumbers[p.id] ? stationNumbers[p.id] : null;
                // Hide pole number label when station numbers are active
                const displayLabel = showStationNumbers ? "" : poleLabel;
                const icon = p.isCluster 
                  ? poleIconWithArrow(displayLabel, p.labelAngle, 45)
                  : poleIcon(displayLabel, p.labelDir);
                return (
                  <React.Fragment key={p.id}>
                    <DraggableMarker 
                      position={p.pos} 
                      icon={icon}
                      draggable={positionEditMode}
                      onDragEnd={(lat, lng) => handlePoleDragEnd(p.id, lat, lng)}
                      zIndexOffset={positionEditMode ? 1500 : 0}
                    >
                      <Popup>
                        <div className="min-w-[180px] font-mono" data-testid={`pole-popup-${p.id}`}>
                          <div className="text-base font-bold text-zinc-900">{p.pole_number || "(unnumbered)"}</div>
                          {stationLabel && <div className="text-xs text-indigo-600 font-bold">Station: {stationLabel}</div>}
                          <div className="mt-1 text-xs text-zinc-600 space-y-0.5">
                            <div><span className="text-zinc-400">Size:</span> {p.pole_size ? `${p.pole_size}'` : "—"}</div>
                            <div><span className="text-zinc-400">Class:</span> {p.pole_class || "—"}</div>
                            <div><span className="text-zinc-400">Condition:</span> {p.condition || "—"}</div>
                            {p.risers && <div><span className="text-zinc-400">Risers:</span> {p.risers}{p.riser_height ? ` @ ${formatRiserHeight(p.riser_height)}` : ""}</div>}
                          </div>
                          {!positionEditMode && (
                            <div className="mt-2 flex gap-2">
                              <Link to={`/jobs/${jobId}/view/${p.id}`} className="flex-1">
                                <Button size="sm" className="w-full h-8 bg-red-600 hover:bg-red-700 text-white" data-testid={`popup-view-${p.id}`}>Open</Button>
                              </Link>
                              <Link to={`/jobs/${jobId}/edit/${p.id}`} className="flex-1">
                                <Button size="sm" variant="outline" className="w-full h-8 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid={`popup-edit-${p.id}`}>Edit</Button>
                              </Link>
                            </div>
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
                const itemColor = AERIAL_ATTR_TYPES.has(u.type) ? "#2563eb" : undergroundColorHex;
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
                  >
                    <Popup>
                      <div className="min-w-[170px] font-mono" data-testid={`ug-popup-${u.id}`}>
                        <div className="text-sm font-bold" style={{ color: isRed ? '#dc2626' : itemColor }}>{undergroundAbbr(u.type)} · {u.type}</div>
                        {stationLabel && <div className="text-xs text-indigo-600 font-bold">Station: {stationLabel}</div>}
                        {u.label && <div className="text-xs text-zinc-600 mt-1">{u.label}</div>}
                        {u.notes && <div className="text-xs text-zinc-500 mt-1">{u.notes}</div>}
                        {!positionEditMode && (
                          <Link to={`/jobs/${jobId}/underground/edit/${u.id}`}>
                            <Button size="sm" className="w-full h-8 mt-2 text-white" style={{ backgroundColor: isRed ? '#dc2626' : itemColor }} data-testid={`ug-edit-${u.id}`}>Edit</Button>
                          </Link>
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
              {/* END badges for End Path items */}
              {[...route, ...ug].filter((it) => it.end_path === true).map((it) => (
                <Marker
                  key={`end-badge-${it.id}`}
                  position={it.pos}
                  interactive={false}
                  zIndexOffset={950}
                  icon={L.divIcon({
                    className: "end-path-badge",
                    html: `<div style="background:#dc2626;color:#fff;font:700 9px ui-monospace,monospace;padding:2px 6px;border-radius:3px;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.45);letter-spacing:0.5px;display:inline-block;white-space:nowrap;">END</div>`,
                    iconSize: [34, 16],
                    iconAnchor: [-10, 26]
                  })}
                />
              ))}
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
                    // Hide auto connections broken by an End Path toggle
                    const earlierItem = fromItem.sort_order <= toItem.sort_order ? fromItem : toItem;
                    if (conn.connection_type !== 'custom' && earlierItem.end_path) return null;
                    
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
            {/* Connection tap-to-reconnect panel */}
            {connectionEditMode && (() => {
              const conn = connections.find((c) => c.id === selectedConn);
              const connLabel = conn
                ? `${allConnectableItems.find((i) => i.id === conn.from_item_id)?.label || "?"} → ${allConnectableItems.find((i) => i.id === conn.to_item_id)?.label || "?"}`
                : null;
              return (
                <div className="absolute top-3 right-3 z-[1000] bg-white border border-zinc-300 rounded-lg shadow-lg p-3 w-64 space-y-2" data-testid="conn-edit-panel">
                  <div className="text-xs font-bold text-zinc-700 uppercase tracking-wide">Connections</div>
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
                      <div className="text-xs font-mono text-zinc-800 font-semibold" data-testid="conn-selected-label">{connLabel}</div>
                      <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setReconnectSide("from")} data-testid="conn-move-start-btn">Move start (blue dot)</Button>
                      <Button size="sm" className="w-full h-8 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => setReconnectSide("to")} data-testid="conn-move-end-btn">Move end (red dot)</Button>
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => { handleConnectionDelete(selectedConn); setSelectedConn(null); }} data-testid="conn-delete-btn">Delete line</Button>
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setSelectedConn(null)} data-testid="conn-deselect-btn">Done with this line</Button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-zinc-500" data-testid="conn-panel-instruction">Tap any line on the map to move, delete or re-route it.</div>
                      {connections.length > 0 && (
                        <Select value="" onValueChange={(v) => { if (v) { setSelectedConn(v); setReconnectSide(null); setAddingConn(null); } }}>
                          <SelectTrigger className="h-8 text-xs bg-white" data-testid="conn-picker-select">
                            <SelectValue placeholder="Or pick a line from list…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 z-[1200] bg-white">
                            {connections.map((c) => {
                              const f = allConnectableItems.find((i) => i.id === c.from_item_id);
                              const t = allConnectableItems.find((i) => i.id === c.to_item_id);
                              if (!f || !t) return null;
                              return (
                                <SelectItem key={c.id} value={c.id} data-testid={`conn-picker-item-${c.id}`}>
                                  {f.label} → {t.label}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setAddingConn({ from: null }); setSelectedConn(null); setReconnectSide(null); }} data-testid="conn-add-line-btn">+ Add line</Button>
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={resetConnections} data-testid="conn-reset-lines-btn">Reset lines to job order</Button>
                    </>
                  )}
                </div>
              );
            })()}
            <div className="absolute bottom-3 right-3 z-[500] bg-white/90 border border-zinc-200 rounded px-3 py-2 text-xs font-mono shadow pointer-events-none max-w-[220px]" data-testid="map-legend">
              <div className="font-bold text-zinc-700 mb-1">LEGEND</div>
              {route.length > 0 && (
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 border border-white inline-block flex-shrink-0"></span>Pole (Red)</div>
              )}
              {route.length > 1 && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-4 h-0.5 inline-block flex-shrink-0" style={{ backgroundColor: aerialColorHex }}></span>Aerial Path ({PATH_COLORS[aerialColor]?.name})</div>
              )}
              {ug.length > 0 && (
                <div className="flex items-center gap-2 mt-0.5"><span className="w-3 h-3 border border-white inline-block flex-shrink-0" style={{ backgroundColor: undergroundColorHex }}></span>Underground ({PATH_COLORS[undergroundColor]?.name})</div>
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
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
              <div className="w-1 h-5 bg-orange-500"></div>
              SPAN MEASUREMENTS
            </h2>
            <ol className="space-y-1 font-mono text-sm text-zinc-800">
              {measurementEntries.map((e) => (
                e.kind === "span" ? (
                  <li key={`entry-${e.num}`} data-testid={`span-measurement-${e.num}`}>
                    <span className="font-bold text-orange-700">{e.num}.</span> {segItemName(e.seg.from)} to {segItemName(e.seg.to)} = {fmtFeet(segListDistance(e.seg))}
                    {!e.seg.isAerial && <span className="text-emerald-700 text-xs ml-1">(UG)</span>}
                  </li>
                ) : e.kind === "riser" ? (
                  <li key={`entry-${e.num}`} data-testid={`riser-measurement-${e.num}`}>
                    <span className="font-bold text-violet-700">{e.num}.</span> {e.text}
                  </li>
                ) : (
                  <li key={`entry-${e.num}`} data-testid={`path-measurement-${e.num}`}>
                    <span className="font-bold text-emerald-700">{e.num}.</span> {e.text}
                  </li>
                )
              ))}
            </ol>
            <div className="mt-3 pt-3 border-t border-zinc-300 font-mono text-sm font-bold text-zinc-900" data-testid="span-measurements-total">
              Total: {fmtFeet(aerialFeetTotal)} aerial{ugFeet > 0 ? ` + ${fmtFeet(ugFeet)} underground` : ""}{totalRiserFeet > 0 ? ` + ${fmtFeet(totalRiserFeet)} risers` : ""}{pathFeet > 0 ? ` + ${fmtFeet(pathFeet)} path` : ""} = {fmtFeet(aerialFeetTotal + totalRiserFeet + ugFeet + pathFeet)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobMap;
