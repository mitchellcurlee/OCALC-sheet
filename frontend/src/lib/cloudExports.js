import axios from "axios";
import { streetOnly } from "@/lib/addressName";

export const CLOUD_EXPORT_LABELS = {
  job_excel: "OCALC/Job Excel",
  ase_excel: "ASE Excel",
  sow_docx: "SOW Notes (Word)",
  permission_stamp: "Permission Stamp (Word)",
  photos_zip: "Photos (ZIP)",
  map_image: "Map Image (PNG)",
  map_pages_zip: "800ft Map Pages (ZIP)",
  map_pdf: "1000ft Map Pages (PDF)",
};

export const notifyCloudExportsUpdated = () => window.dispatchEvent(new CustomEvent("cloud-exports-updated"));

export const formExportFilename = (job, form, ext) => {
  const address = streetOnly(job?.location || job?.ase_data?.address || "");
  const parts = [(job?.job_type || "OCALC").trim(), address, form].filter(Boolean);
  const safe = parts.join("_").replace(/[^\w \-.,]/g, "_").trim();
  return `${safe || "export"}.${ext}`;
};

export const uploadExportToCloud = async (jobId, exportType, filename, blob) => {
  const fd = new FormData();
  fd.append("export_type", exportType);
  fd.append("file", blob, filename);
  await axios.post(`/jobs/${jobId}/cloud-exports/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  notifyCloudExportsUpdated();
};

export const saveBlobToDevice = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const formatBytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
