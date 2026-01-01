import { useState, useEffect } from "react";
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
  ArrowLeft,
  Pencil,
  Trash2,
  Zap,
  Radio,
  MapPin,
  Calendar,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ViewPole = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pole, setPole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    fetchPole();
  }, [id]);

  const fetchPole = async () => {
    try {
      const response = await axios.get(`${API}/poles/${id}`);
      setPole(response.data);
    } catch (error) {
      toast.error("Failed to fetch pole data");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/poles/${id}`);
      toast.success("Pole deleted successfully");
      navigate("/");
    } catch (error) {
      toast.error("Failed to delete pole");
    }
  };

  const getConditionColor = (condition) => {
    const colors = {
      Excellent: "bg-green-500/20 text-green-400 border-green-500/50",
      Good: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
      Bad: "bg-red-500/20 text-red-400 border-red-500/50",
    };
    return colors[condition] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/50";
  };

  const openInMaps = () => {
    if (pole?.latitude && pole?.longitude) {
      window.open(`https://www.google.com/maps?q=${pole.latitude},${pole.longitude}`, "_blank");
    }
  };

  const PhotoDisplay = ({ label, src }) => {
    if (!src) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">{label}</p>
        <img src={src} alt={label} className="max-w-full max-h-48 object-contain border-2 border-zinc-700" />
      </div>
    );
  };

  const DataRow = ({ label, value, mono = false }) => (
    <div className="space-y-1">
      <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">{label}</p>
      <p className={`text-zinc-200 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!pole) return null;

  const mapCenter = pole.latitude && pole.longitude
    ? [pole.latitude, pole.longitude]
    : [37.7749, -122.4194];

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="view-pole-page">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white" data-testid="back-btn">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${pole.pole_owner === "Power" ? "bg-red-600" : "bg-orange-600"}`}>
                  {pole.pole_owner === "Power" ? <Zap className="w-6 h-6 text-white" /> : <Radio className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <h1 className="font-heading text-xl font-bold tracking-tight uppercase text-white">Pole Details</h1>
                  {pole.job_number && <p className="text-xs text-zinc-500 font-mono">JOB: {pole.job_number}</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {pole.pole_number && (
                <div className="text-right">
                  <p className="text-xs text-zinc-500 font-mono">POLE #</p>
                  <p className="text-lg font-mono text-white">{pole.pole_number}</p>
                </div>
              )}
              <Link to={`/edit/${pole.id}`}>
                <Button variant="outline" className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white" data-testid="edit-btn">
                  <Pencil className="w-4 h-4 mr-2" />Edit
                </Button>
              </Link>
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
              <Badge className={`${pole.pole_owner === "Power" ? "pole-power" : "pole-telecom"} border font-mono text-sm px-4 py-2`}>
                {pole.pole_owner === "Power" ? <Zap className="w-4 h-4 mr-2" /> : <Radio className="w-4 h-4 mr-2" />}
                {pole.pole_owner} Pole
              </Badge>
              <Badge className={`${getConditionColor(pole.condition)} border font-mono text-sm px-4 py-2`}>
                Condition: {pole.condition}
              </Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 font-mono text-sm px-4 py-2">
                Size: {pole.pole_size}
              </Badge>
              <div className="flex items-center gap-2 text-zinc-400 font-mono text-sm ml-auto">
                <Calendar className="w-4 h-4" />
                {new Date(pole.inspection_date).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500"></div>Basic Information
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DataRow label="Pole Owner" value={pole.pole_owner} />
              <DataRow label="Pole Size" value={pole.pole_size} />
              <DataRow label="Condition" value={pole.condition} />
              <DataRow label="Telecom Attachments" value={pole.telecom_attachments} mono />
            </div>
          </div>

          {/* OCALC Photos */}
          {(pole.ocalc_left_photo || pole.ocalc_middle_photo || pole.ocalc_right_photo) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-blue-500"></div>OCALC Photos
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <PhotoDisplay label="Left" src={pole.ocalc_left_photo} />
                <PhotoDisplay label="Middle" src={pole.ocalc_middle_photo} />
                <PhotoDisplay label="Right" src={pole.ocalc_right_photo} />
              </div>
            </div>
          )}

          {/* Birthmark */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-purple-500"></div>Birthmark
            </h2>
            <div className="flex items-center gap-6">
              <Badge className={pole.has_birthmark ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-zinc-500/20 text-zinc-400 border-zinc-500/50"}>
                {pole.has_birthmark ? "Has Birthmark" : "No Birthmark"}
              </Badge>
              {pole.has_birthmark && pole.birthmark_photo && (
                <PhotoDisplay label="Photo" src={pole.birthmark_photo} />
              )}
            </div>
          </div>

          {/* MGNV */}
          {(pole.mgnv || pole.mgnv_photo) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-cyan-500"></div>MGNV
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <DataRow label="MGNV Present" value={pole.mgnv} />
                <PhotoDisplay label="Photo" src={pole.mgnv_photo} />
              </div>
            </div>
          )}

          {/* Height of Attachment */}
          {(pole.height_of_attachment || pole.height_of_attachment_photo) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-green-500"></div>Height of Attachment
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <DataRow label="Height" value={pole.height_of_attachment ? `${pole.height_of_attachment} ft` : null} mono />
                <PhotoDisplay label="Photo" src={pole.height_of_attachment_photo} />
              </div>
            </div>
          )}

          {/* Down Guy - 4 rows */}
          {(pole.down_guy1_size || pole.down_guy1_direction || pole.down_guy1_owner ||
            pole.down_guy2_size || pole.down_guy2_direction || pole.down_guy2_owner ||
            pole.down_guy3_size || pole.down_guy3_direction || pole.down_guy3_owner ||
            pole.down_guy4_size || pole.down_guy4_direction || pole.down_guy4_owner) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-yellow-500"></div>Down Guys
              </h2>
              <div className="space-y-3">
                {(pole.down_guy1_size || pole.down_guy1_direction || pole.down_guy1_owner || pole.down_guy1_height || pole.down_guy1_lead) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-yellow-400 w-8">1</span>
                      <div className="grid grid-cols-5 gap-4 flex-1">
                        <DataRow label="Size" value={pole.down_guy1_size} />
                        <DataRow label="Direction" value={pole.down_guy1_direction} />
                        <DataRow label="Owner" value={pole.down_guy1_owner} />
                        <DataRow label="Height" value={pole.down_guy1_height ? `${pole.down_guy1_height} ft` : null} mono />
                        <DataRow label="Lead" value={pole.down_guy1_lead} />
                      </div>
                    </div>
                  </div>
                )}
                {(pole.down_guy2_size || pole.down_guy2_direction || pole.down_guy2_owner || pole.down_guy2_height || pole.down_guy2_lead) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-yellow-400 w-8">2</span>
                      <div className="grid grid-cols-5 gap-4 flex-1">
                        <DataRow label="Size" value={pole.down_guy2_size} />
                        <DataRow label="Direction" value={pole.down_guy2_direction} />
                        <DataRow label="Owner" value={pole.down_guy2_owner} />
                        <DataRow label="Height" value={pole.down_guy2_height ? `${pole.down_guy2_height} ft` : null} mono />
                        <DataRow label="Lead" value={pole.down_guy2_lead} />
                      </div>
                    </div>
                  </div>
                )}
                {(pole.down_guy3_size || pole.down_guy3_direction || pole.down_guy3_owner || pole.down_guy3_height || pole.down_guy3_lead) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-yellow-400 w-8">3</span>
                      <div className="grid grid-cols-5 gap-4 flex-1">
                        <DataRow label="Size" value={pole.down_guy3_size} />
                        <DataRow label="Direction" value={pole.down_guy3_direction} />
                        <DataRow label="Owner" value={pole.down_guy3_owner} />
                        <DataRow label="Height" value={pole.down_guy3_height ? `${pole.down_guy3_height} ft` : null} mono />
                        <DataRow label="Lead" value={pole.down_guy3_lead} />
                      </div>
                    </div>
                  </div>
                )}
                {(pole.down_guy4_size || pole.down_guy4_direction || pole.down_guy4_owner || pole.down_guy4_height || pole.down_guy4_lead) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-yellow-400 w-8">4</span>
                      <div className="grid grid-cols-5 gap-4 flex-1">
                        <DataRow label="Size" value={pole.down_guy4_size} />
                        <DataRow label="Direction" value={pole.down_guy4_direction} />
                        <DataRow label="Owner" value={pole.down_guy4_owner} />
                        <DataRow label="Height" value={pole.down_guy4_height ? `${pole.down_guy4_height} ft` : null} mono />
                        <DataRow label="Lead" value={pole.down_guy4_lead} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Down Guy Anchor */}
          {(pole.down_guy_anchor_photo || pole.anchor_knuckles) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-orange-500"></div>Down Guy Anchor
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <PhotoDisplay label="Anchor Photo" src={pole.down_guy_anchor_photo} />
                <DataRow label="Knuckles Used" value={pole.anchor_knuckles} />
              </div>
            </div>
          )}

          {/* Span - Rows */}
          {(pole.span1_direction || pole.span1_distance || pole.span1_owner ||
            pole.span2_direction || pole.span2_distance || pole.span2_owner ||
            pole.span3_direction || pole.span3_distance || pole.span3_owner ||
            pole.span4_direction || pole.span4_distance || pole.span4_owner) && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-indigo-500"></div>Spans
              </h2>
              <div className="space-y-3">
                {(pole.span1_direction || pole.span1_distance || pole.span1_owner) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-indigo-400 w-8">1</span>
                      <div className="grid grid-cols-3 gap-4 flex-1">
                        <DataRow label="Direction" value={pole.span1_direction} />
                        <DataRow label="Distance" value={pole.span1_distance ? `${pole.span1_distance} ft` : null} mono />
                        <DataRow label="Owner" value={pole.span1_owner} />
                      </div>
                    </div>
                  </div>
                )}
                {(pole.span2_direction || pole.span2_distance || pole.span2_owner) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-indigo-400 w-8">2</span>
                      <div className="grid grid-cols-3 gap-4 flex-1">
                        <DataRow label="Direction" value={pole.span2_direction} />
                        <DataRow label="Distance" value={pole.span2_distance ? `${pole.span2_distance} ft` : null} mono />
                        <DataRow label="Owner" value={pole.span2_owner} />
                      </div>
                    </div>
                  </div>
                )}
                {(pole.span3_direction || pole.span3_distance || pole.span3_owner) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-indigo-400 w-8">3</span>
                      <div className="grid grid-cols-3 gap-4 flex-1">
                        <DataRow label="Direction" value={pole.span3_direction} />
                        <DataRow label="Distance" value={pole.span3_distance ? `${pole.span3_distance} ft` : null} mono />
                        <DataRow label="Owner" value={pole.span3_owner} />
                      </div>
                    </div>
                  </div>
                )}
                {(pole.span4_direction || pole.span4_distance || pole.span4_owner) && (
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-indigo-400 w-8">4</span>
                      <div className="grid grid-cols-3 gap-4 flex-1">
                        <DataRow label="Direction" value={pole.span4_direction} />
                        <DataRow label="Distance" value={pole.span4_distance ? `${pole.span4_distance} ft` : null} mono />
                        <DataRow label="Owner" value={pole.span4_owner} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Telecom Attachment */}
          {pole.telecom_attachment_photo && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-pink-500"></div>Telecom Attachment
              </h2>
              <PhotoDisplay label="Photo" src={pole.telecom_attachment_photo} />
            </div>
          )}

          {/* GPS Location */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-emerald-500"></div>GPS Location
            </h2>
            {pole.latitude && pole.longitude ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <DataRow label="Latitude" value={pole.latitude.toFixed(6)} mono />
                    <DataRow label="Longitude" value={pole.longitude.toFixed(6)} mono />
                  </div>
                  <Button onClick={openInMaps} className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700" data-testid="open-maps-btn">
                    <MapPin className="w-4 h-4 mr-2" />Open in Google Maps<ExternalLink className="w-3 h-3 ml-2" />
                  </Button>
                </div>
                <div className="h-64 border border-zinc-700 overflow-hidden">
                  <MapContainer center={mapCenter} zoom={18} style={{ height: "100%", width: "100%" }} className="z-0">
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='&copy; Esri' />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" attribution='' />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" attribution='' />
                    <Marker position={mapCenter} />
                  </MapContainer>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 font-mono text-sm">No GPS coordinates recorded</p>
            )}
          </div>

          {/* Notes */}
          {pole.notes && (
            <div className="industrial-card p-5">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-zinc-500"></div>Notes
              </h2>
              <p className="text-zinc-300 whitespace-pre-wrap">{pole.notes}</p>
            </div>
          )}

          {/* Record Info */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
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
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Pole?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This action cannot be undone. This will permanently delete the pole data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white" data-testid="confirm-delete-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ViewPole;
