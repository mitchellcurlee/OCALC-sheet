import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Upload, Ruler, Trash2, Check, RotateCcw, Plus, Save, ZoomIn, ZoomOut } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

// Reference object height options (in feet)
const REFERENCE_HEIGHT_OPTIONS = [4, 5, 6, 7, 8, 10, 12, 13, 14];

// Local storage key prefix for auto-save
const STORAGE_KEY_PREFIX = "heightMeasurer_";

// Helper function to convert decimal feet to feet'inches" format
const formatFeetInches = (decimalFeet) => {
  const feet = Math.floor(decimalFeet);
  let inches = Math.round((decimalFeet - feet) * 12);
  if (inches === 12) {
    return `${feet + 1}' 0"`;
  }
  return `${feet}' ${inches}"`;
};

// Helper function to get decimal feet for storage
const toDecimalFeet = (decimalFeet) => {
  // Round to nearest inch for clean conversion
  const feet = Math.floor(decimalFeet);
  const inches = Math.round((decimalFeet - feet) * 12);
  if (inches === 12) {
    return feet + 1;
  }
  return Math.round((feet + inches / 12) * 10000) / 10000;
};

/**
 * ReferenceHeightMeasurer - Measure pole attachment heights using a reference object
 * 
 * User places a known-height object (like a 6ft pole) at the base,
 * then marks points on the image to calculate attachment heights.
 * 
 * Auto-saves progress to localStorage to prevent data loss if app is closed.
 */
