import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Camera, Upload, X, Pencil, Type, Circle, Square, 
  Minus, Undo, Redo, Trash2, Loader2, ZoomIn,
  Save, MousePointer, Move, ArrowRight, Triangle, List
} from "lucide-react";
import { toast } from "sonner";
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

/**
 * PhotoMarkupEditor - In-app photo editor for markup annotations
 * Allows adding lines, markers, shapes, and text notes on photos
 */
export const PhotoMarkupEditor = ({ photos = [], onChange, label = "Mark Ups" }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(-1);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Editor state
  const [tool, setTool] = useState("select"); // select, draw, marker, text, shape
  const [lineColor, setLineColor] = useState("#dc2626");
  const [lineWidth, setLineWidth] = useState(3);
  const [fillShape, setFillShape] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [selectedShape, setSelectedShape] = useState("rectangle");
  const [markerSize, setMarkerSize] = useState(24);
  const [textInput, setTextInput] = useState("");
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
  const imageRef = useRef(null);

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

  // Load image into canvas
  useEffect(() => {
    if (currentPhoto && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        const maxWidth = 800;
        const maxHeight = 600;
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
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        imageRef.current = { img, width, height };
        setImageLoaded(true);
      };
      
      img.onerror = () => {
        console.error("Failed to load image with CORS, trying without...");
        const img2 = new Image();
        img2.onload = () => {
          const maxWidth = 800;
          const maxHeight = 600;
          let width = img2.width;
          let height = img2.height;
          
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img2, 0, 0, width, height);
          imageRef.current = { img: img2, width, height };
          setImageLoaded(true);
        };
        img2.onerror = () => {
          console.error("Failed to load image completely");
          setImageLoaded(false);
        };
        img2.src = currentPhoto;
      };
      
      img.src = currentPhoto;
    }
  }, [currentPhoto]);

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
        ctx.fillStyle = ann.color || "#18181b";
        ctx.font = `bold ${ann.fontSize || 16}px sans-serif`;
        ctx.fillText(ann.text, ann.x, ann.y);
        
        if (isSelected) {
          const metrics = ctx.measureText(ann.text);
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(ann.x - 2, ann.y - (ann.fontSize || 16), metrics.width + 4, (ann.fontSize || 16) + 4);
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
  }, [annotations, currentLine, shapeStart, lineColor, lineWidth, fillShape, selectedShape, selectedAnnotation, tool]);

  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [annotations, currentLine, shapeStart, imageLoaded, redrawCanvas, selectedAnnotation]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Find annotation at position
  const findAnnotationAt = (x, y) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === "marker") {
        const size = ann.size || 24;
        const dist = Math.sqrt((x - ann.x) ** 2 + (y - ann.y) ** 2);
        if (dist <= size / 2) return i;
      } else if (ann.type === "text") {
        const fontSize = ann.fontSize || 16;
        if (x >= ann.x && x <= ann.x + 100 && y >= ann.y - fontSize && y <= ann.y) {
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
    const coords = getCanvasCoords(e);
    
    if (tool === "select") {
      const idx = findAnnotationAt(coords.x, coords.y);
      setSelectedAnnotation(idx >= 0 ? idx : null);
      
      if (idx >= 0) {
        setIsDragging(true);
        const ann = annotations[idx];
        setDragOffset({ x: coords.x - (ann.x || 0), y: coords.y - (ann.y || 0) });
      }
    } else if (tool === "draw") {
      setIsDrawing(true);
      setCurrentLine({ type: "draw", color: lineColor, width: lineWidth, points: [coords] });
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
      }
    } else if (tool === "text" && textInput.trim()) {
      addAnnotation({ 
        type: "text", 
        text: textInput, 
        color: lineColor, 
        x: coords.x, 
        y: coords.y,
        fontSize: fontSize
      });
      setTextInput("");
    } else if (tool === "shape") {
      setShapeStart({ x: coords.x, y: coords.y, endX: coords.x, endY: coords.y });
    }
  };

  const handleMouseMove = (e) => {
    const coords = getCanvasCoords(e);
    
    if (isDragging && selectedAnnotation !== null) {
      const newAnnotations = [...annotations];
      const ann = newAnnotations[selectedAnnotation];
      ann.x = coords.x - dragOffset.x;
      ann.y = coords.y - dragOffset.y;
      setAnnotations(newAnnotations);
    } else if (isDrawing && tool === "draw") {
      setCurrentLine(prev => ({
        ...prev,
        points: [...prev.points, coords]
      }));
    } else if (shapeStart && tool === "shape") {
      setShapeStart(prev => ({ ...prev, endX: coords.x, endY: coords.y }));
    }
  };

  const handleMouseUp = (e) => {
    const coords = getCanvasCoords(e);
    
    if (isDragging) {
      setIsDragging(false);
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

  const deleteSelectedAnnotation = () => {
    if (selectedAnnotation !== null) {
      const newAnnotations = annotations.filter((_, i) => i !== selectedAnnotation);
      setAnnotations(newAnnotations);
      setSelectedAnnotation(null);
      saveHistory();
    }
  };

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
    let photoUrl = photo;
    if (photo && photo.startsWith('/api/')) {
      photoUrl = `${window.location.origin}${photo}`;
    }
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
    <div className="space-y-3">
      <Label className="text-sm font-mono uppercase text-zinc-600 flex items-center gap-2">
        <Pencil className="w-4 h-4" />
        {label}
      </Label>
      
      {/* Photo grid */}
      <div className="flex flex-wrap gap-3">
        {photoArray.map((photo, idx) => (
          <div key={idx} className="relative group">
            <img
              src={photo}
              alt=""
              className="w-24 h-24 object-cover rounded-lg border-2 border-zinc-200 cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => openEditor(photo, idx)}
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
              onClick={() => setLightboxPhoto(photo)}
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
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden p-0">
          <DialogHeader className="p-4 border-b bg-zinc-50">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Photo Markup Editor
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex h-[calc(95vh-120px)]">
            {/* Toolbar */}
            <div className="w-64 border-r bg-zinc-50 p-3 space-y-3 overflow-y-auto">
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
                    title="Draw"
                  >
                    <Pencil className="w-4 h-4" />
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
                    variant={tool === "text" ? "default" : "outline"}
                    onClick={() => setTool("text")}
                    className="h-8 p-0"
                    title="Text"
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </div>
              </div>

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
              {(tool === "draw" || tool === "shape") && (
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

              {/* Underground markers */}
              {tool === "marker" && (
                <div className="space-y-2">
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
                  <Label className="text-xs font-mono">TEXT</Label>
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
                  <p className="text-[10px] text-zinc-500">Click on image to place text</p>
                </div>
              )}

              {/* Selected annotation controls */}
              {tool === "select" && selectedAnnotation !== null && (
                <div className="space-y-2 p-2 bg-blue-50 rounded">
                  <Label className="text-xs font-mono text-blue-700">SELECTED ITEM</Label>
                  {annotations[selectedAnnotation]?.type === "marker" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Resize marker:</Label>
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
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelectedAnnotation}
                    className="w-full h-8"
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
            <div ref={containerRef} className="flex-1 bg-zinc-900 flex items-center justify-center p-4 overflow-auto relative">
              {!imageLoaded && currentPhoto && (
                <div className="text-white text-center">
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
                className={`bg-white shadow-lg ${tool === "select" ? 'cursor-default' : 'cursor-crosshair'} ${!imageLoaded ? 'hidden' : ''}`}
                style={{ maxWidth: "100%", maxHeight: "100%" }}
              />
              
              {/* Legend overlay */}
              {showLegend && imageLoaded && (
                <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-sm border border-zinc-300 rounded-lg shadow-lg p-3 max-w-xs">
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
            <img src={lightboxPhoto} alt="" className="max-h-[80vh] w-auto mx-auto object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotoMarkupEditor;
