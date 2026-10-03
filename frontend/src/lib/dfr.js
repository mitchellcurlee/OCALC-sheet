// Daily Field Report helpers
export const MARKETS = ["FTH", "FTD", "FOH"];
export const HOUR_OPTIONS = Array.from({ length: 16 * 4 + 1 }, (_, i) => (i * 0.25).toFixed(2).replace(/\.?0+$/, "") || "0");
export const MILE_OPTIONS = Array.from({ length: 501 }, (_, i) => String(i));
export const PHASES = ["travel", "work", "return"];
export const PHASE_LABELS = { travel: "Travel to site", work: "Work @ job", return: "Return / next site" };

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const haversineMiles = (a, b) => {
  const R = 3958.7613;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const trackMiles = (pts) => pts.reduce((sum, p, i) => (i ? sum + haversineMiles(pts[i - 1], p) : 0), 0);

export const roundQuarter = (hrs) => Math.min(16, Math.round(hrs * 4) / 4);
export const fmtHrs = (h) => (h == null || h === "" ? "" : String(Number(h)).replace(/\.?0+$/, "") || "0");

export const newRow = (job) => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
  job_id: job?.id || "",
  job: job?.name || "",
  market: "",
  sow: job?.job_type || "",
  job_type: job?.job_type || "",
  job_address: job?.location || "",
  fielder: "",
  travel_hrs: "", work_hrs: "", return_hrs: "", miles: "", footage: "", poles: "", computer_hrs: "", status: "", comments: "",
  gps: {}, // { travel_start, arrived, leaving, stop } ISO timestamps
});

/** Summarise one row's GPS phases from the track → { travel_hrs, work_hrs, return_hrs, miles } */
export const summarizeRowTrack = (track, row) => {
  const pts = track.filter((p) => p.row_id === row.id);
  const by = (phase) => pts.filter((p) => p.phase === phase);
  const g = row.gps || {};
  const hrs = (a, b) => (a && b ? roundQuarter((new Date(b) - new Date(a)) / 3600000) : null);
  return {
    travel_hrs: hrs(g.travel_start, g.arrived),
    work_hrs: hrs(g.arrived, g.leaving),
    return_hrs: hrs(g.leaving, g.stop),
    miles: Math.min(500, Math.round(trackMiles(by("travel")) + trackMiles(by("work")) + trackMiles(by("return")))),
  };
};
