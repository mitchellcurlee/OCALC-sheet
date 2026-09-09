import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip, Upload, Trash2 } from "lucide-react";

const fmtSize = (n) => (!n ? "" : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s; } };

export const JobFilesShare = ({ jobId }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const loadFiles = async () => {
    try { setFiles((await axios.get(`/jobs/${jobId}/files`)).data || []); } catch { /* ignore */ }
  };
  useEffect(() => { loadFiles(); /* eslint-disable-next-line */ }, [jobId]);

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

  return (
    <div className="industrial-card p-4 mb-6 bg-white" data-testid="job-files-share">
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
  );
};

export default JobFilesShare;
