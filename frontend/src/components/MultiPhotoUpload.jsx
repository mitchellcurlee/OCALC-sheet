import { useState, useRef, useCallback, useEffect } from "react";
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
 * Supports DRAG AND DROP of photos
 * @param {string} label - Field label
 * @param {string[]} value - Array of photo URLs
 * @param {function} onChange - Callback with updated array
 * @param {string} testId - Test ID prefix
 * @param {boolean} compact - Use compact layout
 * @param {number} maxPhotos - Maximum number of photos allowed (optional)
 */
export const MultiPhotoUpload = ({ label, value = [], onChange, testId, compact = false, maxPhotos }) => {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Use refs to always have access to latest props (avoids stale closure issues)
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const maxPhotosRef = useRef(maxPhotos);
  
  // Keep refs updated
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    maxPhotosRef.current = maxPhotos;
  }, [value, onChange, maxPhotos]);

  const photos = Array.isArray(value) ? value : (value ? [value] : []);

  // Process files (shared between file input and drag/drop)
  const processFiles = useCallback(async (files) => {
    if (files.length === 0) return;
    
    setUploading(true);
    setUploadCount(files.length);
    
    const uploadedUrls = [];
    
    for (const file of files) {
      // Check if it's an image
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
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
        console.log('[MultiPhotoUpload] Photo uploaded:', res.data.url);
        uploadedUrls.push(res.data.url);
      } catch (err) {
        console.error("Photo upload failed", err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    
    if (uploadedUrls.length > 0) {
      // Use refs to get the LATEST value, not stale closure value
      const currentValue = valueRef.current;
      const currentPhotos = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
      let newPhotos = [...currentPhotos, ...uploadedUrls];
      
      // If maxPhotos is set, only keep the last maxPhotos
      const max = maxPhotosRef.current;
      if (max && newPhotos.length > max) {
        newPhotos = newPhotos.slice(-max);
      }
      
      console.log('[MultiPhotoUpload] Calling onChange with:', newPhotos);
      // Use ref to call the LATEST onChange callback
      onChangeRef.current(newPhotos);
      toast.success(`${uploadedUrls.length} photo${uploadedUrls.length > 1 ? 's' : ''} added`);
    }
    
    setUploading(false);
    setUploadCount(0);
  }, []); // No dependencies - uses refs instead

  // Handle file input change
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    e.target.value = "";
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast.error("Please drop image files only");
      return;
    }
    
    await processFiles(imageFiles);
  }, [processFiles]);

  const removePhoto = (index) => {
    const updated = photos.filter((_, i) => i !== index);
    onChange(updated);
  };

  // Compact layout for inline use (e.g., in dynamic rows)
  if (compact) {
    return (
      <>
        <div 
          className={`space-y-1 ${isDragging ? 'ring-2 ring-red-500 ring-offset-2 rounded' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
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
                title="Select multiple photos or drag & drop"
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>
            {/* Drag indicator */}
            {isDragging && (
              <span className="text-xs text-red-600 font-medium animate-pulse">Drop here!</span>
            )}
            {/* Mini gallery */}
            {photos.length > 0 && !isDragging && (
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
            {photos.length > 0 && !uploading && !isDragging && (
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
      <div 
        className={`space-y-2 p-3 rounded-lg border-2 border-dashed transition-colors ${
          isDragging 
            ? 'border-red-500 bg-red-50' 
            : 'border-transparent hover:border-zinc-300'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
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

        {/* Drag indicator */}
        {isDragging && (
          <div className="flex items-center justify-center py-4 text-red-600 font-medium animate-pulse">
            <Upload className="w-5 h-5 mr-2" />
            Drop photos here!
          </div>
        )}

        {!isDragging && (
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
                title="Select multiple photos or drag & drop"
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

            {/* Drag hint when no photos */}
            {photos.length === 0 && !uploading && (
              <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm py-4">
                <span>or drag & drop photos here</span>
              </div>
            )}
          </div>
        )}
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
