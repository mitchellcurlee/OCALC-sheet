import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { ArrowLeft, Save, Loader2, MapPin, Search, Pencil } from "lucide-react";

const MapClickHandler = ({ onSelect }) => {
  useMapEvents({ click: (e) => onSelect(e.latlng.lat, e.latlng.lng) });
  return null;
};

const MapCenterUpdater = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    const a = parseFloat(lat);
    const b = parseFloat(lng);
    if (Number.isFinite(a) && Number.isFinite(b)) map.flyTo([a, b], 19, { duration: 1.2 });
  }, [lat, lng, map]);
  return null;
};

const UndergroundForm = () => {
  const navigate = useNavigate();
  const { jobId, id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const backUrl = `/jobs/${jobId}`;

  const [types, setTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const [formData, setFormData] = useState({
    type: searchParams.get("type") || "",
    material_type: "", // Subtype for Handhole, Hoffman Box, Pedestal
    latitude: "",
    longitude: "-",
    label: "",
    notes: "",
    photos: [],
    tie_in_measurements: "", // For Handhole/Pole tie-in measurements
  });

  // Material type options based on underground type
  const materialTypeOptions = useMemo(() => {
    const typeMap = {
      "Handhole": ["Concrete", "Concrete/ Bi-fold Metal", "Concrete/ MH lid", "Fiber Glass", "Plastic"],
      "Hoffman Box": ["Community", "Private"],
      "Pedestal": ["Copper", "Fiber"],
    };
    return typeMap[formData.type] || [];
  }, [formData.type]);

  const fetchOptions = useCallback(async () => {
    try {
      const res = await axios.get("/poles/options");
      setTypes(res.data.underground_types || []);
    } catch (e) {
      toast.error("Failed to load options");
    }
  }, []);

  const fetchItem = useCallback(async () => {
    if (!isEdit) return;
    try {
      const res = await axios.get(`/underground/${id}`);
      const u = res.data;
      // Convert legacy single photo to array
      const photos = u.photos || (u.photo ? [u.photo] : []);
      setFormData({
        type: u.type || "",
        material_type: u.material_type || "",
        latitude: u.latitude?.toString() || "",
        longitude: u.longitude?.toString() || "-",
        label: u.label || "",
        notes: u.notes || "",
        photos: photos,
        tie_in_measurements: u.tie_in_measurements || "",
      });
    } catch (e) {
      toast.error("Failed to load item");
      navigate(backUrl);
    } finally {
      setFetching(false);
    }
  }, [id, isEdit, navigate, backUrl]);

  useEffect(() => {
    fetchOptions();
    fetchItem();
  }, [fetchOptions, fetchItem]);

  const setLatLng = (lat, lng) => {
    setFormData((prev) => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    toast.success("Location pinned");
  };

  const getGPS = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({ ...prev, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGpsLoading(false);
        toast.success("GPS location captured!");
      },
      (err) => {
        setGpsLoading(false);
        let msg = "Unable to fetch your location.";
        if (err.code === err.PERMISSION_DENIED) msg = "Location permission denied. Allow location access for this site.";
        else if (err.code === err.POSITION_UNAVAILABLE) msg = "Location unavailable. Check that GPS is on.";
        else if (err.code === err.TIMEOUT) msg = "Location request timed out.";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const searchAddress = async () => {
    if (!addressQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}&limit=1`);
      const data = await res.json();
      if (data.length) {
        setFormData((prev) => ({ ...prev, latitude: parseFloat(data[0].lat).toFixed(6), longitude: parseFloat(data[0].lon).toFixed(6) }));
        toast.success("Address found");
      } else {
        toast.error("Address not found");
      }
    } catch (e) {
      toast.error("Address search failed");
    } finally {
      setSearching(false);
    }
  };

  const markerPosition = useMemo(() => {
    const a = parseFloat(formData.latitude);
    const b = parseFloat(formData.longitude);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  }, [formData.latitude, formData.longitude]);
  const markerHandlers = useMemo(() => ({ dragend: (e) => { const { lat, lng } = e.target.getLatLng(); setLatLng(lat, lng); } }), []);
  const mapCenter = markerPosition || [29.7604, -95.3698];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.type) {
      toast.error("Please select a type");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        job_id: jobId,
        type: formData.type,
        material_type: formData.material_type || null,
        label: formData.label,
        notes: formData.notes,
        photos: formData.photos,
        tie_in_measurements: formData.tie_in_measurements || null,
        latitude: Number.isFinite(parseFloat(formData.latitude)) ? parseFloat(formData.latitude) : null,
        longitude: Number.isFinite(parseFloat(formData.longitude)) ? parseFloat(formData.longitude) : null,
      };
      if (isEdit) await axios.put(`/underground/${id}`, payload);
      else await axios.post("/underground", payload);
      toast.success(isEdit ? "Underground item updated" : "Underground item saved");
      navigate(backUrl);
    } catch (err) {
      toast.error("Failed to save underground item");
    } finally {
      setSubmitting(false);
    }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg pb-4" data-testid="underground-form-page">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-[1000]">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to={backUrl}>
              <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900 h-9 w-9">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-heading text-sm sm:text-lg font-bold tracking-tight uppercase text-zinc-900">
              {isEdit ? "Edit" : "Add"} Underground
            </h1>
          </div>
          <Button type="submit" form="ug-form" disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white" data-testid="save-underground-btn">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Save</>}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <form id="ug-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="industrial-card p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Type *</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData((p) => ({ ...p, type: v, material_type: "" }))}>
                  <SelectTrigger className="h-11 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="ug-type-select">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300 max-h-72">
                    {types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Label / ID (optional)</Label>
                <Input value={formData.label} onChange={(e) => setFormData((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. HH-12" className="h-11 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="ug-label-input" />
              </div>
            </div>
            {/* Material Type dropdown - shows for Handhole, Hoffman Box, Pedestal */}
            {materialTypeOptions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Material / Type</Label>
                <Select value={formData.material_type || "none"} onValueChange={(v) => setFormData((p) => ({ ...p, material_type: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-11 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="ug-material-type-select">
                    <SelectValue placeholder="Select material type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    <SelectItem value="none" className="text-zinc-500">—</SelectItem>
                    {materialTypeOptions.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
              <div className="w-1 h-5 bg-blue-500"></div>
              GPS Location
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs font-mono text-zinc-500">Latitude</Label>
                <Input value={formData.latitude} onChange={(e) => setFormData((p) => ({ ...p, latitude: e.target.value }))} placeholder="29.7604" className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid="ug-latitude-input" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-zinc-500">Longitude</Label>
                <Input value={formData.longitude} onChange={(e) => setFormData((p) => ({ ...p, longitude: e.target.value }))} placeholder="-95.3698" className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid="ug-longitude-input" />
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <Input value={addressQuery} onChange={(e) => setAddressQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchAddress(); } }} placeholder="Search address" className="h-10 bg-white border-zinc-300 text-zinc-900 flex-1" />
              <Button type="button" onClick={searchAddress} disabled={searching} className="h-10 bg-zinc-800 hover:bg-zinc-700 text-white">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <Button type="button" onClick={getGPS} disabled={gpsLoading} className="w-full h-10 mb-3 bg-zinc-100 border border-zinc-300 hover:bg-zinc-200 text-zinc-900">
              {gpsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
              Get Current Location
            </Button>
            <p className="text-xs text-zinc-500 mb-2">Click the map to drop a pin, or drag the pin to fine-tune.</p>
            <div className="h-72 sm:h-80 border border-zinc-300 overflow-hidden">
              <MapContainer center={mapCenter} zoom={18} minZoom={3} maxZoom={22} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }} className="z-0">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} />
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} />
                <MapClickHandler onSelect={setLatLng} />
                <MapCenterUpdater lat={formData.latitude} lng={formData.longitude} />
                {markerPosition && <Marker position={markerPosition} draggable={true} eventHandlers={markerHandlers} />}
              </MapContainer>
            </div>
          </div>

          <div className="industrial-card p-4 sm:p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="bg-white border-zinc-300 text-zinc-900" data-testid="ug-notes-input" />
            </div>
            
            {/* Handhole/Pole Tie-in Measurements - only show for Handhole type */}
            {(formData.type === "Handhole" || formData.type?.toLowerCase().includes("handhole")) && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Label className="text-xs font-mono tracking-widest text-amber-700 uppercase flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  Handhole / Pole Tie-in Measurements
                </Label>
                <Textarea 
                  value={formData.tie_in_measurements} 
                  onChange={(e) => setFormData((p) => ({ ...p, tie_in_measurements: e.target.value }))} 
                  placeholder="Enter tie-in measurements from handhole to poles (e.g., HH to Pole 1: 125ft N, HH to Pole 2: 89ft E)" 
                  className="bg-white border-amber-300 text-zinc-900" 
                  rows={3}
                  data-testid="ug-tiein-input" 
                />
                <p className="text-xs text-amber-600">
                  Enter measurements from this handhole to connecting poles. This will auto-populate the "Starting FH/MH/Pole tie-in measurements" field in the ASE Site Walk Survey.
                </p>
              </div>
            )}
            
            {/* Photos with Markup Editor */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-green-600" />
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Photos & Markups</Label>
              </div>
              <PhotoMarkupEditor 
                photos={formData.photos || []} 
                onChange={(v) => setFormData((p) => ({ ...p, photos: v }))}
                label="Underground Photos"
              />
              <p className="text-xs text-zinc-500">
                Upload photos and add annotations: lines, shapes, text, and measurement markers. Click on a photo to edit.
              </p>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default UndergroundForm;
