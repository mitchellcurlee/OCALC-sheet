import io
import math
import zipfile
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from services.auth import get_current_user
from services.helpers import format_height, haversine_feet

router = APIRouter(tags=["kmz"])
_db = None


def set_db(db):
    global _db
    _db = db


def _f(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _kml_color(hex_color: str, alpha: str = "ff") -> str:
    """#rrggbb → KML aabbggrr"""
    h = (hex_color or "#f59e0b").lstrip("#")
    if len(h) != 6:
        h = "f59e0b"
    return f"{alpha}{h[4:6]}{h[2:4]}{h[0:2]}"


def _row(k, v):
    return f"<tr><td><b>{escape(str(k))}</b></td><td>{escape(str(v))}</td></tr>" if v not in (None, "", [], {}) else ""


def _table(rows):
    body = "".join(_row(k, v) for k, v in rows)
    return f"<![CDATA[<table border='1' cellpadding='3' style='border-collapse:collapse;font-family:monospace;font-size:12px'>{body}</table>]]>"


def _placemark(name, desc_rows, lat, lon, style):
    return (f"<Placemark><name>{escape(str(name))}</name><styleUrl>#{style}</styleUrl>"
            f"<description>{_table(desc_rows)}</description>"
            f"<Point><coordinates>{lon:.7f},{lat:.7f},0</coordinates></Point></Placemark>")


def _pole_rows(p):
    hoa = "; ".join(f"{a.get('owner') or ''} {a.get('hoa_type') or ''} @ {format_height(a.get('height'))}".strip() for a in (p.get("attachments") or []) if a)
    dg = "; ".join(f"{format_height(d.get('height'))} {d.get('lead') or ''}".strip() for d in (p.get("down_guys") or []) if d)
    return [
        ("Type", "Pole" + (f" · Terminal: {p['pole_terminal']}" if p.get("pole_terminal") else "")), ("Pole #", p.get("pole_number")), ("Latitude", p.get("latitude")), ("Longitude", p.get("longitude")),
        ("Address", p.get("address")), ("Height", format_height(p.get("height")) if p.get("height") else None), ("Class", p.get("pole_class")),
        ("Condition", p.get("condition")), ("Owner", p.get("pole_owner")),
        ("Span 1", f"{p['span1_distance']} ft" if _f(p.get("span1_distance")) else None), ("Span 2", f"{p['span2_distance']} ft" if _f(p.get("span2_distance")) else None),
        ("New risers", f"{p.get('risers')} × {format_height(p.get('riser_height'))}" if p.get("risers") and _f(p.get("risers")) else None), ("Existing risers", p.get("existing_risers")),
        ("HOA attachments", hoa), ("Down guys", dg), ("Pole Line Start", "Yes" if p.get("pole_line_start") else None), ("Pole Line End", "Yes" if p.get("pole_line_end") else None),
        ("End Path", "Yes" if p.get("end_path") else None), ("Standalone", "Yes" if p.get("standalone") else None), ("Notes", p.get("notes")),
    ]


def _path_text(u):
    pms = [m for m in (u.get("path_measurements") or []) if _f(m.get("feet"))]
    if not pms:
        return None
    parts = [f"{m.get('direction') or ''} {float(m['feet']):g}ft" + (f" to {m['to']}" if m.get("to") else "") for m in pms]
    return ", ".join(parts) + f" = {sum(float(m['feet']) for m in pms):g} ft"


def _ug_rows(u):
    return [
        ("Type", u.get("type")), ("Subtype", u.get("material_type")), ("Label", u.get("label")), ("Latitude", u.get("latitude")), ("Longitude", u.get("longitude")),
        ("Address", u.get("address")), ("Class", (u.get("aerial_override") or "").capitalize() or None), ("FID", (u.get("fid") or "") + (" (Primary)" if u.get("primary_fid") else "") or None),
        ("Path measurements", _path_text(u)), ("Tie-in measurements", u.get("tie_in_measurements")), ("SOC Start", "Yes" if u.get("soc_start") else None), ("SOC End", "Yes" if u.get("soc_end") else None),
        ("End Path", "Yes" if u.get("end_path") else None), ("Standalone", "Yes" if u.get("standalone") else None), ("Notes", u.get("notes")),
    ]


@router.get("/jobs/{job_id}/export/kmz")
async def export_job_kmz(job_id: str, current_user: dict = Depends(get_current_user)):
    """Google Earth KMZ: GPS, labels, attribute types, measurements and notes for every pole / underground item, plus map lines and areas. No photos."""
    from routes.jobs import can_view_job
    from routes.poles import _compute_map_pairs, _route_waypoints_lookup
    job = await can_view_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).sort("sort_order", 1).to_list(2000)
    ugs = await _db.underground.find({"job_id": job_id}, {"_id": 0}).sort("sort_order", 1).to_list(2000)
    anns = await _db.annotations.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    pairs = await _compute_map_pairs(job_id)
    wps = await _route_waypoints_lookup(job_id)

    by_id = {}
    pole_pm, aerial_pm, ug_pm = [], [], []
    for p in poles:
        lat, lon = _f(p.get("latitude")), _f(p.get("longitude"))
        if lat is None or lon is None:
            continue
        by_id[p["id"]] = (lat, lon, f"Pole {p.get('pole_number') or ''}".strip(), "pole")
        pole_pm.append(_placemark(f"Pole {p.get('pole_number') or ''}".strip(), _pole_rows(p), lat, lon, "pole"))
    for u in ugs:
        lat, lon = _f(u.get("latitude")), _f(u.get("longitude"))
        if lat is None or lon is None:
            continue
        name = f"{u.get('type') or 'Item'}" + (f" · {u['label']}" if u.get("label") and u.get("label") != u.get("type") else "")
        is_aerial = (u.get("aerial_override") == "aerial") or (u.get("aerial_override") != "underground" and u.get("type") in {"Aerial Splice", "Loop", "Power", "X-Messenger", "Eyebolt", "Pullbox", "Weather Head", "Aerial NTE", "Aerial PI", "Aerial FBT"})
        by_id[u["id"]] = (lat, lon, name, "aerial" if is_aerial else "ug")
        (aerial_pm if is_aerial else ug_pm).append(_placemark(name, _ug_rows(u), lat, lon, "aerial" if is_aerial else "ug"))

    # Map lines (same pairs as the interactive map; waypoints honored)
    lines = []
    for i, pr in enumerate(pairs, 1):
        a, b = by_id.get(pr["from"]["id"]), by_id.get(pr["to"]["id"])
        if not a or not b:
            continue
        pts = [(a[0], a[1])] + [(w[0], w[1]) for w in (wps.get((pr["from"]["id"], pr["to"]["id"])) or wps.get((pr["to"]["id"], pr["from"]["id"]), [])[::-1])] + [(b[0], b[1])]
        feet = sum(haversine_feet(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]) for k in range(len(pts) - 1))
        aerial = a[3] in ("pole", "aerial") and b[3] in ("pole", "aerial")
        coords = " ".join(f"{lo:.7f},{la:.7f},0" for la, lo in pts)
        lines.append(f"<Placemark><name>{i}. {escape(a[2])} to {escape(b[2])} = {feet:.0f} ft</name><styleUrl>#{'aerialLine' if aerial else 'ugLine'}</styleUrl>"
                     f"<description>{_table([('From', a[2]), ('To', b[2]), ('Distance', f'{feet:.1f} ft'), ('Class', 'Aerial' if aerial else 'Underground')])}</description>"
                     f"<LineString><tessellate>1</tessellate><coordinates>{coords}</coordinates></LineString></Placemark>")

    # Annotations: measurements, notes, polygon / DA areas
    meas, notes, areas = [], [], []
    for a in anns:
        t = a.get("type")
        lat, lon = _f(a.get("latitude")), _f(a.get("longitude"))
        if t == "measurement" and lat is not None and _f(a.get("end_latitude")) is not None:
            d = a.get("distance_ft") or haversine_feet(lat, lon, float(a["end_latitude"]), float(a["end_longitude"]))
            meas.append(f"<Placemark><name>{escape(a.get('text') or 'Measurement')} = {float(d):.0f} ft</name><styleUrl>#measLine</styleUrl>"
                        f"<LineString><tessellate>1</tessellate><coordinates>{lon:.7f},{lat:.7f},0 {float(a['end_longitude']):.7f},{float(a['end_latitude']):.7f},0</coordinates></LineString></Placemark>")
        elif t in ("polygon", "da") and a.get("points"):
            ring = [(float(p[0]), float(p[1])) for p in a["points"] if len(p) >= 2] 
            if len(ring) >= 3:
                ring.append(ring[0])
                coords = " ".join(f"{lo:.7f},{la:.7f},0" for la, lo in ring)
                areas.append(f"<Placemark><name>{escape(a.get('text') or ('DA' if t == 'da' else 'Polygon'))}</name><styleUrl>#{'daArea' if t == 'da' else 'polyArea'}</styleUrl>"
                             f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>")
        elif lat is not None and lon is not None:
            notes.append(_placemark(a.get("text") or "Note", [("Note", a.get("text")), ("Latitude", lat), ("Longitude", lon)], lat, lon, "note"))

    def folder(name, items):
        return f"<Folder><name>{escape(name)} ({len(items)})</name>{''.join(items)}</Folder>" if items else ""

    def icon_style(sid, color, icon="http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png", scale="1.1"):
        return (f"<Style id='{sid}'><IconStyle><color>{_kml_color(color)}</color><scale>{scale}</scale><Icon><href>{icon}</href></Icon></IconStyle>"
                f"<LabelStyle><scale>0.9</scale></LabelStyle></Style>")

    def line_style(sid, color, width="3"):
        return f"<Style id='{sid}'><LineStyle><color>{_kml_color(color)}</color><width>{width}</width></LineStyle></Style>"

    def area_style(sid, color):
        return f"<Style id='{sid}'><LineStyle><color>{_kml_color(color)}</color><width>2</width></LineStyle><PolyStyle><color>{_kml_color(color, '55')}</color></PolyStyle></Style>"

    styles = (icon_style("pole", "#dc2626") + icon_style("aerial", "#2563eb") + icon_style("ug", "#16a34a") + icon_style("note", "#f59e0b", "http://maps.google.com/mapfiles/kml/shapes/info-i.png", "1.0")
              + line_style("aerialLine", "#2563eb") + line_style("ugLine", "#16a34a") + line_style("measLine", "#f59e0b", "2") + area_style("polyArea", "#2563eb") + area_style("daArea", "#dc2626"))
    name = job.get("name") or job.get("site_id") or "Job"
    desc = _table([("Job", job.get("name")), ("Site ID", job.get("site_id")), ("Job type", job.get("job_type")), ("Address", job.get("location")), ("Description", job.get("description")),
                   ("Poles", len(pole_pm)), ("Aerial attributes", len(aerial_pm)), ("Underground attributes", len(ug_pm)), ("Map lines", len(lines)), ("Measurements", len(meas)), ("Notes", len(notes))])
    kml = ("<?xml version='1.0' encoding='UTF-8'?><kml xmlns='http://www.opengis.net/kml/2.2'><Document>"
           f"<name>{escape(name)}</name><description>{desc}</description>{styles}"
           + folder("Poles", pole_pm) + folder("Aerial attributes", aerial_pm) + folder("Underground attributes", ug_pm)
           + folder("Map lines (spans)", lines) + folder("Measurements", meas) + folder("Notes", notes) + folder("Areas (Polygon / DA)", areas)
           + "</Document></kml>")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("doc.kml", kml.encode("utf-8"))
    buf.seek(0)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name) or "Job"
    return StreamingResponse(buf, media_type="application/vnd.google-earth.kmz", headers={"Content-Disposition": f'attachment; filename="{safe}.kmz"'})
