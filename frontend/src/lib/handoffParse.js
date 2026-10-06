// Parses a pasted "Site Visit Award Info" block (one "Label: value" per line) into handoff_* keys
export const parseHandoff = (raw, handoffFields) => {
  const out = {};
  String(raw || "").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (!m) return;
    const lab = m[1].trim().toLowerCase().replace(/\s+/g, " ");
    const h = handoffFields.find((x) => x.label.toLowerCase() === lab);
    if (h) out[`handoff_${h.key}`] = m[2].trim();
  });
  return out;
};

const PHONE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
export const splitContact = (s) => {
  const str = String(s || "");
  const phone = (str.match(PHONE) || [""])[0];
  const email = (str.match(EMAIL) || [""])[0];
  const name = str.replace(EMAIL, "").replace(PHONE, "").replace(/[,;]+\s*$/g, "").split(/[,;(]/)[0].trim();
  return { name, phone, email };
};

// Fielding Checklist values derived from the handoff block
export const checklistFromHandoff = (h) => {
  const biz = h.handoff_end_customer || h.handoff_customer;
  const cityLine = [[h.handoff_city, h.handoff_state].filter(Boolean).join(", "), h.handoff_zip].filter(Boolean).join(" ");
  const addr = [h.handoff_address, h.handoff_sub_address, cityLine].filter(Boolean).join(", ");
  const lcon = splitContact(h.handoff_lcon);
  const sec = splitContact(h.handoff_secondary_lcon);
  const out = {
    business_name: biz, business_name_2: biz, site_address: addr, site_address_2: addr,
    lcon_name: lcon.name, lcon_phone: lcon.phone, lcon_email: lcon.email,
    local_contact_name: sec.name, local_contact_number: sec.phone,
  };
  Object.keys(out).forEach((k) => { if (!out[k]) delete out[k]; });
  return out;
};
