import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Pencil, Loader2, ZoomIn } from "lucide-react";
import { getPhotoUrl } from "./MarkupConstants";

/**
 * MarkupPhotoGallery - Photo grid with upload, edit, and delete controls
 */
export const MarkupPhotoGallery = ({
  photos = [],
  label = "Mark Ups",
  uploading,
  fileInputRef,
  cameraInputRef,
  onFileChange,
  onRemovePhoto,
  onOpenEditor,
  onOpenLightbox
}) => {
  const photoArray = Array.isArray(photos) ? photos : (photos ? [photos] : []);
  
  return (
    <div className="space-y-3">
      <Label className="text-sm font-mono uppercase text-zinc-600 flex items-center gap-2">
        <Pencil className="w-4 h-4" />
        {label} ({photoArray.length})
      </Label>
      
      {/* Photo grid */}
      <div className="flex flex-wrap gap-3">
        {photoArray.map((photo, idx) => {
          const photoUrl = getPhotoUrl(photo);
          return (
            <div key={idx} className="relative group">
              <div 
                className="w-20 h-20 rounded-lg bg-zinc-100 border-2 border-zinc-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => onOpenLightbox(photoUrl)}
              >
                {photoUrl && (
                  <img 
                    src={photoUrl} 
                    alt={`Markup ${idx + 1}`} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentNode.innerHTML = '<div class="w-full h-full flex items-center justify-center text-zinc-400 text-xs">Load error</div>';
                    }}
                  />
                )}
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEditor(photo, idx);
                  }}
                  title="Edit markup"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLightbox(photoUrl);
                  }}
                  title="View full"
                >
                  <ZoomIn className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhoto(idx);
                  }}
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
        
        {/* Add photo buttons */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 border-dashed border-zinc-300 hover:border-blue-400"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
            Camera
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 border-dashed border-zinc-300 hover:border-blue-400"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Upload
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
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
};

export default MarkupPhotoGallery;
