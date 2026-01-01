import { useState, useEffect } from "react";
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
  Download,
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
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const [poles, setPoles] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [deleteId, setDeleteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPoles = async () => {
    try {
      let url = `${API}/poles`;
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("pole_type", filterType);
      if (filterCondition !== "all") params.append("condition", filterCondition);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await axios.get(url);
      setPoles(response.data);
    } catch (error) {
      toast.error("Failed to fetch poles");
      console.error(error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPoles(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [filterType, filterCondition]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`${API}/poles/${deleteId}`);
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
      const response = await axios.get(`${API}/poles/export/excel`, {
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
      Excellent: "bg-green-500/20 text-green-400 border-green-500/50",
      Good: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
      Bad: "bg-red-500/20 text-red-400 border-red-500/50",
    };
    return colors[condition] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/50";
  };

  const filteredPoles = poles.filter((pole) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pole.id.toLowerCase().includes(query) ||
      pole.pole_type.toLowerCase().includes(query) ||
      pole.condition.toLowerCase().includes(query) ||
      (pole.notes && pole.notes.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="dashboard">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-black tracking-tight uppercase text-white">
                  Pole Inspector
                </h1>
                <p className="text-xs text-zinc-500 font-mono tracking-wider">
                  POWER POLE DATA COLLECTION SYSTEM
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleExport}
                variant="outline"
                className="industrial-button bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white"
                data-testid="export-btn"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Link to="/add">
                <Button
                  className="industrial-button bg-red-600 hover:bg-red-700 text-white"
                  data-testid="add-pole-btn"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Pole
                </Button>
              </Link>
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
                  <p className="text-4xl font-heading font-black text-white mt-1">
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
                  <p className="text-4xl font-heading font-black text-red-500 mt-1">
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
                  <p className="text-4xl font-heading font-black text-orange-500 mt-1">
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
                placeholder="Search poles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 industrial-input bg-black border-zinc-700 text-white"
                data-testid="search-input"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger
                className="w-full sm:w-48 industrial-input bg-black border-zinc-700 text-white"
                data-testid="filter-type"
              >
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Power">Power</SelectItem>
                <SelectItem value="Telecom">Telecom</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCondition} onValueChange={setFilterCondition}>
              <SelectTrigger
                className="w-full sm:w-48 industrial-input bg-black border-zinc-700 text-white"
                data-testid="filter-condition"
              >
                <SelectValue placeholder="Filter by condition" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
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
            <h3 className="text-xl font-heading font-bold text-zinc-400 mb-2">
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
                className={`industrial-card pole-card ${pole.pole_type.toLowerCase()} p-5 animate-fade-in`}
                style={{ animationDelay: `${index * 50}ms` }}
                data-testid={`pole-card-${pole.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 flex items-center justify-center ${
                        pole.pole_type === "Power"
                          ? "bg-red-500/20 text-red-500"
                          : "bg-orange-500/20 text-orange-500"
                      }`}
                    >
                      {pole.pole_type === "Power" ? (
                        <Zap className="w-5 h-5" />
                      ) : (
                        <Radio className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <Badge
                        className={`${
                          pole.pole_type === "Power"
                            ? "pole-power"
                            : "pole-telecom"
                        } border font-mono text-xs`}
                      >
                        {pole.pole_type}
                      </Badge>
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        {pole.id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={`${getConditionColor(pole.condition)} border condition-badge`}
                  >
                    {pole.condition}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 font-mono text-xs">SIZE:</span>
                    <span className="text-zinc-300">{pole.pole_size}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 font-mono text-xs">ATTACHMENTS:</span>
                    <span className="text-zinc-300 font-mono">
                      {pole.telecom_attachments}
                    </span>
                  </div>
                  {pole.latitude && pole.longitude && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-3 h-3 text-zinc-500" />
                      <span className="text-zinc-400 font-mono text-xs">
                        {pole.latitude.toFixed(4)}, {pole.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-400 font-mono text-xs">
                      {new Date(pole.inspection_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-zinc-800">
                  <Link to={`/view/${pole.id}`} className="flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
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
                      className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
                      data-testid={`edit-pole-${pole.id}`}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Pole?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This action cannot be undone. This will permanently delete the pole
              data from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
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
