import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  MapPin,
  Calendar,
  Trash2,
  Pencil,
  LogOut,
  Loader2,
  Radio,
  Shield,
  User,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const JobsList = () => {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "", location: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API}/jobs`);
      setJobs(response.data);
    } catch (error) {
      toast.error("Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Job name is required");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/jobs`, formData);
      toast.success("Job created successfully!");
      setShowCreateDialog(false);
      setFormData({ name: "", description: "", location: "" });
      fetchJobs();
    } catch (error) {
      toast.error("Failed to create job");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!formData.name.trim()) {
      toast.error("Job name is required");
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/jobs/${editingJob.id}`, formData);
      toast.success("Job updated successfully!");
      setShowEditDialog(false);
      setEditingJob(null);
      setFormData({ name: "", description: "", location: "" });
      fetchJobs();
    } catch (error) {
      toast.error("Failed to update job");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/jobs/${deleteId}`);
      toast.success("Job deleted successfully");
      setDeleteId(null);
      fetchJobs();
    } catch (error) {
      toast.error("Failed to delete job");
    }
  };

  const openEditDialog = (job, e) => {
    e.stopPropagation();
    setEditingJob(job);
    setFormData({ name: job.name, description: job.description || "", location: job.location || "" });
    setShowEditDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg" data-testid="jobs-list">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-600 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight uppercase text-white">
                  Pole Data Sheet
                </h1>
                <p className="text-xs text-zinc-500 font-mono tracking-wider hidden sm:block">
                  SELECT OR CREATE A JOB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {user && (
                <span className="hidden sm:block text-xs text-zinc-400 font-mono">
                  {user.name || user.email}
                </span>
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
                className="h-11 w-11 sm:h-10 sm:w-10 text-zinc-400 hover:text-white hover:bg-zinc-800"
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
            <h2 className="text-xl font-bold text-white mb-2">No Jobs Yet</h2>
            <p className="text-zinc-400 mb-6">Create your first job to start collecting pole data</p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Job
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="industrial-card p-5 cursor-pointer hover:border-red-500/50 transition-colors group"
                data-testid={`job-card-${job.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-600/20 border border-red-500/30 flex items-center justify-center">
                      <Folder className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h3 className="font-heading text-lg font-bold text-white group-hover:text-red-400 transition-colors">
                        {job.name}
                      </h3>
                      {job.location && (
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-zinc-400 hover:text-white"
                      onClick={(e) => openEditDialog(job, e)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-zinc-400 hover:text-red-400"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(job.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {job.description && (
                  <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{job.description}</p>
                )}
                
                <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                  <div className="flex items-center gap-2 text-sm">
                    <Radio className="w-4 h-4 text-yellow-500" />
                    <span className="text-zinc-300 font-mono">{job.pole_count}</span>
                    <span className="text-zinc-500">poles</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Calendar className="w-3 h-3" />
                    {new Date(job.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Job Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Job Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Street Project"
                className="bg-black border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Dallas, TX"
                className="bg-black border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                className="bg-black border-zinc-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="bg-zinc-800 border-zinc-700 text-white">
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
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Job Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-black border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="bg-black border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-zinc-500 uppercase">Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-black border-zinc-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="bg-zinc-800 border-zinc-700 text-white">
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Job?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete this job and ALL poles in it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JobsList;
