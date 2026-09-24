import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Camera, Upload, X, Pencil, Type, Circle, Square, 
  Minus, Undo, Redo, Trash2, Loader2, ZoomIn, ZoomOut, RotateCcw,
  Save, MousePointer, Move, ArrowRight, Triangle, List, Eraser,
  Waypoints, GitBranch
} from "lucide-react";
import { toast } from "sonner";
import { ZoomableImage } from "@/components/ZoomableImage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Underground marker types - matches backend UNDERGROUND_TYPES exactly
const UG_MARKERS = [
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

const LINE_COLORS = [
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#9333ea" },
  { name: "Yellow", value: "#eab308" },
  { name: "Black", value: "#18181b" },
  { name: "White", value: "#ffffff" },
];

const SHAPES = [
  { type: "rectangle", icon: Square, label: "Rectangle" },
  { type: "circle", icon: Circle, label: "Circle" },
  { type: "arrow", icon: ArrowRight, label: "Arrow" },
  { type: "line", icon: Minus, label: "Line" },
  { type: "triangle", icon: Triangle, label: "Triangle" },
];

// Helper function: Calculate distance from point to line segment
const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
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

/**
 * PhotoMarkupEditor - In-app photo editor for markup annotations
 * Allows adding lines, markers, shapes, and text notes on photos
 */
export const PhotoMarkupEditor = ({ 
  photos = [], 
  onChange, 
  label = "Mark Ups",
  undergroundItems = [],  // Underground items from the job for quick labeling
  poles = []              // Poles from the job for quick labeling
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(-1);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const baseFitRef = useRef(null);
  const pinchRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  
  // Editor state
  const [tool, setTool] = useState("select"); // select, draw, marker, text, shape, straightline, polyline, label, icon
  const [lineColor, setLineColor] = useState("#dc2626");
  const [lineWidth, setLineWidth] = useState(3);
  const [fillShape, setFillShape] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [selectedShape, setSelectedShape] = useState("rectangle");
  const [markerSize, setMarkerSize] = useState(24);
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState("#18181b"); // Color for text boxes
  const [fontSize, setFontSize] = useState(16);
  const [annotations, setAnnotations] = useState([]); // Array of {type, data}
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentLine, setCurrentLine] = useState(null);
  const [shapeStart, setShapeStart] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  
  // Polyline state - for multi-point editable lines
  const [polylinePoints, setPolylinePoints] = useState([]); // Points being added
  const [editingVertexIndex, setEditingVertexIndex] = useState(null); // Which vertex is being dragged
  const [straightLineStart, setStraightLineStart] = useState(null); // Start point for straight line
  const [labelSize, setLabelSize] = useState(14); // Size for insertable text labels
  const [iconSize, setIconSize] = useState(32); // Size for underground icons
  const [iconColor, setIconColor] = useState("#16a34a"); // Color for underground icons
  const [selectedIcon, setSelectedIcon] = useState(null); // Selected underground icon type
  const imageRef = useRef(null);

  // Helper to get full photo URL
  const getPhotoUrl = (photo) => {
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

  const photoArray = Array.isArray(photos) ? photos : (photos ? [photos] : []);

  // Generate legend data from current annotations
  const getLegendItems = useCallback(() => {
    const items = [];
    const markerCounts = {};
    const shapeCounts = { rectangle: 0, circle: 0, arrow: 0, line: 0, triangle: 0 };
    let drawCount = 0;
    let textCount = 0;

    annotations.forEach(ann => {
      if (ann.type === "marker") {
        const marker = UG_MARKERS.find(m => m.type === ann.label);
        if (marker) {
          markerCounts[ann.label] = (markerCounts[ann.label] || 0) + 1;
        }
      } else if (ann.type === "shape") {
        shapeCounts[ann.shape] = (shapeCounts[ann.shape] || 0) + 1;
      } else if (ann.type === "draw") {
        drawCount++;
      } else if (ann.type === "text") {
        textCount++;
      }
    });

    // Add markers to legend
    Object.entries(markerCounts).forEach(([type, count]) => {
      const marker = UG_MARKERS.find(m => m.type === type);
      if (marker) {
        items.push({ type: "marker", label: `${marker.type} - ${marker.label}`, color: marker.color, count });
      }
    });

    // Add shapes to legend
    Object.entries(shapeCounts).forEach(([shape, count]) => {
      if (count > 0) {
        items.push({ type: "shape", label: `${shape.charAt(0).toUpperCase() + shape.slice(1)}`, count });
      }
    });

    // Add drawings
    if (drawCount > 0) {
      items.push({ type: "draw", label: "Freehand Drawing", count: drawCount });
    }

    // Add text
    if (textCount > 0) {
      items.push({ type: "text", label: "Text Annotation", count: textCount });
    }

    return items;
  }, [annotations]);

  // Load image into canvas - also depends on editorOpen since canvas only exists when dialog is open
  useEffect(() => {
    if (!editorOpen || !currentPhoto) {
      return;
    }
    
    // Small delay to ensure canvas is rendered after dialog opens
    const timer = setTimeout(() => {
      if (!canvasRef.current) {
        console.log("Canvas ref still null after dialog open");
        return;
      }
      
      console.log("Starting image load for:", currentPhoto.substring(0, 50) + "...");
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      
      const loadImage = (url, useCors = true) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          // Don't use CORS for data URLs
          if (useCors && !url.startsWith('data:')) {
            img.crossOrigin = "anonymous";
          }
          img.onload = () => {
            console.log("Image loaded successfully, dimensions:", img.width, "x", img.height);
            resolve(img);
          };
          img.onerror = (e) => {
            console.error("Image load error:", e);
            reject(new Error("Failed to load image"));
          };
          img.src = url;
        });
      };
      
      const processImage = (img) => {
        const maxWidth = 1400;
        const maxHeight = 1000;
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        console.log("Processing image, canvas dimensions:", width, "x", height);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        imageRef.current = { img, width, height };
        setImageLoaded(true);
        console.log("Image loaded state set to true");
      };
      
      const showError = () => {
        console.log("Showing error state");
        canvas.width = 400;
        canvas.height = 300;
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(0, 0, 400, 300);
        ctx.fillStyle = "#6b7280";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Failed to load image", 200, 140);
        ctx.fillText("Please try a different photo", 200, 160);
        setImageLoaded(false);
      };
      
      // For data URLs, load directly without CORS
      if (currentPhoto.startsWith('data:')) {
        console.log("Loading data URL image...");
        loadImage(currentPhoto, false)
          .then(processImage)
          .catch((err) => {
            console.error("Failed to load data URL image:", err);
            showError();
          });
      } else {
        // For other URLs, try with CORS first, then without
        console.log("Loading regular URL image...");
        loadImage(currentPhoto, true)
          .then(processImage)
          .catch(() => {
            console.log("CORS failed, trying without...");
            return loadImage(currentPhoto, false)
              .then(processImage)
              .catch((err) => {
                console.error("Failed to load image:", err);
                showError();
              });
          });
      }
    }, 100); // Small delay for dialog to render
    
    return () => clearTimeout(timer);
  }, [currentPhoto, editorOpen]);

  // Redraw canvas with all annotations
  const redrawCanvas = useCallback(() => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { img, width, height } = imageRef.current;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, width, height);
    
    // Draw all annotations
    annotations.forEach((ann, idx) => {
      const isSelected = selectedAnnotation === idx;
      
      if (ann.type === "line" || ann.type === "draw") {
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (ann.points && ann.points.length > 0) {
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          ann.points.forEach(p => ctx.lineTo(p.x, p.y));
        }
        ctx.stroke();
        
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (ann.type === "straightline") {
        // Simple point-to-point straight line
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.lineCap = "round";
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
        
        if (isSelected) {
          // Draw selection indicators at endpoints
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath();
          ctx.arc(ann.startX, ann.startY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ann.endX, ann.endY, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (ann.type === "polyline") {
        // Multi-point editable line
        if (ann.points && ann.points.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = ann.width;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
          
          if (isSelected) {
            // Draw editable vertices
            ann.points.forEach((p, pIdx) => {
              ctx.fillStyle = editingVertexIndex === pIdx ? "#ef4444" : "#3b82f6";
              ctx.strokeStyle = "#fff";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      } else if (ann.type === "marker") {
        const size = ann.size || 24;
        const halfSize = size / 2;
        
        // Draw marker background
        ctx.beginPath();
        ctx.fillStyle = ann.color;
        ctx.arc(ann.x, ann.y, halfSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Label
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(8, size * 0.4)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ann.label, ann.x, ann.y);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        
        // Selection indicator
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(ann.x, ann.y, halfSize + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (ann.type === "text") {
        // Text with white background box
        const fontSize = ann.fontSize || 16;
        const padding = 4;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const metrics = ctx.measureText(ann.text);
        const textWidth = metrics.width;
        const textHeight = fontSize;
        
        // Draw white background
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = ann.color || "#18181b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(ann.x - padding, ann.y - textHeight - padding, textWidth + padding * 2, textHeight + padding * 2, 4);
        ctx.fill();
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = ann.color || "#18181b";
        ctx.fillText(ann.text, ann.x, ann.y);
        
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(ann.x - padding - 2, ann.y - textHeight - padding - 2, textWidth + padding * 2 + 4, textHeight + padding * 2 + 4);
          ctx.setLineDash([]);
        }
      } else if (ann.type === "icon") {
        // Underground attribute icon (circle with text inside)
        const size = ann.size || 32;
        const radius = size / 2;
        
        // Draw circle background
        ctx.fillStyle = ann.color || "#16a34a";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ann.x, ann.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw icon text
        const iconFontSize = Math.max(10, size * 0.4);
        ctx.font = `bold ${iconFontSize}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ann.iconType, ann.x, ann.y);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(ann.x, ann.y, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (ann.type === "label") {
        // Insertable label with background
        const fontSize = ann.fontSize || 14;
        const padding = ann.padding || 4;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const metrics = ctx.measureText(ann.text);
        const textWidth = metrics.width;
        const textHeight = fontSize;
        
        // Draw background
        ctx.fillStyle = ann.backgroundColor || "#ffffff";
        ctx.strokeStyle = ann.color || "#18181b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(ann.x - padding, ann.y - textHeight - padding, textWidth + padding * 2, textHeight + padding * 2, 4);
        ctx.fill();
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = ann.color || "#18181b";
        ctx.fillText(ann.text, ann.x, ann.y);
        
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(ann.x - padding - 2, ann.y - textHeight - padding - 2, textWidth + padding * 2 + 4, textHeight + padding * 2 + 4);
          ctx.setLineDash([]);
        }
      } else if (ann.type === "shape") {
        ctx.strokeStyle = ann.color;
        ctx.fillStyle = ann.fill ? ann.color + "40" : "transparent";
        ctx.lineWidth = ann.width || 2;
        
        if (ann.shape === "rectangle") {
          if (ann.fill) ctx.fillRect(ann.x, ann.y, ann.w, ann.h);
          ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
        } else if (ann.shape === "circle") {
          const radius = Math.sqrt(ann.w * ann.w + ann.h * ann.h) / 2;
          ctx.beginPath();
          ctx.arc(ann.x + ann.w / 2, ann.y + ann.h / 2, radius, 0, Math.PI * 2);
          if (ann.fill) ctx.fill();
          ctx.stroke();
        } else if (ann.shape === "line") {
          ctx.beginPath();
          ctx.moveTo(ann.x, ann.y);
          ctx.lineTo(ann.x + ann.w, ann.y + ann.h);
          ctx.stroke();
        } else if (ann.shape === "arrow") {
          // Draw line
          ctx.beginPath();
          ctx.moveTo(ann.x, ann.y);
          ctx.lineTo(ann.x + ann.w, ann.y + ann.h);
          ctx.stroke();
          
          // Draw arrowhead
          const angle = Math.atan2(ann.h, ann.w);
          const headLen = 15;
          ctx.beginPath();
          ctx.moveTo(ann.x + ann.w, ann.y + ann.h);
          ctx.lineTo(
            ann.x + ann.w - headLen * Math.cos(angle - Math.PI / 6),
            ann.y + ann.h - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(ann.x + ann.w, ann.y + ann.h);
          ctx.lineTo(
            ann.x + ann.w - headLen * Math.cos(angle + Math.PI / 6),
            ann.y + ann.h - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        } else if (ann.shape === "triangle") {
          ctx.beginPath();
          ctx.moveTo(ann.x + ann.w / 2, ann.y);
          ctx.lineTo(ann.x, ann.y + ann.h);
          ctx.lineTo(ann.x + ann.w, ann.y + ann.h);
          ctx.closePath();
          if (ann.fill) ctx.fill();
          ctx.stroke();
        }
        
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(ann.x - 2, ann.y - 2, (ann.w || 0) + 4, (ann.h || 0) + 4);
          ctx.setLineDash([]);
        }
      }
    });
    
    // Draw current drawing/shape in progress
    if (currentLine && currentLine.points && currentLine.points.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.moveTo(currentLine.points[0].x, currentLine.points[0].y);
      currentLine.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
    
    if (shapeStart && tool === "shape") {
      ctx.strokeStyle = lineColor;
      ctx.fillStyle = fillShape ? lineColor + "40" : "transparent";
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4, 4]);
      
      const w = shapeStart.endX - shapeStart.x;
      const h = shapeStart.endY - shapeStart.y;
      
      if (selectedShape === "rectangle") {
        if (fillShape) ctx.fillRect(shapeStart.x, shapeStart.y, w, h);
        ctx.strokeRect(shapeStart.x, shapeStart.y, w, h);
      } else if (selectedShape === "circle") {
        const radius = Math.sqrt(w * w + h * h) / 2;
        ctx.beginPath();
        ctx.arc(shapeStart.x + w / 2, shapeStart.y + h / 2, radius, 0, Math.PI * 2);
        if (fillShape) ctx.fill();
        ctx.stroke();
      } else if (selectedShape === "line" || selectedShape === "arrow") {
        ctx.beginPath();
        ctx.moveTo(shapeStart.x, shapeStart.y);
        ctx.lineTo(shapeStart.endX, shapeStart.endY);
        ctx.stroke();
      } else if (selectedShape === "triangle") {
        ctx.beginPath();
        ctx.moveTo(shapeStart.x + w / 2, shapeStart.y);
        ctx.lineTo(shapeStart.x, shapeStart.y + h);
        ctx.lineTo(shapeStart.x + w, shapeStart.y + h);
        ctx.closePath();
        if (fillShape) ctx.fill();
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    
    // Draw straight line in progress
    if (straightLineStart && tool === "straightline") {
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(straightLineStart.x, straightLineStart.y);
      ctx.lineTo(straightLineStart.endX || straightLineStart.x, straightLineStart.endY || straightLineStart.y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw endpoint indicators
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(straightLineStart.x, straightLineStart.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw polyline points in progress
    if (polylinePoints.length > 0 && tool === "polyline") {
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y);
      for (let i = 1; i < polylinePoints.length; i++) {
        ctx.lineTo(polylinePoints[i].x, polylinePoints[i].y);
      }
      ctx.stroke();
      
      // Draw vertices
      polylinePoints.forEach((p, idx) => {
        ctx.fillStyle = idx === 0 ? "#16a34a" : "#3b82f6";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }, [annotations, currentLine, shapeStart, lineColor, lineWidth, fillShape, selectedShape, selectedAnnotation, tool, straightLineStart, polylinePoints, editingVertexIndex]);

  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [annotations, currentLine, shapeStart, imageLoaded, redrawCanvas, selectedAnnotation, straightLineStart, polylinePoints]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scaling factors between display size and actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Support both mouse and touch events
    const pt = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: (pt.clientX - rect.left) * scaleX,
      y: (pt.clientY - rect.top) * scaleY
    };
  };

  // Find vertex of polyline near position (for editing)
  const findPolylineVertexAt = (annIdx, x, y) => {
    const ann = annotations[annIdx];
    if (ann.type !== "polyline" || !ann.points) return -1;
    
    for (let i = 0; i < ann.points.length; i++) {
      const p = ann.points[i];
      const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
      if (dist <= 10) return i;
    }
    return -1;
  };

  // Find annotation at position
  const findAnnotationAt = (x, y) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === "marker") {
        const size = ann.size || 24;
        const dist = Math.sqrt((x - ann.x) ** 2 + (y - ann.y) ** 2);
        if (dist <= size / 2) return i;
      } else if (ann.type === "straightline") {
        // Check if point is near the line segment
        const dist = pointToLineDistance(x, y, ann.startX, ann.startY, ann.endX, ann.endY);
        if (dist <= 10) return i;
      } else if (ann.type === "polyline" && ann.points && ann.points.length > 1) {
        // Check if point is near any segment of the polyline
        for (let j = 0; j < ann.points.length - 1; j++) {
          const p1 = ann.points[j];
          const p2 = ann.points[j + 1];
          const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
          if (dist <= 10) return i;
        }
      } else if (ann.type === "draw" && ann.points && ann.points.length > 1) {
        // Check if point is near any segment of a freehand drawing
        for (let j = 0; j < ann.points.length - 1; j++) {
          const p1 = ann.points[j];
          const p2 = ann.points[j + 1];
          const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
          if (dist <= 10) return i;
        }
      } else if (ann.type === "text") {
        const fontSize = ann.fontSize || 16;
        const padding = 4;
        // Use canvas to measure text width accurately if we have context, otherwise estimate
        let textWidth;
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          ctx.font = `bold ${fontSize}px sans-serif`;
          textWidth = ctx.measureText(ann.text || "").width;
        } else {
          textWidth = (ann.text?.length || 5) * fontSize * 0.6;
        }
        const textHeight = fontSize;
        // Hit test area includes the white background box
        if (x >= ann.x - padding - 5 && x <= ann.x + textWidth + padding + 5 && 
            y >= ann.y - textHeight - padding - 5 && y <= ann.y + padding + 5) {
          return i;
        }
      } else if (ann.type === "icon") {
        const size = ann.size || 32;
        const radius = size / 2;
        const dist = Math.sqrt((x - ann.x) ** 2 + (y - ann.y) ** 2);
        if (dist <= radius + 5) return i;
      } else if (ann.type === "label") {
        const fontSize = ann.fontSize || 14;
        const padding = ann.padding || 4;
        // Estimate text width based on character count
        const textWidth = (ann.text?.length || 5) * fontSize * 0.6;
        if (x >= ann.x - padding - 5 && x <= ann.x + textWidth + padding + 5 && 
            y >= ann.y - fontSize - padding - 5 && y <= ann.y + padding + 5) {
          return i;
        }
      } else if (ann.type === "shape") {
        if (x >= ann.x && x <= ann.x + ann.w && y >= ann.y && y <= ann.y + ann.h) {
          return i;
        }
      }
    }
    return -1;
  };

  const handleMouseDown = (e) => {
    if (e.touches && e.touches.length === 2) {
      // Two-finger pinch — zoom instead of drawing
      e.preventDefault();
      pinchRef.current = {
        dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY),
        startZoom: zoom,
      };
      setIsDrawing(false);
      setIsDragging(false);
      return;
    }
    const coords = getCanvasCoords(e);
    
    if (tool === "select") {
      const idx = findAnnotationAt(coords.x, coords.y);
      setSelectedAnnotation(idx >= 0 ? idx : null);
      
      if (idx >= 0) {
        const ann = annotations[idx];
        
        // Check if clicking on a polyline vertex for editing
        if (ann.type === "polyline") {
          const vertexIdx = findPolylineVertexAt(idx, coords.x, coords.y);
          if (vertexIdx >= 0) {
            setEditingVertexIndex(vertexIdx);
            setIsDragging(true);
            return;
          }
        }
        
        setIsDragging(true);
        if ((ann.type === "draw" || ann.type === "polyline") && ann.points?.length) {
          setDragOffset({ x: coords.x - ann.points[0].x, y: coords.y - ann.points[0].y });
        } else {
          setDragOffset({ x: coords.x - (ann.x || ann.startX || 0), y: coords.y - (ann.y || ann.startY || 0) });
        }
      }
    } else if (tool === "eraser") {
      const idx = findAnnotationAt(coords.x, coords.y);
      if (idx >= 0) {
        const newAnnotations = annotations.filter((_, i) => i !== idx);
        setAnnotations(newAnnotations);
        setSelectedAnnotation(null);
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAnnotations);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
    } else if (tool === "draw") {
      setIsDrawing(true);
      setCurrentLine({ type: "draw", color: lineColor, width: lineWidth, points: [coords] });
    } else if (tool === "straightline") {
      // Start drawing a straight line
      setStraightLineStart({ x: coords.x, y: coords.y, endX: coords.x, endY: coords.y });
    } else if (tool === "polyline") {
      // Add a point to the polyline
      setPolylinePoints(prev => [...prev, coords]);
    } else if (tool === "marker" && selectedMarker) {
      const marker = UG_MARKERS.find(m => m.type === selectedMarker);
      if (marker) {
        addAnnotation({ 
          type: "marker", 
          label: marker.type, 
          color: marker.color, 
          x: coords.x, 
          y: coords.y,
          size: markerSize
        });
      } else {
        // Custom label (from job underground/poles)
        addAnnotation({ 
          type: "marker", 
          label: selectedMarker, 
          color: lineColor, 
          x: coords.x, 
          y: coords.y,
          size: markerSize
        });
      }
    } else if (tool === "text" && textInput.trim()) {
      addAnnotation({ 
        type: "text", 
        text: textInput, 
        color: textColor, 
        x: coords.x, 
        y: coords.y,
        fontSize: fontSize
      });
      setTextInput("");
    } else if (tool === "shape") {
      setShapeStart({ x: coords.x, y: coords.y, endX: coords.x, endY: coords.y });
    } else if (tool === "label" && textInput.trim()) {
      // Insertable label with adjustable size
      addAnnotation({ 
        type: "label", 
        text: textInput, 
        color: lineColor, 
        x: coords.x, 
        y: coords.y,
        fontSize: labelSize,
        backgroundColor: "#ffffff",
        padding: 4
      });
    } else if (tool === "icon" && selectedIcon) {
      // Underground attribute icon
      addAnnotation({ 
        type: "icon", 
        iconType: selectedIcon, 
        color: iconColor, 
        x: coords.x, 
        y: coords.y,
        size: iconSize
      });
    }
  };

  const applyZoom = (next, clientX = null, clientY = null) => {
    const el = containerRef.current;
    setZoom((prev) => {
      const z = Math.min(5, Math.max(1, typeof next === "function" ? next(prev) : next));
      if (prev === 1 && z > 1 && canvasRef.current) {
        baseFitRef.current = { w: canvasRef.current.getBoundingClientRect().width };
      }
      if (z === 1) baseFitRef.current = null;
      if (el && z !== prev) {
        // Keep the point under the cursor (or view center) fixed while zooming
        const r = el.getBoundingClientRect();
        const ox = clientX == null ? r.width / 2 : clientX - r.left;
        const oy = clientY == null ? r.height / 2 : clientY - r.top;
        const px = (el.scrollLeft + ox) / prev;
        const py = (el.scrollTop + oy) / prev;
        requestAnimationFrame(() => {
          el.scrollLeft = px * z - ox;
          el.scrollTop = py * z - oy;
        });
      }
      return z;
    });
  };

  useEffect(() => {
    setZoom(1);
    baseFitRef.current = null;
    pinchRef.current = null;
  }, [currentPhoto, editorOpen]);

  useEffect(() => {
    if (!editorOpen || !imageLoaded) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      applyZoom((prev) => prev * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, imageLoaded]);

  const handleMouseMove = (e) => {
    if (e.touches && e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (pinchRef.current.dist > 0) applyZoom(pinchRef.current.startZoom * (d / pinchRef.current.dist), mx, my);
      return;
    }
    const coords = getCanvasCoords(e);
    
    if (isDragging && selectedAnnotation !== null) {
      const newAnnotations = [...annotations];
      const ann = newAnnotations[selectedAnnotation];
      
      // Handle polyline vertex editing
      if (ann.type === "polyline" && editingVertexIndex !== null) {
        ann.points[editingVertexIndex] = coords;
        setAnnotations(newAnnotations);
        return;
      }
      
      // Move entire freehand drawing or polyline (translate all points)
      if ((ann.type === "draw" || ann.type === "polyline") && ann.points?.length) {
        const dx = coords.x - dragOffset.x - ann.points[0].x;
        const dy = coords.y - dragOffset.y - ann.points[0].y;
        ann.points = ann.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        setAnnotations(newAnnotations);
        return;
      }
      
      // Handle straightline dragging
      if (ann.type === "straightline") {
        const dx = coords.x - dragOffset.x - ann.startX;
        const dy = coords.y - dragOffset.y - ann.startY;
        ann.startX += dx;
        ann.startY += dy;
        ann.endX += dx;
        ann.endY += dy;
        setDragOffset({ x: coords.x - ann.startX, y: coords.y - ann.startY });
      } else {
        ann.x = coords.x - dragOffset.x;
        ann.y = coords.y - dragOffset.y;
      }
      setAnnotations(newAnnotations);
    } else if (isDrawing && tool === "draw") {
      setCurrentLine(prev => ({
        ...prev,
        points: [...prev.points, coords]
      }));
    } else if (shapeStart && tool === "shape") {
      setShapeStart(prev => ({ ...prev, endX: coords.x, endY: coords.y }));
    } else if (straightLineStart && tool === "straightline") {
      setStraightLineStart(prev => ({ ...prev, endX: coords.x, endY: coords.y }));
    }
  };

  const handleMouseUp = (e) => {
    if (pinchRef.current) {
      // End of a pinch gesture — don't treat it as a draw/click
      if (!e.touches || e.touches.length === 0) pinchRef.current = null;
      setIsDrawing(false);
      setCurrentLine(null);
      setShapeStart(null);
      setStraightLineStart(null);
      return;
    }
    const coords = getCanvasCoords(e);
    
    if (isDragging) {
      setIsDragging(false);
      setEditingVertexIndex(null);
      saveHistory();
    }
    
    if (isDrawing && currentLine && currentLine.points && currentLine.points.length > 1) {
      addAnnotation(currentLine);
    }
    setIsDrawing(false);
    setCurrentLine(null);
    
    if (shapeStart && tool === "shape") {
      const w = coords.x - shapeStart.x;
      const h = coords.y - shapeStart.y;
      if (Math.abs(w) > 5 || Math.abs(h) > 5) {
        addAnnotation({
          type: "shape",
          shape: selectedShape,
          color: lineColor,
          width: lineWidth,
          fill: fillShape,
          x: Math.min(shapeStart.x, coords.x),
          y: Math.min(shapeStart.y, coords.y),
          w: Math.abs(w),
          h: Math.abs(h)
        });
      }
      setShapeStart(null);
    }
    
    // Finish straight line
    if (straightLineStart && tool === "straightline") {
      const dist = Math.sqrt(
        (coords.x - straightLineStart.x) ** 2 + 
        (coords.y - straightLineStart.y) ** 2
      );
      if (dist > 10) {
        addAnnotation({
          type: "straightline",
          color: lineColor,
          width: lineWidth,
          startX: straightLineStart.x,
          startY: straightLineStart.y,
          endX: coords.x,
          endY: coords.y
        });
      }
      setStraightLineStart(null);
    }
  };
  
  // Finish polyline (double-click or button)
  const finishPolyline = () => {
    if (polylinePoints.length >= 2) {
      addAnnotation({
        type: "polyline",
        color: lineColor,
        width: lineWidth,
        points: [...polylinePoints]
      });
    }
    setPolylinePoints([]);
  };
  
  // Cancel polyline
  const cancelPolyline = () => {
    setPolylinePoints([]);
  };
  
  // Handle double-click to finish polyline
  const handleDoubleClick = (e) => {
    if (tool === "polyline" && polylinePoints.length >= 2) {
      finishPolyline();
    }
  };

  const saveHistory = () => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...annotations]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const addAnnotation = (ann) => {
    const newAnnotations = [...annotations, ann];
    setAnnotations(newAnnotations);
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const deleteSelectedAnnotation = useCallback(() => {
    if (selectedAnnotation !== null) {
      const newAnnotations = annotations.filter((_, i) => i !== selectedAnnotation);
      setAnnotations(newAnnotations);
      setSelectedAnnotation(null);
      // Save history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newAnnotations);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [selectedAnnotation, annotations, history, historyIndex]);
  
  // Handle keyboard events for delete and other shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedAnnotation !== null && tool === "select") {
        e.preventDefault();
        deleteSelectedAnnotation();
      }
    } else if (e.key === "Escape") {
      setSelectedAnnotation(null);
      setPolylinePoints([]);
      setStraightLineStart(null);
    }
  }, [selectedAnnotation, tool, deleteSelectedAnnotation]);
  
  // Add keyboard event listener when editor is open
  useEffect(() => {
    if (editorOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [editorOpen, handleKeyDown]);

  const resizeSelectedMarker = (newSize) => {
    if (selectedAnnotation !== null && annotations[selectedAnnotation]?.type === "marker") {
      const newAnnotations = [...annotations];
      newAnnotations[selectedAnnotation].size = newSize;
      setAnnotations(newAnnotations);
    }
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1] || []);
      setSelectedAnnotation(null);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setAnnotations([]);
      setSelectedAnnotation(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  };

  const clearAnnotations = () => {
    setAnnotations([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedAnnotation(null);
  };

  // Resize selected label
  const resizeSelectedLabel = (newSize) => {
    if (selectedAnnotation !== null && annotations[selectedAnnotation]?.type === "label") {
      const newAnnotations = [...annotations];
      newAnnotations[selectedAnnotation] = {
        ...newAnnotations[selectedAnnotation],
        fontSize: newSize
      };
      setAnnotations(newAnnotations);
    }
  };

  // Resize selected text
  const resizeSelectedText = (newSize) => {
    if (selectedAnnotation !== null && annotations[selectedAnnotation]?.type === "text") {
      const newAnnotations = [...annotations];
      newAnnotations[selectedAnnotation] = {
        ...newAnnotations[selectedAnnotation],
        fontSize: newSize
      };
      setAnnotations(newAnnotations);
    }
  };

  // Change color of selected text
  const changeSelectedTextColor = (newColor) => {
    if (selectedAnnotation !== null && annotations[selectedAnnotation]?.type === "text") {
      const newAnnotations = [...annotations];
      newAnnotations[selectedAnnotation] = {
        ...newAnnotations[selectedAnnotation],
        color: newColor
      };
      setAnnotations(newAnnotations);
    }
  };

  // Resize selected icon
  const resizeSelectedIcon = (newSize) => {
    if (selectedAnnotation !== null && annotations[selectedAnnotation]?.type === "icon") {
      const newAnnotations = [...annotations];
      newAnnotations[selectedAnnotation] = {
        ...newAnnotations[selectedAnnotation],
        size: newSize
      };
      setAnnotations(newAnnotations);
    }
  };

  // Change color of selected icon
  const changeSelectedIconColor = (newColor) => {
    if (selectedAnnotation !== null && annotations[selectedAnnotation]?.type === "icon") {
      const newAnnotations = [...annotations];
      newAnnotations[selectedAnnotation] = {
        ...newAnnotations[selectedAnnotation],
        color: newColor
      };
      setAnnotations(newAnnotations);
    }
  };

  const saveMarkup = async () => {
    if (!canvasRef.current) return;
    
    try {
      setSelectedAnnotation(null);
      setTimeout(async () => {
        redrawCanvas();
        const canvas = canvasRef.current;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
        
        const fd = new FormData();
        fd.append("file", blob, `markup_${Date.now()}.jpg`);
        const res = await axios.post("/upload-photo", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        
        const newPhotos = [...photoArray];
        if (currentPhotoIndex >= 0) {
          newPhotos[currentPhotoIndex] = res.data.url;
        } else {
          newPhotos.push(res.data.url);
        }
        onChange(newPhotos);
        
        toast.success("Markup saved!");
        setEditorOpen(false);
        setAnnotations([]);
        setHistory([]);
        setHistoryIndex(-1);
      }, 100);
    } catch (err) {
      toast.error("Failed to save markup");
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setUploading(true);
    const newPhotos = [...photoArray];
    
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 25MB)`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await axios.post("/upload-photo", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        newPhotos.push(res.data.url);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    
    onChange(newPhotos);
    setUploading(false);
    if (e.target) e.target.value = "";
  };

  const removePhoto = (index) => {
    const newPhotos = photoArray.filter((_, i) => i !== index);
    onChange(newPhotos);
  };

  const openEditor = (photo, index) => {
    const photoUrl = getPhotoUrl(photo);
    setCurrentPhoto(photoUrl);
    setCurrentPhotoIndex(index);
    setAnnotations([]);
    setHistory([]);
    setHistoryIndex(-1);
    setImageLoaded(false);
    setSelectedAnnotation(null);
    setEditorOpen(true);
  };

  return (
    <div
      className="space-y-3"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-staged-photo")) e.preventDefault(); }}
      onDrop={(e) => {
        const stagedUrl = e.dataTransfer.getData("application/x-staged-photo");
        if (stagedUrl) {
          e.preventDefault();
          e.stopPropagation();
          if (!photoArray.includes(stagedUrl)) {
            onChange([stagedUrl, ...photoArray]);
            window.dispatchEvent(new CustomEvent("staged-photo-assigned", { detail: { url: stagedUrl } }));
            toast.success("Photo assigned");
          }
        }
      }}
    >
      <Label className="text-sm font-mono uppercase text-zinc-600 flex items-center gap-2">
        <Pencil className="w-4 h-4" />
        {label}
      </Label>
      
      {/* Photo grid */}
      <div className="flex flex-wrap gap-3">
        {photoArray.map((photo, idx) => (
          <div key={idx} className="relative group">
            <img
              src={getPhotoUrl(photo)}
              alt=""
              className="w-24 h-24 object-cover rounded-lg border-2 border-zinc-200 cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => openEditor(photo, idx)}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" fill="%23ccc"><rect width="96" height="96"/><text x="48" y="48" text-anchor="middle" dy=".3em" fill="%23666" font-size="10">No Image</text></svg>';
              }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => openEditor(photo, idx)}
              className="absolute bottom-1 right-1 bg-blue-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit markup"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setLightboxPhoto(getPhotoUrl(photo))}
              className="absolute bottom-1 left-1 bg-zinc-800 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="View full size"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        {/* Add photo buttons */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            className="h-12 w-24 border-dashed border-2"
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="h-12 w-24 border-dashed border-2"
            disabled={uploading}
          >
            <Upload className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="w-[98vw] max-w-[1800px] max-h-[95vh] overflow-hidden p-0">
          <DialogHeader className="p-4 border-b bg-zinc-50">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Photo Markup Editor
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex h-[calc(95vh-120px)]">
            {/* Toolbar */}
            <div className="w-64 shrink-0 border-r bg-zinc-50 p-3 space-y-3 overflow-y-auto">
              {/* Tool selection */}
              <div className="space-y-2">
                <Label className="text-xs font-mono">TOOLS</Label>
                <div className="grid grid-cols-5 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "select" ? "default" : "outline"}
                    onClick={() => setTool("select")}
                    className="h-8 p-0"
                    title="Select & Move"
                  >
                    <MousePointer className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "draw" ? "default" : "outline"}
                    onClick={() => setTool("draw")}
                    className="h-8 p-0"
                    title="Freehand Draw"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "straightline" ? "default" : "outline"}
                    onClick={() => setTool("straightline")}
                    className="h-8 p-0"
                    title="Straight Line"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "polyline" ? "default" : "outline"}
                    onClick={() => setTool("polyline")}
                    className="h-8 p-0"
                    title="Multi-Point Line"
                  >
                    <Waypoints className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "shape" ? "default" : "outline"}
                    onClick={() => setTool("shape")}
                    className="h-8 p-0"
                    title="Shapes"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "marker" ? "default" : "outline"}
                    onClick={() => setTool("marker")}
                    className="h-8 p-0"
                    title="Markers"
                  >
                    <Circle className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "label" ? "default" : "outline"}
                    onClick={() => setTool("label")}
                    className="h-8 p-0"
                    title="Insertable Labels"
                  >
                    <GitBranch className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "text" ? "default" : "outline"}
                    onClick={() => setTool("text")}
                    className="h-8 p-0"
                    title="Text"
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "icon" ? "default" : "outline"}
                    onClick={() => setTool("icon")}
                    className="h-8 p-0"
                    title="UG Icons"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "eraser" ? "default" : "outline"}
                    onClick={() => { setTool("eraser"); setSelectedAnnotation(null); }}
                    className={`h-8 p-0 ${tool === "eraser" ? "bg-red-600 hover:bg-red-700" : "text-red-600 hover:bg-red-50"}`}
                    title="Eraser - click an item to erase it"
                    data-testid="eraser-tool-btn"
                  >
                    <Eraser className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {/* Eraser hint */}
              {tool === "eraser" && (
                <div className="space-y-1 p-2 bg-red-50 rounded-lg border border-red-200" data-testid="eraser-hint">
                  <Label className="text-xs font-mono text-red-700">ERASER</Label>
                  <p className="text-xs text-red-600">Tap or click any item (line, shape, marker, text) to erase it.</p>
                </div>
              )}
              
              {/* Polyline controls */}
              {tool === "polyline" && (
                <div className="space-y-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <Label className="text-xs font-mono text-blue-700">MULTI-POINT LINE</Label>
                  <p className="text-xs text-blue-600">Click to add points. Double-click to finish.</p>
                  {polylinePoints.length > 0 && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={finishPolyline}
                        className="flex-1 h-7 text-xs bg-blue-600"
                        disabled={polylinePoints.length < 2}
                      >
                        Finish ({polylinePoints.length} pts)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={cancelPolyline}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Straight line info */}
              {tool === "straightline" && (
                <div className="p-2 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs text-orange-600">Click and drag to draw a straight line.</p>
                </div>
              )}

              {/* Shapes */}
              {tool === "shape" && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono">SHAPES</Label>
                  <div className="grid grid-cols-5 gap-1">
                    {SHAPES.map(s => (
                      <Button
                        key={s.type}
                        type="button"
                        size="sm"
                        variant={selectedShape === s.type ? "default" : "outline"}
                        onClick={() => setSelectedShape(s.type)}
                        className="h-8 p-0"
                        title={s.label}
                      >
                        <s.icon className="w-4 h-4" />
                      </Button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input 
                      type="checkbox" 
                      checked={fillShape} 
                      onChange={(e) => setFillShape(e.target.checked)}
                      className="rounded"
                    />
                    Fill shape
                  </label>
                </div>
              )}

              {/* Colors */}
              <div className="space-y-2">
                <Label className="text-xs font-mono">COLOR</Label>
                <div className="flex flex-wrap gap-1">
                  {LINE_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setLineColor(c.value)}
                      className={`w-6 h-6 rounded border-2 ${lineColor === c.value ? 'border-blue-500 scale-110' : 'border-zinc-300'}`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Line width */}
              {(tool === "draw" || tool === "shape" || tool === "straightline" || tool === "polyline") && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono">LINE WIDTH: {lineWidth}px</Label>
                  <Slider
                    value={[lineWidth]}
                    onValueChange={([v]) => setLineWidth(v)}
                    min={1}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}
              
              {/* Insertable Labels tool */}
              {tool === "label" && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-purple-700">INSERTABLE LABELS</Label>
                  <p className="text-xs text-zinc-500">Select a label, then click on the image to place it.</p>
                  
                  {/* Job Underground Labels */}
                  {undergroundItems.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono text-green-700">UNDERGROUND ({undergroundItems.length})</Label>
                      <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto bg-green-50 p-2 rounded">
                        {undergroundItems.map((item, idx) => {
                          const abbr = item.type?.substring(0, 2).toUpperCase() || "UG";
                          const baseLabel = item.label || `${abbr}-${idx + 1}`;
                          const stationNum = item.stationNumber || "";
                          const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                          return (
                            <button
                              key={item.id || idx}
                              type="button"
                              onClick={() => setTextInput(fullLabel)}
                              className={`p-1.5 text-[10px] font-mono rounded border text-left ${
                                textInput === fullLabel 
                                  ? 'bg-green-200 border-green-500' 
                                  : 'border-green-300 hover:bg-green-100 bg-white'
                              }`}
                              title={`${item.type}: ${fullLabel}`}
                            >
                              <span className="font-bold">{baseLabel}</span>
                              {stationNum && <span className="text-green-700 ml-1">{stationNum}</span>}
                              <span className="text-zinc-400 ml-1">({item.type?.substring(0, 3)})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Job Pole Labels */}
                  {poles.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono text-orange-700">POLES ({poles.length})</Label>
                      <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto bg-orange-50 p-2 rounded">
                        {poles.map((pole, idx) => {
                          const baseLabel = pole.pole_number || `P-${idx + 1}`;
                          const stationNum = pole.stationNumber || "";
                          const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                          return (
                            <button
                              key={pole.id || idx}
                              type="button"
                              onClick={() => setTextInput(fullLabel)}
                              className={`p-1.5 text-[10px] font-mono rounded border text-left ${
                                textInput === fullLabel 
                                  ? 'bg-orange-200 border-orange-500' 
                                  : 'border-orange-300 hover:bg-orange-100 bg-white'
                              }`}
                              title={`Pole: ${fullLabel}`}
                            >
                              <span className="font-bold">{baseLabel}</span>
                              {stationNum && <span className="text-orange-700 ml-1">{stationNum}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Custom label input */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-mono">CUSTOM LABEL</Label>
                    <Input
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Type custom label..."
                      className="text-xs h-8"
                    />
                  </div>
                  
                  {/* Label size */}
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">LABEL SIZE: {labelSize}px</Label>
                    <Slider
                      value={[labelSize]}
                      onValueChange={([v]) => setLabelSize(v)}
                      min={10}
                      max={32}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  
                  {textInput && (
                    <p className="text-xs text-purple-600 bg-purple-50 p-2 rounded">
                      Click on image to place: <strong>{textInput}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Underground markers */}
              {tool === "marker" && (
                <div className="space-y-2">
                  {/* Job-specific underground labels */}
                  {undergroundItems.length > 0 && (
                    <>
                      <Label className="text-xs font-mono text-green-700">JOB UNDERGROUND ({undergroundItems.length})</Label>
                      <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto bg-green-50 p-2 rounded">
                        {undergroundItems.map((item, idx) => {
                          const abbr = item.type?.substring(0, 2).toUpperCase() || "UG";
                          const baseLabel = item.label || `${abbr}-${idx + 1}`;
                          const stationNum = item.stationNumber || "";
                          const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                          return (
                            <button
                              key={item.id || idx}
                              type="button"
                              onClick={() => {
                                setSelectedMarker(fullLabel);
                                setTextInput(fullLabel);
                              }}
                              className={`p-1 text-[10px] font-mono rounded border text-left ${
                                selectedMarker === fullLabel 
                                  ? 'bg-green-200 border-green-500' 
                                  : 'border-green-300 hover:bg-green-100 bg-white'
                              }`}
                              title={`${item.type}: ${fullLabel}`}
                            >
                              <span className="font-bold">{baseLabel}</span>
                              {stationNum && <span className="text-green-700 ml-1">{stationNum}</span>}
                              <span className="text-zinc-400 ml-1">({item.type?.substring(0, 3)})</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  
                  {/* Job-specific pole labels */}
                  {poles.length > 0 && (
                    <>
                      <Label className="text-xs font-mono text-orange-700">JOB POLES ({poles.length})</Label>
                      <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto bg-orange-50 p-2 rounded">
                        {poles.map((pole, idx) => {
                          const baseLabel = pole.pole_number || `P-${idx + 1}`;
                          const stationNum = pole.stationNumber || "";
                          const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                          return (
                            <button
                              key={pole.id || idx}
                              type="button"
                              onClick={() => {
                                setSelectedMarker(fullLabel);
                                setTextInput(fullLabel);
                              }}
                              className={`p-1 text-[10px] font-mono rounded border text-left ${
                                selectedMarker === fullLabel 
                                  ? 'bg-orange-200 border-orange-500' 
                                  : 'border-orange-300 hover:bg-orange-100 bg-white'
                              }`}
                              title={`Pole: ${fullLabel}`}
                            >
                              <span className="font-bold">{baseLabel}</span>
                              {stationNum && <span className="text-orange-700 ml-1">{stationNum}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  
                  <Label className="text-xs font-mono">UG MARKERS</Label>
                  <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
                    {UG_MARKERS.map(m => (
                      <button
                        key={m.type}
                        type="button"
                        onClick={() => setSelectedMarker(m.type)}
                        className={`p-1 text-[10px] font-mono rounded border ${
                          selectedMarker === m.type 
                            ? 'bg-blue-100 border-blue-500' 
                            : 'border-zinc-300 hover:bg-zinc-100'
                        }`}
                        style={{ color: m.color }}
                        title={m.label}
                      >
                        {m.type}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">MARKER SIZE: {markerSize}px</Label>
                    <Slider
                      value={[markerSize]}
                      onValueChange={([v]) => setMarkerSize(v)}
                      min={16}
                      max={48}
                      step={2}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {/* Text input */}
              {tool === "text" && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono">TEXT BOX</Label>
                  <Input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter text..."
                    className="h-8 text-sm"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">FONT SIZE: {fontSize}px</Label>
                    <Slider
                      value={[fontSize]}
                      onValueChange={([v]) => setFontSize(v)}
                      min={10}
                      max={48}
                      step={2}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">TEXT COLOR</Label>
                    <div className="flex gap-1 flex-wrap">
                      {["#18181b", "#dc2626", "#16a34a", "#2563eb", "#9333ea", "#f97316"].map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setTextColor(color)}
                          className={`w-6 h-6 rounded border-2 ${textColor === color ? 'border-blue-500' : 'border-zinc-300'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500">Click on image to place text with white background box</p>
                </div>
              )}
              
              {/* Underground Icons tool */}
              {tool === "icon" && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-green-700">UNDERGROUND ICONS</Label>
                  <p className="text-xs text-zinc-500">Select an icon, then click on the image to place it.</p>
                  
                  <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto bg-zinc-50 p-2 rounded">
                    {UG_MARKERS.map(m => (
                      <button
                        key={m.type}
                        type="button"
                        onClick={() => setSelectedIcon(m.type)}
                        className={`p-2 text-[10px] font-mono rounded border flex flex-col items-center ${
                          selectedIcon === m.type 
                            ? 'bg-green-100 border-green-500' 
                            : 'border-zinc-300 hover:bg-zinc-100 bg-white'
                        }`}
                        title={m.label}
                      >
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold mb-1"
                          style={{ backgroundColor: iconColor }}
                        >
                          {m.type}
                        </div>
                        <span className="text-[8px] text-zinc-500 truncate w-full text-center">{m.label.substring(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">ICON SIZE: {iconSize}px</Label>
                    <Slider
                      value={[iconSize]}
                      onValueChange={([v]) => setIconSize(v)}
                      min={20}
                      max={64}
                      step={2}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">ICON COLOR</Label>
                    <div className="flex gap-1 flex-wrap">
                      {["#16a34a", "#2563eb", "#dc2626", "#f97316", "#9333ea", "#64748b", "#18181b"].map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setIconColor(color)}
                          className={`w-6 h-6 rounded border-2 ${iconColor === color ? 'border-blue-500' : 'border-zinc-300'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {selectedIcon && (
                    <p className="text-xs text-green-600 bg-green-50 p-2 rounded">
                      Click on image to place: <strong>{selectedIcon}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Select tool instructions when nothing selected */}
              {tool === "select" && selectedAnnotation === null && annotations.length > 0 && (
                <div className="space-y-2 p-2 bg-zinc-100 rounded border border-zinc-300">
                  <Label className="text-xs font-mono text-zinc-700">SELECT & EDIT</Label>
                  <p className="text-xs text-zinc-600">Click on any annotation to select it.</p>
                  <p className="text-xs text-zinc-500">• Drag to move</p>
                  <p className="text-xs text-zinc-500">• Press Delete to remove</p>
                  <p className="text-xs text-zinc-500">• Use controls to resize</p>
                </div>
              )}

              {/* Selected annotation controls */}
              {tool === "select" && selectedAnnotation !== null && (
                <div className="space-y-2 p-2 bg-blue-50 rounded">
                  <Label className="text-xs font-mono text-blue-700">SELECTED ITEM</Label>
                  <p className="text-xs text-blue-600">Drag to move • Press Delete to remove</p>
                  {annotations[selectedAnnotation]?.type === "marker" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Marker: {annotations[selectedAnnotation]?.label}</Label>
                      <Label className="text-xs">Resize:</Label>
                      <Slider
                        value={[annotations[selectedAnnotation]?.size || 24]}
                        onValueChange={([v]) => resizeSelectedMarker(v)}
                        min={16}
                        max={48}
                        step={2}
                        className="w-full"
                      />
                    </div>
                  )}
                  {annotations[selectedAnnotation]?.type === "label" && (
                    <div className="space-y-2">
                      <div className="text-xs bg-white p-1 rounded border">
                        <span className="font-bold">{annotations[selectedAnnotation]?.text}</span>
                      </div>
                      <Label className="text-xs">Resize label: {annotations[selectedAnnotation]?.fontSize || 14}px</Label>
                      <Slider
                        value={[annotations[selectedAnnotation]?.fontSize || 14]}
                        onValueChange={([v]) => resizeSelectedLabel(v)}
                        min={10}
                        max={48}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  )}
                  {annotations[selectedAnnotation]?.type === "text" && (
                    <div className="space-y-2">
                      <div className="text-xs bg-white p-1 rounded border">
                        <span className="font-bold">{annotations[selectedAnnotation]?.text}</span>
                      </div>
                      <Label className="text-xs">Resize text: {annotations[selectedAnnotation]?.fontSize || 16}px</Label>
                      <Slider
                        value={[annotations[selectedAnnotation]?.fontSize || 16]}
                        onValueChange={([v]) => resizeSelectedText(v)}
                        min={10}
                        max={48}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  )}
                  {annotations[selectedAnnotation]?.type === "polyline" && (
                    <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
                      <p>Click and drag vertices to edit the line.</p>
                    </div>
                  )}
                  {annotations[selectedAnnotation]?.type === "straightline" && (
                    <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
                      <p>Straight line selected.</p>
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelectedAnnotation}
                    className="w-full h-8"
                    data-testid="delete-selected-annotation-btn"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}

              {/* History controls */}
              <div className="space-y-2">
                <Label className="text-xs font-mono">HISTORY</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={undo}
                    disabled={historyIndex < 0}
                    className="flex-1 h-8"
                  >
                    <Undo className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    className="flex-1 h-8"
                  >
                    <Redo className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={clearAnnotations}
                    className="flex-1 h-8 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Legend toggle */}
              <div className="space-y-2">
                <Label className="text-xs font-mono">LEGEND</Label>
                <Button
                  type="button"
                  size="sm"
                  variant={showLegend ? "default" : "outline"}
                  onClick={() => setShowLegend(!showLegend)}
                  className="w-full h-8"
                  data-testid="toggle-legend-btn"
                >
                  <List className="w-4 h-4 mr-1" />
                  {showLegend ? "Hide Legend" : "Show Legend"}
                </Button>
              </div>

              {/* Save button */}
              <Button
                type="button"
                onClick={saveMarkup}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Markup
              </Button>
            </div>

            {/* Canvas area */}
            <div className="flex-1 relative overflow-hidden">
              <div ref={containerRef} className="absolute inset-0 bg-zinc-900 flex p-4 overflow-auto">
                {!imageLoaded && currentPhoto && (
                  <div className="text-white text-center m-auto">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p>Loading image...</p>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onDoubleClick={handleDoubleClick}
                  onTouchStart={handleMouseDown}
                  onTouchMove={handleMouseMove}
                  onTouchEnd={handleMouseUp}
                  data-testid="markup-canvas"
                  className={`m-auto bg-white shadow-lg ${tool === "select" ? 'cursor-default' : tool === "eraser" ? 'cursor-pointer' : 'cursor-crosshair'} ${!imageLoaded ? 'hidden' : ''}`}
                  style={zoom > 1 && baseFitRef.current
                    ? { width: `${Math.round(baseFitRef.current.w * zoom)}px`, maxWidth: "none", maxHeight: "none", touchAction: "none" }
                    : { maxWidth: "100%", maxHeight: "100%", touchAction: "none" }}
                />
              </div>

              {/* Zoom controls */}
              {imageLoaded && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1 z-10">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => applyZoom((p) => p / 1.5)} data-testid="markup-zoom-out"><ZoomOut className="w-4 h-4" /></Button>
                  <span className="text-[11px] font-mono text-white w-10 text-center" data-testid="markup-zoom-level">{Math.round(zoom * 100)}%</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => applyZoom((p) => p * 1.5)} data-testid="markup-zoom-in"><ZoomIn className="w-4 h-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => applyZoom(1)} data-testid="markup-zoom-reset"><RotateCcw className="w-4 h-4" /></Button>
                </div>
              )}
              
              {/* Legend overlay */}
              {showLegend && imageLoaded && (
                <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-sm border border-zinc-300 rounded-lg shadow-lg p-3 max-w-xs" data-testid="photo-markup-legend">
                  <h4 className="font-mono text-xs font-bold text-zinc-700 mb-2 border-b pb-1">LEGEND</h4>
                  {getLegendItems().length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">No annotations yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {getLegendItems().map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          {item.type === "marker" && (
                            <>
                              <span 
                                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                                style={{ backgroundColor: item.color }}
                              >
                                {item.label.split(" - ")[0]}
                              </span>
                              <span className="text-zinc-700">{item.label.split(" - ")[1]}</span>
                              <span className="text-zinc-400 ml-auto">×{item.count}</span>
                            </>
                          )}
                          {item.type === "shape" && (
                            <>
                              <Square className="w-4 h-4 text-zinc-600" />
                              <span className="text-zinc-700">{item.label}</span>
                              <span className="text-zinc-400 ml-auto">×{item.count}</span>
                            </>
                          )}
                          {item.type === "draw" && (
                            <>
                              <Pencil className="w-4 h-4 text-zinc-600" />
                              <span className="text-zinc-700">{item.label}</span>
                              <span className="text-zinc-400 ml-auto">×{item.count}</span>
                            </>
                          )}
                          {item.type === "text" && (
                            <>
                              <Type className="w-4 h-4 text-zinc-600" />
                              <span className="text-zinc-700">{item.label}</span>
                              <span className="text-zinc-400 ml-auto">×{item.count}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/90">
          {lightboxPhoto && (
            <ZoomableImage src={lightboxPhoto} alt="Photo" className="w-full" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotoMarkupEditor;
