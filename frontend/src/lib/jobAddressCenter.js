import axios from "axios";

const cache = {};

// Geocode the job's address (job.location); cached per address string
export async function getJobAddressCenter(jobId) {
  if (!jobId) return null;
  try {
    const { data: job } = await axios.get(`/jobs/${jobId}`);
    const q = (job.location || "").trim();
    if (!q) return null;
    if (cache[q] !== undefined) return cache[q];
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
    const arr = await res.json();
    const hit = Array.isArray(arr) && arr[0];
    cache[q] = hit ? [parseFloat(hit.lat), parseFloat(hit.lon)] : null;
    return cache[q];
  } catch (e) {
    return null;
  }
}
