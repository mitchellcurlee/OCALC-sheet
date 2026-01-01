import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
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
  Camera,
  X,
  Zap,
  Loader2,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EditPole = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [options, setOptions] = useState({
    pole_types: [],
    conditions: [],
    sizes: [],
  });

  const [formData, setFormData] = useState({
    pole_type: "",
    pole_size: "",
    telecom_attachments: 0,
    condition: "",
    down_guy_height: "",
    lead_anchor_characteristics: "",
    ground_type: "",
    riser_number: "",
    height_of_attachment: "",
    latitude: "",
    longitude: "",
    photo_base64: "",
    notes: "",
  });

  const [photoPreview, setPhotoPreview] = useState(null);

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
        pole_type: pole.pole_type || "",
        pole_size: pole.pole_size || "",
        telecom_attachments: pole.telecom_attachments || 0,
        condition: pole.condition || "",
        down_guy_height: pole.down_guy_height?.toString() || "",
        lead_anchor_characteristics: pole.lead_anchor_characteristics || "",
        ground_type: pole.ground_type || "",
        riser_number: pole.riser_number?.toString() || "",
        height_of_attachment: pole.height_of_attachment?.toString() || "",
        latitude: pole.latitude?.toString() || "",
        longitude: pole.longitude?.toString() || "",
        photo_base64: pole.photo_base64 || "",
        notes: pole.notes || "",
      });
      if (pole.photo_base64) {
        setPhotoPreview(pole.photo_base64);
      }
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

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setFormData((prev) => ({ ...prev, photo_base64: base64 }));
        setPhotoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setFormData((prev) => ({ ...prev, photo_base64: "" }));
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
          latitude: position.coords.latitude.toString(),
          longitude: position.coords.longitude.toString(),
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

    if (!formData.pole_type || !formData.pole_size || !formData.condition) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        ...formData,
        telecom_attachments: parseInt(formData.telecom_attachments) || 0,
        down_guy_height: formData.down_guy_height
          ? parseFloat(formData.down_guy_height)
          : null,
        riser_number: formData.riser_number
          ? parseInt(formData.riser_number)
          : null,
        height_of_attachment: formData.height_of_attachment
          ? parseFloat(formData.height_of_attachment)
          : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };

      await axios.put(`${API}/poles/${id}`, submitData);
      toast.success("Pole data updated successfully!");
      navigate("/");
    } catch (error) {
      toast.error("Failed to update pole data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 font-mono">Loading pole data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="edit-pole-page">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
              <div className="w-10 h-10 bg-orange-600 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold tracking-tight uppercase text-white">
                  Edit Pole
                </h1>
                <p className="text-xs text-zinc-500 font-mono">
                  ID: {id.slice(0, 8)}...
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info Section */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-red-500"></div>
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Pole Type *
                </Label>
                <Select
                  value={formData.pole_type}
                  onValueChange={(value) => handleSelectChange("pole_type", value)}
                >
                  <SelectTrigger
                    className="industrial-input bg-black border-zinc-700 text-white"
                    data-testid="pole-type-select"
                  >
                    <SelectValue placeholder="Select pole type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.pole_types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Pole Size *
                </Label>
                <Select
                  value={formData.pole_size}
                  onValueChange={(value) => handleSelectChange("pole_size", value)}
                >
                  <SelectTrigger
                    className="industrial-input bg-black border-zinc-700 text-white"
                    data-testid="pole-size-select"
                  >
                    <SelectValue placeholder="Select pole size" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.sizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Condition *
                </Label>
                <Select
                  value={formData.condition}
                  onValueChange={(value) => handleSelectChange("condition", value)}
                >
                  <SelectTrigger
                    className="industrial-input bg-black border-zinc-700 text-white"
                    data-testid="condition-select"
                  >
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {options.conditions.map((cond) => (
                      <SelectItem key={cond} value={cond}>
                        {cond}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Telecom Attachments
                </Label>
                <Input
                  type="number"
                  name="telecom_attachments"
                  value={formData.telecom_attachments}
                  onChange={handleInputChange}
                  min="0"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="telecom-attachments-input"
                />
              </div>
            </div>
          </div>

          {/* Technical Details Section */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-orange-500"></div>
              Technical Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Down Guy Height (ft)
                </Label>
                <Input
                  type="number"
                  name="down_guy_height"
                  value={formData.down_guy_height}
                  onChange={handleInputChange}
                  step="0.1"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="down-guy-height-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Height of Attachment (ft)
                </Label>
                <Input
                  type="number"
                  name="height_of_attachment"
                  value={formData.height_of_attachment}
                  onChange={handleInputChange}
                  step="0.1"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="attachment-height-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Lead & Anchor Characteristics
                </Label>
                <Input
                  type="text"
                  name="lead_anchor_characteristics"
                  value={formData.lead_anchor_characteristics}
                  onChange={handleInputChange}
                  placeholder="e.g., Steel anchor, 6ft lead"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="lead-anchor-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Ground Type
                </Label>
                <Input
                  type="text"
                  name="ground_type"
                  value={formData.ground_type}
                  onChange={handleInputChange}
                  placeholder="e.g., Concrete, Soil, Asphalt"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="ground-type-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Riser Number
                </Label>
                <Input
                  type="number"
                  name="riser_number"
                  value={formData.riser_number}
                  onChange={handleInputChange}
                  min="0"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="riser-number-input"
                />
              </div>
            </div>
          </div>

          {/* GPS Location Section */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-green-500"></div>
              GPS Location
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Latitude
                </Label>
                <Input
                  type="number"
                  name="latitude"
                  value={formData.latitude}
                  onChange={handleInputChange}
                  step="0.000001"
                  placeholder="e.g., 37.7749"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="latitude-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Longitude
                </Label>
                <Input
                  type="number"
                  name="longitude"
                  value={formData.longitude}
                  onChange={handleInputChange}
                  step="0.000001"
                  placeholder="e.g., -122.4194"
                  className="industrial-input bg-black border-zinc-700 text-white"
                  data-testid="longitude-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  Auto-Capture
                </Label>
                <Button
                  type="button"
                  onClick={getGPSLocation}
                  disabled={gpsLoading}
                  className="w-full industrial-button bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                  data-testid="get-gps-btn"
                >
                  {gpsLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  Get Current Location
                </Button>
              </div>
            </div>
          </div>

          {/* Photo Upload Section */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-blue-500"></div>
              Photo Documentation
            </h2>
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
                data-testid="photo-input"
              />
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Pole preview"
                    className="max-w-sm max-h-64 object-cover border-2 border-zinc-700"
                    data-testid="photo-preview"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-700"
                    onClick={removePhoto}
                    data-testid="remove-photo-btn"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="industrial-button bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 border-dashed h-32 w-full"
                  data-testid="upload-photo-btn"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="w-8 h-8 text-zinc-500" />
                    <span className="text-sm text-zinc-400">
                      Click to upload photo
                    </span>
                    <span className="text-xs text-zinc-600">Max 5MB</span>
                  </div>
                </Button>
              )}
            </div>
          </div>

          {/* Notes Section */}
          <div className="industrial-card p-6">
            <h2 className="font-heading text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-purple-500"></div>
              Additional Notes
            </h2>
            <Textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Enter any additional observations or notes..."
              rows={4}
              className="industrial-input bg-black border-zinc-700 text-white resize-none"
              data-testid="notes-input"
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link to="/">
              <Button
                type="button"
                variant="outline"
                className="industrial-button bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white"
                data-testid="cancel-btn"
              >
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading}
              className="industrial-button bg-red-600 hover:bg-red-700 text-white min-w-32"
              data-testid="update-pole-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Update Pole Data
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default EditPole;
