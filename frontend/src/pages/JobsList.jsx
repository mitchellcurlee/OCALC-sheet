import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ASE_OPTIONS } from "@/components/ase/ASEFormConstants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  Zap,
  Folder,
  FolderOpen,
  MapPin,
  Calendar,
  Trash2,
  DatabaseBackup,
  Users,
  Pencil,
  ArrowRightLeft,
  LogOut,
  Loader2,
  Radio,
  Shield,
  User,
  ChevronLeft,
  Search,
  X,
  Map as MapIcon,
  WifiOff,
  Copy,
  FolderInput,
} from "lucide-react";
import { LifeBuoy, Home } from "lucide-react";
import { getOfflineSavedJobs } from "@/lib/offlineTiles";
import { useAuth } from "@/context/AuthContext";
import { OfflineIndicator } from "@/components/OfflineIndicator";

const JOB_TYPES = ["OCALC", "DMG", "ABF", "BAU", "ASE", "PBB", "SEAL", "SV", "CELL SITE", "PFP", "F1", "F2"];

const jobPinIcon = (name, completed = false) => {
  const color = completed ? "#16a34a" : "#dc2626";
  return L.divIcon({
    className: "job-pin",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
      <div style="background:${color};color:#fff;font:700 10px ui-monospace,monospace;padding:2px 6px;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;">${name}</div>
      <div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 1px 3px rgba(0,0,0,.5);"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

const JobsLocationMap = ({ jobs, onOpenJob }) => {
  const pins = jobs.filter((j) => Number.isFinite(j.latitude) && Number.isFinite(j.longitude));
  if (pins.length === 0) return null;
  const bounds = L.latLngBounds(pins.map((j) => [j.latitude, j.longitude]));
  return (
    <div className="industrial-card mb-6 overflow-hidden" data-testid="jobs-location-map-card">
      <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
        <MapIcon className="w-4 h-4 text-red-600" />
        <span className="text-xs font-mono tracking-widest text-zinc-600 uppercase">Job Locations ({pins.length})</span>
      </div>
      <div className="h-[320px]">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [40, 40], maxZoom: 15 }} className="h-full w-full" scrollWheelZoom={true}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={22} crossOrigin="anonymous" />
          {pins.map((job) => (
            <Marker key={job.id} position={[job.latitude, job.longitude]} icon={jobPinIcon(job.name, !!job.completed)}>
              <Popup>
                <div className="min-w-[160px] font-mono">
                  <div className="text-sm font-bold text-zinc-900">{job.name || job.site_id}</div>
                  {job.location && <div className="text-xs text-zinc-500">{job.location}</div>}
                  <div className="text-xs text-zinc-600 mt-1">{job.pole_count} attribute{job.pole_count === 1 ? "" : "s"}</div>
                  <Button size="sm" className="w-full h-7 mt-2 bg-red-600 hover:bg-red-700 text-white" onClick={() => onOpenJob(job.id)} data-testid={`map-open-job-${job.id}`}>
                    Open Job
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

const JobsList = () => {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [offlineSavedJobs, setOfflineSavedJobs] = useState(() => getOfflineSavedJobs());
  useEffect(() => {
    const refresh = () => setOfflineSavedJobs(getOfflineSavedJobs());
    window.addEventListener("offline-saved-jobs-changed", refresh);
    return () => window.removeEventListener("offline-saved-jobs-changed", refresh);
  }, []);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "", location: "", job_type: "OCALC", site_id: "", employee_info: "" });
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return jobs.filter((j) =>
      [j.name, j.location, j.description, j.job_type]
        .some((f) => (f || "").toLowerCase().includes(q))
    );
  }, [jobs, searchQuery]);

  // Group jobs into month folders by folder_month override or created_at (newest month first)
  const monthGroups = useMemo(() => {
    const groups = {};
    jobs.forEach((j) => {
      let key = /^\d{4}-\d{2}$/.test(j.folder_month || "") ? j.folder_month : null;
      if (!key) {
        const d = new Date(j.created_at);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!groups[key]) {
        const [y, m] = key.split("-").map(Number);
        groups[key] = { key, label: new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }), jobs: [] };
      }
      groups[key].jobs.push(j);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [jobs]);

  const activeGroup = monthGroups.find((g) => g.key === selectedMonth) || null;

  const fetchJobs = useCallback(async () => {
    try {
      const response = await axios.get("/jobs");
      setJobs(response.data);
    } catch (error) {
      toast.error("Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreate = async () => {
    if (!(formData.site_id || "").trim()) {
      toast.error("Site ID is required");
      return;
    }
    setSaving(true);
    try {
      await axios.post("/jobs", formData);
      toast.success("Job created successfully!");
      setShowCreateDialog(false);
      setFormData({ name: "", description: "", location: "", job_type: "OCALC", site_id: "", employee_info: "" });
      fetchJobs();
    } catch (error) {
      toast.error("Failed to create job");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!(formData.site_id || "").trim()) {
      toast.error("Site ID is required");
      return;
    }
    setSaving(true);
    try {
      await axios.put(`/jobs/${editingJob.id}`, formData);
      toast.success("Job updated successfully!");
      setShowEditDialog(false);
      setEditingJob(null);
      setFormData({ name: "", description: "", location: "", job_type: "OCALC", site_id: "", employee_info: "" });
      fetchJobs();
    } catch (error) {
      toast.error("Failed to update job");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`/jobs/${deleteId}`);
      toast.success("Job moved to Deleted Items — restore it anytime from the trash folder");
      setDeleteId(null);
      fetchJobs();
    } catch (error) {
      toast.error("Failed to delete job");
    }
  };

  const openEditDialog = (job, e) => {
    e.stopPropagation();
    setEditingJob(job);
    setFormData({ name: job.name, description: job.description || "", location: job.location || "", job_type: job.job_type || "OCALC", site_id: job.site_id || "", employee_info: job.employee_info || "" });
    setShowEditDialog(true);
  };

  const handleToggleComplete = async (job, completed) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, completed } : j)));
    try {
      await axios.put(`/jobs/${job.id}`, { completed });
      toast.success(completed ? "Job marked complete" : "Job marked incomplete");
    } catch (error) {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, completed: !completed } : j)));
      toast.error("Failed to update job status");
    }
  };

  // Job transfer
  const [transferJob, setTransferJob] = useState(null);
  const [transferUsers, setTransferUsers] = useState([]);
  const [transferUserId, setTransferUserId] = useState("");
  const [transferring, setTransferring] = useState(false);

  const [moveMonthJob, setMoveMonthJob] = useState(null);
  const [moveMonthValue, setMoveMonthValue] = useState("");
  const [movingMonth, setMovingMonth] = useState(false);

  const duplicateJob = async (job, e) => {
    e.stopPropagation();
    try {
      await axios.post(`/jobs/${job.id}/duplicate`);
      toast.success("Job duplicated");
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to duplicate job");
    }
  };

  const openMoveMonthDialog = (job, e) => {
    e.stopPropagation();
    setMoveMonthJob(job);
    const d = new Date(job.created_at);
    setMoveMonthValue(/^\d{4}-\d{2}$/.test(job.folder_month || "") ? job.folder_month : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleMoveMonth = async () => {
    if (!moveMonthJob || !/^\d{4}-\d{2}$/.test(moveMonthValue)) return;
    setMovingMonth(true);
    try {
      await axios.put(`/jobs/${moveMonthJob.id}`, { folder_month: moveMonthValue });
      toast.success("Job moved to new month");
      setMoveMonthJob(null);
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to move job");
    } finally {
      setMovingMonth(false);
    }
  };

  const openTransferDialog = async (job, e) => {
    e.stopPropagation();
    setTransferJob(job);
    setTransferUserId("");
    try {
      const res = await axios.get("/users/transferable");
      setTransferUsers(res.data || []);
    } catch (error) {
      toast.error("Failed to load users");
    }
  };

  const handleTransfer = async () => {
    if (!transferJob || !transferUserId) return;
    setTransferring(true);
    try {
      const res = await axios.post(`/jobs/${transferJob.id}/transfer`, { user_id: transferUserId });
      toast.success(res.data?.message || "Job transferred");
      setTransferJob(null);
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to transfer job");
    } finally {
      setTransferring(false);
    }
  };

  const renderJobCard = (job) => (
    <div
      key={job.id}
      onClick={() => navigate(`/jobs/${job.id}`)}
      className={`industrial-card p-5 cursor-pointer transition-colors group ${job.completed ? "border-green-500/50 hover:border-green-600" : "hover:border-red-500/50"}`}
      data-testid={`job-card-${job.id}`}
    >
      {/* Complete checkbox */}
      <div className="flex items-center justify-between mb-2" onClick={(e) => e.stopPropagation()}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={!!job.completed}
            onCheckedChange={(v) => handleToggleComplete(job, !!v)}
            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
            data-testid={`job-complete-checkbox-${job.id}`}
          />
          <span className={`text-xs font-mono uppercase ${job.completed ? "text-green-600 font-bold" : "text-zinc-500"}`}>
            {job.completed ? "Complete" : "Mark Complete"}
          </span>
          {offlineSavedJobs[job.id] && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide bg-sky-100 text-sky-700 border border-sky-300 rounded px-1.5 py-0.5 ml-1"
              title={`Saved for offline use ${new Date(offlineSavedJobs[job.id]).toLocaleDateString()}`}
              data-testid={`job-offline-badge-${job.id}`}
            >
              <WifiOff className="w-3 h-3" />
              Saved Offline
            </span>
          )}
        </label>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-600 hover:text-emerald-600"
            title="Duplicate job"
            onClick={(e) => duplicateJob(job, e)}
            data-testid={`job-duplicate-btn-${job.id}`}
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-600 hover:text-violet-600"
            title="Move job to another month"
            onClick={(e) => openMoveMonthDialog(job, e)}
            data-testid={`job-move-month-btn-${job.id}`}
          >
            <FolderInput className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-600 hover:text-blue-600"
            title="Transfer job to another user"
            onClick={(e) => openTransferDialog(job, e)}
            data-testid={`job-transfer-btn-${job.id}`}
          >
            <ArrowRightLeft className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-600 hover:text-zinc-900"
            onClick={(e) => openEditDialog(job, e)}
            data-testid={`job-edit-btn-${job.id}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-600 hover:text-red-600"
            onClick={(e) => { e.stopPropagation(); setDeleteId(job.id); }}
            data-testid={`job-delete-btn-${job.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center ${job.completed ? "bg-green-600/20 border border-green-500/30" : "bg-red-600/20 border border-red-500/30"}`}>
            <Folder className={`w-5 h-5 ${job.completed ? "text-green-600" : "text-red-600"}`} />
          </div>
          <div>
            <h3 className={`font-heading text-lg font-bold text-zinc-900 transition-colors ${job.completed ? "group-hover:text-green-600" : "group-hover:text-red-600"}`}>
              {job.site_id || job.name}
            </h3>
            {job.name && job.site_id && (
              <div className="text-xs text-zinc-500 font-mono">{job.name}</div>
            )}
            {job.location && (
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="w-3 h-3" />
                {job.location}
              </div>
            )}
            {isAdmin && job.user_email && (
              <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                <User className="w-3 h-3" />
                {job.user_email}
              </div>
            )}
            {job.transferred_from && (
              <div className="flex items-center gap-1 text-xs text-amber-600 mt-1" data-testid={`job-transferred-from-${job.id}`}>
                <ArrowRightLeft className="w-3 h-3" />
                Transferred from {job.transferred_from}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {job.description && (
        <p className="text-sm text-zinc-600 mb-3 line-clamp-2">{job.description}</p>
      )}
      
      <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
        <div className="flex items-center gap-2 text-sm">
          <Radio className="w-4 h-4 text-yellow-500" />
          <span className="text-zinc-700 font-mono">{job.pole_count}</span>
          <span className="text-zinc-500">poles</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <Calendar className="w-3 h-3" />
          {new Date(job.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="jobs-list">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-600 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight uppercase text-zinc-900">
                  Pole Data Sheet
                </h1>
                <p className="text-xs text-zinc-500 font-mono tracking-wider hidden sm:block">
                  {isAdmin ? "ADMIN VIEW - ALL JOBS" : "SELECT OR CREATE A JOB"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <OfflineIndicator />
              <Button
                onClick={() => navigate("/recovery")}
                size="icon"
                variant="ghost"
                className="text-zinc-400 hover:text-amber-400 hover:bg-zinc-800"
                title="Device data recovery"
                data-testid="device-recovery-btn"
              >
                <LifeBuoy className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => navigate("/trash")}
                size="icon"
                variant="ghost"
                className="text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                title="Deleted items"
                data-testid="deleted-items-btn"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                onClick={async () => {
                  if (!window.confirm("Fill in the lot address (building # + street) for every GPS'd pole and attribute that has none yet?")) return;
                  setBackfilling(true);
                  try {
                    const r = await axios.post("/maps/backfill-addresses");
                    toast.success(`Addresses filled: ${r.data.filled} (${r.data.no_match} without a nearby home) across ${r.data.jobs} job${r.data.jobs === 1 ? "" : "s"}`);
                  } catch (e) {
                    toast.error("Address backfill failed");
                  } finally { setBackfilling(false); }
                }}
                disabled={backfilling}
                size="icon"
                variant="ghost"
                className="text-zinc-400 hover:text-sky-400 hover:bg-zinc-800"
                title="Fill in missing item addresses on all my jobs"
                data-testid="backfill-addresses-btn"
              >
                {backfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Home className="w-4 h-4" />}
              </Button>
              {isAdmin && (
                <>
                <Button
                  onClick={() => navigate("/admin/users")}
                  size="icon"
                  variant="ghost"
                  className="text-zinc-400 hover:text-amber-400 hover:bg-zinc-800"
                  title="Users by company"
                  data-testid="admin-users-btn"
                >
                  <Users className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => navigate("/backup")}
                  size="icon"
                  variant="ghost"
                  className="text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800"
                  title="Backup to Atlas"
                  data-testid="backup-atlas-btn"
                >
                  <DatabaseBackup className="w-4 h-4" />
                </Button>
                </>
              )}
              {user && (
                <div className="hidden sm:flex items-center gap-2">
                  {isAdmin && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-mono rounded">
                      <Shield className="w-3 h-3" />
                      ADMIN
                    </span>
                  )}
                  <span className="text-xs text-zinc-600 font-mono">
                    {user.name || user.email}
                  </span>
                </div>
              )}
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="flex-1 sm:flex-initial h-11 sm:h-10 bg-red-600 hover:bg-red-700 text-white"
                data-testid="create-job-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Job
              </Button>
              <Button
                onClick={logout}
                variant="ghost"
                size="icon"
                className="h-11 w-11 sm:h-10 sm:w-10 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        {jobs.length === 0 ? (
          <div className="industrial-card p-12 text-center">
            <Folder className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-zinc-900 mb-2">No Jobs Yet</h2>
            <p className="text-zinc-600 mb-6">Create your first job to start collecting pole data</p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Job
            </Button>
          </div>
        ) : (
          <>
            {/* Map of all job locations */}
            <JobsLocationMap jobs={jobs} onOpenJob={(id) => navigate(`/jobs/${id}`)} />

            {/* Search bar */}
            <div className="relative mb-6 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs by name, location, or type..."
                className="pl-9 pr-9 bg-white border-zinc-300 text-zinc-900 h-11 sm:h-10"
                data-testid="job-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  data-testid="job-search-clear-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchQuery.trim() ? (
              /* Search results view */
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Search className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-zinc-600 font-mono" data-testid="job-search-results-count">
                    {searchResults.length} job{searchResults.length === 1 ? "" : "s"} found for "{searchQuery.trim()}"
                  </span>
                </div>
                {searchResults.length === 0 ? (
                  <div className="industrial-card p-8 text-center text-zinc-500" data-testid="job-search-no-results">
                    No jobs match your search.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="job-search-results-grid">
                    {searchResults.map((job) => renderJobCard(job))}
                  </div>
                )}
              </>
            ) : activeGroup === null ? (
              /* Month folders view */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="month-folders-grid">
                {monthGroups.map((group) => (
                  <div
                    key={group.key}
                    onClick={() => setSelectedMonth(group.key)}
                    className="industrial-card p-5 cursor-pointer hover:border-red-500/50 transition-colors group"
                    data-testid={`month-folder-${group.key}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                        <Folder className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <h3 className="font-heading text-lg font-bold text-zinc-900 group-hover:text-red-600 transition-colors">
                          {group.label}
                        </h3>
                        <p className="text-xs text-zinc-500 font-mono">
                          {group.jobs.length} job{group.jobs.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Jobs inside selected month */
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedMonth(null)}
                    className="h-9 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900"
                    data-testid="back-to-months-btn"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    All Months
                  </Button>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-red-600" />
                    <h2 className="font-heading text-lg font-bold text-zinc-900 uppercase">{activeGroup.label}</h2>
                    <span className="text-xs text-zinc-500 font-mono">({activeGroup.jobs.length} job{activeGroup.jobs.length === 1 ? "" : "s"})</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeGroup.jobs.map((job) => renderJobCard(job))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Create Job Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-50 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Create New Job</DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">Set the site ID, wire center, type and location details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Site ID *</Label>
              <Input
                value={formData.site_id || ""}
                onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
                placeholder="e.g., A05CZ38"
                className="bg-white border-zinc-300 text-zinc-900"
                data-testid="job-site-id-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Wire Center</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Street Project"
                className="bg-white border-zinc-300 text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Employee Info</Label>
              <Select value={formData.employee_info || ""} onValueChange={(v) => setFormData({ ...formData, employee_info: v === "__none__" ? "" : v })}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900" data-testid="job-employee-select">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300 max-h-64">
                  <SelectItem value="__none__" className="text-zinc-500">—</SelectItem>
                  {ASE_OPTIONS.employees.map((emp) => (<SelectItem key={emp} value={emp}>{emp}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Job Type</Label>
              <Select value={formData.job_type} onValueChange={(v) => setFormData({ ...formData, job_type: v })}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900" data-testid="job-type-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300">
                  {JOB_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Dallas, TX"
                className="bg-white border-zinc-300 text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                className="bg-white border-zinc-300 text-zinc-900"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="bg-zinc-100 border-zinc-300 text-zinc-900">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Job Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-zinc-50 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Edit Job</DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">Update the site ID, wire center, type and location details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Site ID *</Label>
              <Input
                value={formData.site_id || ""}
                onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
                className="bg-white border-zinc-300 text-zinc-900"
                data-testid="job-edit-site-id-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Wire Center</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white border-zinc-300 text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Employee Info</Label>
              <Select value={formData.employee_info || ""} onValueChange={(v) => setFormData({ ...formData, employee_info: v === "__none__" ? "" : v })}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900" data-testid="job-edit-employee-select">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300 max-h-64">
                  <SelectItem value="__none__" className="text-zinc-500">—</SelectItem>
                  {ASE_OPTIONS.employees.map((emp) => (<SelectItem key={emp} value={emp}>{emp}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Job Type</Label>
              <Select value={formData.job_type} onValueChange={(v) => setFormData({ ...formData, job_type: v })}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300">
                  {JOB_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="bg-white border-zinc-300 text-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-white border-zinc-300 text-zinc-900"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="bg-zinc-100 border-zinc-300 text-zinc-900">
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Month Dialog */}
      <Dialog open={!!moveMonthJob} onOpenChange={(o) => { if (!o) setMoveMonthJob(null); }}>
        <DialogContent className="bg-white border-zinc-200 max-w-sm" aria-describedby={undefined} data-testid="move-month-dialog">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <FolderInput className="w-5 h-5 text-violet-600" />
              Move Job to Month
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-zinc-700">Pick the month folder for "{moveMonthJob?.site_id || moveMonthJob?.name}"</Label>
            <input
              type="month"
              value={moveMonthValue}
              onChange={(e) => setMoveMonthValue(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-zinc-300 rounded-md text-zinc-900"
              data-testid="move-month-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveMonthJob(null)} className="bg-zinc-100 border-zinc-300 text-zinc-900" data-testid="move-month-cancel">Cancel</Button>
            <Button onClick={handleMoveMonth} disabled={movingMonth || !/^\d{4}-\d{2}$/.test(moveMonthValue)} className="bg-violet-600 hover:bg-violet-700 text-white" data-testid="move-month-confirm">
              {movingMonth ? <Loader2 className="w-4 h-4 animate-spin" /> : "Move Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Job Dialog */}
      <Dialog open={!!transferJob} onOpenChange={(open) => { if (!open) setTransferJob(null); }}>
        <DialogContent className="bg-zinc-50 border-zinc-200" data-testid="transfer-job-dialog">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              Transfer Job
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Transfer <span className="font-bold text-zinc-900">{transferJob?.name}</span> to another user. It will appear on their dashboard{!isAdmin ? " and leave yours" : ""}.
            </p>
            <div className="space-y-2">
              <Label className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Transfer To</Label>
              <Select value={transferUserId} onValueChange={setTransferUserId}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900" data-testid="transfer-user-select">
                  <SelectValue placeholder={transferUsers.length ? "Select a user" : "Loading users..."} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-50 border-zinc-300 max-h-64">
                  {transferUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id} data-testid={`transfer-user-${u.email}`}>{u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferUsers.length === 0 && (
                <p className="text-xs text-zinc-500">No other company users found.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferJob(null)} className="bg-zinc-100 border-zinc-300 text-zinc-900">
              Cancel
            </Button>
            <Button onClick={handleTransfer} disabled={!transferUserId || transferring} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="transfer-confirm-btn">
              {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : "Transfer Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Job?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This will delete this job and EVERYTHING inside it (poles, attributes, photos and map data). It will be moved to your Deleted Items folder, where you can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900" data-testid="job-delete-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white" data-testid="job-delete-confirm-btn">
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JobsList;
