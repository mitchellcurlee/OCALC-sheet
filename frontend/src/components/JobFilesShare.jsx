import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, Upload, Trash2, Link2, Copy, Users, Share2 } from "lucide-react";

const fmtSize = (n) => (!n ? "" : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s; } };

export const JobFilesShare = ({ jobId, job, onJobUpdated }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [emails, setEmails] = useState("");
  const [sharing, setSharing] = useState(false);
  const inputRef = useRef(null);
  const shareLink = `${window.location.origin}/jobs/${jobId}`;

  const loadFiles = async () => {
    try { setFiles((await axios.get(`/jobs/${jobId}/files`)).data || []); } catch { /* ignore */ }
  };
  useEffect(() => { loadFiles(); /* eslint-disable-next-line */ }, [jobId]);

  useEffect(() => { setEmails((job?.shared_with || []).join(", ")); }, [job?.shared_with]);

  const handleUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", f);
        await axios.post(`/jobs/${jobId}/files`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success(`${list.length} file${list.length > 1 ? "s" : ""} uploaded`);
      loadFiles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const handleDelete = async (fileId) => {
    try { await axios.delete(`/jobs/${jobId}/files/${fileId}`); loadFiles(); } catch { toast.error("Delete failed"); }
  };

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
    <div className="industrial-card p-4 mb-6 bg-white" data-testid="job-files-share">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2 flex items-center gap-2"><Paperclip className="w-4 h-4" />Job Files</h3>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} data-testid="job-file-input" />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="bg-zinc-50 border-zinc-300 mb-2" data-testid="job-file-upload-btn">
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}Upload Files
          </Button>
          {files.length === 0 ? (
            <p className="text-xs text-zinc-400">No files yet — attach permits, prints, or any documents for this job.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm" data-testid={`job-file-${f.id}`}>
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline truncate max-w-[240px]">{f.original_filename}</a>
                  <span className="text-[11px] text-zinc-400">{fmtSize(f.size)} · {f.uploaded_by} · {fmtDate(f.created_at)}</span>
                  <button type="button" onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-600" data-testid={`job-file-delete-${f.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-2 flex items-center gap-2"><Share2 className="w-4 h-4" />Share This Job</h3>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 text-xs text-zinc-600 truncate"><Link2 className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate" data-testid="job-share-link">{shareLink}</span></div>
            <Button variant="outline" size="sm" onClick={copyLink} className="bg-zinc-50 border-zinc-300" data-testid="job-copy-link-btn"><Copy className="w-4 h-4 mr-1" />Copy</Button>
          </div>
          <p className="text-[11px] text-zinc-500 mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" />Team members (comma-separated emails) — they see this job in their list; you keep it too:</p>
          <div className="flex items-center gap-2">
            <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="crew1@byers.com, crew2@mastec.com" className="h-9 bg-white border-zinc-300 text-sm" data-testid="job-share-emails-input" />
            <Button size="sm" onClick={handleShare} disabled={sharing} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="job-share-save-btn">
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Share"}
            </Button>
          </div>
          {(job?.shared_with || []).length > 0 && (
            <p className="text-[11px] text-emerald-700 mt-2" data-testid="job-shared-with">Shared with: {(job.shared_with || []).join(", ")}</p>
          )}
          <p className="text-[10px] text-zinc-400 mt-2">Every add or edit by a team member is stamped with their email and date.</p>
        </div>
      </div>
    </div>
  );
};

export default JobFilesShare;
