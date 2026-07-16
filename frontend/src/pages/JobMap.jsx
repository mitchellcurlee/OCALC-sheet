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
import { computeRoute, fmtFeet, feetToStation, markerLabel, downloadPoleMapImage, downloadSegmentedMapPages, ugWithGps, undergroundAbbr, computeUgConnectors } from "@/lib/poleMapImage";
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
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><span style="background:#fff;border:1.5px solid ${isRed ? '#dc2626' : color};border-radius:11px;padding:1px 7px;font-family:ui-monospace,monospace;font-weight:700;font-size:10px;color:${isRed ? '#dc2626' : color};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);">${text}</span></div>`,
    iconSize: [64, 20],
    iconAnchor: [32, 10],
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
const DraggableMarker = ({ position, icon, children, draggable, onDragEnd, zIndexOffset = 0 }) => {
  const markerRef = useRef(null);
  
  const eventHandlers = useMemo(() => ({
    dragend() {
      const marker = markerRef.current;
      if (marker && onDragEnd) {
        const newPos = marker.getLatLng();
        onDragEnd(newPos.lat, newPos.lng);
      }
    },
  }), [onDragEnd]);

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
      await axios.put(`/jobs/${jobId}/underground/${ugId}`, {
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

  // Get label position for an item (base position + custom offset)
  const getLabelPosition = useCallback((itemId, basePos) => {
    const defaultOffset = [-0.00015, 0.00015]; // Default offset: up and to the right
    const offset = labelOffsets[itemId] || defaultOffset;
    return [basePos[0] + offset[0], basePos[1] + offset[1]];
  }, [labelOffsets]);

  // Get measurement label position (base position at midpoint + custom offset)
  // Each segment gets a unique default offset to prevent overlap
  const getMeasurementLabelPosition = useCallback((segmentKey, basePos, segmentIndex = 0) => {
    // If user has set a custom position, use that
    if (measurementOffsets[segmentKey]) {
      const offset = measurementOffsets[segmentKey];
      return [basePos[0] + offset[0], basePos[1] + offset[1]];
    }
    
    // Generate unique default offset based on segment index to prevent overlap
    // Alternate between different positions: top-right, bottom-right, top-left, bottom-left
    const offsetPatterns = [
      [-0.00018, 0.00020],   // top-right
      [0.00015, 0.00022],    // bottom-right  
      [-0.00020, -0.00018],  // top-left
      [0.00018, -0.00015],   // bottom-left
      [-0.00025, 0.00010],   // far top-right
      [0.00022, 0.00012],    // far bottom-right
    ];
    
    const patternIndex = segmentIndex % offsetPatterns.length;
    const defaultOffset = offsetPatterns[patternIndex];
    
    return [basePos[0] + defaultOffset[0], basePos[1] + defaultOffset[1]];
  }, [measurementOffsets]);

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
        pos: p.pos
      });
    });
    
    // Add underground items with sort_order
    ug.forEach(u => {
      allItems.push({
        id: u.id,
        type: "underground",
        sort_order: u.sort_order ?? Infinity,
        pos: u.pos
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
        sort_order: p.sort_order ?? Infinity
      });
    });
    ug.forEach(u => {
      items.push({
        id: u.id,
        pos: u.pos,
        type: "underground",
        label: u.label || u.type,
        sort_order: u.sort_order ?? Infinity
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
        label: p.pole_number || 'Pole'
      });
    });
    
    ug.forEach(u => {
      allItems.push({
        id: u.id,
        type: "underground",
        ugType: u.type,
        pos: u.pos,
        sort_order: u.sort_order ?? Infinity,
        label: u.label || u.type
      });
    });
    
    // Sort by sort_order (matching job page display order)
    allItems.sort((a, b) => a.sort_order - b.sort_order);
    
    // Create segments between consecutive items
    const segments = [];
    for (let i = 0; i < allItems.length - 1; i++) {
      const fromItem = allItems[i];
      const toItem = allItems[i + 1];
      
      // Calculate distance
      const latDiff = (toItem.pos[0] - fromItem.pos[0]) * 364000;
      const lngDiff = (toItem.pos[1] - fromItem.pos[1]) * 288200;
      const distFt = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      
      // Calculate midpoint
      const mid = [
        (fromItem.pos[0] + toItem.pos[0]) / 2,
        (fromItem.pos[1] + toItem.pos[1]) / 2
      ];
      
      // Determine segment type and styling
      const isAerial = fromItem.type === "pole" && toItem.type === "pole";
      const hasUnderground = fromItem.type === "underground" || toItem.type === "underground";
      
      // Check if either item is MPOE or after MPOE
      const mpoeIndex = allItems.findIndex(item => item.ugType === "MPOE");
      const isAfterMPOE = mpoeIndex >= 0 && i >= mpoeIndex;
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
    }
    
    return segments;
  }, [route, ug]);

  // ======== END CONNECTION MANAGEMENT ========

  const downloadImage = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadPoleMapImage({ poles, job, showStops: false, underground });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, underground]);

  const downloadSegmented = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadSegmentedMapPages({ poles, job, showStops: false, underground, targetFeet: 800 });
    } finally {
      setDownloading(false);
    }
  }, [poles, job, underground]);

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
              <p className="text-xs font-mono text-zinc-500">
                {route.length} pole(s){ug.length ? ` · ${ug.length} underground` : ""} · {fmtFeet(totalFeet)} span{totalRiserFeet > 0 ? ` + ${fmtFeet(totalRiserFeet)} risers = ${fmtFeet(grandTotalFeet)} total` : " total"}
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
                        <SelectContent>
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
                        <SelectContent>
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
                        setEditMode(true);
                        setPositionEditMode(true);
                        setConnectionEditMode(true);
                        initializeConnections();
                      }}
                      className="cursor-pointer"
                      data-testid="edit-all-btn"
                    >
                      <Move className="w-4 h-4 mr-2" />
                      Move Items & Edit Lines
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* Show current mode indicators */}
                {(editMode || positionEditMode || connectionEditMode) && !addingType && (
                  <span className="flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                    Edit Mode: Drag markers, edit lines, reconnect items
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
                <div className="font-semibold">Edit Mode Active</div>
                <div className="text-xs opacity-90 mt-0.5">
                  • Drag markers to move items • Edit route lines • Click line to change its color
                </div>
                {/* Segment selector dropdown for easier selection */}
                {orderedSegments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-400">
                    <div className="text-xs opacity-80 mb-1">Or select segment from list:</div>
                    <Select value={selectedSegment || ""} onValueChange={(v) => v && setSelectedSegment(v)}>
                      <SelectTrigger className="h-7 text-xs bg-white text-zinc-900">
                        <SelectValue placeholder="Select a segment..." />
                      </SelectTrigger>
                      <SelectContent>
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
                const measurementLabelPos = getMeasurementLabelPosition(segmentKey, seg.mid, i);
                
                // For aerial pole-to-pole segments, use EditableRoute with waypoints
                if (seg.isAerial) {
                  const waypoints = customRoutes[segmentKey] || [];
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
                        showDistance={true}
                        isAfterMPOE={seg.isRed}
                        onClick={() => handleSegmentClick(segmentKey)}
                        measurementLabelPos={measurementLabelPos}
                        onMeasurementDragEnd={handleMeasurementDragEnd}
                      />
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
                    {/* Orange connecting line from measurement label to midpoint */}
                    <Polyline
                      positions={[seg.mid, measurementLabelPos]}
                      pathOptions={{
                        color: "#ea580c",
                        weight: 2,
                        opacity: 0.9,
                        dashArray: "4,4"
                      }}
                    />
                    {/* Smart measurement label - draggable in edit mode */}
                    <DraggableMarker 
                      position={measurementLabelPos}
                      icon={L.divIcon({
                        className: "ug-measurement-label",
                        html: `<div style="background:#fff;border:2px solid #ea580c;border-radius:6px;padding:4px 10px;font:700 12px/1.2 ui-monospace,monospace;color:#c2410c;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.25);cursor:${editMode ? 'move' : 'default'};">${fmtFeet(seg.distFt)}</div>`,
                        iconSize: [80, 28],
                        iconAnchor: [40, 14],
                      })}
                      draggable={editMode}
                      onDragEnd={(lat, lng) => handleMeasurementDragEnd(segmentKey, seg.mid, lat, lng)}
                      zIndexOffset={900}
                    />
                  </React.Fragment>
                );
              })}
              
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
                    {/* Station number label with offset and connecting line */}
                    {stationLabel && (() => {
                      const labelPos = getLabelPosition(p.id, p.pos);
                      const isEditingLabels = editMode || positionEditMode || connectionEditMode;
                      return (
                        <>
                          {/* Connecting line from marker to station label */}
                          <Polyline 
                            positions={[p.pos, labelPos]} 
                            pathOptions={{ color: "#4f46e5", weight: 1.5, dashArray: "3,3", opacity: 0.8 }} 
                          />
                          <DraggableMarker 
                            position={labelPos} 
                            icon={L.divIcon({
                              className: "station-label-smart",
                              html: `<div style="background:#4f46e5;color:#fff;border:2px solid #fff;border-radius:4px;padding:2px 6px;font:700 10px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%);${isEditingLabels ? 'cursor:move;' : ''}">${p.pole_number || 'P'}<br/>${stationLabel}</div>`,
                              iconSize: [60, 32],
                              iconAnchor: [30, 16],
                            })}
                            draggable={isEditingLabels}
                            onDragEnd={(lat, lng) => handleLabelDragEnd(p.id, p.pos, lat, lng)}
                            zIndexOffset={850}
                          />
                        </>
                      );
                    })()}
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
                // Hide underground type label when station numbers are active
                const ugDisplayLabel = showStationNumbers ? "" : undergroundAbbr(u.type);
                return (
                <React.Fragment key={u.id}>
                  <DraggableMarker 
                    position={u.pos} 
                    icon={ugIcon(ugDisplayLabel, isRed, undergroundColorHex)}
                    draggable={positionEditMode}
                    onDragEnd={(lat, lng) => handleUndergroundDragEnd(u.id, lat, lng)}
                  >
                    <Popup>
                      <div className="min-w-[170px] font-mono" data-testid={`ug-popup-${u.id}`}>
                        <div className="text-sm font-bold" style={{ color: isRed ? '#dc2626' : undergroundColorHex }}>{undergroundAbbr(u.type)} · {u.type}</div>
                        {stationLabel && <div className="text-xs text-indigo-600 font-bold">Station: {stationLabel}</div>}
                        {u.label && <div className="text-xs text-zinc-600 mt-1">{u.label}</div>}
                        {u.notes && <div className="text-xs text-zinc-500 mt-1">{u.notes}</div>}
                        {!positionEditMode && (
                          <Link to={`/jobs/${jobId}/underground/edit/${u.id}`}>
                            <Button size="sm" className="w-full h-8 mt-2 text-white" style={{ backgroundColor: isRed ? '#dc2626' : undergroundColorHex }} data-testid={`ug-edit-${u.id}`}>Edit</Button>
                          </Link>
                        )}
                        {positionEditMode && (
                          <div className="mt-2 text-xs font-medium" style={{ color: undergroundColorHex }}>Drag marker to reposition</div>
                        )}
                      </div>
                    </Popup>
                  </DraggableMarker>
                  {/* Station number label with offset and connecting line */}
                  {stationLabel && (() => {
                    const labelPos = getLabelPosition(u.id, u.pos);
                    const isEditingLabels = editMode || positionEditMode || connectionEditMode;
                    return (
                      <>
                        {/* Connecting line from marker to station label */}
                        <Polyline 
                          positions={[u.pos, labelPos]} 
                          pathOptions={{ color: isRed ? "#dc2626" : undergroundColorHex, weight: 1.5, dashArray: "3,3", opacity: 0.8 }} 
                        />
                        <DraggableMarker 
                          position={labelPos} 
                          icon={L.divIcon({
                            className: "station-label-smart",
                            html: `<div style="background:${isRed ? '#dc2626' : undergroundColorHex};color:#fff;border:2px solid #fff;border-radius:4px;padding:2px 6px;font:700 10px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%);${isEditingLabels ? 'cursor:move;' : ''}">${undergroundAbbr(u.type)}${u.label ? '-' + u.label : ''}<br/>${stationLabel}</div>`,
                            iconSize: [70, 32],
                            iconAnchor: [35, 16],
                          })}
                          draggable={isEditingLabels}
                          onDragEnd={(lat, lng) => handleLabelDragEnd(u.id, u.pos, lat, lng)}
                          zIndexOffset={850}
                        />
                      </>
                    );
                  })()}
                </React.Fragment>
              )})}
              {/* Map annotations (notes and measurements) */}
              <MapAnnotations
                annotations={annotations}
                editMode={editMode}
                addingType={addingType}
                onAnnotationAdd={handleAnnotationAdd}
                onAnnotationUpdate={handleAnnotationUpdate}
                onAnnotationDelete={handleAnnotationDelete}
              />
              {/* Connection edit mode - draggable endpoints */}
              {connectionEditMode && (
                <>
                  {/* Show target indicators for all connectable items */}
                  {allConnectableItems.map(item => (
                    <Marker
                      key={`target-${item.id}`}
                      position={item.pos}
                      icon={L.divIcon({
                        className: "conn-target",
                        html: `<div style="width:28px;height:28px;border-radius:50%;background:rgba(139,92,246,0.15);border:2px dashed #8b5cf6;"></div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                      })}
                      interactive={false}
                      zIndexOffset={800}
                    />
                  ))}
                  
                  {/* Render connection lines with draggable endpoints */}
                  {connections.map(conn => {
                    const fromItem = allConnectableItems.find(i => i.id === conn.from_item_id);
                    const toItem = allConnectableItems.find(i => i.id === conn.to_item_id);
                    
                    if (!fromItem || !toItem) return null;
                    
                    const lineColor = conn.connection_type === 'aerial' ? '#3b82f6' : 
                                      conn.connection_type === 'underground' ? '#22c55e' : '#8b5cf6';
                    
                    return (
                      <React.Fragment key={conn.id}>
                        {/* Connection line */}
                        <Polyline
                          positions={[fromItem.pos, toItem.pos]}
                          pathOptions={{
                            color: lineColor,
                            weight: 4,
                            opacity: 0.8,
                            dashArray: conn.connection_type === 'custom' ? '8, 8' : undefined
                          }}
                        />
                        {/* Draggable "from" endpoint - BLUE */}
                        <Marker
                          position={fromItem.pos}
                          icon={L.divIcon({
                            className: "conn-endpoint-from",
                            html: `<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:grab;z-index:2000;"></div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                          })}
                          draggable={true}
                          eventHandlers={{
                            dragend: async (e) => {
                              const dropPos = [e.target.getLatLng().lat, e.target.getLatLng().lng];
                              // Find nearest item to drop position
                              let nearest = null;
                              let minDist = Infinity;
                              allConnectableItems.forEach(item => {
                                // Can't connect to the "to" endpoint of this same connection
                                if (item.id === conn.to_item_id) return;
                                const dist = Math.sqrt(
                                  Math.pow(dropPos[0] - item.pos[0], 2) + 
                                  Math.pow(dropPos[1] - item.pos[1], 2)
                                );
                                if (dist < minDist) {
                                  minDist = dist;
                                  nearest = item;
                                }
                              });
                              
                              if (nearest && nearest.id !== conn.from_item_id) {
                                try {
                                  await handleConnectionUpdate(conn.id, {
                                    from_item_id: nearest.id,
                                    from_item_type: nearest.type
                                  });
                                  toast.success(`Connected from ${nearest.label}`);
                                } catch (err) {
                                  toast.error("Failed to update connection");
                                }
                              }
                              fetchData();
                            }
                          }}
                          zIndexOffset={1200}
                        >
                          <Popup><div className="text-xs font-mono p-1"><strong>From:</strong> {fromItem.label}<br/><span className="text-zinc-500">Drag to another item</span></div></Popup>
                        </Marker>
                        
                        {/* Draggable "to" endpoint - RED */}
                        <Marker
                          position={toItem.pos}
                          icon={L.divIcon({
                            className: "conn-endpoint-to",
                            html: `<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:grab;z-index:2000;"></div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                          })}
                          draggable={true}
                          eventHandlers={{
                            dragend: async (e) => {
                              const dropPos = [e.target.getLatLng().lat, e.target.getLatLng().lng];
                              // Find nearest item to drop position
                              let nearest = null;
                              let minDist = Infinity;
                              allConnectableItems.forEach(item => {
                                // Can't connect to the "from" endpoint of this same connection
                                if (item.id === conn.from_item_id) return;
                                const dist = Math.sqrt(
                                  Math.pow(dropPos[0] - item.pos[0], 2) + 
                                  Math.pow(dropPos[1] - item.pos[1], 2)
                                );
                                if (dist < minDist) {
                                  minDist = dist;
                                  nearest = item;
                                }
                              });
                              
                              if (nearest && nearest.id !== conn.to_item_id) {
                                try {
                                  await handleConnectionUpdate(conn.id, {
                                    to_item_id: nearest.id,
                                    to_item_type: nearest.type
                                  });
                                  toast.success(`Connected to ${nearest.label}`);
                                } catch (err) {
                                  toast.error("Failed to update connection");
                                }
                              }
                              fetchData();
                            }
                          }}
                          zIndexOffset={1200}
                        >
                          <Popup><div className="text-xs font-mono p-1"><strong>To:</strong> {toItem.label}<br/><span className="text-zinc-500">Drag to another item</span></div></Popup>
                        </Marker>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </MapContainer>
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
                <div key={t} className="text-zinc-500 mt-0.5 ml-1"><span style={{ color: undergroundColorHex }} className="font-semibold">{undergroundAbbr(t)}</span> {t}</div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobMap;
