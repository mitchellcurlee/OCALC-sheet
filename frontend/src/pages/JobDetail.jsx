import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { UNDERGROUND_TYPES, undergroundAbbr } from "@/lib/poleMapImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Search,
  Zap,
  Radio,
  MapPin,
  Calendar,
  Eye,
  Pencil,
  Trash2,
  Copy,
  FileSpreadsheet,
  ArrowLeft,
  Loader2,
  Folder,
  Map as MapIcon,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Repeat,
  GripVertical,
  Check,
  X,
  FileText,
  FileDown,
  Image as ImageIcon,
  Download,
  FileUp,
  WifiOff,
} from "lucide-react";
import { buildSowNotesText } from "@/components/ase/ASESOWNotesTab";
import { ExportDestinationDialog } from "@/components/ExportDestinationDialog";
import { CloudExportsSection } from "@/components/CloudExportsSection";
import { CLOUD_EXPORT_LABELS, uploadExportToCloud, saveBlobToDevice, notifyCloudExportsUpdated } from "@/lib/cloudExports";
import { cacheJobForOffline, markJobSavedOffline } from "@/lib/offlineTiles";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import MarkupTab from "@/components/MarkupTab";

// Sortable item component for drag-and-drop (poles and underground)
const SortableItem = ({ item, index, getConditionColor }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isPole = item._type === "pole";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`industrial-card p-3 flex items-center justify-between bg-white cursor-grab active:cursor-grabbing ${isPole ? '' : 'border-l-4 border-l-green-500'}`}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="text-zinc-400 hover:text-zinc-600 cursor-grab"
        >
          <GripVertical className="w-5 h-5" />
        </div>
        <span className="text-sm font-mono text-zinc-500 w-6">{index + 1}</span>
        {isPole ? (
          <>
            <Zap className="w-4 h-4 text-yellow-600" />
            <span className="font-bold text-zinc-900">{item.pole_number || "No #"}</span>
            <Badge className={`${getConditionColor(item.condition)} text-xs`}>
              {item.condition || "Not set"}
            </Badge>
          </>
        ) : (
          <>
            <div className="w-6 h-6 flex items-center justify-center bg-green-600 text-white font-mono text-[10px] font-bold rounded">
              {undergroundAbbr(item.type)}
            </div>
            <span className="font-bold text-zinc-900">{item.type}{item.label ? ` · ${item.label}` : ""}</span>
            <Badge className="bg-green-100 text-green-800 text-xs">UG</Badge>
          </>
        )}
      </div>
    </div>
  );
};

// Keep old component for backward compatibility
const SortablePoleItem = SortableItem;

