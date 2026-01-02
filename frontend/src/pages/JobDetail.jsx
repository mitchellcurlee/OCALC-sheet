import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FileSpreadsheet,
  ArrowLeft,
  Loader2,
  Folder,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const JobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    fetchJobAndPoles();
  }, [jobId]);

  const fetchJobAndPoles = async () => {
    try {
      const [jobRes, polesRes] = await Promise.all([
        axios.get(`${API}/jobs/${jobId}`),
        axios.get(`${API}/jobs/${jobId}/poles`)
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data);
    } catch (error) {
      toast.error("Failed to fetch job data");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API}/jobs/${jobId}/export/excel`, {
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const filename = response.headers["content-disposition"]?.split("filename=")[1] || `${job?.name || "job"}_export.xlsx`;
      link.setAttribute("download", filename.replace(/"/g, ""));
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Excel file downloaded!");
    } catch (error) {
      toast.error("Failed to export data");
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/poles/${deleteId}`);
      toast.success("Pole deleted successfully");
      setDeleteId(null);
      fetchJobAndPoles();
    } catch (error) {
      toast.error("Failed to delete pole");
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
      pole.pole_number?.toLowerCase().includes(query) ||
      pole.job_number?.toLowerCase().includes(query) ||
      pole.pole_owner?.toLowerCase().includes(query) ||
      pole.condition?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="job-detail">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/">
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-600 flex items-center justify-center flex-shrink-0">
                <Folder className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight uppercase text-white">
                  {job?.name}
                </h1>
                {job?.location && (
                  <p className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {job.location}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <Button
                onClick={handleExport}
                variant="outline"
                className="flex-1 sm:flex-initial h-11 sm:h-10 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white text-sm"
                data-testid="export-btn"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Link to={`/jobs/${jobId}/add`} className="flex-1 sm:flex-initial">
                <Button className="w-full h-11 sm:h-10 bg-red-600 hover:bg-red-700 text-white text-sm" data-testid="add-pole-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Pole
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-white">{poles.length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Total Poles</p>
              </div>
            </div>
          </div>
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-2xl font-bold text-white">{poles.filter(p => p.condition === "Excellent").length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Excellent</p>
              </div>
            </div>
          </div>
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div>
                <p className="text-2xl font-bold text-white">{poles.filter(p => p.condition === "Good").length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Good</p>
              </div>
            </div>
          </div>
          <div className="industrial-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div>
                <p className="text-2xl font-bold text-white">{poles.filter(p => p.condition === "Bad").length}</p>
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
              placeholder="Search poles..."
              className="pl-10 h-11 bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
        </div>

        {/* Poles List */}
        {filteredPoles.length === 0 ? (
          <div className="industrial-card p-12 text-center">
            <Radio className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              {poles.length === 0 ? "No Poles Yet" : "No Results"}
            </h2>
            <p className="text-zinc-400 mb-6">
              {poles.length === 0 ? "Add your first pole to this job" : "Try a different search term"}
            </p>
            {poles.length === 0 && (
              <Link to={`/jobs/${jobId}/add`}>
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Pole
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPoles.map((pole) => (
              <div
                key={pole.id}
                className="industrial-card p-4 hover:border-zinc-600 transition-colors"
                data-testid={`pole-card-${pole.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 flex items-center justify-center ${pole.pole_owner === "Foreign Owned" ? "bg-red-600" : "bg-orange-600"}`}>
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{pole.pole_number || "No #"}</span>
                        <Badge className={`${getConditionColor(pole.condition)} text-xs`}>
                          {pole.condition}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                        <span>{pole.pole_size}</span>
                        <span>•</span>
                        <span>{pole.pole_owner}</span>
                        {pole.latitude && pole.longitude && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
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
                      {new Date(pole.inspection_date).toLocaleDateString()}
                    </div>
                    <Link to={`/jobs/${jobId}/view/${pole.id}`}>
                      <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link to={`/jobs/${jobId}/edit/${pole.id}`}>
                      <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-red-400"
                      onClick={() => setDeleteId(pole.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Pole?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This action cannot be undone. This will permanently delete the pole data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white">Cancel</AlertDialogCancel>
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
