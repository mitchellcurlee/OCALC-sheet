import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Copy,
  Zap,
  MapPin,
  Calendar,
  Loader2,
  ExternalLink,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatHeight } from "@/components/HeightInput";

// Fix Leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Photo Display Component - moved outside to prevent re-creation on each render
const PhotoDisplay = ({ label, src, onImageClick }) => {
  if (!src) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">{label}</p>
      <div 
        className="relative group cursor-pointer"
        onClick={() => onImageClick({ src, label })}
      >
        <img 
          src={src} 
          alt={label} 
          className="w-full max-w-sm h-48 object-cover border-2 border-zinc-300 hover:border-red-500 transition-colors" 
        />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ZoomIn className="w-8 h-8 text-white" />
        </div>
      </div>
    </div>
  );
};

// Data Row Component - moved outside to prevent re-creation on each render
const DataRow = ({ label, value, mono = false }) => (
  <div className="space-y-1">
    <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">{label}</p>
    <p className={`text-zinc-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

const ViewPole = () => {
  const { jobId, id } = useParams();
  const navigate = useNavigate();
  const [pole, setPole] = useState(null);
  const [poles, setPoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [syncing, setSyncing] = useState(false);
  
  const backUrl = jobId ? `/jobs/${jobId}` : "/";

  // Fetch all poles in the job for navigation
  const fetchPoles = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await axios.get(`/jobs/${jobId}/poles?_t=${Date.now()}`);
      setPoles(response.data);
    } catch (error) {
      console.error("Failed to fetch poles for navigation");
    }
  }, [jobId]);

  const fetchPole = useCallback(async () => {
    try {
      const response = await axios.get(`/poles/${id}?_t=${Date.now()}`);
      setPole(response.data);
    } catch (error) {
      toast.error("Failed to fetch pole data");
      navigate(backUrl);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, backUrl]);

  useEffect(() => {
    // Reset state when navigating to a different pole
    setLoading(true);
    setPole(null);
    fetchPole();
    fetchPoles();
    window.scrollTo(0, 0);
  }, [id, jobId]);

  // Calculate previous and next poles
  const { prevPole, nextPole, currentIndex, totalPoles } = useMemo(() => {
    if (!poles.length || !id) {
      return { prevPole: null, nextPole: null, currentIndex: -1, totalPoles: 0 };
    }
    const idx = poles.findIndex(p => p.id === id);
    return {
      prevPole: idx > 0 ? poles[idx - 1] : null,
      nextPole: idx < poles.length - 1 ? poles[idx + 1] : null,
      currentIndex: idx,
      totalPoles: poles.length
    };
  }, [poles, id]);

  const handleDelete = async () => {
    try {
      await axios.delete(`/poles/${id}`);
      toast.success("Pole deleted successfully");
      navigate(backUrl);
    } catch (error) {
      toast.error("Failed to delete pole");
    }
  };

  const handleDuplicate = async () => {
    try {
      const res = await axios.post(`/poles/${id}/duplicate`);
      toast.success("Pole duplicated — edit the copy");
      navigate(jobId ? `/jobs/${jobId}/edit/${res.data.id}` : `/edit/${res.data.id}`);
    } catch (error) {
      toast.error("Failed to duplicate pole");
    }
  };

  const handleSyncDistances = async () => {
    setSyncing(true);
    try {
      const response = await axios.post(`/poles/${id}/sync-distances`);
      if (response.data.updated) {
        toast.success(`Synced: Span 1 = ${response.data.span1 || 'N/A'}ft, Span 2 = ${response.data.span2 || 'N/A'}ft`);
        fetchPole(); // Refresh pole data
      } else {
        toast.info(response.data.message || "No changes needed");
      }
    } catch (error) {
      toast.error("Failed to sync distances");
    } finally {
      setSyncing(false);
    }
  };

  const getConditionColor = (condition) => {
    const colors = {
      Excellent: "bg-green-500/20 text-green-700 border-green-500/50",
      Good: "bg-yellow-500/20 text-yellow-700 border-yellow-500/50",
      Bad: "bg-red-500/20 text-red-600 border-red-500/50",
    };
    return colors[condition] || "bg-zinc-500/20 text-zinc-600 border-zinc-500/50";
  };

  const openInMaps = () => {
    if (pole?.latitude && pole?.longitude) {
      window.open(`https://www.google.com/maps?q=${pole.latitude},${pole.longitude}`, "_blank");
    }
  };

  // Wrapper to pass setLightboxImage to PhotoDisplay
  const renderPhoto = (label, src) => (
    <PhotoDisplay label={label} src={src} onImageClick={setLightboxImage} />
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!pole) return null;

  const mapCenter = pole.latitude && pole.longitude
    ? [pole.latitude, pole.longitude]
    : [29.7604, -95.3698]; // Houston, TX

  // Check if any span has data
  const hasSpanData = [1, 2, 3, 4].some(num => 
    pole[`span${num}_direction`] || pole[`span${num}_distance`] || pole[`span${num}_owner`]
  );

  // Check if any down guy has data (array format)
  const hasDownGuyData = pole.down_guys && pole.down_guys.length > 0 && pole.down_guys.some(g => g.owner || g.direction || g.size || g.type || g.condition || g.height || g.lead);

  // Check if any anchor (knuckle) has data (array format)
  const hasKnuckleData = pole.knuckles && pole.knuckles.length > 0 && pole.knuckles.some(k => k.size || k.total_eyes || k.direction || k.condition || (k.photos && k.photos.length > 0) || k.photo);

  // Check if any attachment has data (array format)
  const hasAttachmentData = pole.attachments && pole.attachments.length > 0 && pole.attachments.some(a => a.height || a.owner || (a.photos && a.photos.length > 0) || a.photo || a.notes);

  // Should show navigation
  const showNavigation = jobId && poles.length > 1;

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="view-pole-page">
      {/* Pole Navigation */}
      {showNavigation && (
        <div className="flex items-center justify-between bg-white border-b border-zinc-200 px-4 py-2" data-testid="pole-navigation">
          <Link 
            to={prevPole ? `/jobs/${jobId}/view/${prevPole.id}` : '#'}
            className={!prevPole ? 'pointer-events-none opacity-40' : ''}
          >
            <Button 
              variant="outline" 
              size="sm" 
              disabled={!prevPole}
              className="flex items-center gap-1 text-zinc-700"
              data-testid="prev-pole-btn"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
              {prevPole && <span className="font-mono text-xs ml-1">({prevPole.pole_number || 'No #'})</span>}
            </Button>
          </Link>
          
          <span className="text-sm text-zinc-500 font-mono" data-testid="pole-counter">
            Pole {currentIndex + 1} of {totalPoles}
          </span>
          
          <Link 
            to={nextPole ? `/jobs/${jobId}/view/${nextPole.id}` : '#'}
            className={!nextPole ? 'pointer-events-none opacity-40' : ''}
          >
            <Button 
              variant="outline" 
              size="sm" 
              disabled={!nextPole}
              className="flex items-center gap-1 text-zinc-700"
              data-testid="next-pole-btn"
            >
              {nextPole && <span className="font-mono text-xs mr-1">({nextPole.pole_number || 'No #'})</span>}
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}
      
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white backdrop-blur-sm sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={backUrl}>
                <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900" data-testid="back-btn">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${pole.pole_owner === "Foreign Owned" ? "bg-red-600" : "bg-orange-600"}`}>
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="font-heading text-xl font-bold tracking-tight uppercase text-zinc-900">Pole Data Sheet / OCALC</h1>
                  {pole.job_number && <p className="text-xs text-zinc-500 font-mono">JOB: {pole.job_number}</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {pole.pole_number && (
                <div className="text-right">
                  <p className="text-xs text-zinc-500 font-mono">POLE #</p>
                  <p className="text-lg font-mono text-zinc-900">{pole.pole_number}</p>
                </div>
              )}
              <Link to={jobId ? `/jobs/${jobId}/edit/${pole.id}` : `/edit/${pole.id}`}>
                <Button variant="outline" className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="edit-btn">
                  <Pencil className="w-4 h-4 mr-2" />Edit
                </Button>
              </Link>
              <Button 
                variant="outline" 
                onClick={handleSyncDistances}
                disabled={syncing || !pole.latitude || !pole.longitude}
                className="bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-700" 
                data-testid="sync-distances-btn"
                title="Sync GPS distances for this pole"
              >
                {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sync Dist
              </Button>
              <Button variant="outline" onClick={handleDuplicate} className="bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="duplicate-btn">
                <Copy className="w-4 h-4 mr-2" />Duplicate
              </Button>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="bg-red-600 hover:bg-red-700" data-testid="delete-btn">
                <Trash2 className="w-4 h-4 mr-2" />Delete
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Status Banner */}
          <div className="industrial-card p-5">
            <div className="flex flex-wrap items-center gap-4">
              <Badge className={`${pole.pole_owner === "Foreign Owned" ? "bg-red-500/20 text-red-600 border-red-500/50" : "bg-orange-500/20 text-orange-600 border-orange-500/50"} border font-mono text-sm px-4 py-2`}>
                <Zap className="w-4 h-4 mr-2" />
                {pole.pole_owner}
              </Badge>
              <Badge className={`${getConditionColor(pole.condition)} border font-mono text-sm px-4 py-2`}>
                Condition: {pole.condition}
              </Badge>
              <Badge className="bg-zinc-100 text-zinc-700 border-zinc-300 font-mono text-sm px-4 py-2">
                Size: {pole.pole_size}{pole.pole_size_type ? ` (${pole.pole_size_type})` : ''}
              </Badge>
              <div className="flex items-center gap-2 text-zinc-600 font-mono text-sm ml-auto">
                <Calendar className="w-4 h-4" />
                {new Date(pole.inspection_date).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500"></div>Basic Information
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
              <DataRow label="Pole Owner" value={pole.pole_owner} />
              <DataRow label="Access" value={pole.access} />
              <DataRow label="Class" value={pole.pole_class} />
              <DataRow label="Pole Size" value={pole.pole_size ? `${pole.pole_size}'` : ""} />
              <DataRow label="Size Type" value={pole.pole_size_type} />
              <DataRow label="Type of Pole" value={pole.pole_type} />
              <DataRow label="Condition" value={pole.condition} />
            </div>
          </div>

          {/* Spans */}
          {hasSpanData && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-indigo-500"></div>Spans
              </h2>
              <div className="space-y-3">
                {[1, 2, 3, 4].map((num) => {
                  const hasData = pole[`span${num}_direction`] || pole[`span${num}_distance`] || pole[`span${num}_owner`];
                  if (!hasData) return null;
                  return (
                    <div key={num} className="bg-zinc-50 p-3 border border-zinc-300">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-mono text-indigo-600 w-8">{num}</span>
                        <div className="grid grid-cols-3 gap-4 flex-1">
                          <DataRow label="Direction" value={pole[`span${num}_direction`]} />
                          <DataRow label="Distance" value={pole[`span${num}_distance`] ? `${pole[`span${num}_distance`]} ft` : null} mono />
                          <DataRow label="Owner" value={pole[`span${num}_owner`]} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* GPS Location */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-emerald-500"></div>GPS Location
            </h2>
            {pole.latitude && pole.longitude ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <DataRow label="Latitude" value={pole.latitude.toFixed(6)} mono />
                    <DataRow label="Longitude" value={pole.longitude.toFixed(6)} mono />
                  </div>
                  <Button onClick={openInMaps} className="bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300" data-testid="open-maps-btn">
                    <MapPin className="w-4 h-4 mr-2" />Open in Google Maps<ExternalLink className="w-3 h-3 ml-2" />
                  </Button>
                </div>
                <div className="h-72 sm:h-80 border border-zinc-300 overflow-hidden">
                  <MapContainer center={mapCenter} zoom={18} minZoom={3} maxZoom={22} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }} className="z-0">
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='&copy; Esri' maxNativeZoom={19} maxZoom={22} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" attribution='' maxNativeZoom={19} maxZoom={22} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" attribution='' maxNativeZoom={19} maxZoom={22} />
                    <Marker position={mapCenter} />
                  </MapContainer>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 font-mono text-sm">No GPS coordinates recorded</p>
            )}
          </div>

          {/* Birthmark & MGNV */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-purple-500"></div>Birthmark & MGNV
            </h2>
            <div className="space-y-4">
              {/* Birthmark */}
              <div className="flex items-center gap-6">
                <Badge className={pole.has_birthmark ? "bg-green-500/20 text-green-700 border-green-500/50" : "bg-zinc-500/20 text-zinc-600 border-zinc-500/50"}>
                  {pole.has_birthmark ? "Has Birthmark" : "No Birthmark"}
                </Badge>
                {pole.has_birthmark && (pole.birthmark_photos?.length > 0 || pole.birthmark_photo) && (
                  <div className="flex flex-wrap gap-2">
                    {(pole.birthmark_photos || [pole.birthmark_photo].filter(Boolean)).map((photo, idx) => (
                      renderPhoto(`Birthmark${pole.birthmark_photos?.length > 1 ? ` ${idx+1}` : ""}`, photo)
                    ))}
                  </div>
                )}
              </div>
              {/* MGNV */}
              {(pole.mgnv || pole.mgnv_condition || pole.mgnv_photos?.length > 0 || pole.mgnv_photo) && (
                <div className="pt-4 border-t border-zinc-300">
                  <h3 className="text-sm font-mono text-cyan-700 mb-3">MGNV</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DataRow label="MGNV Present" value={pole.mgnv} />
                    <DataRow label="Condition" value={pole.mgnv_condition} />
                    <div className="flex flex-wrap gap-2">
                      {(pole.mgnv_photos || [pole.mgnv_photo].filter(Boolean)).map((photo, idx) => (
                        renderPhoto(`MGNV${pole.mgnv_photos?.length > 1 ? ` ${idx+1}` : ""}`, photo)
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* OCALC Photos */}
          {(pole.ocalc_left_photo || pole.ocalc_middle_photo || pole.ocalc_right_photo) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-blue-500"></div>OCALC Photos
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {renderPhoto("Left", pole.ocalc_left_photo)}
                {renderPhoto("Middle", pole.ocalc_middle_photo)}
                {renderPhoto("Right", pole.ocalc_right_photo)}
              </div>
            </div>
          )}

          {/* Down Guys with Knuckles */}
          {(hasDownGuyData || hasKnuckleData) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-yellow-500"></div>Down Guys
              </h2>
              <div className="space-y-3">
                {pole.down_guys && pole.down_guys.map((guy, index) => {
                  if (!guy.size && !guy.direction && !guy.owner && !guy.type && !guy.condition && !guy.height && !guy.lead) return null;
                  return (
                    <div key={index} className="bg-zinc-50 p-3 border border-zinc-300">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-mono text-yellow-700 w-8">{index + 1}</span>
                        <div className="grid grid-cols-3 md:grid-cols-7 gap-4 flex-1">
                          <DataRow label="Owner" value={guy.owner} />
                          <DataRow label="Direction" value={guy.direction} />
                          <DataRow label="Size" value={guy.size} />
                          <DataRow label="Type" value={guy.type} />
                          <DataRow label="Condition" value={guy.condition} />
                          <DataRow label="Height" value={guy.height ? formatHeight(guy.height) : null} mono />
                          <DataRow label="Lead" value={guy.lead ? formatHeight(guy.lead) : null} mono />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Anchor */}
                {hasKnuckleData && (
                  <div className="mt-4 pt-4 border-t border-zinc-300">
                    <h3 className="text-sm font-mono text-orange-600 mb-3">ANCHOR</h3>
                    <div className="space-y-3">
                      {pole.knuckles && pole.knuckles.map((knuckle, index) => {
                        const photos = knuckle.photos || (knuckle.photo ? [knuckle.photo] : []);
                        if (!knuckle.size && !knuckle.total_eyes && !knuckle.direction && !knuckle.condition && photos.length === 0) return null;
                        return (
                          <div key={index} className="bg-zinc-50 p-3 border border-zinc-300">
                            <div className="flex items-start gap-4">
                              <span className="text-sm font-mono text-orange-600 w-8">{index + 1}</span>
                              <div className="flex-1">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                                  <DataRow label="Size" value={knuckle.size ? `${knuckle.size}"` : null} />
                                  <DataRow label="Total Eyes" value={knuckle.total_eyes} />
                                  <DataRow label="Direction" value={knuckle.direction} />
                                  <DataRow label="Condition" value={knuckle.condition} />
                                </div>
                                {photos.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {photos.map((photo, pIdx) => renderPhoto(`Photo ${photos.length > 1 ? pIdx+1 : ""}`, photo))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HOA */}
          {(hasAttachmentData || pole.pole_terminal || pole.risers) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-green-500"></div>HOA
              </h2>
              <div className="space-y-3">
                {pole.attachments && pole.attachments.map((att, index) => {
                  const photos = att.photos || (att.photo ? [att.photo] : []);
                  if (!att.height && !att.owner && photos.length === 0 && !att.notes) return null;
                  return (
                    <div key={index} className="bg-zinc-50 p-3 border border-zinc-300">
                      <div className="flex items-start gap-4">
                        <span className="text-sm font-mono text-green-700 w-8">{index + 1}</span>
                        <div className="flex-1">
                          <div className="grid grid-cols-3 gap-4 mb-2">
                            <DataRow label="Height" value={att.height ? formatHeight(att.height) : null} mono />
                            <DataRow label="Owner" value={att.owner} />
                            <DataRow label="Notes" value={att.notes} />
                          </div>
                          {photos.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {photos.map((photo, pIdx) => renderPhoto(`Photo ${photos.length > 1 ? pIdx+1 : ""}`, photo))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pole Terminal and Risers */}
                {(pole.pole_terminal || pole.risers) && (
                  <div className="mt-4 pt-4 border-t border-zinc-300">
                    <div className="grid grid-cols-2 gap-4">
                      <DataRow label="Pole Terminal" value={pole.pole_terminal} />
                      <DataRow label="Risers" value={pole.risers} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {pole.notes && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-zinc-500"></div>Notes
              </h2>
              <p className="text-zinc-700 whitespace-pre-wrap">{pole.notes}</p>
            </div>
          )}

          {/* Record Info */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-zinc-600"></div>Record Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DataRow label="Record ID" value={pole.id} mono />
              <DataRow label="Created" value={new Date(pole.created_at).toLocaleString()} />
              <DataRow label="Last Updated" value={new Date(pole.updated_at).toLocaleString()} />
            </div>
          </div>
        </div>
      </main>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Pole?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This action cannot be undone. This will permanently delete the pole data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900 hover:bg-zinc-200">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white" data-testid="confirm-delete-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="bg-zinc-50 border-zinc-200 max-w-4xl max-h-[90vh] p-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setLightboxImage(null)}
            >
              <X className="w-5 h-5" />
            </Button>
            {lightboxImage && (
              <div className="flex flex-col items-center">
                <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2">{lightboxImage.label}</p>
                <img 
                  src={lightboxImage.src} 
                  alt={lightboxImage.label} 
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ViewPole;
