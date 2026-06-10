import re


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
    """Natural sort by pole_number so numbers compare numerically regardless of
    prefix: '1' < '2' < '10', and 'P-2' < 'P-12'."""
    pn = str(pole.get("pole_number") or "").strip().lower()
    return [(0, int(t)) if t.isdigit() else (1, t) for t in re.split(r"(\d+)", pn) if t]


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
    for label, val in labeled:
        if val:
            items.append((label, val))
    return items
