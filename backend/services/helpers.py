import re
import math


def format_height(value):
    """Convert a decimal-feet value to a 'X' Y\"' string for display/export."""
    if value is None or value == "":
        return ""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    feet = int(v)
    inches = int(round((v - feet) * 12))
    if inches == 12:
        feet += 1
        inches = 0
    return f"{feet}' {inches}\""


def pole_sort_key(pole):
    """Sort by sort_order if set, otherwise natural sort by pole_number."""
    # If sort_order is explicitly set, use it as primary sort
    sort_order = pole.get("sort_order")
    if sort_order is not None:
        return (0, sort_order, [])
    
    # Fall back to natural sort by pole_number
    pn = str(pole.get("pole_number") or "").strip().lower()
    natural_key = [(0, int(t)) if t.isdigit() else (1, t) for t in re.split(r"(\d+)", pn) if t]
    return (1, 0, natural_key)


def haversine_feet(lat1, lon1, lat2, lon2):
    """Calculate the distance in feet between two GPS coordinates using Haversine formula."""
    R = 6371000  # Earth's radius in meters
    FEET_PER_METER = 3.28084
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c * FEET_PER_METER


def has_gps(pole):
    """Check if a pole has valid GPS coordinates."""
    try:
        lat = float(pole.get("latitude", ""))
        lon = float(pole.get("longitude", ""))
        return math.isfinite(lat) and math.isfinite(lon)
    except (TypeError, ValueError):
        return False


def compute_route_segments(poles):
    """
    Compute GPS-calculated route segments between consecutive poles.
    Returns a list of dicts: [{from_pole, to_pole, distance_ft}] and total footage.
    Poles are sorted by natural pole_number order (same as map display).
    """
    # Sort poles by natural order
    sorted_poles = sorted(poles, key=pole_sort_key)
    
    # Filter poles with valid GPS
    route_poles = []
    for p in sorted_poles:
        if has_gps(p):
            route_poles.append({
                "pole_number": p.get("pole_number", ""),
                "lat": float(p.get("latitude")),
                "lon": float(p.get("longitude")),
            })
    
    segments = []
    total_feet = 0
    
    for i in range(len(route_poles) - 1):
        p1 = route_poles[i]
        p2 = route_poles[i + 1]
        dist = haversine_feet(p1["lat"], p1["lon"], p2["lat"], p2["lon"])
        segments.append({
            "from_pole": p1["pole_number"],
            "to_pole": p2["pole_number"],
            "distance_ft": round(dist, 1),
        })
        total_feet += dist
    
    # List poles missing GPS
    missing_gps = [p.get("pole_number", "(unnumbered)") for p in sorted_poles if not has_gps(p)]
    
    return segments, round(total_feet, 1), missing_gps


def pole_photo_items(pole: dict):
    """Return [(label, url)] for every photo present on a pole."""
    items = []
    labeled = [
        ("OCALC Left", pole.get("ocalc_left_photo")),
        ("OCALC Middle", pole.get("ocalc_middle_photo")),
        ("OCALC Right", pole.get("ocalc_right_photo")),
        ("Birthmark", pole.get("birthmark_photo")),
        ("MGNV", pole.get("mgnv_photo")),
    ]
    for i, kn in enumerate(pole.get("knuckles", []) or [], 1):
        labeled.append((f"Anchor {i}", kn.get("photo")))
    for i, att in enumerate(pole.get("attachments", []) or [], 1):
        labeled.append((f"HOA {i}", att.get("photo")))
    # Additional photos
    for i, ap in enumerate(pole.get("additional_photos", []) or [], 1):
        label = ap.get("label") or f"Additional {i}"
        labeled.append((label, ap.get("photo")))
    for label, val in labeled:
        if val:
            items.append((label, val))
    return items
