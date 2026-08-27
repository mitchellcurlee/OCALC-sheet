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
import { Switch } from "@/components/ui/switch";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { PhotoStagingGallery } from "@/components/PhotoStagingGallery";
import { getJobAddressCenter } from "@/lib/jobAddressCenter";
import { undergroundAbbr } from "@/lib/poleMapImage";
import { ArrowLeft, Save, Loader2, MapPin, Search, Pencil, Plus, Trash2 } from "lucide-react";

// Types that get a FID box + Primary FID toggle
const FID_TYPES = ["Handhole", "FBT", "NTE", "FBT/NTE", "Aerial Splice", "Loop", "PFP", "Manhole", "Brooks Enclosure", "Flowerpot", "FDF"];
const PATH_DIRECTIONS = ["In", "Over", "Up", "Down"];

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
  const backUrl = searchParams.get("from") === "map"
    ? `/jobs/${jobId}/map${isEdit ? `?focus=${id}` : ""}`
    : `/jobs/${jobId}`;

  const [types, setTypes] = useState([]);
  const [jobItems, setJobItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const [formData, setFormData] = useState({
    type: searchParams.get("type") || "",
    material_type: "", // Subtype for Handhole, Hoffman Box, Pedestal
    latitude: searchParams.get("lat") || "",
    longitude: searchParams.get("lng") || "-",
    label: "",
    notes: "",
    photos: [],
    staged_photos: [],
    auto_label_unsorted: false,
    tie_in_measurements: "", // For Handhole/Pole tie-in measurements
    fid: "",
    primary_fid: false,
    path_measurements: [], // [{direction, feet}]
    soc_start: false,
    soc_end: false,
    end_path: false,
    standalone: false,
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
        staged_photos: u.staged_photos || [],
        auto_label_unsorted: !!u.auto_label_unsorted,
        tie_in_measurements: u.tie_in_measurements || "",
        fid: u.fid || "",
        primary_fid: !!u.primary_fid,
        path_measurements: (u.path_measurements || []).map((m) => ({ direction: m.direction, feet: m.feet?.toString() || "", to: m.to || "" })),
        soc_start: !!u.soc_start,
        soc_end: !!u.soc_end,
        end_path: !!u.end_path,
        standalone: !!u.standalone,
      });
    } catch (e) {
      toast.error("Failed to load item");
      navigate(backUrl);
    } finally {
      setFetching(false);
    }
  }, [id, isEdit, navigate, backUrl]);

  const fetchJobItems = useCallback(async () => {
    try {
      const [polesRes, ugRes] = await Promise.all([
        axios.get(`/jobs/${jobId}/poles`),
        axios.get(`/jobs/${jobId}/underground`),
      ]);
      const items = [];
      (polesRes.data || []).forEach((p) => items.push({
        id: p.id, kind: "pole", sort_order: p.sort_order ?? Infinity, standalone: p.standalone === true,
        lat: parseFloat(p.latitude), lng: parseFloat(p.longitude),
        name: /^\d/.test(String(p.pole_number || "")) ? `P${p.pole_number}` : (p.pole_number || "Pole"),
      }));
      (ugRes.data || []).forEach((u) => items.push({
        id: u.id, kind: "underground", sort_order: u.sort_order ?? Infinity, standalone: u.standalone === true,
        lat: parseFloat(u.latitude), lng: parseFloat(u.longitude),
        name: `${undergroundAbbr(u.type)}${u.label && u.label !== u.type ? ` ${u.label}` : ""}`,
      }));
      items.sort((a, b) => a.sort_order - b.sort_order);
      setJobItems(items);
    } catch (e) { /* dropdown is best-effort */ }
  }, [jobId]);

  useEffect(() => {
    fetchOptions();
    fetchItem();
    fetchJobItems();
  }, [fetchOptions, fetchItem, fetchJobItems]);

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
  const [addressCenter, setAddressCenter] = useState(null);
  useEffect(() => {
    if (!markerPosition && jobId) {
      getJobAddressCenter(jobId).then((c) => { if (c) setAddressCenter(c); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  const mapCenter = markerPosition || addressCenter || [29.7604, -95.3698];

  const showFid = FID_TYPES.includes(formData.type);

  const handlePrimaryFidToggle = async (checked) => {
    setFormData((p) => ({ ...p, primary_fid: checked }));
    if (checked) {
      try {
        const res = await axios.get(`/jobs/${jobId}/underground`);
        const others = (res.data || []).filter((u) => u.primary_fid && u.id !== id);
        if (others.length > 0) {
          toast.warning(`Primary FID is already ON for: ${others.map((u) => `${u.type}${u.label ? ` ${u.label}` : ""}`).join(", ")}`);
        }
      } catch (e) { /* non-blocking check */ }
    }
  };

  const addPathMeasurement = () => setFormData((p) => ({ ...p, path_measurements: [...p.path_measurements, { direction: "In", feet: "", to: "" }] }));
  const updatePathMeasurement = (i, field, value) => setFormData((p) => {
    const rows = [...p.path_measurements];
    rows[i] = { ...rows[i], [field]: value };
    return { ...p, path_measurements: rows };
  });
  const removePathMeasurement = (i) => setFormData((p) => ({ ...p, path_measurements: p.path_measurements.filter((_, idx) => idx !== i) }));

  // Target options for the "to" dropdown — all attribute markers in the job except this item
  const targetOptions = useMemo(
    () => jobItems.filter((it) => it.id !== id).map((it) => it.name),
    [jobItems, id]
  );

  // Auto GPS coordinate-to-coordinate measurements to the path neighbors (edit mode)
  const autoGpsMeasurements = useMemo(() => {
    if (!isEdit) return null;
    const dFt = (a, b) => {
      const R = 20925646.3;
      const la1 = (a[0] * Math.PI) / 180, la2 = (b[0] * Math.PI) / 180;
      const dLat = la2 - la1, dLng = ((b[1] - a[1]) * Math.PI) / 180;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };
    const myLat = parseFloat(formData.latitude);
    const myLng = parseFloat(formData.longitude);
    if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) return null;
    const pathChain = jobItems.filter((it) => !it.standalone && Number.isFinite(it.lat) && Number.isFinite(it.lng));
    const idx = pathChain.findIndex((it) => it.id === id);
    if (idx === -1) return null;
    const prev = pathChain[idx - 1];
    const next = pathChain[idx + 1];
    return {
      incoming: prev ? { name: prev.name, ft: dFt([prev.lat, prev.lng], [myLat, myLng]) } : null,
      outgoing: next ? { name: next.name, ft: dFt([myLat, myLng], [next.lat, next.lng]) } : null,
    };
  }, [isEdit, id, jobItems, formData.latitude, formData.longitude]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.type) {
      toast.error("Please select a type");
      return;
    }
    const validRows = formData.path_measurements.filter((m) => m.direction && m.feet !== "" && Number.isFinite(parseFloat(m.feet)));
    if (validRows.length > 0 && !validRows[validRows.length - 1].to) {
      toast.error("Select a \"to\" target on the last path measurement (e.g. Down 5ft to FBT)");
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
        staged_photos: formData.staged_photos || [],
        auto_label_unsorted: !!formData.auto_label_unsorted,
        tie_in_measurements: formData.tie_in_measurements || null,
        fid: formData.fid || null,
        primary_fid: !!formData.primary_fid,
        soc_start: !!formData.soc_start,
        soc_end: !!formData.soc_end,
        end_path: !!formData.end_path,
        standalone: !!formData.standalone,
        path_measurements: formData.path_measurements
          .filter((m) => m.direction && m.feet !== "" && Number.isFinite(parseFloat(m.feet)))
          .map((m) => ({ direction: m.direction, feet: parseFloat(m.feet), to: m.to })),
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
          {/* Photo Gallery — capture/upload first, sort into categories below */}
          <PhotoStagingGallery
            photos={formData.staged_photos || []}
            onChange={(v) => setFormData((p) => ({ ...p, staged_photos: v }))}
            autoLabel={formData.auto_label_unsorted}
            onAutoLabelChange={(v) => setFormData((p) => ({ ...p, auto_label_unsorted: v }))}
            itemLabel={[formData.type, formData.label].filter(Boolean).join(" ") || "this item"}
            categories={[{ key: "array:photos", label: "Photos & Markups" }]}
            onAssign={(url) => { setFormData((p) => ({ ...p, photos: [...(p.photos || []), url] })); toast.success("Photo assigned"); }}
            testId="ug-staging"
          />
          <div className="industrial-card p-4 sm:p-5 space-y-4">
            {/* SOC Start / SOC End toggles — auto-populate ASE checklist */}
            <div className="flex flex-wrap items-center gap-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Switch checked={formData.soc_start} onCheckedChange={(v) => setFormData((p) => ({ ...p, soc_start: v }))} data-testid="ug-soc-start-toggle" />
                <Label className="text-xs font-mono tracking-widest text-amber-700 uppercase">SOC Start</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={formData.soc_end} onCheckedChange={(v) => setFormData((p) => ({ ...p, soc_end: v }))} data-testid="ug-soc-end-toggle" />
                <Label className="text-xs font-mono tracking-widest text-amber-700 uppercase">SOC End</Label>
              </div>
              <p className="text-xs text-amber-600 basis-full">Auto-populates the SOC START / SOC END Lat/Long boxes on the ASE checklist with this item's coordinates.</p>
            </div>
            {/* End Path toggle — breaks the map route after this attribute */}
            <div className="flex flex-wrap items-center gap-6 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Switch checked={formData.end_path} onCheckedChange={(v) => setFormData((p) => ({ ...p, end_path: v }))} data-testid="ug-end-path-toggle" />
                <Label className="text-xs font-mono tracking-widest text-red-700 uppercase">End Path</Label>
              </div>
              <p className="text-xs text-red-600 basis-full">Marks this as the last attribute on its path. The map will not draw a line from this attribute to the next one — the next attribute starts a new path.</p>
            </div>
            {/* Standalone toggle — show on map without connecting to the path */}
            <div className="flex flex-wrap items-center gap-6 p-3 bg-violet-50 border border-violet-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Switch checked={formData.standalone} onCheckedChange={(v) => setFormData((p) => ({ ...p, standalone: v }))} data-testid="ug-standalone-toggle" />
                <Label className="text-xs font-mono tracking-widest text-violet-700 uppercase">Standalone (Not on Path)</Label>
              </div>
              <p className="text-xs text-violet-600 basis-full">Shows this attribute on the interactive map without connecting it to the attribute before or after it.</p>
            </div>
            {/* FID + Primary FID toggle for fiber-bearing attribute types */}
            {showFid && (
              <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-blue-700 uppercase">FID</Label>
                    <Input value={formData.fid} onChange={(e) => setFormData((p) => ({ ...p, fid: e.target.value }))} placeholder="Enter FID" className="h-11 sm:h-10 bg-white border-blue-300 text-zinc-900" data-testid="ug-fid-input" />
                  </div>
                  <div className="flex items-center gap-3 pb-2">
                    <Switch checked={formData.primary_fid} onCheckedChange={handlePrimaryFidToggle} data-testid="ug-primary-fid-toggle" />
                    <Label className="text-xs font-mono tracking-widest text-blue-700 uppercase">Primary FID</Label>
                  </div>
                </div>
                <p className="text-xs text-blue-600">
                  Turn on Primary FID to auto-populate this FID into "Nearest fiber FID" on the ASE checklist.
                </p>
              </div>
            )}
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
                {!markerPosition && addressCenter && <MapCenterUpdater lat={addressCenter[0]} lng={addressCenter[1]} />}
                {markerPosition && <Marker position={markerPosition} draggable={true} eventHandlers={markerHandlers} />}
              </MapContainer>
            </div>
          </div>

          <div className="industrial-card p-4 sm:p-5 space-y-4">
            {/* Handhole|Manhole / Pole Tie-in Measurements */}
            {(formData.type === "Handhole" || formData.type?.toLowerCase().includes("handhole") || formData.type === "Manhole" || formData.type?.toLowerCase().includes("manhole")) && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Label className="text-xs font-mono tracking-widest text-amber-700 uppercase flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  {formData.type?.toLowerCase().includes("manhole") ? "Manhole" : "Handhole"} / Pole Tie-in Measurements
                </Label>
                <Textarea 
                  value={formData.tie_in_measurements} 
                  onChange={(e) => setFormData((p) => ({ ...p, tie_in_measurements: e.target.value }))} 
                  placeholder={formData.type?.toLowerCase().includes("manhole")
                    ? "Enter tie-in measurements from manhole to poles (e.g., MH to Pole 1: 125ft N, MH to Pole 2: 89ft E)"
                    : "Enter tie-in measurements from handhole to poles (e.g., HH to Pole 1: 125ft N, HH to Pole 2: 89ft E)"} 
                  className="bg-white border-amber-300 text-zinc-900" 
                  rows={3}
                  data-testid="ug-tiein-input" 
                />
                <p className="text-xs text-amber-600">
                  Enter measurements from this {formData.type?.toLowerCase().includes("manhole") ? "manhole" : "handhole"} to connecting poles. This will auto-populate the "Starting FH/MH/Pole tie-in measurements" field in the ASE Site Walk Survey.
                </p>
              </div>
            )}
            
            {/* Path of Approach Measurements */}
            <div className="space-y-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-mono tracking-widest text-emerald-700 uppercase">Path Measurements</Label>
                <Button type="button" onClick={addPathMeasurement} size="sm" variant="outline" className="h-8 bg-white border-emerald-300 hover:bg-emerald-100 text-emerald-700" data-testid="add-path-measurement-btn">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
              {formData.path_measurements.length === 0 && (
                <p className="text-xs text-emerald-600">Add direction + footage rows; the last row needs a "to" target (e.g. Up 2ft, Over 3ft, Down 5ft to FBT). These are added to the map's overall measurements and the ASE path of approach.</p>
              )}
              {formData.path_measurements.map((m, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap" data-testid={`path-measurement-row-${i}`}>
                  <Select value={m.direction} onValueChange={(v) => updatePathMeasurement(i, "direction", v)}>
                    <SelectTrigger className="h-10 w-24 bg-white border-emerald-300 text-zinc-900" data-testid={`path-direction-select-${i}`}>
                      <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-50 border-zinc-300 z-[1200]">
                      {PATH_DIRECTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <div className="relative w-24">
                    <Input type="number" inputMode="decimal" min="0" step="any" value={m.feet} onChange={(e) => updatePathMeasurement(i, "feet", e.target.value)} placeholder="0" className="h-10 bg-white border-emerald-300 text-zinc-900 pr-8" data-testid={`path-feet-input-${i}`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">ft</span>
                  </div>
                  <span className="text-xs font-mono text-emerald-700">to</span>
                  <Select value={m.to || "__blank__"} onValueChange={(v) => updatePathMeasurement(i, "to", v === "__blank__" ? "" : v)}>
                    <SelectTrigger className="h-10 flex-1 min-w-[130px] bg-white border-emerald-300 text-zinc-900" data-testid={`path-to-select-${i}`}>
                      <SelectValue placeholder="Target…" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-50 border-zinc-300 z-[1200] max-h-60">
                      <SelectItem value="__blank__"><span className="text-zinc-400">— blank —</span></SelectItem>
                      {targetOptions.map((t, ti) => (<SelectItem key={`${t}-${ti}`} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={() => removePathMeasurement(i)} size="icon" variant="ghost" className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`remove-path-measurement-${i}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {formData.path_measurements.length > 0 && (
                <p className="text-xs font-mono text-emerald-700" data-testid="path-measurements-summary">
                  {formData.path_measurements.filter((m) => m.direction && m.feet).map((m) => `${m.direction} ${m.feet}ft${m.to ? ` to ${m.to}` : ""}`).join(", ")}
                  {(() => { const t = formData.path_measurements.reduce((s, m) => s + (parseFloat(m.feet) || 0), 0); return t > 0 ? ` — ${t} ft total` : ""; })()}
                </p>
              )}
              {autoGpsMeasurements && (autoGpsMeasurements.incoming || autoGpsMeasurements.outgoing) && (
                <div className="border border-emerald-200 bg-white rounded p-2 space-y-0.5" data-testid="auto-gps-measurements">
                  <p className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase">Auto GPS measurements</p>
                  {autoGpsMeasurements.incoming && (
                    <p className="text-xs font-mono text-zinc-600" data-testid="auto-gps-incoming">{autoGpsMeasurements.incoming.name} → this: {Math.round(autoGpsMeasurements.incoming.ft)} ft</p>
                  )}
                  {autoGpsMeasurements.outgoing && (
                    <p className={`text-xs font-mono ${formData.path_measurements.length > 0 ? "text-zinc-400 line-through" : "text-zinc-600"}`} data-testid="auto-gps-outgoing">
                      this → {autoGpsMeasurements.outgoing.name}: {Math.round(autoGpsMeasurements.outgoing.ft)} ft
                      {formData.path_measurements.length > 0 && <span className="ml-1 no-underline text-emerald-700">(replaced by path measurements)</span>}
                    </p>
                  )}
                </div>
              )}
            </div>
            
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

            {/* Notes - at the bottom */}
            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="bg-white border-zinc-300 text-zinc-900" data-testid="ug-notes-input" />
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default UndergroundForm;