export const ReferenceHeightMeasurer = ({ onHeightsDetected, buttonVariant = "outline", sessionId = "default", suggestedPhotos = [], testId = "height-measurer-btn", targetLabel = "HOA", downGuyMode = false, initialGuyCount = 1, preloadUrl = null, onPreloadHandled = null }) => {
  const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
  const [open, setOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [referenceHeight, setReferenceHeight] = useState("6");
  const [step, setStep] = useState(1); // 1: upload, 2: mark reference, 3: mark attachments
  const [markers, setMarkers] = useState({
    refBottom: null,
    refTop: null,
    attachments: []
  });
  const [pixelsPerFoot, setPixelsPerFoot] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [hasRestoredData, setHasRestoredData] = useState(false);
  // Down Guy mode: which field (height/lead) and which down guy the next marker belongs to
  const [measureField, setMeasureField] = useState("height");
  const [activeGuy, setActiveGuy] = useState(0);
  const [guyCount, setGuyCount] = useState(initialGuyCount || 1);

  useEffect(() => {
    if (open && downGuyMode) {
      setGuyCount((c) => Math.max(c, initialGuyCount || 1));
    }
  }, [open, downGuyMode, initialGuyCount]);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const scrollBoxRef = useRef(null);
  const baseSizeRef = useRef(null);
  const pinchRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  const applyZoom = (next, clientX = null, clientY = null) => {
    const el = scrollBoxRef.current;
    setZoom((prev) => {
      const z = Math.min(5, Math.max(1, typeof next === "function" ? next(prev) : next));
      if (prev === 1 && z > 1 && imageRef.current) {
        baseSizeRef.current = { w: imageRef.current.offsetWidth, h: imageRef.current.offsetHeight };
      }
      if (z === 1) baseSizeRef.current = null;
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
    baseSizeRef.current = null;
    pinchRef.current = null;
  }, [imagePreview]);

  // Wheel + pinch zoom on the image area
  useEffect(() => {
    const el = scrollBoxRef.current;
    if (!el) return;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    const onWheel = (e) => { e.preventDefault(); applyZoom((p) => p * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); };
    const onTouchStart = (e) => { if (e.touches.length === 2) pinchRef.current = dist(e.touches); };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = dist(e.touches);
        const [mx, my] = mid(e.touches);
        if (pinchRef.current > 0) applyZoom((p) => p * (d / pinchRef.current), mx, my);
        pinchRef.current = d;
      }
    };
    const onTouchEnd = (e) => { if (e.touches.length < 2) pinchRef.current = null; };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [step, imagePreview]);

  // Auto-save to localStorage whenever state changes
  useEffect(() => {
    if (!imageBase64) return; // Don't save empty state
    
    const saveData = {
      imageBase64,
      imagePreview,
      referenceHeight,
      step,
      markers,
      pixelsPerFoot,
      savedAt: Date.now()
    };
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(saveData));
      console.log('[HeightMeasurer] Auto-saved progress');
    } catch (e) {
      console.warn('[HeightMeasurer] Failed to auto-save:', e);
    }
  }, [imageBase64, markers, step, referenceHeight, pixelsPerFoot, storageKey, imagePreview]);

  // Restore from localStorage when dialog opens
  useEffect(() => {
    if (open && !hasRestoredData) {
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const data = JSON.parse(savedData);
          // Only restore if saved within last 24 hours
          const hoursSinceSave = (Date.now() - data.savedAt) / (1000 * 60 * 60);
          if (hoursSinceSave < 24) {
            setImageBase64(data.imageBase64);
            setImagePreview(data.imagePreview);
            setReferenceHeight(data.referenceHeight || "6");
            setStep(data.step || 1);
            setMarkers(data.markers || { refBottom: null, refTop: null, attachments: [] });
            setPixelsPerFoot(data.pixelsPerFoot);
            setHasRestoredData(true);
            toast.success("Previous session restored!", { duration: 2000 });
          }
        }
      } catch (e) {
        console.warn('[HeightMeasurer] Failed to restore saved data:', e);
      }
    }
  }, [open, storageKey, hasRestoredData]);

  // Clear saved data when successfully completed
  const clearSavedData = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      console.log('[HeightMeasurer] Cleared saved data');
    } catch (e) {
      console.warn('[HeightMeasurer] Failed to clear saved data:', e);
    }
  }, [storageKey]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl);
      setStep(2);
      setMarkers({ refBottom: null, refTop: null, attachments: [] });
      setPixelsPerFoot(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Load one of the pole's existing photos (e.g. OCALC L/M/R) into the measurer.
  // stayOnStep1 keeps the reference-height dropdown visible (assigned-photo flow).
  const loadSuggestedPhoto = async (url, stayOnStep1 = false) => {
    try {
      let dataUrl = url;
      if (!url.startsWith("data:")) {
        const resp = await fetch(url);
        const blob = await resp.blob();
        dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = (ev) => resolve(ev.target.result);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      }
      setImagePreview(dataUrl);
      setImageBase64(dataUrl);
      setStep(stayOnStep1 ? 1 : 2);
      setMarkers({ refBottom: null, refTop: null, attachments: [] });
      setPixelsPerFoot(null);
    } catch {
      toast.error("Could not load that photo");
    }
  };

  // Calculate pixels per foot when reference points are set
  useEffect(() => {
    if (preloadUrl) {
      setHasRestoredData(true);
      setOpen(true);
      loadSuggestedPhoto(preloadUrl, true);
      onPreloadHandled && onPreloadHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadUrl]);

  useEffect(() => {
    if (markers.refBottom && markers.refTop) {
      const pixelDistance = Math.abs(markers.refTop.y - markers.refBottom.y);
      const refHeightFt = parseFloat(referenceHeight);
      setPixelsPerFoot(pixelDistance / refHeightFt);
      setStep(3);
    }
  }, [markers.refBottom, markers.refTop, referenceHeight]);

  // Draw markers on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imagePreview) return;

    const ctx = canvas.getContext("2d");
    
    // Set canvas size to the image LAYOUT size (invariant under CSS zoom transform)
    canvas.width = image.offsetWidth;
    canvas.height = image.offsetHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw reference markers
    if (markers.refBottom) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(markers.refBottom.x, markers.refBottom.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px Arial";
      ctx.textAlign = "center";
      ctx.fillText("B", markers.refBottom.x, markers.refBottom.y + 3);
    }

    if (markers.refTop) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(markers.refTop.x, markers.refTop.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px Arial";
      ctx.textAlign = "center";
      ctx.fillText("T", markers.refTop.x, markers.refTop.y + 3);
    }

    // Draw reference line
    if (markers.refBottom && markers.refTop) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(markers.refBottom.x, markers.refBottom.y);
      ctx.lineTo(markers.refTop.x, markers.refTop.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      const midY = (markers.refBottom.y + markers.refTop.y) / 2;
      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`${referenceHeight}ft ref`, markers.refBottom.x + 10, midY);
    }

    // Draw attachment markers (small numbered dots)
    markers.attachments.forEach((att, i) => {
      ctx.fillStyle = att.field === "lead" ? "#f97316" : "#22c55e";
      ctx.beginPath();
      ctx.arc(att.x, att.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText(i + 1, att.x, att.y + 2.5);
    });

    // Numbered heights listed off to the side (top-right of the picture)
    if (markers.attachments.length > 0 && pixelsPerFoot && markers.refBottom) {
      const lw = downGuyMode ? 128 : 88;
      const lh = 16;
      const lx = canvas.width - lw - 6;
      let ly = 6;
      markers.attachments.forEach((att, i) => {
        const val = att.field === "lead"
          ? Math.abs(att.x - markers.refBottom.x) / pixelsPerFoot
          : (markers.refBottom.y - att.y) / pixelsPerFoot;
        const valDisplay = formatFeetInches(val);
        const lbl = downGuyMode
          ? `${i + 1}: DG${(att.guy ?? 0) + 1} ${att.field === "lead" ? "Lead" : "Ht"} ${valDisplay}`
          : `${i + 1}: ${valDisplay}`;
        ctx.fillStyle = att.field === "lead" ? "rgba(249, 115, 22, 0.92)" : "rgba(34, 197, 94, 0.92)";
        ctx.fillRect(lx, ly, lw, lh);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "left";
        ctx.fillText(lbl, lx + 5, ly + 11.5);
        ly += lh + 3;
      });
    }
  }, [markers, pixelsPerFoot, referenceHeight, imagePreview, downGuyMode]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Click-drag pans the (zoomed) picture; a plain click places a marker
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const onCanvasMouseDown = (e) => {
    const el = scrollBoxRef.current;
    if (!el || e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
  };
  const onCanvasMouseMove = (e) => {
    const d = dragRef.current;
    const el = scrollBoxRef.current;
    if (!d || !el || e.buttons !== 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      el.scrollLeft = d.sl - dx;
      el.scrollTop = d.st - dy;
    }
  };
  const onCanvasMouseUp = () => {
    if (dragRef.current?.moved) suppressClickRef.current = true;
    dragRef.current = null;
  };

  // Handle canvas click
  const handleCanvasClick = (e) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Rect is scaled by the CSS zoom transform; convert back to layout coords
    const scale = canvas.width ? rect.width / canvas.width : 1;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (step === 2) {
      // Marking reference points
      if (!markers.refBottom) {
        setMarkers(prev => ({ ...prev, refBottom: { x, y } }));
        toast.info("Now tap the TOP of your reference object");
      } else if (!markers.refTop) {
        setMarkers(prev => ({ ...prev, refTop: { x, y } }));
        toast.success("Reference set! Now tap each attachment to measure");
      }
    } else if (step === 3) {
      // Marking attachments
      const meta = downGuyMode ? { field: measureField, guy: activeGuy } : {};
      setMarkers(prev => ({
        ...prev,
        attachments: [...prev.attachments, { x, y, ...meta }]
      }));
    }
  };

  // Remove last attachment marker
  const removeLastAttachment = () => {
    setMarkers(prev => ({
      ...prev,
      attachments: prev.attachments.slice(0, -1)
    }));
  };

  // Reset all markers
  const resetMarkers = () => {
    setMarkers({ refBottom: null, refTop: null, attachments: [] });
    setPixelsPerFoot(null);
    setStep(2);
  };

  // Create annotated image
  const createAnnotatedImage = () => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Scale factor (canvas display size vs actual image size)
        const displayCanvas = canvasRef.current;
        const scaleX = img.width / displayCanvas.width;
        const scaleY = img.height / displayCanvas.height;

        // Annotation size scale — keeps text/markers readable on high-res photos
        const s = Math.max(1, Math.max(img.width, img.height) / 1000);

        // Draw reference line
        if (markers.refBottom && markers.refTop) {
          const bx = markers.refBottom.x * scaleX;
          const by = markers.refBottom.y * scaleY;
          const tx = markers.refTop.x * scaleX;
          const ty = markers.refTop.y * scaleY;

          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 4 * s;
          ctx.setLineDash([10 * s, 10 * s]);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.setLineDash([]);

          // Reference label
          ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
          const midY = (by + ty) / 2;
          ctx.fillRect(bx + 20 * s, midY - 15 * s, 90 * s, 30 * s);
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(16 * s)}px Arial`;
          ctx.textAlign = "center";
          ctx.fillText(`${referenceHeight}ft ref`, bx + 65 * s, midY + 5 * s);
        }

        // Draw attachment markers (small numbered dots with guide lines)
        markers.attachments.forEach((att, i) => {
          const ax = att.x * scaleX;
          const ay = att.y * scaleY;
          const color = att.field === "lead" ? "#f97316" : "#22c55e";

          if (att.field === "lead" && markers.refBottom) {
            // Lead: line from pole base to the marked anchor point
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 * s;
            ctx.beginPath();
            ctx.moveTo(markers.refBottom.x * scaleX, markers.refBottom.y * scaleY);
            ctx.lineTo(ax, ay);
            ctx.stroke();
          } else {
            // Height: horizontal line to marker
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 * s;
            ctx.beginPath();
            ctx.moveTo(0, ay);
            ctx.lineTo(ax - 8 * s, ay);
            ctx.stroke();
          }

          // Marker circle (small)
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(ax, ay, 6 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 * s;
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(8 * s)}px Arial`;
          ctx.textAlign = "center";
          ctx.fillText(i + 1, ax, ay + 3 * s);
        });

        // Numbered heights listed off to the side (top-right)
        if (markers.attachments.length > 0) {
          const lw = (downGuyMode ? 220 : 150) * s;
          const lh = 32 * s;
          const lx = img.width - lw - 10 * s;
          let ly = 50 * s;
          markers.attachments.forEach((att, i) => {
            const val = att.field === "lead"
              ? Math.abs(att.x - markers.refBottom.x) / pixelsPerFoot
              : (markers.refBottom.y - att.y) / pixelsPerFoot;
            const valDisplay = formatFeetInches(val);
            const lbl = downGuyMode
              ? `${i + 1}: DG${(att.guy ?? 0) + 1} ${att.field === "lead" ? "Lead" : "Ht"} ${valDisplay}`
              : `${i + 1}: ${valDisplay}`;
            ctx.fillStyle = att.field === "lead" ? "rgba(249, 115, 22, 0.92)" : "rgba(34, 197, 94, 0.92)";
            ctx.fillRect(lx, ly, lw, lh);
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.round(18 * s)}px Arial`;
            ctx.textAlign = "left";
            ctx.fillText(lbl, lx + 8 * s, ly + 22 * s);
            ly += lh + 6 * s;
          });
        }

        // Title bar
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(0, 0, img.width, 40 * s);
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(18 * s)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(`Height Measurements (${markers.attachments.length} attachment${markers.attachments.length !== 1 ? 's' : ''})`, img.width / 2, 28 * s);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = imageBase64;
    });
  };

  // Upload annotated image
  const uploadAnnotatedImage = async (annotatedDataUrl) => {
    const response = await fetch(annotatedDataUrl);
    const blob = await response.blob();
    const formData = new FormData();
    formData.append("file", blob, `height-measurement-${Date.now()}.jpg`);
    const uploadResponse = await axios.post("/upload-photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return uploadResponse.data.url;
  };

  // Apply measurements
  const handleApply = async () => {
    if (markers.attachments.length === 0) {
      toast.error("Please mark at least one attachment");
      return;
    }

    setUploading(true);
    try {
      // Calculate heights with proper feet/inches conversion
      const heights = markers.attachments.map((att, i) => {
        const rawVal = att.field === "lead"
          ? Math.abs(att.x - markers.refBottom.x) / pixelsPerFoot
          : (markers.refBottom.y - att.y) / pixelsPerFoot;
        const heightFt = toDecimalFeet(rawVal); // Rounds to nearest inch
        return {
          height_ft: heightFt,
          field: att.field || "height",
          guyIndex: att.guy ?? 0,
          type: `Attachment ${i + 1}`,
          description: "",
          confidence: "high"
        };
      });

      // Create and upload annotated image
      toast.info("Creating measurement image...");
      const annotatedImage = await createAnnotatedImage();
      const photoUrl = await uploadAnnotatedImage(annotatedImage);
      toast.success("Image uploaded!");

      // Add photo to first attachment
      const heightsWithPhoto = heights.map((h, idx) => ({
        ...h,
        photo: idx === 0 ? photoUrl : ""
      }));

      if (onHeightsDetected) {
        onHeightsDetected(heightsWithPhoto);
        toast.success(`Applied ${heights.length} measurement(s) to ${targetLabel}`);
      }

      // Clear saved data after successful completion
      clearSavedData();
      setHasRestoredData(false);
      setOpen(false);
    } catch (err) {
      console.error("Failed to apply measurements:", err);
      toast.error("Failed to save measurements");
    } finally {
      setUploading(false);
    }
  };

  const resetState = () => {
    setImagePreview(null);
    setImageBase64(null);
    setStep(1);
    setMarkers({ refBottom: null, refTop: null, attachments: [] });
    setPixelsPerFoot(null);
    setMeasureField("height");
    setActiveGuy(0);
    clearSavedData();
    setHasRestoredData(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} className="gap-2" data-testid={testId}>
          <Ruler className="w-4 h-4" />
          Measure Heights
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-blue-600" />
            Reference Height Measurement
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            Use a reference object to accurately measure attachment heights.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">How to use:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>Place a measuring stick or known-height object at pole base</li>
              <li>Take a photo showing the reference object and attachments</li>
              <li>Tap the BOTTOM then TOP of your reference object</li>
              <li>Tap each attachment to measure its height</li>
            </ol>
          </div>

          {/* Step 1: Photo capture */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Reference Object Height</Label>
                <Select value={referenceHeight} onValueChange={setReferenceHeight}>
                  <SelectTrigger className="h-10 bg-white border-zinc-300">
                    <SelectValue placeholder="Select height" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    {REFERENCE_HEIGHT_OPTIONS.map((h) => (
                      <SelectItem key={h} value={h.toString()}>{h} ft</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500">
                  Common options: 6ft measuring pole, 5ft fence, etc.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Pole Photo</Label>
                <div className="flex gap-2">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 h-12"
                    data-testid="capture-photo-btn"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 h-12"
                    data-testid="upload-photo-btn"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Photo
                  </Button>
                </div>
                {imagePreview && (
                  <div className="flex items-center gap-3 p-2 bg-sky-50 border border-sky-200 rounded" data-testid="measurer-preloaded-photo">
                    <img src={imagePreview} alt="Selected" className="w-20 h-16 object-cover border border-sky-300 rounded" />
                    <div className="flex-1 text-xs text-sky-800">Photo loaded. Pick the reference object height above, then continue.</div>
                    <Button
                      type="button"
                      onClick={() => setStep(2)}
                      className="h-10 bg-sky-600 hover:bg-sky-700 text-white"
                      data-testid="measurer-continue-btn"
                    >
                      Continue
                    </Button>
                  </div>
                )}
                {suggestedPhotos.length > 0 && (
                  <div className="space-y-1.5 pt-1" data-testid="measurer-suggested-photos">
                    <Label className="text-xs text-zinc-500">Or use a photo already on this pole:</Label>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPhotos.map((sp, i) => (
                        <button
                          key={`${sp.url}-${i}`}
                          type="button"
                          onClick={() => loadSuggestedPhoto(sp.url)}
                          className="group text-center"
                          data-testid={`measurer-suggested-${i}`}
                        >
                          <img src={sp.url} alt={sp.label} className="w-20 h-16 object-cover border-2 border-zinc-300 rounded group-hover:border-sky-500 transition-colors" />
                          <span className="block text-[10px] text-zinc-500 mt-0.5">{sp.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Steps 2 & 3: Marking on image */}
          {(step === 2 || step === 3) && imagePreview && (
            <div className="space-y-4">
              {/* Status bar */}
              <div className={`p-3 rounded-lg text-sm font-medium ${
                step === 2 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>
                {step === 2 && !markers.refBottom && (
                  <>📍 Step 1: Tap the BOTTOM of your {referenceHeight}ft reference object</>
                )}
                {step === 2 && markers.refBottom && !markers.refTop && (
                  <>📍 Step 2: Now tap the TOP of your reference object</>
                )}
                {step === 3 && !downGuyMode && (
                  <>✓ Reference set! Tap each attachment to measure ({markers.attachments.length} marked)</>
                )}
                {step === 3 && downGuyMode && (
                  <>✓ Reference set! Tap to mark <b>{measureField === "lead" ? "Lead" : "Height"}</b> for <b>Down Guy {activeGuy + 1}</b> ({markers.attachments.length} marked)</>
                )}
              </div>

              {/* Down Guy mode: Height/Lead tabs + down guy selector */}
              {step === 3 && downGuyMode && (
                <div className="space-y-2" data-testid="measurer-dg-controls">
                  <div className="flex rounded-lg overflow-hidden border border-zinc-300 w-fit">
                    <button
                      type="button"
                      onClick={() => setMeasureField("height")}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${measureField === "height" ? "bg-green-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"}`}
                      data-testid="measurer-tab-height"
                    >
                      Height
                    </button>
                    <button
                      type="button"
                      onClick={() => setMeasureField("lead")}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${measureField === "lead" ? "bg-orange-500 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"}`}
                      data-testid="measurer-tab-lead"
                    >
                      Lead
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-500 mr-1">Down Guy:</span>
                    {Array.from({ length: guyCount }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveGuy(i)}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors ${activeGuy === i ? "bg-yellow-500 border-yellow-600 text-white font-semibold" : "bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-100"}`}
                        data-testid={`measurer-dg-${i}`}
                      >
                        DG {i + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setGuyCount((c) => c + 1); setActiveGuy(guyCount); }}
                      className="px-2.5 py-1 text-sm rounded-full border border-dashed border-zinc-400 text-zinc-600 hover:bg-zinc-100 flex items-center gap-1"
                      data-testid="measurer-add-dg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Down Guy
                    </button>
                  </div>
                </div>
              )}

              {/* Zoom controls */}
              <div className="flex items-center justify-end gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => applyZoom((p) => p / 1.5)} data-testid="measurer-zoom-out"><ZoomOut className="w-4 h-4" /></Button>
                <span className="text-xs font-mono text-zinc-600 w-11 text-center" data-testid="measurer-zoom-level">{Math.round(zoom * 100)}%</span>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => applyZoom((p) => p * 1.5)} data-testid="measurer-zoom-in"><ZoomIn className="w-4 h-4" /></Button>
                {zoom > 1 && (
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-zinc-600" onClick={() => applyZoom(1)} data-testid="measurer-zoom-reset"><RotateCcw className="w-4 h-4" /></Button>
                )}
              </div>

              {/* Image with canvas overlay (zoom via CSS transform; marker coords stay in layout px) */}
              <div ref={scrollBoxRef} className="border border-zinc-300 rounded-lg overflow-auto bg-zinc-100 max-h-[75vh]">
                <div style={zoom > 1 && baseSizeRef.current ? { width: baseSizeRef.current.w * zoom, height: baseSizeRef.current.h * zoom } : undefined}>
                  <div className="relative" style={zoom > 1 && baseSizeRef.current ? { transform: `scale(${zoom})`, transformOrigin: "top left", width: baseSizeRef.current.w } : undefined}>
                    <img
                      ref={imageRef}
                      src={imagePreview}
                      alt="Pole"
                      className="w-full max-h-[70vh] object-contain"
                      onLoad={drawCanvas}
                    />
                    <canvas
                      ref={canvasRef}
                      onClick={handleCanvasClick}
                      onMouseDown={onCanvasMouseDown}
                      onMouseMove={onCanvasMouseMove}
                      onMouseUp={onCanvasMouseUp}
                      onMouseLeave={onCanvasMouseUp}
                      className="absolute inset-0 w-full h-full cursor-crosshair"
                      style={{ touchAction: zoom > 1 ? "pan-x pan-y" : "manipulation" }}
                    />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-2 flex-wrap">
                {markers.attachments.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeLastAttachment}
                    className="text-amber-600 border-amber-300"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove Last
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetMarkers}
                  className="text-zinc-600"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Reset All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { resetState(); }}
                  className="text-zinc-600"
                >
                  <Camera className="w-4 h-4 mr-1" />
                  New Photo
                </Button>
              </div>

              {/* Measurements summary */}
              {markers.attachments.length > 0 && pixelsPerFoot && (
                <div className="border border-zinc-200 rounded-lg divide-y">
                  <div className="p-2 bg-zinc-50 font-medium text-sm text-zinc-700">
                    Measured Heights
                  </div>
                  {markers.attachments.map((att, i) => {
                    const rawVal = att.field === "lead"
                      ? Math.abs(att.x - markers.refBottom.x) / pixelsPerFoot
                      : (markers.refBottom.y - att.y) / pixelsPerFoot;
                    const valDisplay = formatFeetInches(rawVal);
                    return (
                      <div key={i} className="p-2 flex justify-between items-center text-sm">
                        <span className="text-zinc-600">
                          {downGuyMode
                            ? <>Down Guy {(att.guy ?? 0) + 1} — {att.field === "lead" ? "Lead" : "Height"}</>
                            : <>Attachment {i + 1}</>}
                        </span>
                        <span className={`font-bold ${att.field === "lead" ? "text-orange-600" : "text-green-700"}`}>{valDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Apply button */}
              {step === 3 && markers.attachments.length > 0 && (
                <Button
                  onClick={handleApply}
                  disabled={uploading}
                  className="w-full h-12 bg-green-600 hover:bg-green-700"
                  data-testid="apply-measurements-btn"
                >
                  {uploading ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Apply {markers.attachments.length} Measurement{markers.attachments.length !== 1 ? 's' : ''} to {targetLabel}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferenceHeightMeasurer;
