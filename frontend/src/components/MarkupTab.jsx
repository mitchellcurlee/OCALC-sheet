import { useState, useEffect } from "react";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, MapPin, Image as ImageIcon } from "lucide-react";

/**
 * MarkupTab - Displays photo markup editor with underground attributes
 * Can be used in ASE Form or Job Detail page
 */
const MarkupTab = ({ 
  photos = [], 
  onPhotosChange, 
  underground = [], 
  poles = [],
  label = "Mark Ups",
  showUnderground = true
}) => {
  const [expandedSections, setExpandedSections] = useState({
    poles: false,
    underground: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Collect all photos from poles and underground for markup gallery
  const getAllJobPhotos = () => {
    const allPhotos = [];
    
    // Collect from poles
    poles.forEach(pole => {
      if (pole.photo) allPhotos.push(pole.photo);
      if (pole.photos && Array.isArray(pole.photos)) {
        allPhotos.push(...pole.photos);
      }
      // Photo categories
      ['birthmark_photos', 'mgnv_photos', 'anchor_photos', 'hoa_photos', 'existing_photos', 'proposed_photos'].forEach(key => {
        if (pole[key] && Array.isArray(pole[key])) {
          allPhotos.push(...pole[key]);
        }
      });
    });
    
    // Collect from underground
    underground.forEach(item => {
      if (item.photo) allPhotos.push(item.photo);
      if (item.photos && Array.isArray(item.photos)) {
        allPhotos.push(...item.photos);
      }
    });
    
    // Dedupe and filter
    return [...new Set(allPhotos.filter(p => p && typeof p === 'string'))];
  };

  // Underground type abbreviations
  const undergroundAbbr = (type) => {
    const abbrs = {
      "Handhole": "HH", "Manhole": "MH", "Brooks Enclosure": "BE", "Flowerpot": "FP",
      "Hoffman Box": "HB", "Pedestal": "PED", "Point of Intersection": "PI", "FBT": "FBT",
      "NTE": "NTE", "FBT/NTE": "F/N", "PFP": "PFP", "SOC Start": "SOC-S", 
      "SOC End": "SOC-E", "Riser": "RSR", "MPOE": "MPOE",
    };
    return abbrs[type] || type?.substring(0, 3).toUpperCase() || "UG";
  };

  // Get all available photos to pre-load into markup if empty
  useEffect(() => {
    if (photos.length === 0) {
      const jobPhotos = getAllJobPhotos();
      if (jobPhotos.length > 0 && onPhotosChange) {
        // Don't auto-update, just make them available
      }
    }
  }, [poles, underground]);

  return (
    <div className="space-y-4">
      {/* Main Photo Markup Editor */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <PhotoMarkupEditor 
          photos={photos} 
          onChange={onPhotosChange}
          label={label}
          undergroundItems={underground}
          poles={poles}
        />
        <p className="text-xs text-zinc-500 mt-2">
          Upload photos and add annotations using the in-app editor. Use the Marker tool to add job-specific labels.
        </p>
      </div>

      {/* Poles Section - Collapsible */}
      {showUnderground && poles.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <button
            onClick={() => toggleSection('poles')}
            className="w-full flex items-center justify-between p-4 bg-orange-50 hover:bg-orange-100 transition-colors"
            data-testid="toggle-poles-section"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-orange-600 rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">P</span>
              </div>
              <span className="font-mono text-sm font-bold text-orange-800 uppercase">
                Poles ({poles.length})
              </span>
            </div>
            {expandedSections.poles ? (
              <ChevronUp className="w-5 h-5 text-orange-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-orange-600" />
            )}
          </button>
          
          {expandedSections.poles && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {poles.map((pole, idx) => {
                const polePhotos = [
                  ...(pole.photo ? [pole.photo] : []),
                  ...(pole.photos || []),
                  ...(pole.birthmark_photos || []),
                  ...(pole.mgnv_photos || []),
                ];
                
                return (
                  <div key={pole.id || idx} className="border border-zinc-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900">
                          {pole.pole_number || `Pole ${idx + 1}`}
                        </span>
                        {pole.latitude && pole.longitude && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            GPS
                          </span>
                        )}
                      </div>
                      {polePhotos.length > 0 && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" />
                          {polePhotos.length} photos
                        </span>
                      )}
                    </div>
                    
                    {/* Pole details */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                      {pole.pole_owner && <div><span className="font-medium">Owner:</span> {pole.pole_owner}</div>}
                      {pole.pole_size && <div><span className="font-medium">Size:</span> {pole.pole_size}&apos;</div>}
                      {pole.pole_class && <div><span className="font-medium">Class:</span> {pole.pole_class}</div>}
                      {pole.condition && <div><span className="font-medium">Condition:</span> {pole.condition}</div>}
                    </div>
                    
                    {/* Photo thumbnails */}
                    {polePhotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {polePhotos.slice(0, 4).map((photo, pIdx) => (
                          <img 
                            key={pIdx} 
                            src={photo.startsWith('/api/') ? `${window.location.origin}${photo}` : photo}
                            alt=""
                            className="w-12 h-12 object-cover rounded border border-zinc-200"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ))}
                        {polePhotos.length > 4 && (
                          <div className="w-12 h-12 bg-zinc-100 rounded border border-zinc-200 flex items-center justify-center text-xs text-zinc-500">
                            +{polePhotos.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Underground Section - Collapsible */}
      {showUnderground && underground.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <button
            onClick={() => toggleSection('underground')}
            className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors"
            data-testid="toggle-underground-section"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-green-600 rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">UG</span>
              </div>
              <span className="font-mono text-sm font-bold text-green-800 uppercase">
                Underground Attributes ({underground.length})
              </span>
            </div>
            {expandedSections.underground ? (
              <ChevronUp className="w-5 h-5 text-green-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-green-600" />
            )}
          </button>
          
          {expandedSections.underground && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {underground.map((item, idx) => {
                const itemPhotos = [
                  ...(item.photo ? [item.photo] : []),
                  ...(item.photos || []),
                ];
                
                return (
                  <div key={item.id || idx} className="border border-green-200 rounded-lg p-3 border-l-4 border-l-green-500">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center">
                          <span className="text-white text-[10px] font-mono font-bold">
                            {undergroundAbbr(item.type)}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-zinc-900">{item.type}</span>
                          {item.label && <span className="text-zinc-500 ml-1">· {item.label}</span>}
                        </div>
                      </div>
                      {item.latitude && item.longitude && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          GPS
                        </span>
                      )}
                    </div>
                    
                    {/* Underground details */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                      {item.latitude && item.longitude && (
                        <div className="col-span-2">
                          <span className="font-medium">Coordinates:</span> {item.latitude}, {item.longitude}
                        </div>
                      )}
                      {item.notes && (
                        <div className="col-span-2">
                          <span className="font-medium">Notes:</span> {item.notes}
                        </div>
                      )}
                    </div>
                    
                    {/* Photo thumbnails */}
                    {itemPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {itemPhotos.map((photo, pIdx) => (
                          <img 
                            key={pIdx} 
                            src={photo.startsWith('/api/') ? `${window.location.origin}${photo}` : photo}
                            alt=""
                            className="w-12 h-12 object-cover rounded border border-zinc-200"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Load All Job Photos Button */}
      {showUnderground && (poles.length > 0 || underground.length > 0) && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const jobPhotos = getAllJobPhotos();
              if (jobPhotos.length > 0 && onPhotosChange) {
                // Merge with existing photos, dedupe
                const merged = [...new Set([...photos, ...jobPhotos])];
                onPhotosChange(merged);
              }
            }}
            className="text-xs"
            data-testid="load-all-photos-btn"
          >
            <ImageIcon className="w-4 h-4 mr-1" />
            Load All Job Photos ({getAllJobPhotos().length})
          </Button>
        </div>
      )}
    </div>
  );
};

export default MarkupTab;
