import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Ruler, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Photo upload component with camera capture
export const PhotoUpload = ({ label, value, onChange, testId, showHeightTool = false, onHeightMeasured }) => {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showHeightDialog, setShowHeightDialog] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size must be less than 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  const openHeightTool = () => {
    if (value) {
      setShowHeightDialog(true);
    } else {
      toast.error("Please capture a photo first");
    }
  };

  return (
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
          <div className="relative inline-block">
            <img
              src={value}
              alt={label}
              className="w-full max-w-xs h-32 object-cover border-2 border-zinc-700"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 bg-red-600 hover:bg-red-700"
              onClick={() => onChange("")}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              className="h-8 bg-zinc-800 hover:bg-zinc-700 text-white text-xs"
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
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 h-20 bg-red-600 hover:bg-red-700 text-white border-0"
            data-testid={`${testId}-camera`}
          >
            <div className="flex flex-col items-center gap-1">
              <Camera className="w-6 h-6" />
              <span className="text-xs font-mono">CAMERA</span>
            </div>
          </Button>
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-20 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700"
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
  );
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

  // Redraw when state changes
  useState(() => {
    if (open) {
      setTimeout(drawCanvas, 100);
    }
  });

  // Effect to redraw
  if (open && canvasRef.current) {
    setTimeout(drawCanvas, 50);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white font-heading">Height Measurement Tool</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-zinc-800 p-3 text-sm space-y-2">
            <p className="text-zinc-300">
              <span className="text-green-400 font-bold">Step 1:</span> Set reference height and click two points for a known height (e.g., person = 6ft)
            </p>
            <p className="text-zinc-300">
              <span className="text-red-400 font-bold">Step 2:</span> Click two points to measure the attachment height
            </p>
          </div>

          {/* Reference Height Input */}
          <div className="flex items-center gap-4">
            <Label className="text-xs font-mono text-zinc-500">REFERENCE HEIGHT (ft):</Label>
            <Input
              type="number"
              value={referenceHeight}
              onChange={(e) => setReferenceHeight(e.target.value)}
              className="w-24 h-8 bg-black border-zinc-700 text-white"
              step="0.5"
            />
            <span className={`text-xs font-mono px-2 py-1 rounded ${mode === "reference" ? "bg-green-600 text-white" : mode === "measure" ? "bg-red-600 text-white" : "bg-zinc-700 text-zinc-400"}`}>
              {mode === "reference" ? "MARKING REFERENCE" : "MARKING MEASUREMENT"}
            </span>
          </div>

          {/* Canvas */}
          <div className="border border-zinc-700 overflow-hidden">
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
              <p className="text-xs font-mono text-zinc-400">MEASURED HEIGHT</p>
              <p className="text-4xl font-heading font-black text-red-500">{measuredHeight} ft</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={resetMeasurement}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white"
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