const JobDetail = () => {
  const { jobId } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [undergroundItems, setUndergroundItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deleteType, setDeleteType] = useState(null); // "pole" or "underground"
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderedItems, setReorderedItems] = useState([]);
  const [syncingPoleId, setSyncingPoleId] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [markupPhotos, setMarkupPhotos] = useState([]);
  const [showMarkupSection, setShowMarkupSection] = useState(false);
  const [savingMarkup, setSavingMarkup] = useState(false);

  // Combine poles and underground into a single list for display/reorder
  const getCombinedItems = useCallback(() => {
    const polesWithType = poles.map(p => ({ ...p, _type: "pole" }));
    const ugWithType = undergroundItems.map(u => ({ ...u, _type: "underground" }));
    const all = [...polesWithType, ...ugWithType];
    // Sort by sort_order, then by created_at
    all.sort((a, b) => {
      const orderA = a.sort_order ?? Infinity;
      const orderB = b.sort_order ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    return all;
  }, [poles, undergroundItems]);

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Reorder handlers
  const startReorder = () => {
    setReorderedItems(getCombinedItems());
    setReorderMode(true);
  };

  const cancelReorder = () => {
    setReorderedItems([]);
    setReorderMode(false);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setReorderedItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const saveReorder = async () => {
    try {
      const itemOrders = reorderedItems.map((item, i) => ({ 
        id: item.id, 
        type: item._type,
        sort_order: i 
      }));
      await axios.put(`/jobs/${jobId}/reorder-items`, itemOrders);
      toast.success("Order updated!");
      setReorderMode(false);
      setReorderedItems([]);
      fetchJobAndPoles();
    } catch (e) {
      toast.error("Failed to save order");
    }
  };

  // Save and sync all distances after reordering
  const saveAndSyncAll = async () => {
    setSyncingAll(true);
    try {
      // First save the new order
      const itemOrders = reorderedItems.map((item, i) => ({ 
        id: item.id, 
        type: item._type,
        sort_order: i 
      }));
      await axios.put(`/jobs/${jobId}/reorder-items`, itemOrders);
      
      // Then sync all distances based on new order
      const syncResult = await axios.post(`/jobs/${jobId}/sync-map-distances`);
      const updatedCount = syncResult.data.updated || 0;
      
      toast.success(`Order saved & ${updatedCount} pole distances synced!`);
      setReorderMode(false);
      setReorderedItems([]);
      fetchJobAndPoles();
    } catch (e) {
      toast.error("Failed to save and sync");
    } finally {
      setSyncingAll(false);
    }
  };

  // Sync distances for a single pole
  const handleSyncPoleDist = async (poleId) => {
    setSyncingPoleId(poleId);
    try {
      const response = await axios.post(`/poles/${poleId}/sync-distances`);
      if (response.data.updated) {
        toast.success(`Synced distances for pole`);
        fetchJobAndPoles();
      } else {
        toast.info(response.data.message || "No changes needed");
      }
    } catch (error) {
      toast.error("Failed to sync distances");
    } finally {
      setSyncingPoleId(null);
    }
  };

  const fetchJobAndPoles = useCallback(async () => {
    try {
      const ts = Date.now();
      const [jobRes, polesRes, ugRes, aseRes] = await Promise.all([
        axios.get(`/jobs/${jobId}?_t=${ts}`),
        axios.get(`/jobs/${jobId}/poles?_t=${ts}`),
        axios.get(`/jobs/${jobId}/underground?_t=${ts}`),
        axios.get(`/jobs/${jobId}/ase-data?_t=${ts}`).catch(() => ({ data: { ase_data: null } })),
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data);
      setUndergroundItems(ugRes.data);
      
      // Load markup photos from ASE data if available
      if (aseRes.data?.ase_data?.markup_photos) {
        setMarkupPhotos(aseRes.data.ase_data.markup_photos);
      }
    } catch (error) {
      toast.error("Failed to fetch job data");
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [jobId, navigate]);

  useEffect(() => {
    fetchJobAndPoles();
  }, [fetchJobAndPoles]);

  // Excel bulk import
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState("add");
  const [importing, setImporting] = useState(false);

  // Save job for offline use (pre-download map tiles + API data)
  const [savingOffline, setSavingOffline] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState(0);

  const handleSaveOffline = async () => {
    if (!navigator.onLine) {
      toast.error("You need a connection to save this job for offline use");
      return;
    }
    setSavingOffline(true);
    setOfflineProgress(0);
    try {
      const points = [
        ...poles.filter((p) => p.latitude && p.longitude).map((p) => [p.latitude, p.longitude]),
        ...undergroundItems.filter((u) => u.latitude && u.longitude).map((u) => [u.latitude, u.longitude]),
      ];
      const { tiles } = await cacheJobForOffline(jobId, points, setOfflineProgress);
      markJobSavedOffline(jobId);
      toast.success(tiles > 0
        ? `Job saved for offline use — ${tiles.toLocaleString()} map tiles cached`
        : "Job data saved for offline use (no GPS items yet, so no map tiles)");
    } catch (e) {
      toast.error("Could not finish saving for offline — try again with better signal");
    } finally {
      setSavingOffline(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await axios.get(`/import/template`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pole_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Failed to download template");
    }
  };

  const handleImportExcel = async () => {
    if (!importFile) {
      toast.error("Choose a filled-in .xlsx file first");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("mode", importMode);
      const res = await axios.post(`/jobs/${jobId}/import-excel`, fd);
      const { poles_created, underground_created, errors } = res.data;
      toast.success(`Imported ${poles_created} pole(s) + ${underground_created} underground item(s)${errors?.length ? ` — ${errors.length} row(s) skipped` : ""}`);
      (errors || []).slice(0, 3).forEach((msg) => toast.warning(msg));
      setShowImportDialog(false);
      setImportFile(null);
      fetchJobAndPoles();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Save markup photos to ASE data
  const handleMarkupPhotosChange = async (newPhotos) => {
    setMarkupPhotos(newPhotos);
    setSavingMarkup(true);
    try {
      // Get current ASE data first
      const aseRes = await axios.get(`/jobs/${jobId}/ase-data`);
      const currentAse = aseRes.data?.ase_data || {};
      
      // Update with new markup photos
      await axios.put(`/jobs/${jobId}/ase-data`, {
        ase_data: { ...currentAse, markup_photos: newPhotos }
      });
      toast.success("Markup photos saved");
    } catch (error) {
      console.error("Failed to save markup photos:", error);
      toast.error("Failed to save markup photos");
    } finally {
      setSavingMarkup(false);
    }
  };

  const [psOpen, setPsOpen] = useState(false);
  const [psData, setPsData] = useState({});
  const [psBusy, setPsBusy] = useState(false);

  const openPermissionStamp = () => {
    const ps = job?.permission_stamp || {};
    setPsData({
      address: ps.address || job?.location || "",
      owner_name: ps.owner_name || "",
      owner_cbr: ps.owner_cbr || "",
      owner_email: ps.owner_email || "",
      access_contact: ps.access_contact || "",
      access_cbr: ps.access_cbr || "",
      access_email: ps.access_email || "",
      advanced_notice_required: ps.advanced_notice_required || "",
      advanced_notice_time_frame: ps.advanced_notice_time_frame || "",
      special_considerations: ps.special_considerations || "",
    });
    setPsOpen(true);
  };

  const savePermissionStamp = async () => {
    setPsBusy(true);
    try {
      await axios.put(`/jobs/${jobId}`, { permission_stamp: psData });
      setJob((prev) => ({ ...prev, permission_stamp: psData }));
      toast.success("Permission Stamp saved");
      return true;
    } catch (error) {
      toast.error("Failed to save Permission Stamp");
      return false;
    } finally {
      setPsBusy(false);
    }
  };

  const [pendingExport, setPendingExport] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);

  const getExportBlob = async (type) => {
    if (type === "job_excel") {
      const response = await axios.get(`/jobs/${jobId}/export/excel`, { params: { base_url: window.location.origin }, responseType: "blob" });
      const filename = (response.headers["content-disposition"]?.split("filename=")[1] || `${job?.name || "job"}_export.xlsx`).replace(/"/g, "");
      return { blob: new Blob([response.data]), filename };
    }
    if (type === "sow_docx") {
      const ase = job?.ase_data || {};
      const text = ase.sow_notes_override || buildSowNotesText(ase);
      const response = await axios.post(`/jobs/${jobId}/export/sow-docx`, { text }, { responseType: "blob" });
      return { blob: new Blob([response.data]), filename: `SOW_Notes_${job?.name || jobId}.docx` };
    }
    if (type === "permission_stamp") {
      await axios.put(`/jobs/${jobId}`, { permission_stamp: psData });
      setJob((prev) => ({ ...prev, permission_stamp: psData }));
      const response = await axios.get(`/jobs/${jobId}/export/permission-stamp-docx`, { responseType: "blob" });
      return { blob: new Blob([response.data]), filename: `Permission_Stamp_${job?.name || jobId}.docx` };
    }
    return null;
  };

  const runPendingExport = async (dest) => {
    const type = pendingExport;
    setExportBusy(true);
    try {
      if (type === "photos_zip") {
        if (dest === "device") {
          handleDownloadPhotos();
        } else {
          toast.info("Building photos ZIP and saving to cloud — this can take a while for large jobs...");
          await axios.post(`/jobs/${jobId}/cloud-exports/photos-zip`, {}, { timeout: 0 });
          notifyCloudExportsUpdated();
          toast.success("Photos ZIP saved to app cloud — see Cloud Exports below");
        }
      } else {
        const res = await getExportBlob(type);
        if (dest === "device") {
          saveBlobToDevice(res.blob, res.filename);
          toast.success("Downloaded to device");
        } else {
          await uploadExportToCloud(jobId, type, res.filename, res.blob);
          toast.success("Saved to app cloud — see Cloud Exports below");
        }
      }
      if (type === "permission_stamp") setPsOpen(false);
      setPendingExport(null);
    } catch (e) {
      toast.error(dest === "cloud" ? "Cloud save failed" : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadPhotos = () => {
    // Open the organized photo gallery page in the browser (same as Excel "All Photos" link)
    const galleryUrl = `${process.env.REACT_APP_BACKEND_URL}/api/jobs/${jobId}/photos`;
    window.open(galleryUrl, "_blank", "noopener");
  };

  const handleDelete = async () => {
    try {
      if (deleteType === "underground") {
        await axios.delete(`/underground/${deleteId}`);
        toast.success("Underground item moved to Deleted Items — restore it anytime from the trash folder");
      } else {
        await axios.delete(`/poles/${deleteId}`);
        toast.success("Pole moved to Deleted Items — restore it anytime from the trash folder");
      }
      setDeleteId(null);
      setDeleteType(null);
      fetchJobAndPoles();
    } catch (error) {
      toast.error(`Failed to delete ${deleteType || "item"}`);
    }
  };

  const handleChangeType = async (item, newType) => {
    if (newType === item.type) return;
    try {
      await axios.put(`/underground/${item.id}`, { type: newType });
      toast.success(`Changed ${item.type}${item.label ? ` ${item.label}` : ""} to ${newType}`);
      fetchJobAndPoles();
    } catch (e) {
      toast.error("Failed to change attribute type");
    }
  };

  const confirmDelete = (id, type = "pole") => {
    setDeleteId(id);
    setDeleteType(type);
  };

  const handleDuplicate = async (poleId) => {
    try {
      const res = await axios.post(`/poles/${poleId}/duplicate`);
      toast.success("Pole duplicated — edit the copy");
      navigate(`/jobs/${jobId}/edit/${res.data.id}`);
    } catch (error) {
      toast.error("Failed to duplicate pole");
    }
  };

  const getConditionColor = (condition) => {
    const colors = {
      Excellent: "bg-green-500/20 text-green-700 border-green-500/50",
      Good: "bg-yellow-500/20 text-yellow-700 border-yellow-500/50",
      Bad: "bg-red-500/20 text-red-600 border-red-500/50",
    };
    return colors[condition] || "bg-zinc-500/20 text-zinc-600 border-zinc-500/50";
  };

  // Combined items for display
  const combinedItems = getCombinedItems();

  // Filter combined items (search poles by pole_number/owner, underground by type/label)
  const filteredItems = combinedItems.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (item._type === "pole") {
      return (
        item.pole_number?.toLowerCase().includes(query) ||
        item.job_number?.toLowerCase().includes(query) ||
        item.pole_owner?.toLowerCase().includes(query) ||
        item.condition?.toLowerCase().includes(query)
      );
    } else {
      return (
        item.type?.toLowerCase().includes(query) ||
        item.label?.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query)
      );
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="job-detail">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/">
                <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-zinc-900">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-600 flex items-center justify-center flex-shrink-0">
                <Folder className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-900" />
              </div>
              <div>
                <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight uppercase text-zinc-900">
                  {job?.name || job?.site_id}
                </h1>
                {job?.location && (
                  <p className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {job.location}
                  </p>
                )}
                {job?.transferred_from && (
                  <p className="text-xs text-amber-600 font-mono flex items-center gap-1" data-testid="job-detail-transferred-from">
                    <Repeat className="w-3 h-3" />
                    Transferred from {job.transferred_from}
                  </p>
                )}
                {isAdmin && (job?.transfer_history || []).length > 0 && (
                  <details className="mt-1" data-testid="transfer-history">
                    <summary className="text-[11px] font-mono text-zinc-500 cursor-pointer hover:text-zinc-700 select-none">
                      Transfer history ({job.transfer_history.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {[...job.transfer_history].reverse().map((h, i) => (
                        <li key={i} className="text-[11px] font-mono text-zinc-500" data-testid={`transfer-history-entry-${i}`}>
                          {h.at ? new Date(h.at).toLocaleString() : ""} — {h.from_email || "?"} → {h.to_email || "?"}{h.by_email && h.by_email !== h.from_email ? ` (by ${h.by_email})` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* 1. Add Dropdown (Pole + Pole Terminal + Underground) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="flex-1 sm:flex-initial w-full sm:w-auto h-11 sm:h-10 bg-red-600 hover:bg-red-700 text-white text-sm" data-testid="add-dropdown-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border-zinc-200 w-56 max-h-96 overflow-auto">
                  <DropdownMenuItem 
                    onClick={() => navigate(`/jobs/${jobId}/add`)} 
                    data-testid="add-pole-btn" 
                    className="cursor-pointer font-semibold text-red-700 border-b border-zinc-200"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Add Pole
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate(`/jobs/${jobId}/add?terminal=true`)} 
                    data-testid="add-pole-terminal-btn" 
                    className="cursor-pointer font-semibold text-blue-700 border-b border-zinc-200"
                  >
                    <Zap className="w-4 h-4 mr-2 text-blue-600" />
                    Pole Terminal
                  </DropdownMenuItem>
                  <div className="px-2 py-1.5 text-xs font-mono text-sky-700 bg-sky-50">Aerial</div>
                  {["Aerial Splice", "Loop", "Power", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head"].map((t) => (
                    <DropdownMenuItem key={t} onClick={() => navigate(`/jobs/${jobId}/underground/add?type=${encodeURIComponent(t)}`)} data-testid={`add-aerial-${t}`} className="cursor-pointer">
                      <span className="font-mono text-xs text-sky-700 w-12 inline-block">{undergroundAbbr(t)}</span>
                      {t}
                    </DropdownMenuItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-mono text-amber-700 bg-amber-50">Underground</div>
                  {UNDERGROUND_TYPES.filter((t) => !["Aerial Splice", "Loop", "Power", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head", "Aerial NTE", "Aerial PI", "Aerial FBT"].includes(t)).map((t) => (
                    <DropdownMenuItem key={t} onClick={() => navigate(`/jobs/${jobId}/underground/add?type=${encodeURIComponent(t)}`)} data-testid={`add-ug-${t}`} className="cursor-pointer">
                      <span className="font-mono text-xs text-amber-700 w-12 inline-block">{undergroundAbbr(t)}</span>
                      {t}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => setShowImportDialog(true)}
                    data-testid="import-excel-btn"
                    className="cursor-pointer font-semibold text-emerald-700 border-t border-zinc-200"
                  >
                    <FileUp className="w-4 h-4 mr-2" />
                    Import from Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 2. Export Dropdown (OCALC Export + ASE Form) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-initial w-full sm:w-auto h-11 sm:h-10 bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-800 text-sm"
                    data-testid="export-dropdown-btn"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border-zinc-200 w-48">
                  <DropdownMenuItem onClick={() => setPendingExport("job_excel")} data-testid="export-btn" className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-zinc-600" />
                    OCALC/JOB Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/ase`)} data-testid="ase-form-btn" className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2 text-blue-600" />
                    ASE Form
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPendingExport("sow_docx")} data-testid="sow-word-export-btn" className="cursor-pointer">
                    <FileDown className="w-4 h-4 mr-2 text-blue-600" />
                    SOW Notes (Word)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openPermissionStamp} data-testid="permission-stamp-export-btn" className="cursor-pointer">
                    <FileDown className="w-4 h-4 mr-2 text-green-600" />
                    Permission Stamp (Word)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 3. Map Button */}
              <Link to={`/jobs/${jobId}/map`} className="flex-1 sm:flex-initial">
                <Button
                  variant="outline"
                  className="w-full h-11 sm:h-10 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900 text-sm"
                  data-testid="map-btn"
                >
                  <MapIcon className="w-4 h-4 mr-2" />
                  Map
                </Button>
              </Link>

              {/* 4. Photos Button */}
              <Button
                onClick={() => setPendingExport("photos_zip")}
                variant="outline"
                className="flex-1 sm:flex-initial h-11 sm:h-10 bg-green-50 border-green-300 hover:bg-green-100 text-green-800 text-sm"
                data-testid="download-photos-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                Photos
              </Button>

              {/* 5. Save Offline Button */}
              <Button
                onClick={handleSaveOffline}
                disabled={savingOffline}
                variant="outline"
                className="flex-1 sm:flex-initial h-11 sm:h-10 bg-sky-50 border-sky-300 hover:bg-sky-100 text-sky-800 text-sm"
                data-testid="save-offline-btn"
              >
                {savingOffline ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <WifiOff className="w-4 h-4 mr-2" />}
                {savingOffline ? `Saving ${offlineProgress}%` : "Save Offline"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Permission Stamp dialog */}
      <Dialog open={psOpen} onOpenChange={setPsOpen}>
        <DialogContent className="bg-white sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="permission-stamp-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">PERMISSION STAMP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Address</Label>
              <Input value={psData.address || ""} onChange={(e) => setPsData((p) => ({ ...p, address: e.target.value }))} className="bg-zinc-50" data-testid="ps-address" />
            </div>
            <div className="space-y-2 border border-zinc-200 rounded-lg p-3">
              <p className="text-sm font-medium text-zinc-700">Property Owner Information – Authorized Permission To Place</p>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-zinc-500 uppercase">Owner Name</Label>
                <Input value={psData.owner_name || ""} onChange={(e) => setPsData((p) => ({ ...p, owner_name: e.target.value }))} className="bg-zinc-50" data-testid="ps-owner-name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-zinc-500 uppercase">CBR</Label>
                  <Input value={psData.owner_cbr || ""} onChange={(e) => setPsData((p) => ({ ...p, owner_cbr: e.target.value }))} className="bg-zinc-50" data-testid="ps-owner-cbr" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-zinc-500 uppercase">Email</Label>
                  <Input value={psData.owner_email || ""} onChange={(e) => setPsData((p) => ({ ...p, owner_email: e.target.value }))} className="bg-zinc-50" data-testid="ps-owner-email" />
                </div>
              </div>
            </div>
            <div className="space-y-2 border border-zinc-200 rounded-lg p-3">
              <p className="text-sm font-medium text-zinc-700">Access Contact Information – Provide Construction Access</p>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-zinc-500 uppercase">Access Contact</Label>
                <Input value={psData.access_contact || ""} onChange={(e) => setPsData((p) => ({ ...p, access_contact: e.target.value }))} className="bg-zinc-50" data-testid="ps-access-contact" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-zinc-500 uppercase">CBR</Label>
                  <Input value={psData.access_cbr || ""} onChange={(e) => setPsData((p) => ({ ...p, access_cbr: e.target.value }))} className="bg-zinc-50" data-testid="ps-access-cbr" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-zinc-500 uppercase">Email</Label>
                  <Input value={psData.access_email || ""} onChange={(e) => setPsData((p) => ({ ...p, access_email: e.target.value }))} className="bg-zinc-50" data-testid="ps-access-email" />
                </div>
              </div>
            </div>
            <div className="space-y-2 border border-zinc-200 rounded-lg p-3">
              <p className="text-sm font-medium text-zinc-700">Notes To Construction As Required By The Customer</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-zinc-500 uppercase">Advanced Notice Required?</Label>
                  <Input value={psData.advanced_notice_required || ""} onChange={(e) => setPsData((p) => ({ ...p, advanced_notice_required: e.target.value }))} className="bg-zinc-50" data-testid="ps-advanced-notice" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-zinc-500 uppercase">Notice Time Frame?</Label>
                  <Input value={psData.advanced_notice_time_frame || ""} onChange={(e) => setPsData((p) => ({ ...p, advanced_notice_time_frame: e.target.value }))} className="bg-zinc-50" data-testid="ps-notice-timeframe" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-zinc-500 uppercase">Special Considerations?</Label>
                <Textarea value={psData.special_considerations || ""} onChange={(e) => setPsData((p) => ({ ...p, special_considerations: e.target.value }))} className="bg-zinc-50 min-h-16" data-testid="ps-special-considerations" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={savePermissionStamp} disabled={psBusy} data-testid="ps-save-btn">
              {psBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Save
            </Button>
            <Button onClick={() => setPendingExport("permission_stamp")} disabled={psBusy} className="bg-green-600 hover:bg-green-700 text-white" data-testid="ps-download-btn">
              {psBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
              Download Word
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel import dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-white sm:max-w-md" data-testid="import-excel-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">IMPORT FROM EXCEL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              className="w-full bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
              data-testid="download-template-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              Download blank template (.xlsx)
            </Button>
            <div className="space-y-1">
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-wide">Filled-in spreadsheet</p>
              <Input
                type="file"
                accept=".xlsx"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="bg-zinc-50 cursor-pointer"
                data-testid="import-file-input"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-wide">Import mode</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImportMode("add")}
                  className={`flex-1 ${importMode === "add" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white hover:text-white" : ""}`}
                  data-testid="import-mode-add"
                >
                  Add to existing
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImportMode("replace")}
                  className={`flex-1 ${importMode === "replace" ? "bg-red-600 hover:bg-red-700 border-red-600 text-white hover:text-white" : ""}`}
                  data-testid="import-mode-replace"
                >
                  Replace all
                </Button>
              </div>
              {importMode === "replace" && (
                <p className="text-xs text-red-600" data-testid="import-replace-warning">
                  Replace deletes ALL existing poles, underground attributes and map connections on this job before importing.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleImportExcel}
              disabled={importing || !importFile}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
              data-testid="import-confirm-btn"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileUp className="w-4 h-4 mr-2" />Import</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        <CloudExportsSection jobId={jobId} />
        <ExportDestinationDialog
          open={!!pendingExport}
          onOpenChange={(v) => { if (!v) setPendingExport(null); }}
          label={CLOUD_EXPORT_LABELS[pendingExport] || ""}
          busy={exportBusy}
          onDevice={() => runPendingExport("device")}
          onCloud={() => runPendingExport("cloud")}
        />
        {/* Photo Markup Section - Collapsible */}
        <div className="mb-6">
          <button
            onClick={() => setShowMarkupSection(!showMarkupSection)}
            className="w-full flex items-center justify-between p-4 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
            data-testid="toggle-markup-section"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="font-heading font-bold text-purple-900">PHOTO MARKUP</h2>
                <p className="text-xs text-purple-600">
                  {markupPhotos.length} photos · Click to {showMarkupSection ? 'collapse' : 'expand'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {savingMarkup && <Loader2 className="w-4 h-4 animate-spin text-purple-600" />}
              {showMarkupSection ? (
                <ChevronUp className="w-5 h-5 text-purple-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-purple-600" />
              )}
            </div>
          </button>
          
          {showMarkupSection && (
            <div className="mt-3 p-4 bg-white rounded-lg border border-zinc-200">
              <MarkupTab
                photos={markupPhotos}
                onPhotosChange={handleMarkupPhotosChange}
                poles={poles}
                underground={undergroundItems}
                label="Job Photo Markups"
                showUnderground={true}
              />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-zinc-900">{poles.length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Total Attributes</p>
              </div>
            </div>
          </div>
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{poles.filter(p => p.condition === "Excellent").length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Excellent</p>
              </div>
            </div>
          </div>
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{poles.filter(p => p.condition === "Good").length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Good</p>
              </div>
            </div>
          </div>
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{poles.filter(p => p.condition === "Bad").length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Bad</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search poles & underground..."
              className="pl-10 h-11 bg-zinc-50 border-zinc-300 text-zinc-900"
            />
          </div>
        </div>

        {/* Items List Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-bold text-zinc-900">
            Poles & Underground ({poles.length} poles, {undergroundItems.length} UG)
          </h2>
          <div className="flex items-center gap-2">
            {reorderMode ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelReorder} disabled={syncingAll} className="gap-1">
                  <X className="w-4 h-4" /> Cancel
                </Button>
                <Button size="sm" onClick={saveReorder} disabled={syncingAll} className="bg-green-600 hover:bg-green-700 gap-1">
                  <Check className="w-4 h-4" /> Save Order
                </Button>
                <Button 
                  size="sm" 
                  onClick={saveAndSyncAll} 
                  disabled={syncingAll}
                  className="bg-blue-600 hover:bg-blue-700 gap-1"
                  data-testid="save-sync-all-btn"
                  title="Save new order and recalculate all span distances from GPS"
                >
                  {syncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Save & Sync All
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={startReorder} className="gap-1" disabled={combinedItems.length < 2}>
                <GripVertical className="w-4 h-4" /> Reorder
              </Button>
            )}
          </div>
        </div>

        {/* Combined Items List */}
        {reorderMode ? (
          <div className="space-y-2 bg-amber-50 p-4 rounded-lg border-2 border-amber-300">
            <p className="text-sm text-amber-700 mb-3">Drag items to reorder, then click Save.</p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={reorderedItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {reorderedItems.map((item, index) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    index={index}
                    getConditionColor={getConditionColor}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="industrial-card p-12 text-center">
            <Radio className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-zinc-900 mb-2">
              {combinedItems.length === 0 ? "No Items Yet" : "No Results"}
            </h2>
            <p className="text-zinc-600 mb-6">
              {combinedItems.length === 0 ? "Add your first pole or underground item to this job" : "Try a different search term"}
            </p>
            {combinedItems.length === 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-red-600 hover:bg-red-700 text-white" data-testid="empty-add-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="bg-white border-zinc-200 w-56 max-h-96 overflow-auto">
                  <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/add`)} data-testid="empty-add-pole-btn" className="cursor-pointer font-semibold text-red-700 border-b border-zinc-200">
                    <Zap className="w-4 h-4 mr-2" />
                    Add Pole
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/jobs/${jobId}/add?terminal=true`)} className="cursor-pointer font-semibold text-blue-700 border-b border-zinc-200">
                    <Zap className="w-4 h-4 mr-2 text-blue-600" />
                    Pole Terminal
                  </DropdownMenuItem>
                  <div className="px-2 py-1.5 text-xs font-mono text-sky-700 bg-sky-50">Aerial</div>
                  {["Aerial Splice", "Loop", "Power", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head"].map((t) => (
                    <DropdownMenuItem key={t} onClick={() => navigate(`/jobs/${jobId}/underground/add?type=${encodeURIComponent(t)}`)} className="cursor-pointer">
                      <span className="font-mono text-xs text-sky-700 w-12 inline-block">{undergroundAbbr(t)}</span>
                      {t}
                    </DropdownMenuItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-mono text-amber-700 bg-amber-50">Underground</div>
                  {UNDERGROUND_TYPES.filter((t) => !["Aerial Splice", "Loop", "Power", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head", "Aerial NTE", "Aerial PI", "Aerial FBT"].includes(t)).map((t) => (
                    <DropdownMenuItem key={t} onClick={() => navigate(`/jobs/${jobId}/underground/add?type=${encodeURIComponent(t)}`)} className="cursor-pointer">
                      <span className="font-mono text-xs text-amber-700 w-12 inline-block">{undergroundAbbr(t)}</span>
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, idx) => (
              item._type === "pole" ? (
                /* Pole Card */
                <div
                  key={item.id}
                  className="industrial-card p-4 hover:border-zinc-300 transition-colors"
                  data-testid={`pole-card-${item.id}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 flex items-center justify-center ${item.pole_owner === "Foreign Owned" ? "bg-red-600" : "bg-orange-600"}`}>
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900">{item.pole_number || "No #"}</span>
                          <Badge className={`${getConditionColor(item.condition)} text-xs`}>
                            {item.condition || "Not set"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 flex-wrap">
                          <span>{item.pole_size ? `${item.pole_size}'` : <span className="text-zinc-400 italic">Size not set</span>}</span>
                          <span>•</span>
                          <span>{item.pole_class ? `Class ${item.pole_class}` : <span className="text-zinc-400 italic">Class not set</span>}</span>
                          {item.latitude && item.longitude && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-green-600">
                                <MapPin className="w-3 h-3" />
                                GPS
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-xs text-zinc-500 flex items-center gap-1 mr-2">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.inspection_date).toLocaleDateString()}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        onClick={() => handleSyncPoleDist(item.id)}
                        disabled={syncingPoleId === item.id || !item.latitude || !item.longitude}
                        title="Sync GPS distances for this pole"
                        data-testid={`sync-pole-${item.id}`}
                      >
                        {syncingPoleId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                      <Link to={`/jobs/${jobId}/view/${item.id}`}>
                        <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-zinc-900">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Link to={`/jobs/${jobId}/edit/${item.id}`}>
                        <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-zinc-900">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-zinc-600 hover:text-zinc-900"
                        onClick={() => handleDuplicate(item.id)}
                        title="Duplicate pole"
                        data-testid={`duplicate-pole-${item.id}`}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-zinc-600 hover:text-red-600"
                        onClick={() => confirmDelete(item.id, "pole")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Underground Card */
                <div key={item.id} className="industrial-card p-4 border-l-4 border-l-green-500" data-testid={`ug-card-${item.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-green-600 text-white font-mono text-xs font-bold rounded">
                        {undergroundAbbr(item.type)}
                      </div>
                      <div>
                        <span className="font-bold text-zinc-900">{item.type}{item.label ? ` · ${item.label}` : ""}</span>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                          {item.latitude && item.longitude ? (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />GPS</span>
                          ) : (
                            <span className="text-amber-600">No GPS</span>
                          )}
                          {item.owner && <span className="text-amber-700 font-semibold" data-testid={`ug-card-owner-${item.id}`}>Owner: {item.owner}</span>}
                          {item.material_type && <span className="text-zinc-600" data-testid={`ug-card-material-${item.id}`}>{item.material_type}</span>}
                          {item.notes && <span className="truncate max-w-[200px]">{item.notes}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-zinc-900" title="Change attribute type" data-testid={`change-type-${item.id}`}>
                            <Repeat className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-50 border-zinc-300 max-h-72 overflow-y-auto">
                          <div className="px-2 py-1 text-[10px] font-mono uppercase text-zinc-500">Change type to</div>
                          {UNDERGROUND_TYPES.filter((t) => t !== item.type).map((t) => (
                            <DropdownMenuItem key={t} onClick={() => handleChangeType(item, t)} data-testid={`change-type-${item.id}-${t}`}>
                              {t}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Link to={`/jobs/${jobId}/underground/edit/${item.id}`}>
                        <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-zinc-900" data-testid={`edit-ug-${item.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-red-600" onClick={() => confirmDelete(item.id, "underground")} data-testid={`delete-ug-${item.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => { setDeleteId(null); setDeleteType(null); }}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete {deleteType === "underground" ? "Underground Item" : "Pole"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This action cannot be undone. This will permanently delete the {deleteType === "underground" ? "underground item" : "pole"} data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JobDetail;
