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
  Image,
} from "lucide-react";

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
      window.open(
        `https://www.google.com/maps?q=${pole.latitude},${pole.longitude}`,
        "_blank"
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 font-mono">Loading pole data...</p>
        </div>
      </div>
    );
  }

  if (!pole) {
    return null;
  }

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="view-pole-page">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-zinc-400 hover:text-white"
                  data-testid="back-btn"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 flex items-center justify-center ${
                    pole.pole_type === "Power"
                      ? "bg-red-600"
                      : "bg-orange-600"
                  }`}
                >
                  {pole.pole_type === "Power" ? (
                    <Zap className="w-6 h-6 text-white" />
                  ) : (
                    <Radio className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h1 className="font-heading text-xl font-bold tracking-tight uppercase text-white">
                    Pole Details
                  </h1>
                  <p className="text-xs text-zinc-500 font-mono">
                    ID: {pole.id.slice(0, 8)}...
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/edit/${pole.id}`}>
                <Button
                  variant="outline"
                  className="industrial-button bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white"
                  data-testid="edit-btn"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="industrial-button bg-red-600 hover:bg-red-700"
                data-testid="delete-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Type and Condition Banner */}
          <div className="industrial-card p-6">
            <div className="flex flex-wrap items-center gap-4">
              <Badge
                className={`${
                  pole.pole_type === "Power" ? "pole-power" : "pole-telecom"
                } border font-mono text-sm px-4 py-2`}
              >
                {pole.pole_type === "Power" ? (
                  <Zap className="w-4 h-4 mr-2" />
                ) : (
                  <Radio className="w-4 h-4 mr-2" />
                )}
                {pole.pole_type} Pole
              </Badge>
              <Badge
                className={`${getConditionColor(pole.condition)} border font-mono text-sm px-4 py-2`}
              >
                Condition: {pole.condition}
              </Badge>
              <div className="flex items-center gap-2 text-zinc-400 font-mono text-sm">
                <Calendar className="w-4 h-4" />
                Inspected: {new Date(pole.inspection_date).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Photo */}
          {pole.photo_base64 && (
            <div className="industrial-card p-6">
              <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-1 h-6 bg-blue-500"></div>
                Photo Documentation
              </h2>
              <img
                src={pole.photo_base64}
                alt="Pole"
                className="max-w-full max-h-96 object-contain border-2 border-zinc-700"
                data-testid="pole-photo"
              />
            </div>
          )}

          {/* Basic Info */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-red-500"></div>
              Basic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DataRow label="Pole Type" value={pole.pole_type} />
              <DataRow label="Pole Size" value={pole.pole_size} />
              <DataRow label="Condition" value={pole.condition} />
              <DataRow
                label="Telecom Attachments"
                value={pole.telecom_attachments}
              />
            </div>
          </div>

          {/* Technical Details */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-orange-500"></div>
              Technical Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DataRow
                label="Down Guy Height"
                value={pole.down_guy_height ? `${pole.down_guy_height} ft` : "—"}
              />
              <DataRow
                label="Height of Attachment"
                value={
                  pole.height_of_attachment
                    ? `${pole.height_of_attachment} ft`
                    : "—"
                }
              />
              <DataRow
                label="Lead & Anchor"
                value={pole.lead_anchor_characteristics || "—"}
              />
              <DataRow label="Ground Type" value={pole.ground_type || "—"} />
              <DataRow label="Riser Number" value={pole.riser_number || "—"} />
            </div>
          </div>

          {/* GPS Location */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-green-500"></div>
              GPS Location
            </h2>
            {pole.latitude && pole.longitude ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <DataRow
                    label="Latitude"
                    value={pole.latitude.toFixed(6)}
                    mono
                  />
                  <DataRow
                    label="Longitude"
                    value={pole.longitude.toFixed(6)}
                    mono
                  />
                </div>
                <Button
                  onClick={openInMaps}
                  className="industrial-button bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                  data-testid="open-maps-btn"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Open in Google Maps
                  <ExternalLink className="w-3 h-3 ml-2" />
                </Button>
              </div>
            ) : (
              <p className="text-zinc-500 font-mono text-sm">
                No GPS coordinates recorded
              </p>
            )}
          </div>

          {/* Notes */}
          {pole.notes && (
            <div className="industrial-card p-6">
              <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
                <div className="w-1 h-6 bg-purple-500"></div>
                Additional Notes
              </h2>
              <p className="text-zinc-300 whitespace-pre-wrap">{pole.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-zinc-500"></div>
              Record Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DataRow label="Record ID" value={pole.id} mono small />
              <DataRow
                label="Created"
                value={new Date(pole.created_at).toLocaleString()}
              />
              <DataRow
                label="Last Updated"
                value={new Date(pole.updated_at).toLocaleString()}
              />
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
              This action cannot be undone. This will permanently delete the pole
              data from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const DataRow = ({ label, value, mono = false, small = false }) => (
  <div className="space-y-1">
    <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
      {label}
    </p>
    <p
      className={`text-zinc-200 ${mono ? "font-mono" : ""} ${
        small ? "text-xs break-all" : ""
      }`}
    >
      {value}
    </p>
  </div>
);

export default ViewPole;
