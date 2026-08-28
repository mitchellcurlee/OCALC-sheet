import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Cloud, Download, Trash2, Loader2 } from "lucide-react";
import { CLOUD_EXPORT_LABELS, formatBytes, saveBlobToDevice } from "@/lib/cloudExports";

export const CloudExportsSection = ({ jobId }) => {
  const [items, setItems] = useState([]);
  const [busyType, setBusyType] = useState(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get(`/jobs/${jobId}/cloud-exports`);
      setItems(res.data || []);
    } catch (e) {
      /* section is optional — stay silent */
    }
  }, [jobId]);

  useEffect(() => {
    fetchItems();
    window.addEventListener("cloud-exports-updated", fetchItems);
    return () => window.removeEventListener("cloud-exports-updated", fetchItems);
  }, [fetchItems]);

  const handleDownload = async (item) => {
    setBusyType(item.export_type);
    try {
      const res = await axios.get(`/jobs/${jobId}/cloud-exports/${item.export_type}/download`, { responseType: "blob" });
      saveBlobToDevice(new Blob([res.data]), item.filename || item.export_type);
      toast.success("Downloaded from cloud");
    } catch (e) {
      toast.error("Cloud download failed");
    } finally {
      setBusyType(null);
    }
  };

  const handleDelete = async (item) => {
    setBusyType(item.export_type);
    try {
      await axios.delete(`/jobs/${jobId}/cloud-exports/${item.export_type}`);
      setItems((prev) => prev.filter((i) => i.export_type !== item.export_type));
      toast.success("Removed from cloud");
    } catch (e) {
      toast.error("Failed to remove");
    } finally {
      setBusyType(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="industrial-card p-4 sm:p-5 mb-6" data-testid="cloud-exports-section">
      <h2 className="font-heading text-base sm:text-lg font-bold text-zinc-900 mb-3 flex items-center gap-2">
        <div className="w-1 h-5 bg-blue-600"></div>
        <Cloud className="w-5 h-5 text-blue-600" />
        CLOUD EXPORTS
      </h2>
      <div className="divide-y divide-zinc-100">
        {items.map((item) => (
          <div key={item.export_type} className="py-2.5 flex items-center justify-between gap-3 flex-wrap" data-testid={`cloud-export-${item.export_type}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800">{CLOUD_EXPORT_LABELS[item.export_type] || item.export_type}</p>
              <p className="text-xs text-zinc-500 font-mono truncate">
                {item.filename}{item.size ? ` · ${formatBytes(item.size)}` : ""}{item.updated_at ? ` · ${new Date(item.updated_at).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(item)}
                disabled={busyType === item.export_type}
                className="text-blue-700 border-blue-300 hover:bg-blue-50"
                data-testid={`cloud-export-download-${item.export_type}`}
              >
                {busyType === item.export_type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline ml-1">Download</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDelete(item)}
                disabled={busyType === item.export_type}
                className="text-red-600 border-red-200 hover:bg-red-50"
                data-testid={`cloud-export-delete-${item.export_type}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CloudExportsSection;
