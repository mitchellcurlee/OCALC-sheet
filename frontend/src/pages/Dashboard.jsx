import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Search,
  Zap,
  Radio,
  MapPin,
  Calendar,
  Eye,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Activity,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [poles, setPoles] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [deleteId, setDeleteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPoles = useCallback(async () => {
    try {
      let url = "/poles";
      const params = new URLSearchParams();
      if (filterOwner !== "all") params.append("pole_owner", filterOwner);
      if (filterCondition !== "all") params.append("condition", filterCondition);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await axios.get(url);
      setPoles(response.data);
    } catch (error) {
      toast.error("Failed to fetch poles");
      console.error(error);
    }
  }, [filterOwner, filterCondition]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get("/stats");
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPoles(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPoles, fetchStats]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`/poles/${deleteId}`);
      toast.success("Pole deleted successfully");
      setDeleteId(null);
      fetchPoles();
      fetchStats();
    } catch (error) {
      toast.error("Failed to delete pole");
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get("/poles/export/excel", {
        params: { base_url: window.location.origin },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `pole_data_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Excel file downloaded!");
    } catch (error) {
      toast.error("Failed to export data");
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

  const filteredPoles = poles.filter((pole) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pole.id.toLowerCase().includes(query) ||
      pole.pole_owner?.toLowerCase().includes(query) ||
      pole.pole_number?.toLowerCase().includes(query) ||
      pole.job_number?.toLowerCase().includes(query) ||
      pole.condition?.toLowerCase().includes(query) ||
      (pole.notes && pole.notes.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="dashboard">
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
                  Pole Inspector
                </h1>
                <p className="text-xs text-zinc-500 font-mono tracking-wider hidden sm:block">
                  POWER POLE DATA COLLECTION SYSTEM
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {user && (
                <span className="hidden sm:block text-xs text-zinc-600 font-mono">
                  {user.name || user.email}
                </span>
              )}
              <Button
                onClick={handleExport}
                variant="outline"
                className="industrial-button flex-1 sm:flex-initial h-11 sm:h-10 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900 text-sm"
                data-testid="export-btn"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Export</span> Excel
              </Button>
              <Link to="/add" className="flex-1 sm:flex-initial">
                <Button
                  className="industrial-button w-full h-11 sm:h-10 bg-red-600 hover:bg-red-700 text-white text-sm"
                  data-testid="add-pole-btn"
                >
                  <Plus className="w-4 h-4 mr-1 sm:mr-2" />
                  Add Pole
                </Button>
              </Link>
              <Button
                onClick={logout}
                variant="ghost"
                size="icon"
                className="h-11 w-11 sm:h-10 sm:w-10 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                data-testid="logout-btn"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="industrial-card p-6 border-l-4 border-l-zinc-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                    Total Poles
                  </p>
                  <p className="text-4xl font-heading font-black text-zinc-900 mt-1">
                    {stats.total_poles}
                  </p>
                </div>
                <Activity className="w-10 h-10 text-zinc-600" />
              </div>
            </div>
            <div className="industrial-card p-6 border-l-4 border-l-red-500 stats-card-power">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                    Power Poles
                  </p>
                  <p className="text-4xl font-heading font-black text-red-600 mt-1">
                    {stats.power_poles}
                  </p>
                </div>
                <Zap className="w-10 h-10 text-red-500/50" />
              </div>
            </div>
            <div className="industrial-card p-6 border-l-4 border-l-orange-500 stats-card-telecom">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                    Telecom Poles
                  </p>
                  <p className="text-4xl font-heading font-black text-orange-600 mt-1">
                    {stats.telecom_poles}
                  </p>
                </div>
                <Radio className="w-10 h-10 text-orange-500/50" />
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="industrial-card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by job #, pole #, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 industrial-input bg-white border-zinc-300 text-zinc-900"
                data-testid="search-input"
              />
            </div>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger
                className="w-full sm:w-48 industrial-input bg-white border-zinc-300 text-zinc-900"
                data-testid="filter-owner"
              >
                <SelectValue placeholder="Filter by owner" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-50 border-zinc-300">
                <SelectItem value="all">All Owners</SelectItem>
                <SelectItem value="Power">Power</SelectItem>
                <SelectItem value="Telecom">Telecom</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCondition} onValueChange={setFilterCondition}>
              <SelectTrigger
                className="w-full sm:w-48 industrial-input bg-white border-zinc-300 text-zinc-900"
                data-testid="filter-condition"
              >
                <SelectValue placeholder="Filter by condition" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-50 border-zinc-300">
                <SelectItem value="all">All Conditions</SelectItem>
                <SelectItem value="Excellent">Excellent</SelectItem>
                <SelectItem value="Good">Good</SelectItem>
                <SelectItem value="Bad">Bad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Poles List */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent animate-spin mx-auto mb-4"></div>
            <p className="text-zinc-500 font-mono">Loading poles...</p>
          </div>
        ) : filteredPoles.length === 0 ? (
          <div className="industrial-card p-12 text-center empty-state">
            <Zap className="w-16 h-16 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-xl font-heading font-bold text-zinc-600 mb-2">
              No Poles Found
            </h3>
            <p className="text-zinc-500 mb-6">
              {poles.length === 0
                ? "Start collecting pole data by adding your first entry."
                : "No poles match your current filters."}
            </p>
            {poles.length === 0 && (
              <Link to="/add">
                <Button className="industrial-button bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Pole
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPoles.map((pole, index) => (
              <div
                key={pole.id}
                className={`industrial-card pole-card ${pole.pole_owner?.toLowerCase()} p-5 animate-fade-in`}
                style={{ animationDelay: `${index * 50}ms` }}
                data-testid={`pole-card-${pole.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 flex items-center justify-center ${
                        pole.pole_owner === "Power"
                          ? "bg-red-500/20 text-red-600"
                          : "bg-orange-500/20 text-orange-600"
                      }`}
                    >
                      {pole.pole_owner === "Power" ? (
                        <Zap className="w-5 h-5" />
                      ) : (
                        <Radio className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <Badge
                        className={`${
                          pole.pole_owner === "Power"
                            ? "pole-power"
                            : "pole-telecom"
                        } border font-mono text-xs`}
                      >
                        {pole.pole_owner}
                      </Badge>
                      {pole.pole_number && (
                        <p className="text-xs text-zinc-600 font-mono mt-1">
                          Pole #{pole.pole_number}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    className={`${getConditionColor(pole.condition)} border condition-badge`}
                  >
                    {pole.condition}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  {pole.job_number && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500 font-mono text-xs">JOB/EWO:</span>
                      <span className="text-zinc-700 font-mono">{pole.job_number}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 font-mono text-xs">SIZE:</span>
                    <span className="text-zinc-700">{pole.pole_size}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 font-mono text-xs">ATTACHMENTS:</span>
                    <span className="text-zinc-700 font-mono">
                      {pole.telecom_attachments}
                    </span>
                  </div>
                  {pole.latitude && pole.longitude && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-3 h-3 text-zinc-500" />
                      <span className="text-zinc-600 font-mono text-xs">
                        {pole.latitude.toFixed(4)}, {pole.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-600 font-mono text-xs">
                      {new Date(pole.inspection_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-zinc-200">
                  <Link to={`/view/${pole.id}`} className="flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                      data-testid={`view-pole-${pole.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </Link>
                  <Link to={`/edit/${pole.id}`} className="flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                      data-testid={`edit-pole-${pole.id}`}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => setDeleteId(pole.id)}
                    data-testid={`delete-pole-${pole.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Pole?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This action cannot be undone. This will permanently delete the pole
              data from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-100 border-zinc-300 text-zinc-900 hover:bg-zinc-200">
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

export default Dashboard;
