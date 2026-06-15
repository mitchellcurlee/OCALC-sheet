import { useState, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, ZoomIn, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";

/**
 * ASEPhotoField - Photo upload with markup capability for ASE form fields
 * Shows small camera icon next to field, with edit button to open markup editor
 */
export const ASEPhotoField = ({ fieldKey, photos = [], onChange, label, compact = false }) => {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [showMarkupEditor, setShowMarkupEditor] = useState(false);

  const photoArray = Array.isArray(photos) ? photos : (photos ? [photos] : []);

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

  // Compact mode - show inline thumbnails with edit option
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {photoArray.map((photo, idx) => (
          <div key={idx} className="relative w-10 h-10 group">
            <img
              src={photo}
              alt=""
              className="w-full h-full object-cover rounded border border-zinc-200 cursor-pointer"
              onClick={() => setLightboxPhoto(photo)}
            />
            <button
              type="button"
              onClick={() => removePhoto(idx)}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        {/* Add photo button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 border-2 border-dashed border-zinc-300 rounded flex items-center justify-center text-zinc-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        </button>
        
        {/* Edit button to open markup editor */}
        {photoArray.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMarkupEditor(true)}
            className="w-10 h-10 border-2 border-dashed border-green-300 rounded flex items-center justify-center text-green-500 hover:border-green-400 hover:text-green-600 transition-colors"
            title="Edit with markup tools"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
        
        {/* Lightbox */}
        <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
          <DialogContent className="max-w-4xl p-0 bg-black/90">
            <img src={lightboxPhoto} alt="" className="w-full h-auto max-h-[80vh] object-contain" />
          </DialogContent>
        </Dialog>
        
        {/* Markup Editor Dialog */}
        <Dialog open={showMarkupEditor} onOpenChange={setShowMarkupEditor}>
          <DialogContent className="max-w-6xl h-[95vh] p-4">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">{label || "Photo Markup Editor"}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <PhotoMarkupEditor 
                photos={photoArray} 
                onChange={(newPhotos) => {
                  onChange(newPhotos);
                }}
                label={label}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="relative">
      {label && <label className="text-xs font-mono text-zinc-600 mb-1.5 block uppercase tracking-wide">{label}</label>}
      <div className="inline-flex items-center gap-1">
        {/* Camera button */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`relative p-1.5 rounded transition-colors ${
            photoArray.length > 0 
              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
          }`}
          title={`${label || 'Photos'} (${photoArray.length})`}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          {photoArray.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
              {photoArray.length}
            </span>
          )}
        </button>
        
        {/* Edit button to open markup editor */}
        {photoArray.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMarkupEditor(true)}
            className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
            title="Edit with markup tools"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}

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

      {/* Expanded photo panel */}
      {expanded && (
        <div className="absolute z-50 mt-8 left-0 bg-white border border-zinc-300 rounded-lg shadow-lg p-3 min-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-zinc-600">{label}</span>
            <button onClick={() => setExpanded(false)} className="text-zinc-400 hover:text-zinc-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Photo grid */}
          {photoArray.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {photoArray.map((photo, idx) => (
                <div key={idx} className="relative w-14 h-14 group">
                  <img
                    src={photo}
                    alt=""
                    className="w-full h-full object-cover rounded border border-zinc-200 cursor-pointer"
                    onClick={() => setLightboxPhoto(photo)}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Upload buttons */}
          <div className="flex gap-2 mb-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 h-7 text-xs"
            >
              <Camera className="w-3 h-3 mr-1" />
              Camera
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 h-7 text-xs"
            >
              <Upload className="w-3 h-3 mr-1" />
              Upload
            </Button>
          </div>
          
          {/* Edit with markup button */}
          {photoArray.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => {
                setExpanded(false);
                setShowMarkupEditor(true);
              }}
              className="w-full h-7 text-xs bg-green-600 hover:bg-green-700"
            >
              <Pencil className="w-3 h-3 mr-1" />
              Edit with Markup
            </Button>
          )}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/90">
          {lightboxPhoto && (
            <img src={lightboxPhoto} alt="" className="max-h-[80vh] w-auto mx-auto object-contain" />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Markup Editor Dialog */}
      <Dialog open={showMarkupEditor} onOpenChange={setShowMarkupEditor}>
        <DialogContent className="max-w-6xl h-[95vh] p-4">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{label || "Photo Markup Editor"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <PhotoMarkupEditor 
              photos={photoArray} 
              onChange={(newPhotos) => {
                onChange(newPhotos);
              }}
              label={label}
            />
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default ASEPhotoField;
