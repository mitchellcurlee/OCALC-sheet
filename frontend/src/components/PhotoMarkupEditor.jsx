import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Camera, Upload, X, Pencil, Type, Circle, Square, 
  Minus, Undo, Redo, Download, Trash2, Loader2, ZoomIn,
  Save, MousePointer
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Underground marker types for the editor
const UG_MARKERS = [
  { type: "HH", label: "Handhole", color: "#16a34a" },
  { type: "MH", label: "Manhole", color: "#16a34a" },
  { type: "BE", label: "Brooks Enclosure", color: "#16a34a" },
  { type: "FP", label: "Flowerpot", color: "#16a34a" },
  { type: "HB", label: "Hoffman Box", color: "#16a34a" },
  { type: "PED", label: "Pedestal", color: "#16a34a" },
  { type: "PI", label: "Point of Intersection", color: "#16a34a" },
  { type: "FBT", label: "Fiber Terminal", color: "#16a34a" },
  { type: "NTE", label: "NTE", color: "#16a34a" },
  { type: "MPOE", label: "MPOE", color: "#dc2626" },
  { type: "SOC-S", label: "SOC Start", color: "#16a34a" },
  { type: "SOC-E", label: "SOC End", color: "#16a34a" },
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

/**
 * PhotoMarkupEditor - In-app photo editor for markup annotations
 * Allows adding lines, markers, and text notes on photos
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
  const [tool, setTool] = useState("select"); // select, line, marker, text
  const [lineColor, setLineColor] = useState("#dc2626");
  const [lineWidth, setLineWidth] = useState(3);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [annotations, setAnnotations] = useState([]); // Array of {type, data}
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef(null);

  const photoArray = Array.isArray(photos) ? photos : (photos ? [photos] : []);

  // Load image into canvas
  useEffect(() => {
    if (currentPhoto && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      
      // Try loading with crossOrigin for canvas editing support
      // If CORS fails, we'll still show the image but editing may be limited
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        // Scale to fit container while maintaining aspect ratio
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
        // Try loading without crossOrigin as fallback
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
    
    // Clear and redraw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, width, height);
    
    // Draw all annotations
    annotations.forEach(ann => {
      if (ann.type === "line") {
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.lineCap = "round";
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        ann.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (ann.type === "marker") {
        // Draw marker circle with label
        ctx.beginPath();
        ctx.fillStyle = ann.color;
        ctx.arc(ann.x, ann.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Label
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ann.label, ann.x, ann.y);
      } else if (ann.type === "text") {
        ctx.fillStyle = ann.color || "#18181b";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(ann.text, ann.x, ann.y);
      }
    });
    
    // Draw current line being drawn
    if (currentLine && currentLine.points.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.moveTo(currentLine.points[0].x, currentLine.points[0].y);
      currentLine.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  }, [annotations, currentLine, lineColor, lineWidth]);

  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [annotations, currentLine, imageLoaded, redrawCanvas]);

  // Get canvas coordinates from mouse event
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Mouse handlers for drawing
  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e);
    
    if (tool === "line") {
      setIsDrawing(true);
      setCurrentLine({ type: "line", color: lineColor, width: lineWidth, points: [coords] });
    } else if (tool === "marker" && selectedMarker) {
      const marker = UG_MARKERS.find(m => m.type === selectedMarker);
      if (marker) {
        addAnnotation({ type: "marker", label: marker.type, color: marker.color, x: coords.x, y: coords.y });
      }
    } else if (tool === "text" && textInput.trim()) {
      addAnnotation({ type: "text", text: textInput, color: lineColor, x: coords.x, y: coords.y });
      setTextInput("");
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || tool !== "line") return;
    
    const coords = getCanvasCoords(e);
    setCurrentLine(prev => ({
      ...prev,
      points: [...prev.points, coords]
    }));
  };

  const handleMouseUp = () => {
    if (isDrawing && currentLine && currentLine.points.length > 1) {
      addAnnotation(currentLine);
    }
    setIsDrawing(false);
    setCurrentLine(null);
  };

  // Add annotation with history
  const addAnnotation = (ann) => {
    const newAnnotations = [...annotations, ann];
    setAnnotations(newAnnotations);
    
    // Update history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo/Redo
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1] || []);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setAnnotations([]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  };

  // Clear all annotations
  const clearAnnotations = () => {
    setAnnotations([]);
    setHistory([]);
    setHistoryIndex(-1);
    redrawCanvas();
  };

  // Save marked up photo
  const saveMarkup = async () => {
    if (!canvasRef.current) return;
    
    try {
      // Convert canvas to blob
      const canvas = canvasRef.current;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
      
      // Upload
      const fd = new FormData();
      fd.append("file", blob, `markup_${Date.now()}.jpg`);
      const res = await axios.post("/upload-photo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      // Update photos array - replace current or add new
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
    } catch (err) {
      toast.error("Failed to save markup");
    }
  };

  // File upload handlers
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
    // Ensure full URL for canvas loading
    let photoUrl = photo;
    if (photo && photo.startsWith('/api/')) {
      // Convert relative URL to full URL
      photoUrl = `${window.location.origin}${photo}`;
    }
    setCurrentPhoto(photoUrl);
    setCurrentPhotoIndex(index);
    setAnnotations([]);
    setHistory([]);
    setHistoryIndex(-1);
    setImageLoaded(false);
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
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0">
          <DialogHeader className="p-4 border-b bg-zinc-50">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Photo Markup Editor
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex h-[calc(95vh-120px)]">
            {/* Toolbar */}
            <div className="w-56 border-r bg-zinc-50 p-3 space-y-4 overflow-y-auto">
              {/* Tool selection */}
              <div className="space-y-2">
                <Label className="text-xs font-mono">TOOLS</Label>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "select" ? "default" : "outline"}
                    onClick={() => setTool("select")}
                    className="h-8"
                  >
                    <MousePointer className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "line" ? "default" : "outline"}
                    onClick={() => setTool("line")}
                    className="h-8"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "marker" ? "default" : "outline"}
                    onClick={() => setTool("marker")}
                    className="h-8"
                  >
                    <Circle className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "text" ? "default" : "outline"}
                    onClick={() => setTool("text")}
                    className="h-8"
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Line colors */}
              <div className="space-y-2">
                <Label className="text-xs font-mono">LINE COLOR</Label>
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
              <div className="space-y-2">
                <Label className="text-xs font-mono">LINE WIDTH</Label>
                <div className="flex gap-1">
                  {[2, 3, 5, 8].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setLineWidth(w)}
                      className={`flex-1 h-8 rounded border ${lineWidth === w ? 'bg-blue-100 border-blue-500' : 'border-zinc-300'}`}
                    >
                      <div className="mx-auto rounded-full bg-zinc-800" style={{ width: w * 2, height: w * 2 }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Underground markers */}
              {tool === "marker" && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono">UG MARKERS</Label>
                  <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto">
                    {UG_MARKERS.map(m => (
                      <button
                        key={m.type}
                        type="button"
                        onClick={() => setSelectedMarker(m.type)}
                        className={`p-1 text-[10px] font-mono rounded border ${
                          selectedMarker === m.type 
                            ? 'bg-green-100 border-green-500' 
                            : 'border-zinc-300 hover:bg-zinc-100'
                        }`}
                        style={{ color: m.color }}
                      >
                        {m.type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text input */}
              {tool === "text" && (
                <div className="space-y-2">
                  <Label className="text-xs font-mono">TEXT NOTE</Label>
                  <Input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter text..."
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-zinc-500">Click on image to place text</p>
                </div>
              )}

              {/* Undo/Redo */}
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
            <div ref={containerRef} className="flex-1 bg-zinc-900 flex items-center justify-center p-4 overflow-auto">
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
                className={`bg-white shadow-lg cursor-crosshair ${!imageLoaded ? 'hidden' : ''}`}
                style={{ maxWidth: "100%", maxHeight: "100%" }}
              />
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
