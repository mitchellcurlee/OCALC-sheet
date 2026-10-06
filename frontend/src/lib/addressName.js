const STATES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc","pr",
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming","puerto rico",
]);
const COUNTRIES = ["united states of america", "united states", "u.s.a.", "u.s.", "canada", "mexico", "usa", "us"];
const UNIT_RE = /^(ste|suite|apt|apartment|unit|bldg|building|fl|floor|rm|room|lot|#)\b|^#/i;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const SUFFIX_RE = /(?:\b(?:fm|cr|hwy|highway|rte|route|loop|spur)\b\.?\s+\d+[\w-]*|\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|way|pkwy|parkway|hwy|highway|trl|trail|pl|place|loop|ter|terrace|run|pass|path|row|sq|square|xing|crossing|cv|cove|pt|point|bnd|bend|holw|hollow|trce|trace|vw|view|walk|aly|alley|expy|expressway|fwy|freeway|plz|plaza|rte|route|fm|cr)\b\.?)(\s+(n|s|e|w|ne|nw|se|sw|north|south|east|west)\b\.?)?(\s*,?\s*(ste|suite|apt|apartment|unit|bldg|building|fl|floor|rm|room|lot|#)\s*\.?\s*#?\s*[\w-]+)?/gi;
const AMBIGUOUS_STATES = new Set(["ct"]); // also a street suffix (Court)

const trimPunct = (s) => s.replace(/^[\s.,]+|[\s.,]+$/g, "");

const stripTrailingTokens = (input) => {
  let s = input;
  let changed = true;
  let sawZipOrCountry = false;
  while (changed) {
    changed = false;
    const low = trimPunct(s).toLowerCase();
    const country = COUNTRIES.find((c) => low === c || low.endsWith(" " + c));
    if (country) { s = trimPunct(s.slice(0, low.length - country.length)); changed = sawZipOrCountry = true; continue; }
    const words = trimPunct(s).split(/\s+/).filter(Boolean);
    if (!words.length) break;
    const last = trimPunct(words[words.length - 1]);
    if (ZIP_RE.test(last)) { s = words.slice(0, -1).join(" "); changed = sawZipOrCountry = true; continue; }
    if (words.length >= 2 && STATES.has(words.slice(-2).map(trimPunct).join(" ").toLowerCase())) { s = words.slice(0, -2).join(" "); changed = true; continue; }
    if (STATES.has(last.toLowerCase()) && words.length > 2 && (sawZipOrCountry || !AMBIGUOUS_STATES.has(last.toLowerCase()))) { s = words.slice(0, -1).join(" "); changed = true; }
  }
  return trimPunct(s);
};

// Keep only the street part (and unit) of an address: no city, state, zip or country.
export const streetOnly = (address) => {
  const s = String(address || "").trim();
  if (!s) return "";
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const keep = [parts[0]];
    for (const p of parts.slice(1)) { if (UNIT_RE.test(p)) keep.push(p); else break; }
    return stripTrailingTokens(keep.join(", "));
  }
  const stripped = stripTrailingTokens(s);
  let last = null;
  for (const m of stripped.matchAll(SUFFIX_RE)) last = m;
  return last ? trimPunct(stripped.slice(0, last.index + last[0].length)) : stripped;
};
