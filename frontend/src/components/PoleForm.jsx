import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
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
import {
  ArrowLeft,
  Save,
  MapPin,
  Zap,
  Loader2,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { HeightInput } from "@/components/HeightInput";
import { SpanDistance } from "@/components/SpanDistance";
import { ReferenceHeightMeasurer } from "@/components/ReferenceHeightMeasurer";
import { PhotoMarkupEditor } from "@/components/PhotoMarkupEditor";
import { MultiPhotoUpload } from "@/components/MultiPhotoUpload";

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Map click handler component
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
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (Number.isFinite(latN) && Number.isFinite(lngN)) {
      map.flyTo([latN, lngN], 18, { duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
};

// Stable key generator for dynamic list rows (kept in component state only)
const rowKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// Styling for the Pole Owner select trigger based on the selected owner
const ownerTriggerClass = (owner) => {
  if (owner === "Foreign Owned") return "text-red-600 border-red-500/50";
  if (owner === "ATT") return "text-orange-600 border-orange-500/50";
  return "text-zinc-900";
};

// Sentinel value for a "blank/clear" option in dropdowns (Radix forbids empty-string values)
const BLANK = "__none__";

// Factories for the initial (empty) form state — reused by reset / "start fresh"
const emptyFormData = () => ({
  job_number: "", pole_number: "P-", pole_owner: "", access: "", pole_class: "",
  pole_size: "", pole_size_type: "", pole_type: "", condition: "",
  pole_photo: "", // Main pole picture
  ocalc_left_photo: "", ocalc_middle_photo: "", ocalc_right_photo: "",
  has_birthmark: true, birthmark_photos: [],
  mgnv: "", mgnv_condition: "", mgnv_photos: [],
  pole_terminal: "", risers: "", riser_height: "",
  use_manual_spans: false,
  span1_direction: "", span1_distance: "", span1_owner: "",
  span2_direction: "", span2_distance: "", span2_owner: "",
  span3_direction: "", span3_distance: "", span3_owner: "",
  span4_direction: "", span4_distance: "", span4_owner: "",
  latitude: "", longitude: "-", notes: "", row_information: "",
  hoa_markup_photos: [], // Photos for HOA markup/annotation
});
const emptyDownGuy = () => ({ _key: rowKey(), owner: "", direction: "", size: "", type: "", condition: "", height: "", lead: "", photos: [] });
const emptyKnuckle = () => ({ _key: rowKey(), size: "", total_eyes: "", direction: "", condition: "", photos: [] });
const emptyAttachment = () => ({ _key: rowKey(), owner: "", location: "", height: "", hoa_type: "", notes: "" });

export const PoleForm = ({ mode = "create", initialPole = null, jobId = null, onSubmit, submitting = false, backUrl = "/" }) => {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [addressSearch, setAddressSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [options, setOptions] = useState({
    pole_owners: [],
    conditions: [],
    sizes: [],
    down_guy_owners: [],
    down_guy_directions: [],
    down_guy_sizes: [],
    down_guy_types: [],
    down_guy_conditions: [],
    knuckle_options: [],
    anchor_sizes: [],
    anchor_eyes: [],
    yes_no: [],
    good_broken: [],
    span_owners: [],
    span_directions: [],
    attachment_owners: [],
    riser_options: [],
    pole_types: [],
    pole_classes: [],
  });

  // Basic form data
  const [formData, setFormData] = useState(emptyFormData);

  // Dynamic arrays - start with 1 row each
  const [downGuys, setDownGuys] = useState(() => [emptyDownGuy()]);
  const [knuckles, setKnuckles] = useState(() => [emptyKnuckle()]);
  const [attachments, setAttachments] = useState(() => [emptyAttachment()]);
  const [syncingDistances, setSyncingDistances] = useState(false);

  // Sync distances for this pole (edit mode only)
  const handleSyncDistances = async () => {
    if (!initialPole?.id) return;
    setSyncingDistances(true);
    try {
      const response = await axios.post(`/poles/${initialPole.id}/sync-distances`);
      if (response.data.updated) {
        toast.success(`Synced: Span 1 = ${response.data.span1 || 'N/A'}ft, Span 2 = ${response.data.span2 || 'N/A'}ft`);
        // Update the form data with the new values
        setFormData((prev) => ({
          ...prev,
          span1_distance: response.data.span1 || prev.span1_distance,
          span2_distance: response.data.span2 || prev.span2_distance,
        }));
      } else {
        toast.info(response.data.message || "No changes needed");
      }
    } catch (error) {
      toast.error("Failed to sync distances");
    } finally {
      setSyncingDistances(false);
    }
  };

  const fetchOptions = useCallback(async () => {
    try {
      const response = await axios.get("/poles/options");
      setOptions(response.data);
    } catch (error) {
      toast.error("Failed to fetch form options");
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  // When editing, populate the form from the loaded pole
  // We wait for options to be loaded so Radix Select can match values to items
  useEffect(() => {
    if (!initialPole) return;
    // Don't populate until options are loaded
    if (!options.pole_owners || options.pole_owners.length === 0) return;
    
    const p = initialPole;
    
    // Debug: Log what data is being loaded
    console.log('[PoleForm] Loading initialPole:', {
      pole_owner: p.pole_owner,
      pole_class: p.pole_class,
      pole_type: p.pole_type,
      condition: p.condition,
      access: p.access,
      pole_size: p.pole_size,
    });
    
    // Convert legacy single photo fields to arrays
    const birthmarkPhotos = p.birthmark_photos || (p.birthmark_photo ? [p.birthmark_photo] : []);
    const mgnvPhotos = p.mgnv_photos || (p.mgnv_photo ? [p.mgnv_photo] : []);
    
    setFormData({
      job_number: p.job_number || "", pole_number: p.pole_number || "",
      pole_owner: p.pole_owner || "", access: p.access || "", pole_class: p.pole_class || "",
      pole_size: p.pole_size || "", pole_size_type: p.pole_size_type || "", pole_type: p.pole_type || "", condition: p.condition || "",
      pole_photo: p.pole_photo || "",
      ocalc_left_photo: p.ocalc_left_photo || "", ocalc_middle_photo: p.ocalc_middle_photo || "", ocalc_right_photo: p.ocalc_right_photo || "",
      has_birthmark: p.has_birthmark !== false, birthmark_photos: birthmarkPhotos,
      mgnv: p.mgnv || "", mgnv_condition: p.mgnv_condition || "", mgnv_photos: mgnvPhotos,
      pole_terminal: p.pole_terminal || "", risers: p.risers || "", riser_height: p.riser_height?.toString() || "",
      use_manual_spans: p.use_manual_spans === true,
      span1_direction: p.span1_direction || "", span1_distance: p.span1_distance?.toString() || "", span1_owner: p.span1_owner || "",
      span2_direction: p.span2_direction || "", span2_distance: p.span2_distance?.toString() || "", span2_owner: p.span2_owner || "",
      span3_direction: p.span3_direction || "", span3_distance: p.span3_distance?.toString() || "", span3_owner: p.span3_owner || "",
      span4_direction: p.span4_direction || "", span4_distance: p.span4_distance?.toString() || "", span4_owner: p.span4_owner || "",
      latitude: p.latitude?.toString() || "", longitude: p.longitude?.toString() || "-", notes: p.notes || "", row_information: p.row_information || "",
      hoa_markup_photos: p.hoa_markup_photos || [],
    });
    setDownGuys(p.down_guys?.length > 0 ? p.down_guys.map(dg => ({ 
      _key: rowKey(), 
      owner: dg.owner || "",
      direction: dg.direction || "",
      size: dg.size || "",
      type: dg.type || "",
      condition: dg.condition || "",
      height: dg.height?.toString() || "", 
      lead: dg.lead?.toString() || "",
      photos: dg.photos || []
    })) : [{ _key: rowKey(), owner: "", direction: "", size: "", type: "", condition: "", height: "", lead: "", photos: [] }]);
    // Convert legacy single photo to photos array for knuckles (anchors)
    setKnuckles(p.knuckles?.length > 0 ? p.knuckles.map(k => ({ 
      _key: rowKey(), 
      size: k.size || "",
      total_eyes: k.total_eyes || "",
      direction: k.direction || "",
      condition: k.condition || "",
      photos: k.photos || (k.photo ? [k.photo] : []) 
    })) : [{ _key: rowKey(), size: "", total_eyes: "", direction: "", condition: "", photos: [] }]);
    // Convert legacy single photo to photos array for attachments and ensure new fields have defaults
    setAttachments(p.attachments?.length > 0 ? p.attachments.map(a => ({ 
      _key: rowKey(), 
      owner: a.owner || "",
      location: a.location || "",
      height: a.height?.toString() || "", 
      hoa_type: a.hoa_type || "",
      notes: a.notes || "",
      photos: a.photos || (a.photo ? [a.photo] : [])
    })) : [{ _key: rowKey(), owner: "", location: "", height: "", hoa_type: "", notes: "" }]);
  }, [initialPole, options.pole_owners]);

  // --- Autosave draft (create mode only) -----------------------------------
  // Keeps an in-progress new pole in localStorage so field crews don't lose
  // data on a page reload or dropped connection.
  const draftKey = mode === "create" ? `poleDraft:${jobId || "none"}` : null;
  const [draftRestored, setDraftRestored] = useState(false);

  // Capture any existing draft synchronously on the first render, BEFORE any
  // effect (incl. React StrictMode's double-invoked save) can overwrite it.
  const initialDraftRef = useRef(undefined);
  if (initialDraftRef.current === undefined) {
    let parsed = null;
    if (draftKey) {
      try {
        const raw = window.localStorage.getItem(draftKey);
        parsed = raw ? JSON.parse(raw) : null;
      } catch (e) {
        parsed = null;
      }
    }
    initialDraftRef.current = parsed;
  }

  const draftLoadedRef = useRef(false);
  const restoreDoneRef = useRef(false);

  // Restore the captured draft once the dropdown options are loaded so Radix
  // Selects can match the restored values to their items.
  useEffect(() => {
    if (!draftKey || draftLoadedRef.current) return;
    if (!options.pole_owners || options.pole_owners.length === 0) return;
    draftLoadedRef.current = true;
    const d = initialDraftRef.current;
    if (d) {
      if (d.formData) setFormData(d.formData);
      if (Array.isArray(d.downGuys) && d.downGuys.length) setDownGuys(d.downGuys);
      if (Array.isArray(d.knuckles) && d.knuckles.length) setKnuckles(d.knuckles);
      if (Array.isArray(d.attachments) && d.attachments.length) setAttachments(d.attachments);
      setDraftRestored(true);
    }
    restoreDoneRef.current = true; // saves are allowed only after restore
  }, [draftKey, options.pole_owners]);

  // Persist the draft on change — but only after restore has run, so we never
  // clobber a saved draft with the empty initial form on mount.
  useEffect(() => {
    if (!draftKey || !restoreDoneRef.current) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ formData, downGuys, knuckles, attachments, ts: Date.now() }));
    } catch (e) {
      // ignore quota/unavailable storage
    }
  }, [draftKey, formData, downGuys, knuckles, attachments]);

  const clearDraft = () => {
    if (!draftKey) return;
    try { window.localStorage.removeItem(draftKey); } catch (e) { /* ignore */ }
  };

  const startFresh = () => {
    setFormData(emptyFormData());
    setDownGuys([emptyDownGuy()]);
    setKnuckles([emptyKnuckle()]);
    setAttachments([emptyAttachment()]);
    setDraftRestored(false);
    // clear after the reset state flushes (the save effect re-writes on change)
    setTimeout(clearDraft, 0);
    toast.success("Started a fresh pole");
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value === BLANK ? "" : value }));
  };

  const handlePhotoChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Down Guys handlers
  const addDownGuy = () => {
    setDownGuys([...downGuys, emptyDownGuy()]);
  };
  const removeDownGuy = (index) => {
    if (downGuys.length > 1) {
      setDownGuys(downGuys.filter((_, i) => i !== index));
    }
  };
  const updateDownGuy = (index, field, value) => {
    const updated = [...downGuys];
    updated[index][field] = value === BLANK ? "" : value;
    setDownGuys(updated);
  };

  // Knuckles handlers
  const addKnuckle = () => {
    setKnuckles([...knuckles, emptyKnuckle()]);
  };
  const removeKnuckle = (index) => {
    if (knuckles.length > 1) {
      setKnuckles(knuckles.filter((_, i) => i !== index));
    }
  };
  const updateKnuckle = (index, field, value) => {
    const updated = [...knuckles];
    updated[index][field] = value === BLANK ? "" : value;
    setKnuckles(updated);
  };

  // Attachments handlers
  const addAttachment = () => {
    setAttachments([...attachments, emptyAttachment()]);
  };
  const removeAttachment = (index) => {
    if (attachments.length > 1) {
      setAttachments(attachments.filter((_, i) => i !== index));
    }
  };
  const updateAttachment = (index, field, value) => {
    const updated = [...attachments];
    updated[index][field] = value === BLANK ? "" : value;
    setAttachments(updated);
  };

  const handleMapClick = useCallback((lat, lng) => {
    setFormData((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
    toast.success("Location pinned on map!");
  }, []);

  const markerPosition = useMemo(
    () => {
      const latN = parseFloat(formData.latitude);
      const lngN = parseFloat(formData.longitude);
      return (Number.isFinite(latN) && Number.isFinite(lngN)) ? [latN, lngN] : null;
    },
    [formData.latitude, formData.longitude]
  );
  const markerEventHandlers = useMemo(() => ({
    dragend: (e) => {
      const { lat, lng } = e.target.getLatLng();
      handleMapClick(lat, lng);
    },
  }), [handleMapClick]);

  const getGPSLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      toast.error("Location needs a secure (https) connection");
      return;
    }
    setGpsLoading(true);

    const onSuccess = (position) => {
      setFormData((prev) => ({
        ...prev,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      }));
      setGpsLoading(false);
      toast.success("GPS location captured!");
    };

    const onError = (error, isRetry) => {
      // A high-accuracy fix often times out (indoors/desktop); retry once with
      // low accuracy and a longer timeout before giving up.
      if (!isRetry && error.code === error.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (e) => onError(e, true),
          { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
        );
        return;
      }
      setGpsLoading(false);
      let msg = "Unable to fetch your location. You can enter coordinates manually or pin on the map.";
      if (error.code === error.PERMISSION_DENIED) {
        msg = "Location permission denied. Allow location access for this site in your browser settings, then try again.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        msg = "Location unavailable. Make sure your device's location/GPS is turned on.";
      } else if (error.code === error.TIMEOUT) {
        msg = "Location request timed out. Try again (ideally outdoors), or enter coordinates manually.";
      }
      toast.error(msg);
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (e) => onError(e, false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Address search using Nominatim (OpenStreetMap) geocoding
  const searchAddress = async () => {
    if (!addressSearch.trim()) {
      toast.error("Please enter an address to search");
      return;
    }
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}&limit=1`,
        { headers: { 'User-Agent': 'PoleDataSheet/1.0' } }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setFormData((prev) => ({
          ...prev,
          latitude: parseFloat(lat).toFixed(6),
          longitude: parseFloat(lon).toFixed(6),
        }));
        toast.success(`Found: ${display_name.substring(0, 50)}...`);
      } else {
        toast.error("Address not found. Try a more specific address.");
      }
    } catch (error) {
      toast.error("Failed to search address");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddressKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAddress();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.pole_size || !formData.condition) {
      toast.error("Please fill in Pole Size and Condition");
      return;
    }

    const submitData = {
      ...formData,
      job_id: jobId || (initialPole && initialPole.job_id) || null,
      // Convert boolean field
      use_manual_spans: formData.use_manual_spans === true,
      // Convert numeric fields
      riser_height: formData.riser_height ? parseFloat(formData.riser_height) : null,
      span1_distance: formData.span1_distance ? parseFloat(formData.span1_distance) : null,
      span2_distance: formData.span2_distance ? parseFloat(formData.span2_distance) : null,
      span3_distance: formData.span3_distance ? parseFloat(formData.span3_distance) : null,
      span4_distance: formData.span4_distance ? parseFloat(formData.span4_distance) : null,
      latitude: Number.isFinite(parseFloat(formData.latitude)) ? parseFloat(formData.latitude) : null,
      longitude: Number.isFinite(parseFloat(formData.longitude)) ? parseFloat(formData.longitude) : null,
      // Dynamic arrays
      down_guys: downGuys.filter(dg => dg.owner || dg.direction || dg.size || dg.type || dg.condition || dg.height || dg.lead).map(({ _key, ...dg }) => ({
        ...dg,
        height: dg.height ? parseFloat(dg.height) : null
      })),
      knuckles: knuckles.filter(k => k.size || k.total_eyes || k.direction || k.condition || (k.photos && k.photos.length > 0)).map(({ _key, ...k }) => k),
      attachments: attachments.filter(a => a.height || a.owner || (a.photos && a.photos.length > 0) || a.notes).map(({ _key, ...a }) => ({
        ...a,
        height: a.height ? parseFloat(a.height) : null
      })),
    };

    // Debug: Log what's being submitted
    console.log('[PoleForm] Submitting data:', {
      pole_owner: submitData.pole_owner,
      pole_class: submitData.pole_class,
      pole_type: submitData.pole_type,
      condition: submitData.condition,
      access: submitData.access,
      pole_size: submitData.pole_size,
    });

    const ok = await onSubmit(submitData);
    if (ok) {
      clearDraft();
      setDraftRestored(false);
    }
  };

  const mapCenter = markerPosition || [29.7604, -95.3698]; // Houston, TX
  const submitLabel = mode === "edit" ? "Update Pole" : "Save Pole";
  const submitBtnClass = mode === "edit" ? "bg-orange-600 hover:bg-orange-700" : "bg-red-600 hover:bg-red-700";

  return (
    <div className="min-h-screen bg-industrial-bg pb-4" data-testid={mode === "edit" ? "edit-pole-page" : "add-pole-page"}>
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white backdrop-blur-sm sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to={backUrl}>
                <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900 h-10 w-10 sm:h-9 sm:w-9" data-testid="back-btn">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-600 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <h1 className="font-heading text-sm sm:text-xl font-bold tracking-tight uppercase text-zinc-900">
                  Pole Data Sheet / OCALC
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              {mode === "edit" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSyncDistances}
                  disabled={syncingDistances || !formData.latitude || !formData.longitude}
                  className="h-9 sm:h-8 bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-700 text-sm"
                  data-testid="sync-distances-btn"
                  title="Sync GPS distances for this pole"
                >
                  {syncingDistances ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  <span className="hidden sm:inline">Sync Dist</span>
                </Button>
              )}
              <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-initial">
                <Label className="text-xs font-mono text-zinc-500 whitespace-nowrap">POLE:</Label>
                <Input name="pole_number" value={formData.pole_number} onChange={handleInputChange} placeholder="Pole #" className="w-full sm:w-28 h-9 sm:h-8 bg-white border-zinc-300 text-zinc-900 text-sm" data-testid="pole-number-input" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {draftRestored && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-amber-300 bg-amber-50 px-4 py-3 rounded" data-testid="draft-restored-banner">
              <span className="text-sm text-amber-800">Restored your unsaved draft from this device.</span>
              <Button type="button" variant="outline" size="sm" onClick={startFresh} className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100" data-testid="start-fresh-btn">
                Start fresh
              </Button>
            </div>
          )}
          {/* Save Button - Top */}
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting} className={`h-11 sm:h-10 ${submitBtnClass} text-white min-w-36`} data-testid="save-pole-top-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />{submitLabel}</>}
            </Button>
          </div>

          {/* Basic Info */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500"></div>
              Basic Information
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Owner</Label>
                <Select value={formData.pole_owner} onValueChange={(v) => handleSelectChange("pole_owner", v)}>
                  <SelectTrigger className={`h-12 sm:h-10 bg-white border-zinc-300 ${ownerTriggerClass(formData.pole_owner)}`} data-testid="pole-owner-select">
                    <SelectValue placeholder="Owner" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    {options.pole_owners.map((o) => (
                      <SelectItem key={o} value={o} className={o === "Foreign Owned" ? "text-red-600" : "text-orange-600"}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Access</Label>
                <Select value={formData.access} onValueChange={(v) => handleSelectChange("access", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="access-select">
                    <SelectValue placeholder="Access" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    <SelectItem value="Yes / Rear Easement">Yes / Rear Easement</SelectItem>
                    <SelectItem value="Yes / Side Easement">Yes / Side Easement</SelectItem>
                    <SelectItem value="Yes / Right of Way">Yes / Right of Way</SelectItem>
                    <SelectItem value="No / Rear Easement">No / Rear Easement</SelectItem>
                    <SelectItem value="No / Side Easement">No / Side Easement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Class</Label>
                <Select value={formData.pole_class} onValueChange={(v) => handleSelectChange("pole_class", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="pole-class-select">
                    <SelectValue placeholder="Class" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    {options.pole_classes.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Size *</Label>
                <Select value={formData.pole_size} onValueChange={(v) => handleSelectChange("pole_size", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="pole-size-select">
                    <SelectValue placeholder="Feet" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300 max-h-60">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    {options.sizes.map((s) => (<SelectItem key={s} value={s}>{s}{"'"}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Size Type</Label>
                <Select value={formData.pole_size_type} onValueChange={(v) => handleSelectChange("pole_size_type", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="pole-size-type-select">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    <SelectItem value="Actual" className="text-green-700">Actual</SelectItem>
                    <SelectItem value="Estimate" className="text-yellow-700">Estimate</SelectItem>
                    <SelectItem value="Proposed" className="text-blue-600">Proposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Type of Pole</Label>
                <Select value={formData.pole_type} onValueChange={(v) => handleSelectChange("pole_type", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="pole-type-select">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    {options.pole_types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Condition *</Label>
                <Select value={formData.condition} onValueChange={(v) => handleSelectChange("condition", v)}>
                  <SelectTrigger className="h-12 sm:h-10 bg-white border-zinc-300 text-zinc-900" data-testid="condition-select">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-50 border-zinc-300">
                    <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                    <SelectItem value="Excellent" className="text-green-700">Excellent</SelectItem>
                    <SelectItem value="Good" className="text-yellow-700">Good</SelectItem>
                    <SelectItem value="Bad" className="text-red-600">Bad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Birthmark & MGNV */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-purple-500"></div>
              Birthmark & MGNV
            </h2>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="space-y-2 w-full sm:w-48">
                  <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Has Birthmark</Label>
                  <Select value={formData.has_birthmark ? "Yes" : "No"} onValueChange={(v) => setFormData((prev) => ({ ...prev, has_birthmark: v === "Yes", birthmark_photos: v === "Yes" ? prev.birthmark_photos : [] }))}>
                    <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid="has-birthmark-select"><SelectValue placeholder="Yes / No" /></SelectTrigger>
                    <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </div>
                {formData.has_birthmark && (
                  <div className="flex-1 w-full sm:w-auto">
                    <MultiPhotoUpload 
                      label="Birthmark Photos" 
                      value={formData.birthmark_photos || []} 
                      onChange={(v) => setFormData((prev) => ({ ...prev, birthmark_photos: v }))} 
                      testId="birthmark"
                    />
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-zinc-300">
                <h3 className="text-sm font-mono text-cyan-700 mb-3">MGNV</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">MGNV Present</Label>
                    <Select value={formData.mgnv} onValueChange={(v) => handleSelectChange("mgnv", v)}>
                      <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid="mgnv-select"><SelectValue placeholder="Yes / No" /></SelectTrigger>
                      <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Condition</Label>
                    <Select value={formData.mgnv_condition} onValueChange={(v) => handleSelectChange("mgnv_condition", v)}>
                      <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid="mgnv-condition-select"><SelectValue placeholder="Good / Broken" /></SelectTrigger>
                      <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem><SelectItem value="Good" className="text-green-700">Good</SelectItem><SelectItem value="Broken" className="text-red-600">Broken</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 sm:col-span-3">
                    <MultiPhotoUpload 
                      label="MGNV Photos" 
                      value={formData.mgnv_photos || []} 
                      onChange={(v) => setFormData((prev) => ({ ...prev, mgnv_photos: v }))} 
                      testId="mgnv"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Spans - 4 Rows */}
          <div className="industrial-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                <div className="w-1 h-5 bg-indigo-500"></div>
                Spans
              </h2>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-mono text-zinc-500">Use for Map:</Label>
                <div className="flex rounded-md border border-zinc-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, use_manual_spans: false }))}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      !formData.use_manual_spans 
                        ? "bg-indigo-600 text-white" 
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                    data-testid="use-gps-spans-btn"
                  >
                    GPS Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, use_manual_spans: true }))}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      formData.use_manual_spans 
                        ? "bg-indigo-600 text-white" 
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                    data-testid="use-manual-spans-btn"
                  >
                    Manual
                  </button>
                </div>
              </div>
            </div>
            {formData.use_manual_spans && (
              <p className="text-xs text-indigo-600 mb-3 bg-indigo-50 p-2 rounded border border-indigo-200">
                ✓ Manual measurements will be used in the interactive map instead of GPS-calculated distances.
              </p>
            )}
            <div className="space-y-3">
              {[1, 2, 3, 4].map((num) => (
                <div key={num} className="bg-zinc-50 p-3 border border-zinc-300">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-indigo-600 w-6">{num}</span>
                    <div className="grid grid-cols-3 gap-3 flex-1">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                        <Select value={formData[`span${num}_direction`]} onValueChange={(v) => handleSelectChange(`span${num}_direction`, v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300">
                            <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                            {options.span_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <SpanDistance value={formData[`span${num}_distance`]} onChange={(v) => handleSelectChange(`span${num}_distance`, v)} testId={`span${num}-distance`} />
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Attachment Owner</Label>
                        <Select value={formData[`span${num}_owner`]} onValueChange={(v) => handleSelectChange(`span${num}_owner`, v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300">
                            <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                            {options.span_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GPS & Map */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-emerald-500"></div>
              GPS Location
            </h2>
            <div className="space-y-4">
              {/* Address Search - At the top */}
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Search Address</Label>
                <div className="flex gap-2">
                  <Input 
                    type="text" 
                    value={addressSearch} 
                    onChange={(e) => setAddressSearch(e.target.value)}
                    onKeyDown={handleAddressKeyDown}
                    placeholder="Enter address, city, or landmark..." 
                    className="h-10 bg-white border-zinc-300 text-zinc-900 flex-1" 
                    data-testid="address-search-input"
                  />
                  <Button 
                    type="button" 
                    onClick={searchAddress} 
                    disabled={searchLoading} 
                    className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white px-4"
                    data-testid="search-address-btn"
                  >
                    {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">Search for an address to auto-fill coordinates</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Latitude</Label>
                      <Input type="text" name="latitude" value={formData.latitude} onChange={handleInputChange} placeholder="29.7604" className="h-10 bg-white border-zinc-300 text-zinc-900 font-mono" data-testid="latitude-input" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Longitude</Label>
                      <Input type="text" name="longitude" value={formData.longitude} onChange={handleInputChange} placeholder="-95.3698" className="h-10 bg-white border-zinc-300 text-zinc-900 font-mono" data-testid="longitude-input" />
                    </div>
                  </div>
                  <Button type="button" onClick={getGPSLocation} disabled={gpsLoading} className="w-full h-10 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300" data-testid="get-gps-btn">
                    {gpsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                    Get Current Location
                  </Button>
                  <p className="text-xs text-zinc-500">Click the map to drop a pin, or drag the pin to fine-tune its position</p>
                </div>
                <div className="h-72 sm:h-80 border border-zinc-300 overflow-hidden relative">
                  <MapContainer center={mapCenter} zoom={18} minZoom={3} maxZoom={22} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }} className="z-0">
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='&copy; Esri' maxNativeZoom={19} maxZoom={22} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" attribution='' maxNativeZoom={19} maxZoom={22} />
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" attribution='' maxNativeZoom={19} maxZoom={22} />
                    <MapClickHandler onLocationSelect={handleMapClick} />
                    <MapCenterUpdater lat={formData.latitude} lng={formData.longitude} />
                    {markerPosition && (
                      <Marker
                        position={markerPosition}
                        draggable={true}
                        eventHandlers={markerEventHandlers}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>
            </div>
          </div>

          {/* HOA - Dynamic Rows */}
          <div className="industrial-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                <div className="w-1 h-5 bg-green-500"></div>
                HOA
              </h2>
              <div className="flex items-center gap-2">
                <ReferenceHeightMeasurer 
                  onHeightsDetected={(heights) => {
                    // Add measured heights as new attachment rows
                    const newAttachments = heights.map(h => ({
                      _key: rowKey(),
                      height: h.height_ft?.toString() || "",
                      owner: "",
                      photo: h.photo || "", // Include annotated photo if provided
                      notes: h.description || ""
                    }));
                    setAttachments(prev => [...prev.filter(a => a.height || a.owner || a.photo || a.notes), ...newAttachments]);
                  }}
                  buttonVariant="outline"
                  sessionId={`pole_${initialPole?.id || 'new'}_${jobId}`}
                />
                <Button type="button" onClick={addAttachment} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="w-4 h-4 mr-1" /> Add Row
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {attachments.map((att, index) => (
                <div key={att._key} className="bg-zinc-50 p-3 border border-zinc-300">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm font-mono text-green-700 w-6">{index + 1}</span>
                    <div className="grid grid-cols-5 gap-2 sm:gap-3 flex-1 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                        <Select value={att.owner} onValueChange={(v) => updateAttachment(index, "owner", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300">
                            <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                            {options.attachment_owners.filter(o => o !== "Midspan" && o !== "Building").map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Location</Label>
                        <Select value={att.location || ""} onValueChange={(v) => updateAttachment(index, "location", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Location" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300">
                            <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                            <SelectItem value="Midspan">Midspan</SelectItem>
                            <SelectItem value="Building">Building</SelectItem>
                            <SelectItem value="Driveway">Driveway</SelectItem>
                            <SelectItem value="St. Crossing">St. Crossing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <HeightInput value={att.height} onChange={(v) => updateAttachment(index, "height", v)} label="Height" testId={`attachment${index}-height`} />
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Type</Label>
                        <Select value={att.hoa_type || ""} onValueChange={(v) => updateAttachment(index, "hoa_type", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300">
                            <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                            <SelectItem value="Fiber new strand">Fiber new strand</SelectItem>
                            <SelectItem value="Fiber over lashed to copper">Fiber over lashed to copper</SelectItem>
                            <SelectItem value="Copper">Copper</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Notes</Label>
                        <Input type="text" value={att.notes || ""} onChange={(e) => updateAttachment(index, "notes", e.target.value)} placeholder="Notes" className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm" />
                      </div>
                    </div>
                    {attachments.length > 1 && (
                      <Button type="button" onClick={() => removeAttachment(index)} size="icon" variant="ghost" className="text-red-600 hover:text-red-300 hover:bg-red-500/10 h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Pole Terminal and Risers */}
              <div className="mt-4 pt-4 border-t border-zinc-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Pole Terminal</Label>
                    <Select value={formData.pole_terminal} onValueChange={(v) => handleSelectChange("pole_terminal", v)}>
                      <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900" data-testid="pole-terminal-select">
                        <SelectValue placeholder="Yes / No" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-50 border-zinc-300">
                        <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">How Many Risers</Label>
                    <div className="flex gap-2">
                      <Select value={formData.risers} onValueChange={(v) => handleSelectChange("risers", v)}>
                        <SelectTrigger className="h-10 bg-white border-zinc-300 text-zinc-900 flex-1" data-testid="risers-select">
                          <SelectValue placeholder="Select #" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-50 border-zinc-300">
                          <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                          {options.riser_options.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <HeightInput 
                        value={formData.riser_height} 
                        onChange={(v) => setFormData(prev => ({ ...prev, riser_height: v }))} 
                        label="" 
                        testId="riser-height" 
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* HOA Mark Ups - Photo Editor */}
              <div className="mt-4 pt-4 border-t border-zinc-300">
                <div className="flex items-center gap-2 mb-3">
                  <Pencil className="w-4 h-4 text-green-600" />
                  <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">HOA Mark Ups</Label>
                </div>
                <PhotoMarkupEditor 
                  photos={formData.hoa_markup_photos || []} 
                  onChange={(v) => setFormData(prev => ({ ...prev, hoa_markup_photos: v }))}
                  label="HOA Mark Ups"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Upload pole photos and add annotations: lines, shapes, text, and measurement markers.
                </p>
              </div>
            </div>
          </div>

          {/* OCALC Photos */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-blue-500"></div>
              OCALC Photos
            </h2>
            
            {/* Pole Picture - Main photo at top */}
            <div className="mb-4 pb-4 border-b border-zinc-200">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2 block">Pole Picture</Label>
              <MultiPhotoUpload 
                label="Pole Picture" 
                value={formData.pole_photo ? [formData.pole_photo] : []} 
                onChange={(v) => setFormData(prev => ({ ...prev, pole_photo: v[0] || "" }))} 
                testId="pole-photo"
                maxPhotos={1}
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Left</Label>
                <PhotoMarkupEditor 
                  photos={formData.ocalc_left_photo ? [formData.ocalc_left_photo] : []} 
                  onChange={(v) => handlePhotoChange("ocalc_left_photo", v[0] || "")}
                  label="OCALC Left"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Middle</Label>
                <PhotoMarkupEditor 
                  photos={formData.ocalc_middle_photo ? [formData.ocalc_middle_photo] : []} 
                  onChange={(v) => handlePhotoChange("ocalc_middle_photo", v[0] || "")}
                  label="OCALC Middle"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Right</Label>
                <PhotoMarkupEditor 
                  photos={formData.ocalc_right_photo ? [formData.ocalc_right_photo] : []} 
                  onChange={(v) => handlePhotoChange("ocalc_right_photo", v[0] || "")}
                  label="OCALC Right"
                />
              </div>
            </div>
          </div>

          {/* Down Guys - Dynamic Rows */}
          <div className="industrial-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                <div className="w-1 h-5 bg-yellow-500"></div>
                Down Guys
              </h2>
              <Button type="button" onClick={addDownGuy} size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white">
                <Plus className="w-4 h-4 mr-1" /> Add Row
              </Button>
            </div>
            <div className="space-y-3">
              {downGuys.map((guy, index) => (
                <div key={guy._key} className="bg-zinc-50 p-3 border border-zinc-300">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm font-mono text-yellow-700 w-6">{index + 1}</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 flex-1">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Owner</Label>
                        <Select value={guy.owner} onValueChange={(v) => updateDownGuy(index, "owner", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.down_guy_owners.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                        <Select value={guy.direction} onValueChange={(v) => updateDownGuy(index, "direction", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Size</Label>
                        <Select value={guy.size} onValueChange={(v) => updateDownGuy(index, "size", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Size" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.down_guy_sizes.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Type</Label>
                        <Select value={guy.type} onValueChange={(v) => updateDownGuy(index, "type", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.down_guy_types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono text-zinc-500">Condition</Label>
                        <Select value={guy.condition} onValueChange={(v) => updateDownGuy(index, "condition", v)}>
                          <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Cond" /></SelectTrigger>
                          <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.down_guy_conditions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <HeightInput value={guy.height} onChange={(v) => updateDownGuy(index, "height", v)} label="Height" testId={`downguy${index}-height`} />
                      <HeightInput value={guy.lead} onChange={(v) => updateDownGuy(index, "lead", v)} label="Lead" testId={`downguy${index}-lead`} />
                    </div>
                    {downGuys.length > 1 && (
                      <Button type="button" onClick={() => removeDownGuy(index)} size="icon" variant="ghost" className="text-red-600 hover:text-red-300 hover:bg-red-500/10 h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 ml-8">
                    <PhotoMarkupEditor 
                      photos={guy.photos || []} 
                      onChange={(v) => updateDownGuy(index, "photos", v)} 
                      label={`Down Guy ${index + 1} Photos`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Anchor - Dynamic Rows */}
            <div className="mt-4 pt-4 border-t border-zinc-300">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-mono text-orange-600">ANCHOR</h3>
                <Button type="button" onClick={addKnuckle} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
                  <Plus className="w-4 h-4 mr-1" /> Add Row
                </Button>
              </div>
              <div className="space-y-3">
                {knuckles.map((knuckle, index) => (
                  <div key={knuckle._key} className="bg-zinc-50 p-3 border border-zinc-300">
                    <div className="flex items-center gap-2 sm:gap-4">
                      <span className="text-sm font-mono text-orange-600 w-6">{index + 1}</span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 flex-1 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs font-mono text-zinc-500">Size</Label>
                          <Select value={knuckle.size} onValueChange={(v) => updateKnuckle(index, "size", v)}>
                            <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Size" /></SelectTrigger>
                            <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.anchor_sizes.map((s) => (<SelectItem key={s} value={s}>{s}{'"'}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-mono text-zinc-500">Total Eyes</Label>
                          <Select value={knuckle.total_eyes} onValueChange={(v) => updateKnuckle(index, "total_eyes", v)}>
                            <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Eyes" /></SelectTrigger>
                            <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.anchor_eyes.map((e) => (<SelectItem key={e} value={e}>{e}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-mono text-zinc-500">Direction</Label>
                          <Select value={knuckle.direction} onValueChange={(v) => updateKnuckle(index, "direction", v)}>
                            <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Dir" /></SelectTrigger>
                            <SelectContent className="bg-zinc-50 border-zinc-300"><SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>{options.down_guy_directions.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-mono text-zinc-500">Condition</Label>
                          <Select value={knuckle.condition} onValueChange={(v) => updateKnuckle(index, "condition", v)}>
                            <SelectTrigger className="h-9 bg-white border-zinc-300 text-zinc-900 text-sm"><SelectValue placeholder="Condition" /></SelectTrigger>
                            <SelectContent className="bg-zinc-50 border-zinc-300">
                              <SelectItem value={BLANK} className="text-zinc-500">—</SelectItem>
                              <SelectItem value="Excellent" className="text-green-700">Excellent</SelectItem>
                              <SelectItem value="Good" className="text-yellow-700">Good</SelectItem>
                              <SelectItem value="Bad" className="text-red-600">Bad</SelectItem>
                              <SelectItem value="Buried" className="text-blue-600">Buried</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {knuckles.length > 1 && (
                        <Button type="button" onClick={() => removeKnuckle(index)} size="icon" variant="ghost" className="text-red-600 hover:text-red-300 hover:bg-red-500/10 h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {/* Anchor Photo Upload */}
                    <div className="mt-2 ml-8">
                      <MultiPhotoUpload 
                        label={`Anchor ${index + 1} Photos`}
                        value={knuckle.photos || []} 
                        onChange={(v) => updateKnuckle(index, "photos", v)} 
                        testId={`anchor${index}-photos`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* R.O.W. Information */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-amber-500"></div>
              R.O.W. Information
            </h2>
            <Textarea name="row_information" value={formData.row_information} onChange={handleInputChange} placeholder="Right of Way information and measurements..." rows={3} className="bg-white border-zinc-300 text-zinc-900 resize-none" data-testid="row-information-input" />
          </div>

          {/* Notes */}
          <div className="industrial-card p-4 sm:p-5">
            <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-zinc-500"></div>
              Notes
            </h2>
            <Textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Additional notes..." rows={3} className="bg-white border-zinc-300 text-zinc-900 resize-none" data-testid="notes-input" />
          </div>

          {/* Submit */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-2">
            <Link to={backUrl} className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="w-full sm:w-auto h-12 sm:h-10 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900" data-testid="cancel-btn">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={submitting} className={`w-full sm:w-auto h-12 sm:h-10 ${submitBtnClass} text-white min-w-32`} data-testid="save-pole-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />{submitLabel}</>}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default PoleForm;
