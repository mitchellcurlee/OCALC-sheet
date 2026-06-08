import { useState, useEffect } from "react";
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
  Zap,
  Loader2,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { PhotoUpload } from "@/components/PhotoUpload";
import { HeightInput } from "@/components/HeightInput";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const MapClickHandler = ({ onLocationSelect }) => {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// Component to recenter map when coordinates change
const MapCenterUpdater = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([parseFloat(lat), parseFloat(lng)], 18, { duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
};

const EditPole = () => {
  const navigate = useNavigate();
  const { jobId, id } = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [addressSearch, setAddressSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [options, setOptions] = useState({
    pole_owners: [], conditions: [], sizes: [], down_guy_owners: [], down_guy_directions: [], down_guy_sizes: [], knuckle_options: [], span_owners: [], span_directions: [], attachment_owners: [], riser_options: [], pole_types: [],
  });

  const backUrl = jobId ? `/jobs/${jobId}` : "/";

  const [formData, setFormData] = useState({
    job_number: "", pole_number: "", pole_size: "", pole_size_type: "", pole_type: "", condition: "",
    ocalc_left_photo: "", ocalc_middle_photo: "", ocalc_right_photo: "",
    has_birthmark: true, birthmark_photo: "",
    mgnv: "", mgnv_condition: "", mgnv_photo: "",
    pole_terminal: "", risers: "", pole_owner: "",
    span1_direction: "", span1_distance: "", span1_owner: "",
    span2_direction: "", span2_distance: "", span2_owner: "",
    span3_direction: "", span3_distance: "", span3_owner: "",
    span4_direction: "", span4_distance: "", span4_owner: "",
    latitude: "", longitude: "", notes: "",
  });

  const [downGuys, setDownGuys] = useState([{ size: "", direction: "", owner: "", height: "", lead: "" }]);
  const [knuckles, setKnuckles] = useState([{ count: "", condition: "", photo: "" }]);
  const [attachments, setAttachments] = useState([{ height: "", owner: "", photo: "" }]);

  useEffect(() => {
    fetchOptions();
    fetchPole();
  }, [id]);

  const fetchOptions = async () => {
    try {
      const response = await axios.get("/poles/options");
      setOptions(response.data);
    } catch (error) {
      toast.error("Failed to fetch form options");
    }
  };

  const fetchPole = async () => {
    try {
      const response = await axios.get(`/poles/${id}`);
      const pole = response.data;
      setFormData({
        job_number: pole.job_number || "", pole_number: pole.pole_number || "",
        pole_size: pole.pole_size || "", pole_size_type: pole.pole_size_type || "", pole_type: pole.pole_type || "", condition: pole.condition || "",
        ocalc_left_photo: pole.ocalc_left_photo || "", ocalc_middle_photo: pole.ocalc_middle_photo || "", ocalc_right_photo: pole.ocalc_right_photo || "",
        has_birthmark: pole.has_birthmark !== false, birthmark_photo: pole.birthmark_photo || "",
        mgnv: pole.mgnv || "", mgnv_condition: pole.mgnv_condition || "", mgnv_photo: pole.mgnv_photo || "",
        pole_terminal: pole.pole_terminal || "", risers: pole.risers || "", pole_owner: pole.pole_owner || "",
        span1_direction: pole.span1_direction || "", span1_distance: pole.span1_distance?.toString() || "", span1_owner: pole.span1_owner || "",
        span2_direction: pole.span2_direction || "", span2_distance: pole.span2_distance?.toString() || "", span2_owner: pole.span2_owner || "",
        span3_direction: pole.span3_direction || "", span3_distance: pole.span3_distance?.toString() || "", span3_owner: pole.span3_owner || "",
        span4_direction: pole.span4_direction || "", span4_distance: pole.span4_distance?.toString() || "", span4_owner: pole.span4_owner || "",
        latitude: pole.latitude?.toString() || "", longitude: pole.longitude?.toString() || "", notes: pole.notes || "",
      });
      // Load dynamic arrays
      setDownGuys(pole.down_guys?.length > 0 ? pole.down_guys.map(dg => ({ ...dg, height: dg.height?.toString() || "" })) : [{ size: "", direction: "", owner: "", height: "", lead: "" }]);
      setKnuckles(pole.knuckles?.length > 0 ? pole.knuckles : [{ count: "", condition: "", photo: "" }]);
      setAttachments(pole.attachments?.length > 0 ? pole.attachments.map(a => ({ ...a, height: a.height?.toString() || "", notes: a.notes || "" })) : [{ height: "", owner: "", photo: "", notes: "" }]);
    } catch (error) {
      toast.error("Failed to fetch pole data");
      navigate(backUrl);
    } finally {
      setFetching(false);
    }
  };

  const handleInputChange = (e) => { const { name, value } = e.target; setFormData((prev) => ({ ...prev, [name]: value })); };
  const handleSelectChange = (name, value) => { setFormData((prev) => ({ ...prev, [name]: value })); };
  const handlePhotoChange = (field, value) => { setFormData((prev) => ({ ...prev, [field]: value })); };

  const addDownGuy = () => { setDownGuys([...downGuys, { size: "", direction: "", owner: "", height: "", lead: "" }]); };
  const removeDownGuy = (index) => { if (downGuys.length > 1) setDownGuys(downGuys.filter((_, i) => i !== index)); };
  const updateDownGuy = (index, field, value) => { const updated = [...downGuys]; updated[index][field] = value; setDownGuys(updated); };

  const addKnuckle = () => { setKnuckles([...knuckles, { count: "", condition: "", photo: "" }]); };
  const removeKnuckle = (index) => { if (knuckles.length > 1) setKnuckles(knuckles.filter((_, i) => i !== index)); };
  const updateKnuckle = (index, field, value) => { const updated = [...knuckles]; updated[index][field] = value; setKnuckles(updated); };

  const addAttachment = () => { setAttachments([...attachments, { height: "", owner: "", photo: "", notes: "" }]); };
  const removeAttachment = (index) => { if (attachments.length > 1) setAttachments(attachments.filter((_, i) => i !== index)); };
  const updateAttachment = (index, field, value) => { const updated = [...attachments]; updated[index][field] = value; setAttachments(updated); };

  const handleMapClick = (lat, lng) => { setFormData((prev) => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) })); toast.success("Location pinned!"); };

  const getGPSLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setFormData((prev) => ({ ...prev, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) })); setGpsLoading(false); toast.success("GPS captured!"); },
      () => { setGpsLoading(false); toast.error("Failed to get location"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Address search using Nominatim (OpenStreetMap) geocoding
  const searchAddress = async () => {
    if (!addressSearch.trim()) { toast.error("Please enter an address to search"); return; }
    setSearchLoading(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}&limit=1`, { headers: { 'User-Agent': 'PoleDataSheet/1.0' } });
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setFormData((prev) => ({ ...prev, latitude: parseFloat(lat).toFixed(6), longitude: parseFloat(lon).toFixed(6) }));
        toast.success(`Found: ${display_name.substring(0, 50)}...`);
      } else { toast.error("Address not found. Try a more specific address."); }
    } catch (error) { toast.error("Failed to search address"); }
    finally { setSearchLoading(false); }
  };

  const handleAddressKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); searchAddress(); } };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.pole_size || !formData.condition) { toast.error("Please fill in Pole Size and Condition"); return; }
    setLoading(true);
    try {
      const submitData = {
        ...formData,
        span1_distance: formData.span1_distance ? parseFloat(formData.span1_distance) : null,
        span2_distance: formData.span2_distance ? parseFloat(formData.span2_distance) : null,
        span3_distance: formData.span3_distance ? parseFloat(formData.span3_distance) : null,
        span4_distance: formData.span4_distance ? parseFloat(formData.span4_distance) : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        down_guys: downGuys.filter(dg => dg.size || dg.direction || dg.owner || dg.height || dg.lead).map(dg => ({ ...dg, height: dg.height ? parseFloat(dg.height) : null })),
        knuckles: knuckles.filter(k => k.count || k.condition || k.photo),
        attachments: attachments.filter(a => a.height || a.owner || a.photo).map(a => ({ ...a, height: a.height ? parseFloat(a.height) : null })),
      };
      await axios.put(`/poles/${id}`, submitData);
      toast.success("Pole updated successfully!");
      navigate(backUrl);
    } catch (error) { toast.error("Failed to update pole"); console.error(error); } finally { setLoading(false); }
  };

  if (fetching) return <div className="min-h-screen bg-industrial-bg flex items-center justify-center"><Loader2 className="w-12 h-12 text-red-500 animate-spin" /></div>;

  const mapCenter = formData.latitude && formData.longitude ? [parseFloat(formData.latitude), parseFloat(formData.longitude)] : [29.7604, -95.3698]; // Houston, TX

  return (
    <div className="min-h-screen bg-industrial-bg pb-4" data-testid="edit-pole-page">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to={backUrl}><Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white h-10 w-10 sm:h-9 sm:w-9"><ArrowLeft className="w-5 h-5" /></Button></Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-600 flex items-center justify-center flex-shrink-0"><Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" /></div>
                <h1 className="font-heading text-sm sm:text-xl font-bold tracking-tight uppercase text-white">Pole Data Sheet / OCALC</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-initial">
                <Label className="text-xs font-mono text-zinc-500 whitespace-nowrap">JOB:</Label>
                <Input name="job_number" value={formData.job_number} onChange={handleInputChange} placeholder="Job #" className="w-full sm:w-28 h-9 sm:h-8 bg-black border-zinc-700 text-white text-sm" />
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-initial">
                <Label className="text-xs font-mono text-zinc-500 whitespace-nowrap">POLE:</Label>
                <Input name="pole_number" value={formData.pole_number} onChange={handleInputChange} placeholder="Pole #" className="w-full sm:w-28 h-9 sm:h-8 bg-black border-zinc-700 text-white text-sm" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Update Button - Top */}
          <div className="flex justify-end">
            <Button type="submit" disabled={loading} className="h-11 sm:h-10 bg-orange-600 hover:bg-orange-700 text-white min-w-36">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Update Pole</>}
            </Button>
          </div>

          {/* Basic Info */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-red-500"></div>Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Size *</Label>
                <Select value={formData.pole_size} onValueChange={(v) => handleSelectChange("pole_size", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Class-Height" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">{options.sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Size Type</Label>
                <Select value={formData.pole_size_type} onValueChange={(v) => handleSelectChange("pole_size_type", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="Actual" className="text-green-400">Actual</SelectItem>
                    <SelectItem value="Estimate" className="text-yellow-400">Estimate</SelectItem>
                    <SelectItem value="Proposed" className="text-blue-400">Proposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Type of Pole</Label>
                <Select value={formData.pole_type} onValueChange={(v) => handleSelectChange("pole_type", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.pole_types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Condition *</Label>
                <Select value={formData.condition} onValueChange={(v) => handleSelectChange("condition", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Select condition" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem>
                    <SelectItem value="Good" className="text-yellow-400">Good</SelectItem>
                    <SelectItem value="Bad" className="text-red-400">Bad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Spans */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-indigo-500"></div>Spans</h2>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((num) => (
                <div key={num} className="bg-zinc-800/50 p-3 border border-zinc-700">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-indigo-400 w-6">{num}</span>
                    <div className="grid grid-cols-3 gap-3 flex-1">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                        <Select value={formData[`span${num}_direction`]} onValueChange={(v) => handleSelectChange(`span${num}_direction`, v)}>
                          <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">{options.span_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Distance (ft)</Label>
                        <Input type="number" name={`span${num}_distance`} value={formData[`span${num}_distance`]} onChange={handleInputChange} step="0.1" className="h-9 bg-black border-zinc-700 text-white text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                        <Select value={formData[`span${num}_owner`]} onValueChange={(v) => handleSelectChange(`span${num}_owner`, v)}>
                          <SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">{options.span_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GPS */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-emerald-500"></div>GPS Location</h2>
            <div className="space-y-4">
              {/* Address Search - At the top */}
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Search Address</Label>
                <div className="flex gap-2">
                  <Input type="text" value={addressSearch} onChange={(e) => setAddressSearch(e.target.value)} onKeyDown={handleAddressKeyDown} placeholder="Enter address, city, or landmark..." className="h-10 bg-black border-zinc-700 text-white flex-1" />
                  <Button type="button" onClick={searchAddress} disabled={searchLoading} className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white px-4">{searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
                </div>
                <p className="text-xs text-zinc-500">Search for an address to auto-fill coordinates</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Latitude</Label><Input type="text" name="latitude" value={formData.latitude} onChange={handleInputChange} className="h-10 bg-black border-zinc-700 text-white font-mono" /></div>
                    <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Longitude</Label><Input type="text" name="longitude" value={formData.longitude} onChange={handleInputChange} className="h-10 bg-black border-zinc-700 text-white font-mono" /></div>
                  </div>
                  <Button type="button" onClick={getGPSLocation} disabled={gpsLoading} className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700">{gpsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}Get Current Location</Button>
                  <p className="text-xs text-zinc-500">Click the map to drop a pin, or drag the pin to fine-tune its position</p>
                </div>
                <div className="h-72 sm:h-80 border border-zinc-700 overflow-hidden">
                  <MapContainer center={mapCenter} zoom={18} minZoom={3} maxZoom={22} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }} className="z-0">
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} />
                    <MapClickHandler onLocationSelect={handleMapClick} />
                    <MapCenterUpdater lat={formData.latitude} lng={formData.longitude} />
                    {formData.latitude && formData.longitude && (
                      <Marker
                        position={[parseFloat(formData.latitude), parseFloat(formData.longitude)]}
                        draggable={true}
                        eventHandlers={{
                          dragend: (e) => {
                            const { lat, lng } = e.target.getLatLng();
                            handleMapClick(lat, lng);
                          },
                        }}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Birthmark & MGNV */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-purple-500"></div>Birthmark & MGNV</h2>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="flex items-center gap-3"><Switch checked={formData.has_birthmark} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, has_birthmark: checked }))} /><Label className="text-sm text-zinc-300">{formData.has_birthmark ? "Has Birthmark" : "No Birthmark"}</Label></div>
                {formData.has_birthmark && <PhotoUpload label="Birthmark Photo" value={formData.birthmark_photo} onChange={(v) => handlePhotoChange("birthmark_photo", v)} testId="birthmark" />}
              </div>
              <div className="pt-4 border-t border-zinc-700">
                <h3 className="text-sm font-mono text-cyan-400 mb-3">MGNV</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">MGNV Present</Label><Select value={formData.mgnv} onValueChange={(v) => handleSelectChange("mgnv", v)}><SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Yes / No" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Condition</Label><Select value={formData.mgnv_condition} onValueChange={(v) => handleSelectChange("mgnv_condition", v)}><SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Good / Broken" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Good" className="text-green-400">Good</SelectItem><SelectItem value="Broken" className="text-red-400">Broken</SelectItem></SelectContent></Select></div>
                  <PhotoUpload label="MGNV Photo" value={formData.mgnv_photo} onChange={(v) => handlePhotoChange("mgnv_photo", v)} testId="mgnv" />
                </div>
              </div>
            </div>
          </div>

          {/* OCALC Photos */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-blue-500"></div>OCALC Photos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PhotoUpload label="Left" value={formData.ocalc_left_photo} onChange={(v) => handlePhotoChange("ocalc_left_photo", v)} testId="ocalc-left" />
              <PhotoUpload label="Middle" value={formData.ocalc_middle_photo} onChange={(v) => handlePhotoChange("ocalc_middle_photo", v)} testId="ocalc-middle" />
              <PhotoUpload label="Right" value={formData.ocalc_right_photo} onChange={(v) => handlePhotoChange("ocalc_right_photo", v)} testId="ocalc-right" />
            </div>
          </div>

          {/* Down Guys - Dynamic */}
          <div className="industrial-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-heading text-base sm:text-lg font-bold text-white flex items-center gap-2"><div className="w-1 h-5 bg-yellow-500"></div>Down Guys</h2>
              <Button type="button" onClick={addDownGuy} size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white"><Plus className="w-4 h-4 mr-1" /> Add Row</Button>
            </div>
            <div className="space-y-3">
              {downGuys.map((guy, index) => (
                <div key={index} className="bg-zinc-800/50 p-3 border border-zinc-700">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm font-mono text-yellow-400 w-6">{index + 1}</span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 flex-1">
                      <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Size</Label><Select value={guy.size} onValueChange={(v) => updateDownGuy(index, "size", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Size" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select></div>
                      <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Direction</Label><Select value={guy.direction} onValueChange={(v) => updateDownGuy(index, "direction", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Dir" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent></Select></div>
                      <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Owner</Label><Select value={guy.owner} onValueChange={(v) => updateDownGuy(index, "owner", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
                      <HeightInput value={guy.height} onChange={(v) => updateDownGuy(index, "height", v)} label="Height" testId={`downguy${index}-height`} />
                      <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Lead</Label><Input value={guy.lead} onChange={(e) => updateDownGuy(index, "lead", e.target.value)} className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                    </div>
                    {downGuys.length > 1 && <Button type="button" onClick={() => removeDownGuy(index)} size="icon" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                </div>
              ))}
            </div>
            {/* Knuckles */}
            <div className="mt-4 pt-4 border-t border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-mono text-orange-400">KNUCKLES</h3>
                <Button type="button" onClick={addKnuckle} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white"><Plus className="w-4 h-4 mr-1" /> Add Row</Button>
              </div>
              <div className="space-y-3">
                {knuckles.map((knuckle, index) => (
                  <div key={index} className="bg-zinc-800/50 p-3 border border-zinc-700">
                    <div className="flex items-center gap-2 sm:gap-4">
                      <span className="text-sm font-mono text-orange-400 w-6">{index + 1}</span>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 flex-1 items-end">
                        <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Knuckles Used</Label><Select value={knuckle.count} onValueChange={(v) => updateKnuckle(index, "count", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Count" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.knuckle_options.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}</SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Condition</Label><Select value={knuckle.condition} onValueChange={(v) => updateKnuckle(index, "condition", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Excellent" className="text-green-400">Excellent</SelectItem><SelectItem value="Good" className="text-yellow-400">Good</SelectItem><SelectItem value="Bad" className="text-red-400">Bad</SelectItem></SelectContent></Select></div>
                        <PhotoUpload label="Photo" value={knuckle.photo} onChange={(v) => updateKnuckle(index, "photo", v)} testId={`knuckle${index}`} compact />
                      </div>
                      {knuckles.length > 1 && <Button type="button" onClick={() => removeKnuckle(index)} size="icon" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* HOA - Dynamic + Pole Owner */}
          <div className="industrial-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-heading text-base sm:text-lg font-bold text-white flex items-center gap-2"><div className="w-1 h-5 bg-green-500"></div>HOA</h2>
              <Button type="button" onClick={addAttachment} size="sm" className="bg-green-600 hover:bg-green-700 text-white"><Plus className="w-4 h-4 mr-1" /> Add Row</Button>
            </div>
            <div className="space-y-3">
              {attachments.map((att, index) => (
                <div key={index} className="bg-zinc-800/50 p-3 border border-zinc-700">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm font-mono text-green-400 w-6">{index + 1}</span>
                    <div className="grid grid-cols-4 gap-2 sm:gap-3 flex-1 items-end">
                      <HeightInput value={att.height} onChange={(v) => updateAttachment(index, "height", v)} label="Height" testId={`attachment${index}-height`} />
                      <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Owner</Label><Select value={att.owner} onValueChange={(v) => updateAttachment(index, "owner", v)}><SelectTrigger className="h-9 bg-black border-zinc-700 text-white text-sm"><SelectValue placeholder="Owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.attachment_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
                      <div className="space-y-1"><Label className="text-xs font-mono text-zinc-500">Notes</Label><Input type="text" value={att.notes || ""} onChange={(e) => updateAttachment(index, "notes", e.target.value)} placeholder="Enter notes" className="h-9 bg-black border-zinc-700 text-white text-sm" /></div>
                      <PhotoUpload label="Photo" value={att.photo} onChange={(v) => updateAttachment(index, "photo", v)} testId={`attachment${index}`} compact />
                    </div>
                    {attachments.length > 1 && <Button type="button" onClick={() => removeAttachment(index)} size="icon" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-zinc-700">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Owner</Label><Select value={formData.pole_owner} onValueChange={(v) => handleSelectChange("pole_owner", v)}><SelectTrigger className={`h-10 bg-black border-zinc-700 ${formData.pole_owner === "Foreign Owned" ? "text-red-500 border-red-500/50" : formData.pole_owner === "ATT" ? "text-orange-500 border-orange-500/50" : "text-white"}`}><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.pole_owners.map((o) => (<SelectItem key={o} value={o} className={o === "Foreign Owned" ? "text-red-500" : "text-orange-500"}>{o}</SelectItem>))}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Terminal</Label><Select value={formData.pole_terminal} onValueChange={(v) => handleSelectChange("pole_terminal", v)}><SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Yes / No" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700"><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Risers</Label><Select value={formData.risers} onValueChange={(v) => handleSelectChange("risers", v)}><SelectTrigger className="h-10 bg-black border-zinc-700 text-white"><SelectValue placeholder="Select #" /></SelectTrigger><SelectContent className="bg-zinc-900 border-zinc-700">{options.riser_options.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent></Select></div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-zinc-500"></div>Notes</h2>
            <Textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Additional notes..." rows={3} className="bg-black border-zinc-700 text-white resize-none" />
          </div>

          {/* Submit */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-2">
            <Link to={backUrl} className="w-full sm:w-auto"><Button type="button" variant="outline" className="w-full sm:w-auto h-12 sm:h-10 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white">Cancel</Button></Link>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 sm:h-10 bg-orange-600 hover:bg-orange-700 text-white min-w-32">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Update Pole</>}</Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default EditPole;
