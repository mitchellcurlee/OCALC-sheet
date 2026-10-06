import re

_STATES = {
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
    "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
    "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc", "pr",
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia",
    "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts",
    "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
    "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia",
    "wisconsin", "wyoming", "puerto rico",
}
_COUNTRIES = {"usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "canada", "mexico"}
_UNIT_RE = re.compile(r"^(ste|suite|apt|apartment|unit|bldg|building|fl|floor|rm|room|lot|#)\b|^#", re.I)
_ZIP_RE = re.compile(r"^\d{5}(-\d{4})?$")
_SUFFIX_RE = re.compile(
    r"(?:\b(?:fm|cr|hwy|highway|rte|route|loop|spur)\b\.?\s+\d+[\w-]*"
    r"|\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|way|pkwy|parkway|hwy|highway|"
    r"trl|trail|pl|place|loop|ter|terrace|run|pass|path|row|sq|square|xing|crossing|cv|cove|pt|point|bnd|bend|holw|hollow|"
    r"trce|trace|vw|view|walk|aly|alley|expy|expressway|fwy|freeway|plz|plaza|rte|route|fm|cr)\b\.?)"
    r"(\s+(n|s|e|w|ne|nw|se|sw|north|south|east|west)\b\.?)?"
    r"(\s*,?\s*(ste|suite|apt|apartment|unit|bldg|building|fl|floor|rm|room|lot|#)\s*\.?\s*#?\s*[\w-]+)?",
    re.I,
)
_AMBIGUOUS_STATES = {"ct"}  # also a street suffix (Court)


def _strip_trailing_tokens(s: str) -> str:
    """Drop trailing country / zip / state words (for addresses written without commas)."""
    changed = True
    saw_zip_or_country = False
    while changed:
        changed = False
        low = s.lower().rstrip(" .,")
        for c in sorted(_COUNTRIES, key=len, reverse=True):
            if low.endswith(" " + c) or low == c:
                s = s[: len(low) - len(c)].rstrip(" .,")
                changed = saw_zip_or_country = True
                break
        if changed:
            continue
        words = s.rstrip(" .,").split()
        if not words:
            break
        last = words[-1].strip(".,")
        if _ZIP_RE.match(last):
            s = " ".join(words[:-1])
            changed = saw_zip_or_country = True
            continue
        if len(words) >= 2 and " ".join(w.strip(".,") for w in words[-2:]).lower() in _STATES:
            s = " ".join(words[:-2])
            changed = True
            continue
        if last.lower() in _STATES and len(words) > 2 and (saw_zip_or_country or last.lower() not in _AMBIGUOUS_STATES):
            s = " ".join(words[:-1])
            changed = True
    return s.strip(" .,")


def street_only(address) -> str:
    """Keep only the street part (and unit) of an address: no city, state, zip or country."""
    s = str(address or "").strip()
    if not s:
        return ""
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if len(parts) > 1:
        keep = [parts[0]]
        for p in parts[1:]:
            if _UNIT_RE.match(p):
                keep.append(p)
            else:
                break
        return _strip_trailing_tokens(", ".join(keep))
    s = _strip_trailing_tokens(s)
    last = None
    for m in _SUFFIX_RE.finditer(s):
        last = m
    if last:
        return s[: last.end()].strip(" .,")
    return s
