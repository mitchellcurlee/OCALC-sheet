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
import { Camera, Upload, Ruler, Trash2, Check, RotateCcw, Plus } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

// Reference object height options (in feet)
const REFERENCE_HEIGHT_OPTIONS = [4, 5, 6, 7, 8, 10, 12, 14];

/**
 * ReferenceHeightMeasurer - Measure pole attachment heights using a reference object
 * 
 * User places a known-height object (like a 6ft pole) at the base,
 * then marks points on the image to calculate attachment heights.
 */
export const ReferenceHeightMeasurer = ({ onHeightsDetected, buttonVariant = "outline" }) => {
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
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

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

  // Calculate pixels per foot when reference points are set
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
    
    // Set canvas size to match image display size
    const rect = image.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw reference markers
    if (markers.refBottom) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(markers.refBottom.x, markers.refBottom.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("B", markers.refBottom.x, markers.refBottom.y + 4);
    }

    if (markers.refTop) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(markers.refTop.x, markers.refTop.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("T", markers.refTop.x, markers.refTop.y + 4);
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
      ctx.font = "bold 12px Arial";
      ctx.fillText(`${referenceHeight}ft ref`, markers.refBottom.x + 15, midY);
    }

    // Draw attachment markers
    markers.attachments.forEach((att, i) => {
      // Calculate height
      let heightFt = null;
      if (pixelsPerFoot && markers.refBottom) {
        const pixelsFromGround = markers.refBottom.y - att.y;
        heightFt = (pixelsFromGround / pixelsPerFoot).toFixed(1);
      }

      // Marker
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(att.x, att.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(i + 1, att.x, att.y + 4);

      // Height label
      if (heightFt !== null) {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(att.x + 15, att.y - 10, 50, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`${heightFt}ft`, att.x + 20, att.y + 4);
      }
    });
  }, [markers, pixelsPerFoot, referenceHeight, imagePreview]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle canvas click
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
      setMarkers(prev => ({
        ...prev,
        attachments: [...prev.attachments, { x, y }]
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

        // Draw reference line
        if (markers.refBottom && markers.refTop) {
          const bx = markers.refBottom.x * scaleX;
          const by = markers.refBottom.y * scaleY;
          const tx = markers.refTop.x * scaleX;
          const ty = markers.refTop.y * scaleY;

          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 10]);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.setLineDash([]);

          // Reference label
          ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
          const midY = (by + ty) / 2;
          ctx.fillRect(bx + 20, midY - 15, 80, 30);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`${referenceHeight}ft ref`, bx + 60, midY + 5);
        }

        // Draw attachment markers with heights
        markers.attachments.forEach((att, i) => {
          const ax = att.x * scaleX;
          const ay = att.y * scaleY;
          const by = markers.refBottom.y * scaleY;

          // Calculate height
          const pixelsFromGround = by - ay;
          const scaledPixelsPerFoot = pixelsPerFoot * scaleY;
          const heightFt = (pixelsFromGround / scaledPixelsPerFoot).toFixed(1);

          // Draw horizontal line to marker
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, ay);
          ctx.lineTo(ax - 20, ay);
          ctx.stroke();

          // Marker circle
          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.arc(ax, ay, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 14px Arial";
          ctx.textAlign = "center";
          ctx.fillText(i + 1, ax, ay + 5);

          // Height label
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(ax + 20, ay - 15, 70, 30);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`${heightFt}ft`, ax + 55, ay + 5);
        });

        // Title bar
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(0, 0, img.width, 40);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`Height Measurements (${markers.attachments.length} attachment${markers.attachments.length !== 1 ? 's' : ''})`, img.width / 2, 28);

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
      // Calculate heights
      const heights = markers.attachments.map((att, i) => {
        const pixelsFromGround = markers.refBottom.y - att.y;
        const heightFt = parseFloat((pixelsFromGround / pixelsPerFoot).toFixed(1));
        return {
          height_ft: heightFt,
          type: `Attachment ${i + 1}`,
          description: `Measured at ${heightFt}ft using ${referenceHeight}ft reference`,
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
        toast.success(`Applied ${heights.length} measurement(s) to HOA`);
      }

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
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} className="gap-2" data-testid="height-measurer-btn">
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
                {step === 3 && (
                  <>✓ Reference set! Tap each attachment to measure ({markers.attachments.length} marked)</>
                )}
              </div>

              {/* Image with canvas overlay */}
              <div className="relative border border-zinc-300 rounded-lg overflow-hidden bg-zinc-100">
                <img
                  ref={imageRef}
                  src={imagePreview}
                  alt="Pole"
                  className="w-full max-h-96 object-contain"
                  onLoad={drawCanvas}
                />
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="absolute inset-0 w-full h-full cursor-crosshair"
                  style={{ touchAction: 'none' }}
                />
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
                    const pixelsFromGround = markers.refBottom.y - att.y;
                    const heightFt = (pixelsFromGround / pixelsPerFoot).toFixed(1);
                    return (
                      <div key={i} className="p-2 flex justify-between items-center text-sm">
                        <span className="text-zinc-600">Attachment {i + 1}</span>
                        <span className="font-bold text-green-700">{heightFt} ft</span>
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
                      Apply {markers.attachments.length} Measurement{markers.attachments.length !== 1 ? 's' : ''} to HOA
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
