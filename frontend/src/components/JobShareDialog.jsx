import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Link2, Copy, Users } from "lucide-react";

export const JobShareDialog = ({ open, onOpenChange, jobId, job, onJobUpdated }) => {
  const [emails, setEmails] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareLink = `${window.location.origin}/jobs/${jobId}`;

  useEffect(() => { setEmails((job?.shared_with || []).join(", ")); }, [job?.shared_with, open]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); toast.success("Job link copied — send it to a coworker"); }
    catch { window.prompt("Copy the job link:", shareLink); }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const list = emails.split(/[,;\s]+/).filter(Boolean);
      const r = await axios.post(`/jobs/${jobId}/share`, { emails: list });
      toast.success(list.length ? `Job shared with ${r.data.shared_with.length} team member${r.data.shared_with.length === 1 ? "" : "s"}` : "Sharing updated");
      onJobUpdated && onJobUpdated();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Share failed");
    } finally { setSharing(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-lg" data-testid="job-share-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Share This Job</DialogTitle>
          <DialogDescription className="text-xs">Send the link or add team members — they see this job in their list; you keep it too.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 text-xs text-zinc-600 truncate"><Link2 className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate" data-testid="job-share-link">{shareLink}</span></div>
          <Button variant="outline" size="sm" onClick={copyLink} className="bg-zinc-50 border-zinc-300" data-testid="job-copy-link-btn"><Copy className="w-4 h-4 mr-1" />Copy</Button>
        </div>
        <p className="text-[11px] text-zinc-500 flex items-center gap-1"><Users className="w-3.5 h-3.5" />Team members (comma-separated company emails):</p>
        <div className="flex items-center gap-2">
          <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="crew1@byers.com, crew2@mastec.com" className="h-9 bg-white border-zinc-300 text-sm" data-testid="job-share-emails-input" />
          <Button size="sm" onClick={handleShare} disabled={sharing} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="job-share-save-btn">
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Share"}
          </Button>
        </div>
        {(job?.shared_with || []).length > 0 && (
          <p className="text-[11px] text-emerald-700" data-testid="job-shared-with">Shared with: {(job.shared_with || []).join(", ")}</p>
        )}
        <p className="text-[10px] text-zinc-400">Every add or edit by a team member is stamped with their email and date.</p>
      </DialogContent>
    </Dialog>
  );
};

export default JobShareDialog;
