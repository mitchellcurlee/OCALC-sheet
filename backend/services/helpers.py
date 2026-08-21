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
        ("Pole", pole.get("pole_photo")),
        ("OCALC Left", pole.get("ocalc_left_photo")),
        ("OCALC Middle", pole.get("ocalc_middle_photo")),
        ("OCALC Right", pole.get("ocalc_right_photo")),
    ]
    # Birthmark photos (array)
    birthmark_photos = pole.get("birthmark_photos") or []
    # Support legacy single photo field
    if not birthmark_photos and pole.get("birthmark_photo"):
        birthmark_photos = [pole.get("birthmark_photo")]
    for i, photo in enumerate(birthmark_photos, 1):
        label = "Birthmark" if len(birthmark_photos) == 1 else f"Birthmark {i}"
        labeled.append((label, photo))
    # MGNV photos (array)
    mgnv_photos = pole.get("mgnv_photos") or []
    # Support legacy single photo field
    if not mgnv_photos and pole.get("mgnv_photo"):
        mgnv_photos = [pole.get("mgnv_photo")]
    for i, photo in enumerate(mgnv_photos, 1):
        label = "MGNV" if len(mgnv_photos) == 1 else f"MGNV {i}"
        labeled.append((label, photo))
    # Anchor photos (array per knuckle)
    for i, kn in enumerate(pole.get("knuckles", []) or [], 1):
        photos = kn.get("photos") or []
        # Support legacy single photo field
        if not photos and kn.get("photo"):
            photos = [kn.get("photo")]
        for j, photo in enumerate(photos, 1):
            label = f"Anchor {i}" if len(photos) == 1 else f"Anchor {i}-{j}"
            labeled.append((label, photo))
    # Down guy photos (array per down guy, incl. measurement overlays)
    for i, dg in enumerate(pole.get("down_guys", []) or [], 1):
        photos = dg.get("photos") or []
        if not photos and dg.get("photo"):
            photos = [dg.get("photo")]
        for j, photo in enumerate(photos, 1):
            label = f"Down_Guy {i}" if len(photos) == 1 else f"Down_Guy {i}-{j}"
            labeled.append((label, photo))
    # HOA photos (array per attachment)
    for i, att in enumerate(pole.get("attachments", []) or [], 1):
        photos = att.get("photos") or []
        # Support legacy single photo field
        if not photos and att.get("photo"):
            photos = [att.get("photo")]
        for j, photo in enumerate(photos, 1):
            label = f"HOA {i}" if len(photos) == 1 else f"HOA {i}-{j}"
            labeled.append((label, photo))
    # HOA Markup photos (array with annotations)
    hoa_markup_photos = pole.get("hoa_markup_photos") or []
    for i, photo in enumerate(hoa_markup_photos, 1):
        label = "HOA_Markup" if len(hoa_markup_photos) == 1 else f"HOA_Markup_{i}"
        labeled.append((label, photo))
    # General Pole Markup photos (array with annotations)
    pole_markup_photos = pole.get("pole_markup_photos") or []
    for i, photo in enumerate(pole_markup_photos, 1):
        label = "Pole_Markup" if len(pole_markup_photos) == 1 else f"Pole_Markup_{i}"
        labeled.append((label, photo))
    # Unsorted staged photos from the form's top gallery
    staged = pole.get("staged_photos") or []
    # Auto-label toggle: name them "P{n} Photo" instead of "Unsorted"
    staged_base = f"P{pole.get('pole_number')} Photo" if pole.get("auto_label_unsorted") and pole.get("pole_number") else ("Photo" if pole.get("auto_label_unsorted") else "Unsorted")
    for i, photo in enumerate(staged, 1):
        label = staged_base if len(staged) == 1 else f"{staged_base}_{i}"
        labeled.append((label, photo))
    for label, val in labeled:
        if val:
            items.append((label, val))
    return items


def underground_photo_items(ug: dict):
    """Return [(label, url)] for every photo present on an underground item."""
    items = []
    ug_type = ug.get("type", "UG")
    ug_label = ug.get("label", "")
    base_name = f"{ug_type}_{ug_label}" if ug_label else ug_type
    
    # Photos array
    photos = ug.get("photos") or []
    # Support legacy single photo field
    if not photos and ug.get("photo"):
        photos = [ug.get("photo")]
    
    for i, photo in enumerate(photos, 1):
        label = base_name if len(photos) == 1 else f"{base_name}_{i}"
        items.append((label, photo))
    # Unsorted staged photos from the form's top gallery
    staged = ug.get("staged_photos") or []
    staged_suffix = "Photo" if ug.get("auto_label_unsorted") else "Unsorted"
    for i, photo in enumerate(staged, 1):
        label = f"{base_name}_{staged_suffix}" if len(staged) == 1 else f"{base_name}_{staged_suffix}_{i}"
        items.append((label, photo))
    
    return items
