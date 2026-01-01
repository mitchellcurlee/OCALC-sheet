import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  Zap,
  Loader2,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { PhotoUpload } from "@/components/PhotoUpload";

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Map click handler component
const MapClickHandler = ({ onLocationSelect }) => {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const AddPole = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
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
    good_broken: [],
    span_owners: [],
    span_directions: [],
    attachment_owners: [],
    riser_options: [],
  });

  const [formData, setFormData] = useState({
    // Title Info
    job_number: "",
    pole_number: "",
    // Basic Info
    pole_owner: "",
    pole_size: "",
    condition: "",
    // OCALC Photos
    ocalc_left_photo: "",
    ocalc_middle_photo: "",
    ocalc_right_photo: "",
    // Birthmark
    has_birthmark: true,
    birthmark_photo: "",
    // MGNV
    mgnv: "",
    mgnv_condition: "",
    mgnv_photo: "",
    // Height of Attachment (5 rows)
    attachment1_height: "",
    attachment1_owner: "",
    attachment1_photo: "",
    attachment2_height: "",
    attachment2_owner: "",
    attachment2_photo: "",
    attachment3_height: "",
    attachment3_owner: "",
    attachment3_photo: "",
    attachment4_height: "",
    attachment4_owner: "",
    attachment4_photo: "",
    attachment5_height: "",
    attachment5_owner: "",
    attachment5_photo: "",
    // Pole Terminal
    pole_terminal: "",
    // Risers
    risers: "",
    // Telecom Attachment Photo
    telecom_attachment_photo: "",
    // Down Guy (4 rows)
    down_guy1_size: "",
    down_guy1_direction: "",
    down_guy1_owner: "",
    down_guy1_height: "",
    down_guy1_lead: "",
    down_guy2_size: "",
    down_guy2_direction: "",
    down_guy2_owner: "",
    down_guy2_height: "",
    down_guy2_lead: "",
    down_guy3_size: "",
    down_guy3_direction: "",
    down_guy3_owner: "",
    down_guy3_height: "",
    down_guy3_lead: "",
    down_guy4_size: "",
    down_guy4_direction: "",
    down_guy4_owner: "",
    down_guy4_height: "",
    down_guy4_lead: "",
    // Knuckles (4 rows)
    knuckle1_count: "",
    knuckle1_condition: "",
    knuckle1_photo: "",
    knuckle2_count: "",
    knuckle2_condition: "",
    knuckle2_photo: "",
    knuckle3_count: "",
    knuckle3_condition: "",
    knuckle3_photo: "",
    knuckle4_count: "",
    knuckle4_condition: "",
    knuckle4_photo: "",
    // Span (4 spans)
    span1_direction: "",
    span1_distance: "",
    span1_owner: "",
    span2_direction: "",
    span2_distance: "",
    span2_owner: "",
    span3_direction: "",
    span3_distance: "",
    span3_owner: "",
    span4_direction: "",
    span4_distance: "",
    span4_owner: "",
    // GPS
    latitude: "",
    longitude: "",
    notes: "",
  });

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const response = await axios.get(`${API}/poles/options`);
      setOptions(response.data);
    } catch (error) {
      toast.error("Failed to fetch form options");
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
      toast.error("Geolocation is not supported by your browser");
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
      (error) => {
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
        attachment1_height: formData.attachment1_height ? parseFloat(formData.attachment1_height) : null,
        attachment2_height: formData.attachment2_height ? parseFloat(formData.attachment2_height) : null,
        attachment3_height: formData.attachment3_height ? parseFloat(formData.attachment3_height) : null,
        attachment4_height: formData.attachment4_height ? parseFloat(formData.attachment4_height) : null,
        attachment5_height: formData.attachment5_height ? parseFloat(formData.attachment5_height) : null,
        down_guy1_height: formData.down_guy1_height ? parseFloat(formData.down_guy1_height) : null,
        down_guy2_height: formData.down_guy2_height ? parseFloat(formData.down_guy2_height) : null,
        down_guy3_height: formData.down_guy3_height ? parseFloat(formData.down_guy3_height) : null,
        down_guy4_height: formData.down_guy4_height ? parseFloat(formData.down_guy4_height) : null,
        span1_distance: formData.span1_distance ? parseFloat(formData.span1_distance) : null,
        span2_distance: formData.span2_distance ? parseFloat(formData.span2_distance) : null,
        span3_distance: formData.span3_distance ? parseFloat(formData.span3_distance) : null,
        span4_distance: formData.span4_distance ? parseFloat(formData.span4_distance) : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };

      await axios.post(`${API}/poles`, submitData);
      toast.success("Pole data saved successfully!");
      navigate("/");
    } catch (error) {
      toast.error("Failed to save pole data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const mapCenter = formData.latitude && formData.longitude
    ? [parseFloat(formData.latitude), parseFloat(formData.longitude)]
    : [37.7749, -122.4194];

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="add-pole-page">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white" data-testid="back-btn">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h1 className="font-heading text-xl font-bold tracking-tight uppercase text-white">
                  Pole Data Sheet / OCALC
                </h1>
              </div>
            </div>
            {/* Title Area - Job/EWO and Pole Number */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-mono text-zinc-500">JOB/EWO:</Label>
                <Input
                  name="job_number"
                  value={formData.job_number}
                  onChange={handleInputChange}
                  placeholder="Enter Job #"
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
                  placeholder="Enter Pole #"
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Pole Owner *
                </Label>
                <Select value={formData.pole_owner} onValueChange={(v) => handleSelectChange("pole_owner", v)}>
                  <SelectTrigger className={`h-10 bg-black border-zinc-700 ${formData.pole_owner === "Foreign Owned" ? "text-red-500 border-red-500/50" : formData.pole_owner === "ATT" ? "text-orange-500 border-orange-500/50" : "text-white"}`} data-testid="pole-owner-select">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.pole_owners.map((o) => (
                      <SelectItem key={o} value={o} className={o === "Foreign Owned" ? "text-red-500" : "text-orange-500"}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Pole Size *
                </Label>
                <Select value={formData.pole_size} onValueChange={(v) => handleSelectChange("pole_size", v)}>
                  <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="pole-size-select">
                    <SelectValue placeholder="Class-Height" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                    {options.sizes.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Condition *
                </Label>
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
            </div>
          </div>

          {/* Span - 4 Rows */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-indigo-500"></div>
              Spans
            </h2>
            <div className="space-y-3">
              {/* Span 1 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-indigo-400 w-8">1</span>
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                      <Select value={formData.span1_direction} onValueChange={(v) => handleSelectChange("span1_direction", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Distance (ft)</Label>
                      <Input type="number" name="span1_distance" value={formData.span1_distance} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.span1_owner} onValueChange={(v) => handleSelectChange("span1_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              {/* Span 2 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-indigo-400 w-8">2</span>
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                      <Select value={formData.span2_direction} onValueChange={(v) => handleSelectChange("span2_direction", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Distance (ft)</Label>
                      <Input type="number" name="span2_distance" value={formData.span2_distance} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.span2_owner} onValueChange={(v) => handleSelectChange("span2_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              {/* Span 3 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-indigo-400 w-8">3</span>
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                      <Select value={formData.span3_direction} onValueChange={(v) => handleSelectChange("span3_direction", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Distance (ft)</Label>
                      <Input type="number" name="span3_distance" value={formData.span3_distance} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.span3_owner} onValueChange={(v) => handleSelectChange("span3_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              {/* Span 4 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-indigo-400 w-8">4</span>
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                      <Select value={formData.span4_direction} onValueChange={(v) => handleSelectChange("span4_direction", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Distance (ft)</Label>
                      <Input type="number" name="span4_distance" value={formData.span4_distance} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.span4_owner} onValueChange={(v) => handleSelectChange("span4_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.span_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                    <Input type="text" name="latitude" value={formData.latitude} onChange={handleInputChange} placeholder="37.7749" className="h-10 bg-black border-zinc-700 text-white font-mono" data-testid="latitude-input" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Longitude</Label>
                    <Input type="text" name="longitude" value={formData.longitude} onChange={handleInputChange} placeholder="-122.4194" className="h-10 bg-black border-zinc-700 text-white font-mono" data-testid="longitude-input" />
                  </div>
                </div>
                <Button type="button" onClick={getGPSLocation} disabled={gpsLoading} className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700" data-testid="get-gps-btn">
                  {gpsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                  Get Current Location
                </Button>
                <p className="text-xs text-zinc-500">Click on the map to pin location</p>
              </div>
              <div className="h-64 border border-zinc-700 overflow-hidden">
                <MapContainer center={mapCenter} zoom={18} style={{ height: "100%", width: "100%" }} className="z-0">
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='&copy; Esri' />
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" attribution='' />
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" attribution='' />
                  <MapClickHandler onLocationSelect={handleMapClick} />
                  {formData.latitude && formData.longitude && (
                    <Marker position={[parseFloat(formData.latitude), parseFloat(formData.longitude)]} />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* OCALC Photos */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-blue-500"></div>
              OCALC Photos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PhotoUpload label="Left" value={formData.ocalc_left_photo} onChange={(v) => handlePhotoChange("ocalc_left_photo", v)} testId="ocalc-left" />
              <PhotoUpload label="Middle" value={formData.ocalc_middle_photo} onChange={(v) => handlePhotoChange("ocalc_middle_photo", v)} testId="ocalc-middle" />
              <PhotoUpload label="Right" value={formData.ocalc_right_photo} onChange={(v) => handlePhotoChange("ocalc_right_photo", v)} testId="ocalc-right" />
            </div>
          </div>

          {/* Down Guys with Knuckles */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-yellow-500"></div>
              Down Guys
            </h2>
            <div className="space-y-3">
              {/* Down Guy 1 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-yellow-400 w-8">1</span>
                  <div className="grid grid-cols-5 gap-3 flex-1">
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Size</Label><Select value={formData.down_guy1_size} onValueChange={(v) => handleSelectChange("down_guy1_size", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Size" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Direction</Label><Select value={formData.down_guy1_direction} onValueChange={(v) => handleSelectChange("down_guy1_direction", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Owner</Label><Select value={formData.down_guy1_owner} onValueChange={(v) => handleSelectChange("down_guy1_owner", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Height (ft)</Label><Input type="number" name="down_guy1_height" value={formData.down_guy1_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Lead</Label><Input name="down_guy1_lead" value={formData.down_guy1_lead} onChange={handleInputChange} className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                  </div>
                </div>
              </div>
              {/* Down Guy 2 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-yellow-400 w-8">2</span>
                  <div className="grid grid-cols-5 gap-3 flex-1">
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Size</Label><Select value={formData.down_guy2_size} onValueChange={(v) => handleSelectChange("down_guy2_size", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Size" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Direction</Label><Select value={formData.down_guy2_direction} onValueChange={(v) => handleSelectChange("down_guy2_direction", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Owner</Label><Select value={formData.down_guy2_owner} onValueChange={(v) => handleSelectChange("down_guy2_owner", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Height (ft)</Label><Input type="number" name="down_guy2_height" value={formData.down_guy2_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Lead</Label><Input name="down_guy2_lead" value={formData.down_guy2_lead} onChange={handleInputChange} className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                  </div>
                </div>
              </div>
              {/* Down Guy 3 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-yellow-400 w-8">3</span>
                  <div className="grid grid-cols-5 gap-3 flex-1">
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Size</Label><Select value={formData.down_guy3_size} onValueChange={(v) => handleSelectChange("down_guy3_size", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Size" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Direction</Label><Select value={formData.down_guy3_direction} onValueChange={(v) => handleSelectChange("down_guy3_direction", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Owner</Label><Select value={formData.down_guy3_owner} onValueChange={(v) => handleSelectChange("down_guy3_owner", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Height (ft)</Label><Input type="number" name="down_guy3_height" value={formData.down_guy3_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Lead</Label><Input name="down_guy3_lead" value={formData.down_guy3_lead} onChange={handleInputChange} className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                  </div>
                </div>
              </div>
              {/* Down Guy 4 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-yellow-400 w-8">4</span>
                  <div className="grid grid-cols-5 gap-3 flex-1">
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Size</Label><Select value={formData.down_guy4_size} onValueChange={(v) => handleSelectChange("down_guy4_size", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Size" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Direction</Label><Select value={formData.down_guy4_direction} onValueChange={(v) => handleSelectChange("down_guy4_direction", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Owner</Label><Select value={formData.down_guy4_owner} onValueChange={(v) => handleSelectChange("down_guy4_owner", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Height (ft)</Label><Input type="number" name="down_guy4_height" value={formData.down_guy4_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                    <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Lead</Label><Input name="down_guy4_lead" value={formData.down_guy4_lead} onChange={handleInputChange} className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                  </div>
                </div>
              </div>
              {/* Knuckles */}
              <div className="mt-4 pt-4 border-t border-zinc-700">
                <h3 className="text-sm font-mono text-orange-400 mb-3">KNUCKLES</h3>
                <div className="space-y-3">
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700"><div className="flex items-center gap-4"><span className="text-sm font-mono text-orange-400 w-8">1</span><div className="grid grid-cols-3 gap-3 flex-1 items-end"><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Knuckles Used</Label><Select value={formData.knuckle1_count} onValueChange={(v) => handleSelectChange("knuckle1_count", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Count" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.knuckle_options.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Condition</Label><Select value={formData.knuckle1_condition} onValueChange={(v) => handleSelectChange("knuckle1_condition", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem><SelectItem value="Good" className="text-yellow-400">Good</SelectItem><SelectItem value="Bad" className="text-red-400">Bad</SelectItem></SelectContent></Select></div><PhotoUpload label="Photo" value={formData.knuckle1_photo} onChange={(v) => handlePhotoChange("knuckle1_photo", v)} testId="knuckle1" compact /></div></div></div>
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700"><div className="flex items-center gap-4"><span className="text-sm font-mono text-orange-400 w-8">2</span><div className="grid grid-cols-3 gap-3 flex-1 items-end"><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Knuckles Used</Label><Select value={formData.knuckle2_count} onValueChange={(v) => handleSelectChange("knuckle2_count", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Count" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.knuckle_options.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Condition</Label><Select value={formData.knuckle2_condition} onValueChange={(v) => handleSelectChange("knuckle2_condition", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem><SelectItem value="Good" className="text-yellow-400">Good</SelectItem><SelectItem value="Bad" className="text-red-400">Bad</SelectItem></SelectContent></Select></div><PhotoUpload label="Photo" value={formData.knuckle2_photo} onChange={(v) => handlePhotoChange("knuckle2_photo", v)} testId="knuckle2" compact /></div></div></div>
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700"><div className="flex items-center gap-4"><span className="text-sm font-mono text-orange-400 w-8">3</span><div className="grid grid-cols-3 gap-3 flex-1 items-end"><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Knuckles Used</Label><Select value={formData.knuckle3_count} onValueChange={(v) => handleSelectChange("knuckle3_count", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Count" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.knuckle_options.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Condition</Label><Select value={formData.knuckle3_condition} onValueChange={(v) => handleSelectChange("knuckle3_condition", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem><SelectItem value="Good" className="text-yellow-400">Good</SelectItem><SelectItem value="Bad" className="text-red-400">Bad</SelectItem></SelectContent></Select></div><PhotoUpload label="Photo" value={formData.knuckle3_photo} onChange={(v) => handlePhotoChange("knuckle3_photo", v)} testId="knuckle3" compact /></div></div></div>
                  <div className="bg-zinc-800/50 p-3 border border-zinc-700"><div className="flex items-center gap-4"><span className="text-sm font-mono text-orange-400 w-8">4</span><div className="grid grid-cols-3 gap-3 flex-1 items-end"><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Knuckles Used</Label><Select value={formData.knuckle4_count} onValueChange={(v) => handleSelectChange("knuckle4_count", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Count" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.knuckle_options.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Condition</Label><Select value={formData.knuckle4_condition} onValueChange={(v) => handleSelectChange("knuckle4_condition", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem><SelectItem value="Good" className="text-yellow-400">Good</SelectItem><SelectItem value="Bad" className="text-red-400">Bad</SelectItem></SelectContent></Select></div><PhotoUpload label="Photo" value={formData.knuckle4_photo} onChange={(v) => handlePhotoChange("knuckle4_photo", v)} testId="knuckle4" compact /></div></div></div>
                </div>
              </div>
            </div>
          </div>

          {/* Height of Attachments - 5 Rows */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-green-500"></div>
              Height of Attachments
            </h2>
            <div className="space-y-3">
              {/* Attachment 1 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-green-400 w-8">1</span>
                  <div className="grid grid-cols-3 gap-3 flex-1 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Height (ft)</Label>
                      <Input type="number" name="attachment1_height" value={formData.attachment1_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.attachment1_owner} onValueChange={(v) => handleSelectChange("attachment1_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.attachment_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <PhotoUpload label="Photo" value={formData.attachment1_photo} onChange={(v) => handlePhotoChange("attachment1_photo", v)} testId="attachment1" compact />
                  </div>
                </div>
              </div>

              {/* Attachment 2 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-green-400 w-8">2</span>
                  <div className="grid grid-cols-3 gap-3 flex-1 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Height (ft)</Label>
                      <Input type="number" name="attachment2_height" value={formData.attachment2_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.attachment2_owner} onValueChange={(v) => handleSelectChange("attachment2_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.attachment_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <PhotoUpload label="Photo" value={formData.attachment2_photo} onChange={(v) => handlePhotoChange("attachment2_photo", v)} testId="attachment2" compact />
                  </div>
                </div>
              </div>

              {/* Attachment 3 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-green-400 w-8">3</span>
                  <div className="grid grid-cols-3 gap-3 flex-1 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Height (ft)</Label>
                      <Input type="number" name="attachment3_height" value={formData.attachment3_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.attachment3_owner} onValueChange={(v) => handleSelectChange("attachment3_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.attachment_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <PhotoUpload label="Photo" value={formData.attachment3_photo} onChange={(v) => handlePhotoChange("attachment3_photo", v)} testId="attachment3" compact />
                  </div>
                </div>
              </div>

              {/* Attachment 4 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-green-400 w-8">4</span>
                  <div className="grid grid-cols-3 gap-3 flex-1 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Height (ft)</Label>
                      <Input type="number" name="attachment4_height" value={formData.attachment4_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.attachment4_owner} onValueChange={(v) => handleSelectChange("attachment4_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.attachment_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <PhotoUpload label="Photo" value={formData.attachment4_photo} onChange={(v) => handlePhotoChange("attachment4_photo", v)} testId="attachment4" compact />
                  </div>
                </div>
              </div>

              {/* Attachment 5 */}
              <div className="bg-zinc-800/50 p-3 border border-zinc-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-green-400 w-8">5</span>
                  <div className="grid grid-cols-3 gap-3 flex-1 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Height (ft)</Label>
                      <Input type="number" name="attachment5_height" value={formData.attachment5_height} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                      <Select value={formData.attachment5_owner} onValueChange={(v) => handleSelectChange("attachment5_owner", v)}>
                        <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {options.attachment_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <PhotoUpload label="Photo" value={formData.attachment5_photo} onChange={(v) => handlePhotoChange("attachment5_photo", v)} testId="attachment5" compact />
                  </div>
                </div>
              </div>

              {/* Pole Terminal and Risers */}
              <div className="mt-4 pt-4 border-t border-zinc-700">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Terminal</Label>
                    <Select value={formData.pole_terminal} onValueChange={(v) => handleSelectChange("pole_terminal", v)}>
                      <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="pole-terminal-select">
                        <SelectValue placeholder="Yes / No" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Risers</Label>
                    <Select value={formData.risers} onValueChange={(v) => handleSelectChange("risers", v)}>
                      <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="risers-select">
                        <SelectValue placeholder="Select #" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {options.riser_options.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Birthmark & MGNV */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-purple-500"></div>
              Birthmark & MGNV
            </h2>
            <div className="space-y-4">
              {/* Birthmark */}
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="flex items-center gap-3">
                  <Switch checked={formData.has_birthmark} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, has_birthmark: checked, birthmark_photo: checked ? prev.birthmark_photo : "" }))} data-testid="has-birthmark-switch" />
                  <Label className="text-sm text-zinc-300">{formData.has_birthmark ? "Has Birthmark" : "No Birthmark"}</Label>
                </div>
                {formData.has_birthmark && (
                  <div className="flex-1 w-full sm:w-auto">
                    <PhotoUpload label="Birthmark Photo" value={formData.birthmark_photo} onChange={(v) => handlePhotoChange("birthmark_photo", v)} testId="birthmark" />
                  </div>
                )}
              </div>
              {/* MGNV */}
              <div className="pt-4 border-t border-zinc-700">
                <h3 className="text-sm font-mono text-cyan-400 mb-3">MGNV</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">MGNV Present</Label>
                    <Select value={formData.mgnv} onValueChange={(v) => handleSelectChange("mgnv", v)}>
                      <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="mgnv-select"><SelectValue placeholder="Yes / No" /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Condition</Label>
                    <Select value={formData.mgnv_condition} onValueChange={(v) => handleSelectChange("mgnv_condition", v)}>
                      <SelectTrigger className="h-10 bg-black border-zinc-700 text-white" data-testid="mgnv-condition-select"><SelectValue placeholder="Good / Broken" /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Good" className="text-green-400">Good</SelectItem><SelectItem value="Broken" className="text-red-400">Broken</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <PhotoUpload label="MGNV Photo" value={formData.mgnv_photo} onChange={(v) => handlePhotoChange("mgnv_photo", v)} testId="mgnv" />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="industrial-card p-5">
            <h2 className="font-heading text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-zinc-500"></div>
              Notes
            </h2>
            <div className="space-y-2">
              <Textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Additional notes..."
                rows={3}
                className="bg-black border-zinc-700 text-white resize-none"
                data-testid="notes-input"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link to="/">
              <Button type="button" variant="outline" className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white" data-testid="cancel-btn">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading} className="bg-red-600 hover:bg-red-700 text-white min-w-32" data-testid="save-pole-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Save Pole</>}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddPole;
