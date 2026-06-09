import { useState, useEffect, useCallback } from "react";
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
  Copy,
  FileSpreadsheet,
  ArrowLeft,
  Loader2,
  Folder,
} from "lucide-react";

const JobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  const fetchJobAndPoles = useCallback(async () => {
    try {
      const [jobRes, polesRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/poles`)
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data);
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

  const handleExport = async () => {
    try {
      const response = await axios.get(`/jobs/${jobId}/export/excel`, {
        params: { base_url: window.location.origin },
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
      await axios.delete(`/poles/${deleteId}`);
      toast.success("Pole deleted successfully");
      setDeleteId(null);
      fetchJobAndPoles();
    } catch (error) {
      toast.error("Failed to delete pole");
    }
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
                className="flex-1 sm:flex-initial h-11 sm:h-10 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-900 text-sm"
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
                <p className="text-2xl font-bold text-zinc-900">{poles.length}</p>
                <p className="text-xs text-zinc-500 uppercase font-mono">Total Poles</p>
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
              placeholder="Search poles..."
              className="pl-10 h-11 bg-zinc-50 border-zinc-300 text-zinc-900"
            />
          </div>
        </div>

        {/* Poles List */}
        {filteredPoles.length === 0 ? (
          <div className="industrial-card p-12 text-center">
            <Radio className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-zinc-900 mb-2">
              {poles.length === 0 ? "No Poles Yet" : "No Results"}
            </h2>
            <p className="text-zinc-600 mb-6">
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
                className="industrial-card p-4 hover:border-zinc-300 transition-colors"
                data-testid={`pole-card-${pole.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 flex items-center justify-center ${pole.pole_owner === "Foreign Owned" ? "bg-red-600" : "bg-orange-600"}`}>
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900">{pole.pole_number || "No #"}</span>
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
                      <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-zinc-900">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link to={`/jobs/${jobId}/edit/${pole.id}`}>
                      <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-zinc-900">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-600 hover:text-zinc-900"
                      onClick={() => handleDuplicate(pole.id)}
                      title="Duplicate pole"
                      data-testid={`duplicate-pole-${pole.id}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-600 hover:text-red-600"
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
        <AlertDialogContent className="bg-zinc-50 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Pole?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              This action cannot be undone. This will permanently delete the pole data.
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
