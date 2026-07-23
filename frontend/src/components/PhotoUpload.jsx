import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Ruler, Check, ZoomIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OfflinePhoto, queuePhotoOffline } from "@/lib/offlinePhotos";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Photo upload component with camera capture
export const PhotoUpload = ({ label, value, onChange, testId, showHeightTool = false, onHeightMeasured, compact = false }) => {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showHeightDialog, setShowHeightDialog] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
    // Reset input so selecting the same file again re-triggers change
    e.target.value = "";
  };

  const processFile = async (file) => {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Image size must be less than 25MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("/upload-photo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(res.data.url);
    } catch (err) {
      if (!err.response) {
        try {
          const placeholder = await queuePhotoOffline(file);
          onChange(placeholder);
          toast.warning("No signal — photo saved on this device and will upload automatically.");
          return;
        } catch (e2) {
          if (e2?.name === "QuotaExceededError" || `${e2?.message}`.includes("write failed")) {
            toast.error("Device storage is full — free up space to save photos offline.");
            return;
          }
        }
      }
      console.error("Photo upload failed", err);
      toast.error("Photo upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const openHeightTool = () => {
    if (value) {
      setShowHeightDialog(true);
    } else {
      toast.error("Please capture a photo first");
    }
  };

  // Compact mode for inline photo uploads
  if (compact) {
    return (
      <>
        <div className="space-y-1">
          <Label className="text-xs font-mono text-zinc-500">{label}</Label>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            data-testid={`${testId}-file-input`}
          />
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            data-testid={`${testId}-camera-input`}
          />
          {value ? (
            <div className="relative inline-block group">
              <div 
                className="cursor-pointer"
                onClick={() => setShowLightbox(true)}
              >
                <OfflinePhoto src={value} alt={label} className="w-20 h-16 object-cover border border-zinc-300 hover:border-red-500 transition-colors" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-4 h-4 text-white" />
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-1 -right-1 h-4 w-4 bg-red-600 hover:bg-red-700"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
              >
                <X className="w-2 h-2" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button
                type="button"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
                className="h-9 px-2 bg-red-600 hover:bg-red-700 text-white"
                data-testid={`${testId}-camera`}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </Button>
              <Button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border border-zinc-300"
                data-testid={`${testId}-upload`}
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        {/* Lightbox for compact mode */}
        <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
          <DialogContent className="bg-zinc-50 border-zinc-200 max-w-4xl max-h-[90vh] p-2">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
                onClick={() => setShowLightbox(false)}
              >
                <X className="w-5 h-5" />
              </Button>
              <div className="flex flex-col items-center">
                <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2">{label}</p>
                <OfflinePhoto 
                  src={value} 
                  alt={label} 
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
          {label}
        </Label>
        
        {/* Hidden file inputs */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          data-testid={`${testId}-file-input`}
        />
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          data-testid={`${testId}-camera-input`}
        />

        {value ? (
          <div className="space-y-2">
            <div className="relative inline-block group">
              <div 
                className="cursor-pointer"
                onClick={() => setShowLightbox(true)}
              >
                <OfflinePhoto
                  src={value}
                  alt={label}
                  className="w-full max-w-md h-48 object-cover border-2 border-zinc-300 hover:border-red-500 transition-colors"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-8 h-8 text-white" />
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 bg-red-600 hover:bg-red-700"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              className="h-8 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs"
            >
              <Camera className="w-3 h-3 mr-1" />
              Retake
            </Button>
            {showHeightTool && (
              <Button
                type="button"
                size="sm"
                onClick={openHeightTool}
                className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                <Ruler className="w-3 h-3 mr-1" />
                Measure Height
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 h-20 bg-red-600 hover:bg-red-700 text-white border-0"
            data-testid={`${testId}-camera`}
          >
            <div className="flex flex-col items-center gap-1">
              {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
              <span className="text-xs font-mono">{uploading ? "UPLOADING" : "CAMERA"}</span>
            </div>
          </Button>
          <Button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-20 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border border-zinc-300"
            data-testid={`${testId}-upload`}
          >
            <div className="flex flex-col items-center gap-1">
              <Upload className="w-5 h-5" />
              <span className="text-xs">Gallery</span>
            </div>
          </Button>
        </div>
      )}

      {/* Height Measurement Dialog */}
      {showHeightTool && (
        <HeightMeasurementDialog
          open={showHeightDialog}
          onOpenChange={setShowHeightDialog}
          imageSrc={value}
          onHeightMeasured={onHeightMeasured}
        />
      )}
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
        <DialogContent className="bg-zinc-50 border-zinc-200 max-w-4xl max-h-[90vh] p-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setShowLightbox(false)}
            >
              <X className="w-5 h-5" />
            </Button>
            <div className="flex flex-col items-center">
              <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2">{label}</p>
              <OfflinePhoto 
                src={value} 
                alt={label} 
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Styling for the height-tool mode badge
const modeBadgeClass = (mode) => {
  if (mode === "reference") return "bg-green-600 text-white";
  if (mode === "measure") return "bg-red-600 text-white";
  return "bg-zinc-200 text-zinc-600";
};

// Height Measurement Tool
const HeightMeasurementDialog = ({ open, onOpenChange, imageSrc, onHeightMeasured }) => {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [referenceHeight, setReferenceHeight] = useState("6"); // Default 6 feet reference
  const [measuredHeight, setMeasuredHeight] = useState(null);
  const [mode, setMode] = useState("reference"); // "reference" or "measure"
  const [referencePoints, setReferencePoints] = useState([]);

  const handleCanvasClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "reference") {
      if (referencePoints.length < 2) {
        const newPoints = [...referencePoints, { x, y }];
        setReferencePoints(newPoints);
        if (newPoints.length === 2) {
          toast.success("Reference points set! Now mark the attachment height.");
          setMode("measure");
        }
      }
    } else {
      if (points.length < 2) {
        const newPoints = [...points, { x, y }];
        setPoints(newPoints);
        if (newPoints.length === 2 && referencePoints.length === 2) {
          // Calculate height
          const refPixelHeight = Math.abs(referencePoints[1].y - referencePoints[0].y);
          const measurePixelHeight = Math.abs(newPoints[1].y - newPoints[0].y);
          const refHeightFt = parseFloat(referenceHeight);
          const calculated = (measurePixelHeight / refPixelHeight) * refHeightFt;
          setMeasuredHeight(calculated.toFixed(1));
        }
      }
    }
  }, [mode, referencePoints, points, referenceHeight]);

  const resetMeasurement = () => {
    setPoints([]);
    setReferencePoints([]);
    setMeasuredHeight(null);
    setMode("reference");
  };

  const applyMeasurement = () => {
    if (measuredHeight && onHeightMeasured) {
      onHeightMeasured(parseFloat(measuredHeight));
      onOpenChange(false);
      toast.success(`Height set to ${measuredHeight} ft`);
    }
  };

  // Draw on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image aspect ratio
      const maxWidth = 600;
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw reference line (green)
      if (referencePoints.length > 0) {
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        
        referencePoints.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#22c55e";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.fillText(`R${i + 1}`, p.x + 12, p.y + 4);
        });

        if (referencePoints.length === 2) {
          ctx.beginPath();
          ctx.moveTo(referencePoints[0].x, referencePoints[0].y);
          ctx.lineTo(referencePoints[1].x, referencePoints[1].y);
          ctx.stroke();
          
          // Label
          const midY = (referencePoints[0].y + referencePoints[1].y) / 2;
          ctx.fillStyle = "#22c55e";
          ctx.fillText(`${referenceHeight}ft ref`, referencePoints[0].x + 15, midY);
        }
      }

      // Draw measurement line (red)
      if (points.length > 0) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;

        points.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#ef4444";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.fillText(`M${i + 1}`, p.x + 12, p.y + 4);
        });

        if (points.length === 2) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          ctx.lineTo(points[1].x, points[1].y);
          ctx.stroke();

          // Show measurement
          if (measuredHeight) {
            const midY = (points[0].y + points[1].y) / 2;
            ctx.fillStyle = "#ef4444";
            ctx.font = "bold 14px monospace";
            ctx.fillText(`${measuredHeight}ft`, points[0].x + 15, midY);
          }
        }
      }
    };
    img.src = imageSrc;
  }, [imageSrc, referencePoints, points, referenceHeight, measuredHeight]);

  // Effect to handle initial drawing when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(drawCanvas, 100);
    }
  }, [open, drawCanvas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-50 border-zinc-200 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-900 font-heading">Height Measurement Tool</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-zinc-100 p-3 text-sm space-y-2">
            <p className="text-zinc-700">
              <span className="text-green-700 font-bold">Step 1:</span> Set reference height and click two points for a known height (e.g., person = 6ft)
            </p>
            <p className="text-zinc-700">
              <span className="text-red-600 font-bold">Step 2:</span> Click two points to measure the attachment height
            </p>
          </div>

          {/* Reference Height Input */}
          <div className="flex items-center gap-4">
            <Label className="text-xs font-mono text-zinc-500">REFERENCE HEIGHT (ft):</Label>
            <Input
              type="number"
              value={referenceHeight}
              onChange={(e) => setReferenceHeight(e.target.value)}
              className="w-24 h-8 bg-white border-zinc-300 text-zinc-900"
              step="0.5"
            />
            <span className={`text-xs font-mono px-2 py-1 rounded ${modeBadgeClass(mode)}`}>
              {mode === "reference" ? "MARKING REFERENCE" : "MARKING MEASUREMENT"}
            </span>
          </div>

          {/* Canvas */}
          <div className="border border-zinc-300 overflow-hidden">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="cursor-crosshair max-w-full"
              style={{ display: "block" }}
            />
          </div>

          {/* Result */}
          {measuredHeight && (
            <div className="bg-red-600/20 border border-red-500 p-4 text-center">
              <p className="text-xs font-mono text-zinc-600">MEASURED HEIGHT</p>
              <p className="text-4xl font-heading font-black text-red-600">{measuredHeight} ft</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={resetMeasurement}
              className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-900"
            >
              Reset
            </Button>
            {measuredHeight && (
              <Button
                type="button"
                onClick={applyMeasurement}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Apply {measuredHeight}ft
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoUpload;
