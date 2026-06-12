import { useState, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, ZoomIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

/**
 * MultiPhotoUpload - Allows capturing/uploading multiple photos
 * Supports selecting MULTIPLE files at once from the file picker
 * @param {string} label - Field label
 * @param {string[]} value - Array of photo URLs
 * @param {function} onChange - Callback with updated array
 * @param {string} testId - Test ID prefix
 * @param {boolean} compact - Use compact layout
 */
export const MultiPhotoUpload = ({ label, value = [], onChange, testId, compact = false }) => {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const photos = Array.isArray(value) ? value : (value ? [value] : []);

  // Handle multiple files at once
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setUploading(true);
    setUploadCount(files.length);
    
    const newPhotos = [...photos];
    let successCount = 0;
    
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
        successCount++;
      } catch (err) {
        console.error("Photo upload failed", err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    
    if (successCount > 0) {
      onChange(newPhotos);
      toast.success(`${successCount} photo${successCount > 1 ? 's' : ''} added`);
    }
    
    setUploading(false);
    setUploadCount(0);
    e.target.value = "";
  };

  const removePhoto = (index) => {
    const updated = photos.filter((_, i) => i !== index);
    onChange(updated);
  };

  // Compact layout for inline use (e.g., in dynamic rows)
  if (compact) {
    return (
      <>
        <div className="space-y-1">
          <Label className="text-xs font-mono text-zinc-500">{label}</Label>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            multiple
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
          <div className="flex items-center gap-2">
            {/* Upload buttons */}
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
                title="Select multiple photos"
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>
            {/* Mini gallery */}
            {photos.length > 0 && (
              <div className="flex gap-1 overflow-x-auto">
                {photos.map((photo, index) => (
                  <div key={index} className="relative flex-shrink-0 group">
                    <div 
                      className="cursor-pointer"
                      onClick={() => setLightboxPhoto(photo)}
                    >
                      <img 
                        src={photo} 
                        alt={`${label} ${index + 1}`} 
                        className="w-9 h-9 object-cover border border-zinc-300 hover:border-red-500 transition-colors" 
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-1 -right-1 h-4 w-4 bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                    >
                      <X className="w-2 h-2" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {uploading && uploadCount > 1 && (
              <span className="text-xs text-zinc-500 font-mono">Uploading {uploadCount}...</span>
            )}
            {photos.length > 0 && !uploading && (
              <span className="text-xs text-zinc-500 font-mono">{photos.length}</span>
            )}
          </div>
        </div>
        {/* Lightbox */}
        <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
          <DialogContent className="bg-zinc-50 border-zinc-200 max-w-4xl max-h-[90vh] p-2">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
                onClick={() => setLightboxPhoto(null)}
              >
                <X className="w-5 h-5" />
              </Button>
              <div className="flex flex-col items-center">
                <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2">{label}</p>
                <img 
                  src={lightboxPhoto} 
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

  // Full layout
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
          {label} {photos.length > 0 && <span className="text-zinc-400">({photos.length})</span>}
        </Label>
        
        {/* Hidden file inputs */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
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

        <div className="flex gap-3 items-start">
          {/* Upload buttons */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              type="button"
              disabled={uploading}
              onClick={() => cameraInputRef.current?.click()}
              className="h-16 w-16 bg-red-600 hover:bg-red-700 text-white border-0 flex flex-col items-center justify-center gap-1"
              data-testid={`${testId}-camera`}
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              <span className="text-[10px] font-mono">{uploading ? `${uploadCount}...` : "CAM"}</span>
            </Button>
            <Button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="h-16 w-16 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border border-zinc-300 flex flex-col items-center justify-center gap-1"
              data-testid={`${testId}-upload`}
              title="Select multiple photos at once"
            >
              <Upload className="w-4 h-4" />
              <span className="text-[10px]">Gallery</span>
            </Button>
          </div>

          {/* Photo gallery */}
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap flex-1">
              {photos.map((photo, index) => (
                <div key={index} className="relative group">
                  <div 
                    className="cursor-pointer"
                    onClick={() => setLightboxPhoto(photo)}
                  >
                    <img
                      src={photo}
                      alt={`${label} ${index + 1}`}
                      className="w-16 h-16 object-cover border-2 border-zinc-300 hover:border-red-500 transition-colors"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-1 -right-1 h-5 w-5 bg-red-600 hover:bg-red-700"
                    onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                    data-testid={`${testId}-remove-${index}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="bg-zinc-50 border-zinc-200 max-w-4xl max-h-[90vh] p-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setLightboxPhoto(null)}
            >
              <X className="w-5 h-5" />
            </Button>
            <div className="flex flex-col items-center">
              <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2">{label}</p>
              <img 
                src={lightboxPhoto} 
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

export default MultiPhotoUpload;
