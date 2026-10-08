// Reproduces JobDetail.getExportBlob().stationMap() then checks KMZ + Excel for the FBT station.
// usage: node ase_export_check.mjs <API_BASE> <TOKEN> <JOB_ID> <FBT_ID>
import fs from "fs";
import { execSync } from "child_process";
const [API, TOKEN, JOB, FBT] = process.argv.slice(2);
const src = fs.readFileSync("/app/frontend/src/lib/poleMapImage.js", "utf8")
  .replace(/^import axios.*$/m, "const axios={};").replace(/^import \{ toast \}.*$/m, "const toast={};")
  .replace(/^import JSZip.*$/m, "const JSZip={};").replace(/^import \{ drawSmartTags \}.*$/m, "const drawSmartTags=()=>[];");
fs.writeFileSync("/tmp/pmi_live.mjs", src);
const { computeItemStations, routeArg } = await import("/tmp/pmi_live.mjs");
const get = async (p) => (await fetch(`${API}/api${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
const [job, poles, ug, conns, routesArr] = await Promise.all([get(`/jobs/${JOB}`), get(`/jobs/${JOB}/poles`), get(`/jobs/${JOB}/underground`), get(`/jobs/${JOB}/connections`), get(`/jobs/${JOB}/routes`).catch(() => [])]);
const routes = {}; (Array.isArray(routesArr) ? routesArr : []).forEach((r) => { routes[`${r.from_pole_id}-${r.to_pole_id}`] = r.waypoints || []; });
const stations = computeItemStations({ poles, underground: ug, connections: conns, routes, spanNotes: job.span_notes || [], spanOrder: job.span_order || null, drawnOnly: routeArg(job), stationStartId: job.station_start_id || null });
console.log("stations", stations, "FBT station:", stations[FBT]);
const post = async (p, body, out) => { const r = await fetch(`${API}/api${p}`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); return r.status; };
console.log("kmz", await post(`/jobs/${JOB}/export/kmz`, { stations }, "/tmp/t.kmz"));
console.log("xlsx", await post(`/jobs/${JOB}/export/excel`, { stations, base_url: "http://x" }, "/tmp/t.xlsx"));
console.log(execSync(`cd /tmp && rm -rf kmzx && mkdir kmzx && cd kmzx && unzip -o -q ../t.kmz && grep -o '<name>[^<]*FBT[^<]*</name>' *.kml | head -3`).toString());
console.log(execSync(`python3 -c "
import openpyxl; wb=openpyxl.load_workbook('/tmp/t.xlsx'); ws=wb.worksheets[0]
for row in ws.iter_rows(values_only=True):
    if any(isinstance(c,str) and 'FBT' in c for c in row): print([c for c in row if c not in (None,'')])
"`).toString());
