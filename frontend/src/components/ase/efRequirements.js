export const EF_REQ_ITEMS = [
  { label: "Do we need a buried PVC pipe?", key: "buried_pvc", qtyKey: "buried_pvc_length", qtyLabel: "Length", unit: "FT", shortName: "PVC" },
  { label: "Do we need buried innerduct on customer property?", key: "buried_innerduct", qtyKey: "buried_innerduct_length", qtyLabel: "Length", unit: "FT", shortName: "Innerduct" },
  { label: "Do we need EMT? (metallic bldg pipe)", key: "need_emt", qtyKey: "emt_length", qtyLabel: "Length", unit: "FT", shortName: "EMT" },
  { label: "Do we need plastic building duct/pipe (Plenum)?", key: "need_plenum", qtyKey: "plenum_length", qtyLabel: "Length", unit: "FT", shortName: "Plenum" },
  { label: "Do we need a core drill?", key: "need_core_drill", qtyKey: "core_drill_qty", qtyLabel: "QTTY", unit: "QTY", shortName: "Core drill" },
  { label: "Do we need an eye-bolt / weatherhead?", key: "need_eyebolt", qtyKey: null, shortName: "Eye-bolt/weatherhead" },
  { label: "Do we need a Pullbox?", key: "need_pullbox", qtyKey: "pullbox_qty", qtyLabel: "QTTY", unit: "QTY", shortName: "Pullbox" },
  { label: "Do we need a Hoffman box?", key: "need_hoffman_box", qtyKey: "hoffman_box_qty", qtyLabel: "QTTY", unit: "QTY", shortName: "Hoffman box" },
  { label: "Do we need a backboard?", key: "need_backboard", qtyKey: "backboard_qty", qtyLabel: "QTTY", unit: "QTY", shortName: "Backboard" },
  { label: "Do we need an outlet?", key: "need_outlet", qtyKey: null, shortName: "Outlet" },
  { label: "Do we need a groundbar?", key: "need_groundbar", qtyKey: "groundbar_qty", qtyLabel: "QTTY", unit: "QTY", shortName: "Groundbar" },
];

const yes = (v) => ["YES", "TRUE", "Y"].includes(String(v || "").trim().toUpperCase());

const itemText = (f, it) => {
  const q = it.qtyKey ? String(f[it.qtyKey] || "").trim() : "";
  if (!q) return it.shortName;
  return `${it.shortName} ${q}${it.unit === "FT" && /^\d+(\.\d+)?$/.test(q) ? "ft" : ""}`;
};

// "(Needed) PVC 17ft, EMT 20ft (Customer to place) Backboard 2x2 (Provided) Power"
export const buildSiteRequirementsText = (f) => {
  const groups = [["Needed", []], ["Customer to place", []], ["Provided", []]];
  EF_REQ_ITEMS.forEach((it) => {
    const t = itemText(f, it);
    if (f[`${it.key}_provided`] === true) groups[2][1].push(t);
    else if (f[`${it.key}_customer`] === true) groups[1][1].push(t);
    else if (yes(f[it.key])) groups[0][1].push(t);
  });
  return groups.filter(([, xs]) => xs.length).map(([g, xs]) => `(${g}) ${xs.join(", ")}`).join(" ");
};
