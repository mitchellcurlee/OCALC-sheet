import { useState, useRef, useEffect } from "react";
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
import { Camera, Loader2, Upload, Ruler, AlertCircle, CheckCircle2, History, Trash2, Clock } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

// Pole height options: 20-65ft in 5ft increments
const POLE_HEIGHT_OPTIONS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65];

// LocalStorage key for recent analyses
const RECENT_ANALYSES_KEY = "poleHeightAnalyses";
const MAX_RECENT_ANALYSES = 5;

/**
 * PoleHeightAnalyzer - AI-powered pole attachment height estimation
 * 
 * Props:
 * - onHeightsDetected: callback with detected heights array [{type, height_ft, confidence, description}]
 * - buttonVariant: "default" | "outline" | "ghost"
 */
export const PoleHeightAnalyzer = ({ onHeightsDetected, buttonVariant = "outline" }) => {
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [poleHeight, setPoleHeight] = useState("40");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Load recent analyses from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_ANALYSES_KEY);
      if (stored) {
        setRecentAnalyses(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);

  // Save analysis to recent history
  const saveToHistory = (analysisResult, thumbnail) => {
    const newEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      pole_height_ft: analysisResult.pole_height_ft,
      attachments: analysisResult.attachments,
      analysis_notes: analysisResult.analysis_notes,
      thumbnail: thumbnail, // Small preview of the image
    };

    const updated = [newEntry, ...recentAnalyses].slice(0, MAX_RECENT_ANALYSES);
    setRecentAnalyses(updated);
    
    try {
      localStorage.setItem(RECENT_ANALYSES_KEY, JSON.stringify(updated));
    } catch (e) {
      // Ignore localStorage errors
    }
  };

  // Create a small thumbnail from the image
  const createThumbnail = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 80;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = dataUrl;
    });
  };

  // Clear all history
  const clearHistory = () => {
    setRecentAnalyses([]);
    try {
      localStorage.removeItem(RECENT_ANALYSES_KEY);
    } catch (e) {
      // Ignore
    }
    toast.success("History cleared");
  };

  // Apply heights from a historical analysis
  const applyFromHistory = (analysis) => {
    if (analysis.attachments && analysis.attachments.length > 0 && onHeightsDetected) {
      onHeightsDetected(analysis.attachments);
      toast.success(`Applied ${analysis.attachments.length} attachment(s) from history`);
      setOpen(false);
    } else {
      toast.error("No attachments in this analysis");
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Read and convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl);
      setResults(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imageBase64) {
      toast.error("Please select or capture an image first");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResults(null);

    try {
      const response = await axios.post("/pole-analysis/analyze-pole-heights", {
        image_base64: imageBase64,
        pole_height_estimate: parseFloat(poleHeight) || 40,
      });

      if (response.data.success) {
        setResults(response.data);
        
        // Save to history with thumbnail
        if (response.data.attachments.length > 0) {
          const thumbnail = await createThumbnail(imageBase64);
          saveToHistory(response.data, thumbnail);
          toast.success(`Detected ${response.data.attachments.length} attachment(s)`);
        } else {
          toast.info("No attachments detected in the image");
        }
      } else {
        setError(response.data.analysis_notes || "Analysis failed");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to analyze image";
      setError(msg);
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyHeights = () => {
    if (results?.attachments && onHeightsDetected) {
      onHeightsDetected(results.attachments);
      toast.success("Heights applied to form");
      setOpen(false);
    }
  };

  const resetState = () => {
    setImagePreview(null);
    setImageBase64(null);
    setResults(null);
    setError(null);
    setShowHistory(false);
  };

  const confidenceColor = (confidence) => {
    switch (confidence) {
      case "high": return "text-green-600 bg-green-50";
      case "medium": return "text-amber-600 bg-amber-50";
      case "low": return "text-red-600 bg-red-50";
      default: return "text-zinc-600 bg-zinc-50";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} className="gap-2" data-testid="height-analyzer-btn">
          <Camera className="w-4 h-4" />
          AI Height Analyzer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-blue-600" />
            AI Pole Height Analyzer
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            Upload a photo of a utility pole to estimate attachment heights using AI vision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">How to use:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>Take a photo of the pole showing all attachments</li>
              <li>Enter the estimated pole height (default 40ft)</li>
              <li>Click &quot;Analyze&quot; to detect attachment heights</li>
              <li>Review and apply detected heights to your form</li>
            </ol>
          </div>

          {/* Image capture/upload */}
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

          {/* Image preview */}
          {imagePreview && (
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <img
                src={imagePreview}
                alt="Pole preview"
                className="w-full max-h-64 object-contain bg-zinc-100"
              />
            </div>
          )}

          {/* Pole height estimate */}
          <div className="space-y-2">
            <Label htmlFor="pole-height">Estimated Pole Height (feet)</Label>
            <Select value={poleHeight} onValueChange={setPoleHeight}>
              <SelectTrigger className="h-10 bg-white border-zinc-300" data-testid="pole-height-input">
                <SelectValue placeholder="Select height" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-50 border-zinc-300">
                {POLE_HEIGHT_OPTIONS.map((h) => (
                  <SelectItem key={h} value={h.toString()}>{h} ft</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">
              Utility poles typically range from 20-65 feet. Select based on pole class if known.
            </p>
          </div>

          {/* Analyze button */}
          <Button
            onClick={handleAnalyze}
            disabled={!imageBase64 || analyzing}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700"
            data-testid="analyze-btn"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Ruler className="w-4 h-4 mr-2" />
                Analyze Pole Heights
              </>
            )}
          </Button>

          {/* Recent Analyses History */}
          {recentAnalyses.length > 0 && (
            <div className="border-t border-zinc-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-zinc-600 hover:text-zinc-900 gap-2 px-2"
                  data-testid="toggle-history-btn"
                >
                  <History className="w-4 h-4" />
                  Recent Analyses ({recentAnalyses.length})
                  <span className="text-xs">{showHistory ? "▲" : "▼"}</span>
                </Button>
                {showHistory && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 px-2"
                    data-testid="clear-history-btn"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </Button>
                )}
              </div>

              {showHistory && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentAnalyses.map((analysis) => (
                    <div
                      key={analysis.id}
                      className="flex items-center gap-3 p-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
                      onClick={() => applyFromHistory(analysis)}
                      data-testid={`history-item-${analysis.id}`}
                    >
                      {analysis.thumbnail && (
                        <img
                          src={analysis.thumbnail}
                          alt="Analysis thumbnail"
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900">
                            {analysis.attachments.length} attachment{analysis.attachments.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-zinc-500">
                            @ {analysis.pole_height_ft} ft pole
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {new Date(analysis.timestamp).toLocaleDateString()} {new Date(analysis.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {analysis.attachments.length > 0 && (
                          <p className="text-xs text-zinc-600 truncate">
                            {analysis.attachments.map(a => `${a.type} (${a.height_ft}ft)`).join(", ")}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-green-600 border-green-300 hover:bg-green-50"
                        onClick={(e) => { e.stopPropagation(); applyFromHistory(analysis); }}
                      >
                        Apply
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Analysis Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Results display */}
          {results && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-800">Analysis Complete</span>
                </div>
                <p className="text-sm text-green-700">
                  Estimated pole height: <strong>{results.pole_height_ft} ft</strong>
                </p>
                {results.analysis_notes && (
                  <p className="text-xs text-green-600 mt-1">{results.analysis_notes}</p>
                )}
              </div>

              {results.attachments.length > 0 ? (
                <div className="space-y-2">
                  <Label>Detected Attachments</Label>
                  <div className="border border-zinc-200 rounded-lg divide-y">
                    {results.attachments.map((att, i) => (
                      <div key={i} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-zinc-900">{att.type}</p>
                          <p className="text-xs text-zinc-500">{att.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-zinc-900">{att.height_ft} ft</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${confidenceColor(att.confidence)}`}>
                            {att.confidence} confidence
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {onHeightsDetected && (
                    <Button
                      onClick={handleApplyHeights}
                      className="w-full h-10 bg-green-600 hover:bg-green-700"
                      data-testid="apply-heights-btn"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Apply Heights to Form
                    </Button>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
                  No attachments detected. Try taking a clearer photo with better lighting.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PoleHeightAnalyzer;
