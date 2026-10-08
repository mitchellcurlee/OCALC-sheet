import { computeItemFeet, distanceFeet, routeArg } from "@/lib/poleMapImage";

// Job attributes (poles + underground) with GPS, labelled the way the ASE "Populate from Job Attribute" dropdowns show them
export const aseAttributeOptions = (poles = [], underground = []) => {
  const items = [];
  underground.forEach((u) => {
    if (u.latitude && u.longitude) items.push({ id: u.id, label: `${u.type}${u.label ? ` ${u.label}` : ""}`, coords: `${u.latitude}, ${u.longitude}`, sort: u.sort_order ?? 9999 });
  });
  poles.forEach((p) => {
    if (p.latitude && p.longitude) items.push({ id: p.id, label: `Pole ${p.pole_number || "?"}`, coords: `${p.latitude}, ${p.longitude}`, sort: p.sort_order ?? 9999 });
  });
  items.sort((a, b) => a.sort - b.sort);
  const seen = {};
  items.forEach((it) => {
    seen[it.label] = (seen[it.label] || 0) + 1;
    if (seen[it.label] > 1) it.label = `${it.label} (${seen[it.label]})`;
  });
  return items;
};

// Fiber (FBT) and NTE attributes: the form's "Populate from Job Attribute" pick wins, else detected by type
const resolveFiberAndNte = (formData, poles, underground) => {
  const options = aseAttributeOptions(poles, underground);
  const all = [...poles, ...underground];
  const picked = (label) => { const o = options.find((x) => x.label === label); return o ? all.find((it) => it.id === o.id) : null; };
  const pedestalAsFbt = String(formData.pedestal_fiber_as_fbt || "").toUpperCase() === "YES";
  const fiberItem = picked(formData.fbt_attribute_source) || (pedestalAsFbt
    ? underground.find((u) => u.type === "Pedestal" && String(u.material_type || "").toLowerCase().includes("fiber"))
    : underground.find((u) => u.type === "FBT" || u.type === "FBT/NTE"));
  const nteItem = picked(formData.nte_attribute_source) || underground.find((u) => u.type === "NTE" || u.type === "FBT/NTE");
  return { fiberItem, nteItem };
};

// Single source for Checklist "Distance From FBT to NTE" and SVCL "Est. Fiber Drop Length":
// measured chainage between the fiber attribute and the NTE attribute (straight-line GPS fallback). "" when unknown.
export const fbtToNteDistance = ({ formData, job, poles = [], underground = [], connections = [], routes = {} }) => {
  const { fiberItem, nteItem } = resolveFiberAndNte(formData, poles, underground);
  if (!fiberItem || !nteItem || fiberItem.id === nteItem.id) return "";
  const feet = computeItemFeet({ poles, underground, connections, routes, spanNotes: job?.span_notes || [], spanOrder: job?.span_order || null, drawnOnly: routeArg(job) });
  if (Number.isFinite(feet[fiberItem.id]) && Number.isFinite(feet[nteItem.id])) return `${Math.round(Math.abs(feet[nteItem.id] - feet[fiberItem.id]))} ft`;
  if (fiberItem.latitude && nteItem.latitude) return `${Math.round(distanceFeet([parseFloat(fiberItem.latitude), parseFloat(fiberItem.longitude)], [parseFloat(nteItem.latitude), parseFloat(nteItem.longitude)]))} ft`;
  return "";
};
