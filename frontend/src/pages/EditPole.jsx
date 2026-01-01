import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  MapPin,
  Camera,
  X,
  Zap,
  Loader2,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Photo upload component
const PhotoUpload = ({ label, value, onChange, testId }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => onChange(reader.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
        {label}
      </Label>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        data-testid={`${testId}-input`}
      />
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt={label}
            className="w-full max-w-xs h-32 object-cover border-2 border-zinc-700"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 bg-red-600 hover:bg-red-700"
            onClick={() => onChange("")}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-24 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 border-dashed"
          data-testid={testId}
        >
          <div className="flex flex-col items-center gap-1">
            <Camera className="w-5 h-5" />
            <span className="text-xs">Upload Photo</span>
          </div>
        </Button>
      )}
    </div>
  );
};

// Map click handler component
const MapClickHandler = ({ onLocationSelect }) => {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const EditPole = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [options, setOptions] = useState({
    pole_owners: [],
    conditions: [],
    sizes: [],
    down_guy_owners: [],
    down_guy_directions: [],
    down_guy_sizes: [],
    knuckle_options: [],
    yes_no: [],
  });

  const [formData, setFormData] = useState({
    job_number: "",
    pole_number: "",
    pole_owner: "",
    pole_size: "",
    condition: "",
    telecom_attachments: 0,
    ocalc_left_photo: "",
    ocalc_middle_photo: "",
    ocalc_right_photo: "",
    has_birthmark: true,
    birthmark_photo: "",
    mgnv: "",
    mgnv_photo: "",
    height_of_attachment: "",
    height_of_attachment_photo: "",
    down_guy_photo: "",
    down_guy_size: "",
    down_guy_direction: "",
    down_guy_owner: "",
    down_guy_height: "",
    down_guy_anchor_photo: "",
    anchor_knuckles: "",
    telecom_attachment_photo: "",
    lead_anchor_characteristics: "",
    ground_type: "",
    riser_number: "",
    latitude: "",
    longitude: "",
    notes: "",
  });

  useEffect(() => {
    fetchOptions();
    fetchPole();
  }, [id]);

  const fetchOptions = async () => {
    try {
      const response = await axios.get(`${API}/poles/options`);
      setOptions(response.data);
    } catch (error) {
      toast.error("Failed to fetch form options");
    }
  };

  const fetchPole = async () => {
    try {
      const response = await axios.get(`${API}/poles/${id}`);
      const pole = response.data;
      setFormData({
        job_number: pole.job_number || "",
        pole_number: pole.pole_number || "",
        pole_owner: pole.pole_owner || "",
        pole_size: pole.pole_size || "",
        condition: pole.condition || "",
        telecom_attachments: pole.telecom_attachments || 0,
        ocalc_left_photo: pole.ocalc_left_photo || "",
        ocalc_middle_photo: pole.ocalc_middle_photo || "",
        ocalc_right_photo: pole.ocalc_right_photo || "",
        has_birthmark: pole.has_birthmark !== false,
        birthmark_photo: pole.birthmark_photo || "",
        mgnv: pole.mgnv || "",
        mgnv_photo: pole.mgnv_photo || "",
        height_of_attachment: pole.height_of_attachment?.toString() || "",
        height_of_attachment_photo: pole.height_of_attachment_photo || "",
        down_guy_photo: pole.down_guy_photo || "",
        down_guy_size: pole.down_guy_size || "",
        down_guy_direction: pole.down_guy_direction || "",
        down_guy_owner: pole.down_guy_owner || "",
        down_guy_height: pole.down_guy_height?.toString() || "",
        down_guy_anchor_photo: pole.down_guy_anchor_photo || "",
        anchor_knuckles: pole.anchor_knuckles || "",
        telecom_attachment_photo: pole.telecom_attachment_photo || "",
        lead_anchor_characteristics: pole.lead_anchor_characteristics || "",
        ground_type: pole.ground_type || "",
        riser_number: pole.riser_number?.toString() || "",
        latitude: pole.latitude?.toString() || "",
        longitude: pole.longitude?.toString() || "",
        notes: pole.notes || "",
      });
    } catch (error) {
      toast.error("Failed to fetch pole data");
      navigate("/");
    } finally {
      setFetching(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleMapClick = (lat, lng) => {
    setFormData((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
    toast.success("Location pinned on map!");
  };

  const getGPSLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
        toast.success("GPS location captured!");
      },
      () => {
        setGpsLoading(false);
        toast.error("Failed to get location");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.pole_owner || !formData.pole_size || !formData.condition) {
      toast.error("Please fill in Pole Owner, Size, and Condition");
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        telecom_attachments: parseInt(formData.telecom_attachments) || 0,
        height_of_attachment: formData.height_of_attachment ? parseFloat(formData.height_of_attachment) : null,
        down_guy_height: formData.down_guy_height ? parseFloat(formData.down_guy_height) : null,
        riser_number: formData.riser_number ? parseInt(formData.riser_number) : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };

      await axios.put(`${API}/poles/${id}`, submitData);
      toast.success("Pole data updated successfully!");
      navigate("/");
    } catch (error) {
      toast.error("Failed to update pole data");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
      </div>
    );
  }

  const mapCenter = formData.latitude && formData.longitude
    ? [parseFloat(formData.latitude), parseFloat(formData.longitude)]
    : [37.7749, -122.4194];

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="edit-pole-page">
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
                <div className="w-10 h-10 bg-orange-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h1 className="font-heading text-xl font-bold tracking-tight uppercase text-white">
                  Edit Pole
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-mono text-zinc-500">JOB/EWO:</Label>
                <Input
                  name="job_number"
                  value={formData.job_number}
                  onChange={handleInputChange}
                  className="w-32 h-8 bg-black border-zinc-700 text-white text-sm"
                  data-testid="job-number-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-mono text-zinc-500">POLE #:</Label>
                <Input
                  name="pole_number"
                  value={formData.pole_number}
                  onChange={handleInputChange}
                  className="w-32 h-8 bg-black border-zinc-700 text-white text-sm"
                  data-testid="pole-number-input"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500"></div>
              Basic Information
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Owner *</Label>
                <Select value={formData.pole_owner} onValueChange={(v) => handleSelectChange("pole_owner", v)}>
                  <SelectTrigger className={`h-10 bg-black border-zinc-700 ${formData.pole_owner === "Power" ? "text-red-500 border-red-500/50" : formData.pole_owner === "Telecom" ? "text-orange-500 border-orange-500/50" : "text-white"}`} data-testid="pole-owner-select">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.pole_owners.map((o) => (
                      <SelectItem key={o} value={o} className={o === "Power" ? "text-red-500" : "text-orange-500"}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Size *</Label>
                <Select value={formData.pole_size} onValueChange={(v) => handleSelectChange("pole_size", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="pole-size-select">
                    <SelectValue placeholder="Class-Height" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                    {options.sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Condition *</Label>
                <Select value={formData.condition} onValueChange={(v) => handleSelectChange("condition", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="condition-select">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem>
                    <SelectItem value="Good" className="text-yellow-400">Good</SelectItem>
                    <SelectItem value="Bad" className="text-red-400">Bad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Telecom Attachments</Label>
                <Input type="number" name="telecom_attachments" value={formData.telecom_attachments} onChange={handleInputChange} min="0" className="h-10 bg-black border-zinc-700 text-white" />
              </div>
            </div>
          </div>

          {/* OCALC Photos */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-blue-500"></div>
              OCALC Photos
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <PhotoUpload label="Left" value={formData.ocalc_left_photo} onChange={(v) => handlePhotoChange("ocalc_left_photo", v)} testId="ocalc-left" />
              <PhotoUpload label="Middle" value={formData.ocalc_middle_photo} onChange={(v) => handlePhotoChange("ocalc_middle_photo", v)} testId="ocalc-middle" />
              <PhotoUpload label="Right" value={formData.ocalc_right_photo} onChange={(v) => handlePhotoChange("ocalc_right_photo", v)} testId="ocalc-right" />
            </div>
          </div>

          {/* Birthmark */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-purple-500"></div>
              Birthmark
            </h2>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Switch checked={formData.has_birthmark} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, has_birthmark: checked, birthmark_photo: checked ? prev.birthmark_photo : "" }))} />
                <Label className="text-sm text-zinc-300">{formData.has_birthmark ? "Has Birthmark" : "No Birthmark"}</Label>
              </div>
              {formData.has_birthmark && (
                <div className="flex-1">
                  <PhotoUpload label="Birthmark Photo" value={formData.birthmark_photo} onChange={(v) => handlePhotoChange("birthmark_photo", v)} testId="birthmark" />
                </div>
              )}
            </div>
          </div>

          {/* MGNV */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-cyan-500"></div>
              MGNV
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">MGNV Present</Label>
                <Select value={formData.mgnv} onValueChange={(v) => handleSelectChange("mgnv", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Yes / No" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <PhotoUpload label="MGNV Photo" value={formData.mgnv_photo} onChange={(v) => handlePhotoChange("mgnv_photo", v)} testId="mgnv" />
            </div>
          </div>

          {/* Height of Attachment */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-green-500"></div>
              Height of Attachment
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Height (ft)</Label>
                <Input type="number" name="height_of_attachment" value={formData.height_of_attachment} onChange={handleInputChange} step="0.1" className="h-10 bg-black border-zinc-700 text-white" />
              </div>
              <PhotoUpload label="Photo" value={formData.height_of_attachment_photo} onChange={(v) => handlePhotoChange("height_of_attachment_photo", v)} testId="height-attachment" />
            </div>
          </div>

          {/* Down Guy */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-yellow-500"></div>
              Down Guy
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <PhotoUpload label="Down Guy Photo" value={formData.down_guy_photo} onChange={(v) => handlePhotoChange("down_guy_photo", v)} testId="down-guy" />
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Size</Label>
                <Select value={formData.down_guy_size} onValueChange={(v) => handleSelectChange("down_guy_size", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Select size" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Direction</Label>
                <Select value={formData.down_guy_direction} onValueChange={(v) => handleSelectChange("down_guy_direction", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Direction" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Owner</Label>
                <Select value={formData.down_guy_owner} onValueChange={(v) => handleSelectChange("down_guy_owner", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Owner" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Height (ft)</Label>
                <Input type="number" name="down_guy_height" value={formData.down_guy_height} onChange={handleInputChange} step="0.1" className="h-10 bg-black border-zinc-700 text-white" />
              </div>
            </div>
          </div>

          {/* Down Guy Anchor */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-orange-500"></div>
              Down Guy Anchor
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <PhotoUpload label="Anchor Photo" value={formData.down_guy_anchor_photo} onChange={(v) => handlePhotoChange("down_guy_anchor_photo", v)} testId="down-guy-anchor" />
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Knuckles Used</Label>
                <Select value={formData.anchor_knuckles} onValueChange={(v) => handleSelectChange("anchor_knuckles", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="# of knuckles" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.knuckle_options.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Telecom Attachment */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-pink-500"></div>
              Telecom Attachment
            </h2>
            <PhotoUpload label="Telecom Attachment Photo" value={formData.telecom_attachment_photo} onChange={(v) => handlePhotoChange("telecom_attachment_photo", v)} testId="telecom-attachment" />
          </div>

          {/* GPS & Map */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-emerald-500"></div>
              GPS Location
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Latitude</Label>
                    <Input type="text" name="latitude" value={formData.latitude} onChange={handleInputChange} className="h-10 bg-black border-zinc-700 text-white font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Longitude</Label>
                    <Input type="text" name="longitude" value={formData.longitude} onChange={handleInputChange} className="h-10 bg-black border-zinc-700 text-white font-mono" />
                  </div>
                </div>
                <Button type="button" onClick={getGPSLocation} disabled={gpsLoading} className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700">
                  {gpsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                  Get Current Location
                </Button>
              </div>
              <div className="h-64 border border-zinc-700 overflow-hidden">
                <MapContainer center={mapCenter} zoom={13} style={{ height: "100%", width: "100%" }} className="z-0">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                  <MapClickHandler onLocationSelect={handleMapClick} />
                  {formData.latitude && formData.longitude && (
                    <Marker position={[parseFloat(formData.latitude), parseFloat(formData.longitude)]} />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-zinc-500"></div>
              Additional Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Lead & Anchor</Label>
                <Input name="lead_anchor_characteristics" value={formData.lead_anchor_characteristics} onChange={handleInputChange} className="h-10 bg-black border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Ground Type</Label>
                <Input name="ground_type" value={formData.ground_type} onChange={handleInputChange} className="h-10 bg-black border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Riser Number</Label>
                <Input type="number" name="riser_number" value={formData.riser_number} onChange={handleInputChange} min="0" className="h-10 bg-black border-zinc-700 text-white" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Notes</Label>
              <Textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={3} className="bg-black border-zinc-700 text-white resize-none" />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link to="/"><Button type="button" variant="outline" className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white">Cancel</Button></Link>
            <Button type="submit" disabled={loading} className="bg-red-600 hover:bg-red-700 text-white min-w-32">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Update Pole</>}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default EditPole;
