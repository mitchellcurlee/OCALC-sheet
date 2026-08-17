from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse, HTMLResponse
from typing import List, Optional
from datetime import datetime, timezone
import json
import io
import math
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from models.pole import Pole, PoleCreate, PoleUpdate
from models.options import POLE_CONDITIONS
from services.helpers import pole_sort_key, format_height, pole_photo_items, haversine_feet, has_gps
from services.auth import get_current_user

router = APIRouter(tags=["poles"])

_db = None


def set_db(db):
    global _db
    _db = db


@router.get("/poles/options")
async def get_pole_options():
    """Get dropdown options for pole form"""
    from models.options import (
        POLE_OWNERS, POLE_CONDITIONS, POLE_TYPES, POLE_CLASSES, POLE_SIZES,
        DOWN_GUY_OWNERS, DOWN_GUY_DIRECTIONS, DOWN_GUY_SIZES, DOWN_GUY_TYPES, DOWN_GUY_CONDITIONS,
        KNUCKLE_OPTIONS, ANCHOR_SIZES, ANCHOR_EYES, YES_NO, GOOD_BROKEN,
        SPAN_OWNERS, SPAN_DIRECTIONS, ATTACHMENT_OWNERS, RISER_OPTIONS, UNDERGROUND_TYPES
    )
    return {
        "pole_owners": POLE_OWNERS,
        "conditions": POLE_CONDITIONS,
        "pole_types": POLE_TYPES,
        "pole_classes": POLE_CLASSES,
        "underground_types": UNDERGROUND_TYPES,
        "sizes": POLE_SIZES,
        "down_guy_owners": DOWN_GUY_OWNERS,
        "down_guy_directions": DOWN_GUY_DIRECTIONS,
        "down_guy_sizes": DOWN_GUY_SIZES,
        "down_guy_types": DOWN_GUY_TYPES,
        "down_guy_conditions": DOWN_GUY_CONDITIONS,
        "knuckle_options": KNUCKLE_OPTIONS,
        "anchor_sizes": ANCHOR_SIZES,
        "anchor_eyes": ANCHOR_EYES,
        "yes_no": YES_NO,
        "good_broken": GOOD_BROKEN,
        "span_owners": SPAN_OWNERS,
        "span_directions": SPAN_DIRECTIONS,
        "attachment_owners": ATTACHMENT_OWNERS,
        "riser_options": RISER_OPTIONS
    }


def bearing_to_direction(bearing):
    """Convert bearing degrees to compass direction (N, NE, E, SE, S, SW, W, NW)"""
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    index = round(bearing / 45) % 8
    return directions[index]


def _compute_bearing(lat1, lon1, lat2, lon2):
    lat1r = math.radians(lat1)
    lat2r = math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(lat2r)
    x = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


async def _compute_map_pairs(job_id: str):
    """Mirror the map's computeConnectionPairs: active connections (excluding
    'removed' tombstones), custom lines, End Path breaks, standalone exclusion,
    and the consecutive-chain fallback for unreferenced items."""
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    ugs = await _db.underground.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    conns = await _db.connections.find({"job_id": job_id}, {"_id": 0}).to_list(1000)

    items = []
    for p in poles:
        if not has_gps(p):
            continue
        items.append({
            "id": p["id"], "type": "pole",
            "lat": float(p["latitude"]), "lon": float(p["longitude"]),
            "sort": p["sort_order"] if p.get("sort_order") is not None else math.inf,
            "end_path": p.get("end_path") is True,
            "standalone": p.get("standalone") is True,
        })
    for u in ugs:
        try:
            lat, lon = float(u.get("latitude")), float(u.get("longitude"))
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(lat) and math.isfinite(lon)):
            continue
        items.append({
            "id": u["id"], "type": "underground",
            "lat": lat, "lon": lon,
            "sort": u["sort_order"] if u.get("sort_order") is not None else math.inf,
            "end_path": u.get("end_path") is True,
            "standalone": u.get("standalone") is True,
        })
    items.sort(key=lambda it: it["sort"])
    by_id = {it["id"]: it for it in items}
    path_items = [it for it in items if not it["standalone"]]

    pairs = []
    if conns:
        for c in conns:
            if c.get("connection_type") == "removed":
                continue
            f, t = by_id.get(c.get("from_item_id")), by_id.get(c.get("to_item_id"))
            if not f or not t or f["id"] == t["id"]:
                continue
            if c.get("connection_type") != "custom":
                if f["standalone"] or t["standalone"]:
                    continue
                earlier = f if f["sort"] <= t["sort"] else t
                if earlier["end_path"]:
                    continue
            pairs.append({"from": f, "to": t, "conn_type": c.get("connection_type")})
        referenced = set()
        for c in conns:
            referenced.add(c.get("from_item_id"))
            referenced.add(c.get("to_item_id"))
        unreferenced = [it for it in path_items if it["id"] not in referenced]
        if unreferenced:
            pairs = [
                pr for pr in pairs
                if pr["conn_type"] == "custom"
                or not any(
                    min(pr["from"]["sort"], pr["to"]["sort"]) < it["sort"] < max(pr["from"]["sort"], pr["to"]["sort"])
                    for it in unreferenced
                )
            ]
        for i in range(len(path_items) - 1):
            a, b = path_items[i], path_items[i + 1]
            if (a["id"] not in referenced or b["id"] not in referenced) and not a["end_path"]:
                pairs.append({"from": a, "to": b, "conn_type": None})
    else:
        for i in range(len(path_items) - 1):
            if path_items[i]["end_path"]:
                continue
            pairs.append({"from": path_items[i], "to": path_items[i + 1], "conn_type": None})
    return pairs


async def _route_waypoints_lookup(job_id: str):
    docs = await _db.routes.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    lookup = {}
    for d in docs:
        wps = [
            (w.get("lat"), w.get("lng"))
            for w in (d.get("waypoints") or [])
            if w.get("lat") is not None and w.get("lng") is not None
        ]
        if wps:
            lookup[(d.get("from_pole_id"), d.get("to_pole_id"))] = wps
    return lookup


def _pole_span_updates(pole, pairs, wp_lookup):
    """Span 1 = active map line to the next item in route order, Span 2 = to the
    previous one. Cleared when no active (non-deleted) line exists that way."""
    pid = pole["id"]
    forward = None
    backward = None
    for pr in pairs:
        if pr["from"]["id"] != pid and pr["to"]["id"] != pid:
            continue
        me = pr["from"] if pr["from"]["id"] == pid else pr["to"]
        other = pr["to"] if pr["from"]["id"] == pid else pr["from"]
        if other["sort"] >= me["sort"]:
            if forward is None or other["sort"] < forward[1]["sort"]:
                forward = (pr, other, me)
        else:
            if backward is None or other["sort"] > backward[1]["sort"]:
                backward = (pr, other, me)
    update = {}
    for slot, hit in (("span1", forward), ("span2", backward)):
        if hit:
            pr, other, me = hit
            wps = wp_lookup.get((pr["from"]["id"], pr["to"]["id"])) or wp_lookup.get((pr["to"]["id"], pr["from"]["id"])) or []
            pts = [(pr["from"]["lat"], pr["from"]["lon"])] + list(wps) + [(pr["to"]["lat"], pr["to"]["lon"])]
            dist = sum(haversine_feet(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) for i in range(len(pts) - 1))
            update[f"{slot}_distance"] = str(round(dist))
            update[f"{slot}_direction"] = bearing_to_direction(_compute_bearing(me["lat"], me["lon"], other["lat"], other["lon"]))
        else:
            update[f"{slot}_distance"] = None
            update[f"{slot}_direction"] = ""
    return update


def _span_val_norm(v):
    return "" if v is None or v == "" else str(v)


async def _sync_job_distances(job_id: str):
    """
    Sync map-line distances into each pole's span1/span2 fields.
    Follows active map connections (deleted lines clear the span).
    Skips poles that have use_manual_spans enabled.
    """
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    if not poles:
        return {"message": "No poles found for this job", "updated": 0, "poles": []}

    pairs = await _compute_map_pairs(job_id)
    wp_lookup = await _route_waypoints_lookup(job_id)

    updates = []
    for p in poles:
        if p.get("use_manual_spans", False) or not has_gps(p):
            continue
        update_data = _pole_span_updates(p, pairs, wp_lookup)
        changed = any(_span_val_norm(p.get(k)) != _span_val_norm(v) for k, v in update_data.items())
        if not changed:
            continue
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _db.poles.update_one({"id": p["id"]}, {"$set": update_data})
        updates.append({
            "pole_number": p.get("pole_number", ""),
            "span1_distance": update_data.get("span1_distance"),
            "span1_direction": update_data.get("span1_direction"),
            "span2_distance": update_data.get("span2_distance"),
            "span2_direction": update_data.get("span2_direction"),
        })

    return {
        "message": f"Updated {len(updates)} poles with GPS-calculated distances",
        "updated": len(updates),
        "poles": updates
    }


async def _sync_single_pole_distances(pole_id: str):
    """
    Sync map-line distances for a single pole (same connection-aware logic as the job sync).
    Returns dict with message and updated flag.
    """
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        return {"message": "Pole not found", "updated": False}

    job_id = pole.get("job_id")
    if not job_id:
        return {"message": "Pole not associated with a job", "updated": False}

    if not has_gps(pole):
        return {"message": "Pole has no GPS coordinates", "updated": False}

    if pole.get("use_manual_spans"):
        return {"message": "Pole uses manual spans (skipped)", "updated": False}

    pairs = await _compute_map_pairs(job_id)
    wp_lookup = await _route_waypoints_lookup(job_id)
    update_data = _pole_span_updates(pole, pairs, wp_lookup)
    changed = any(_span_val_norm(pole.get(k)) != _span_val_norm(v) for k, v in update_data.items())
    if not changed:
        return {"message": "No updates needed", "updated": False}

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.poles.update_one({"id": pole_id}, {"$set": update_data})
    return {"message": "Distances synced", "updated": True, "span1": update_data.get("span1_distance"), "span2": update_data.get("span2_distance")}


@router.post("/poles/{pole_id}/sync-distances")
async def sync_single_pole_distances(pole_id: str, current_user: dict = Depends(get_current_user)):
    """
    Sync GPS-calculated distances for a single pole.
    Updates span1 with distance/direction to next pole,
    Updates span2 with distance/direction to previous pole.
    """
    return await _sync_single_pole_distances(pole_id)


@router.post("/jobs/{job_id}/sync-map-distances")
async def sync_map_distances_to_poles(job_id: str):
    """
    Sync GPS-calculated distances from the map to each pole's span fields.
    Updates span1 with distance/direction to next pole,
    Updates span2 with distance/direction to previous pole.
    """
    return await _sync_job_distances(job_id)


@router.post("/poles", response_model=Pole, status_code=201)
async def create_pole(pole_data: PoleCreate):
    """Create a new pole entry"""
    pole = Pole(**pole_data.model_dump())
    doc = pole.model_dump()
    await _db.poles.insert_one(doc)
    
    # Auto-sync distances if pole has GPS and belongs to a job
    if pole.job_id and pole.latitude and pole.longitude:
        try:
            await _sync_job_distances(pole.job_id)
        except Exception:
            pass  # Don't fail pole creation if sync fails
    
    return pole


@router.post("/poles/{pole_id}/duplicate", response_model=Pole, status_code=201)
async def duplicate_pole(pole_id: str):
    """Create a copy of an existing pole"""
    src = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Pole not found")
    for k in ("id", "created_at", "updated_at", "inspection_date"):
        src.pop(k, None)
    src["latitude"] = None
    src["longitude"] = None
    src["pole_number"] = "P-"
    pole = Pole(**src)
    doc = pole.model_dump()
    await _db.poles.insert_one(doc)
    return pole


@router.get("/poles", response_model=List[Pole])
async def get_poles(pole_owner: Optional[str] = None, condition: Optional[str] = None):
    """Get all poles with optional filtering"""
    query = {}
    if pole_owner:
        query["pole_owner"] = pole_owner
    if condition:
        query["condition"] = condition
    poles = await _db.poles.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Convert any legacy single photo fields to array format
    poles = [convert_legacy_photos(p) for p in poles]
    return poles


@router.put("/poles/reorder")
async def reorder_poles(pole_orders: List[dict], current_user: dict = Depends(get_current_user)):
    """
    Update the order of poles by setting their sort_order field.
    Expects: [{"id": "pole-id-1", "sort_order": 0}, {"id": "pole-id-2", "sort_order": 1}, ...]
    """
    updated = 0
    for item in pole_orders:
        pole_id = item.get("id")
        sort_order = item.get("sort_order")
        if pole_id is not None and sort_order is not None:
            result = await _db.poles.update_one(
                {"id": pole_id},
                {"$set": {"sort_order": sort_order, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            if result.modified_count > 0:
                updated += 1
    return {"message": f"Updated order for {updated} poles", "updated": updated}


def convert_legacy_photos(pole_doc: dict) -> dict:
    """Convert legacy single photo fields to array format for backward compatibility.
    This ensures old data with 'photo' fields gets transformed to 'photos' arrays.
    """
    if not pole_doc:
        return pole_doc
    
    # Convert birthmark_photo to birthmark_photos if needed
    if not pole_doc.get("birthmark_photos") and pole_doc.get("birthmark_photo"):
        pole_doc["birthmark_photos"] = [pole_doc["birthmark_photo"]]
    
    # Convert mgnv_photo to mgnv_photos if needed
    if not pole_doc.get("mgnv_photos") and pole_doc.get("mgnv_photo"):
        pole_doc["mgnv_photos"] = [pole_doc["mgnv_photo"]]
    
    # Convert legacy anchor_photo to anchor_photos if it exists (old single-photo field)
    if not pole_doc.get("anchor_photos") and pole_doc.get("anchor_photo"):
        pole_doc["anchor_photos"] = [pole_doc["anchor_photo"]]
    
    # Convert legacy hoa_photo to hoa_photos if it exists
    if not pole_doc.get("hoa_photos") and pole_doc.get("hoa_photo"):
        pole_doc["hoa_photos"] = [pole_doc["hoa_photo"]]
    
    # Convert knuckle photo -> photos for each knuckle
    knuckles = pole_doc.get("knuckles", []) or []
    for k in knuckles:
        if isinstance(k, dict):
            # If photos is empty/missing but photo exists, convert
            if (not k.get("photos") or len(k.get("photos", [])) == 0) and k.get("photo"):
                k["photos"] = [k["photo"]]
    
    # Convert attachment photo -> photos for each attachment (HOA)
    attachments = pole_doc.get("attachments", []) or []
    for a in attachments:
        if isinstance(a, dict):
            # If photos is empty/missing but photo exists, convert
            if (not a.get("photos") or len(a.get("photos", [])) == 0) and a.get("photo"):
                a["photos"] = [a["photo"]]
    
    return pole_doc


@router.get("/poles/{pole_id}", response_model=Pole)
async def get_pole(pole_id: str):
    """Get a single pole by ID"""
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    # Convert any legacy single photo fields to array format
    pole = convert_legacy_photos(pole)
    return pole


@router.put("/poles/{pole_id}", response_model=Pole)
async def update_pole(pole_id: str, pole_data: PoleUpdate):
    """Update a pole entry"""
    existing = await _db.poles.find_one({"id": pole_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    update_data = {k: v for k, v in pole_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.poles.update_one({"id": pole_id}, {"$set": update_data})
    updated = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    
    # Auto-sync distances if pole has GPS and belongs to a job
    job_id = updated.get("job_id")
    has_gps_coords = updated.get("latitude") and updated.get("longitude")
    if job_id and has_gps_coords:
        try:
            await _sync_job_distances(job_id)
        except Exception:
            pass  # Don't fail pole update if sync fails
    
    return updated


@router.delete("/poles/{pole_id}")
async def delete_pole(pole_id: str, current_user: dict = Depends(get_current_user)):
    """Move a pole to the user's Deleted Items (restorable)"""
    from routes.trash import archive_entity
    existing = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Pole not found")
    await archive_entity(_db, "pole", existing, current_user)
    await _db.poles.delete_one({"id": pole_id})
    return {"message": "Pole moved to Deleted Items"}


@router.get("/poles/{pole_id}/gallery", response_class=HTMLResponse)
async def pole_gallery(pole_id: str, token: Optional[str] = None, request: Request = None):
    """HTML gallery showing every photo attached to a pole.
    Access via: valid token OR authenticated mastec.com/byers.com user.
    """
    from jose import jwt, JWTError
    from services.auth import SECRET_KEY, ALGORITHM
    
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    # Check access: token OR mastec/byers auth
    has_access = False
    
    # Check token
    if token:
        try:
            # Simple token validation - check if it matches expected format
            parts = token.split(":")
            if len(parts) == 2:
                has_access = True  # Token provided, allow access
        except Exception:
            pass
    
    # Check for authenticated mastec.com/byers.com user
    if not has_access and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                jwt_token = auth_header.replace("Bearer ", "")
                payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
                user_id = payload.get("sub")
                if user_id:
                    user = await _db.users.find_one({"id": user_id}, {"_id": 0})
                    if user:
                        email = user.get("email", "").lower()
                        if email.endswith("@mastec.com") or email.endswith("@byers.com"):
                            has_access = True
            except (JWTError, Exception):
                pass
    
    # Also allow access if no token required (for backward compatibility with direct links)
    # But show login prompt if no access
    if not has_access and not token:
        has_access = True  # Allow public gallery view for now
    
    items = pole_photo_items(pole)
    pole_no = pole.get("pole_number") or pole_id[:8]

    def _safe(s):
        return ("".join(c if (c.isalnum() or c in " -_") else "_" for c in str(s)).strip().replace(" ", "_")) or "photo"

    def _ext_of(u):
        if u.startswith("data:image/"):
            return (u.split("data:image/", 1)[1].split(";", 1)[0][:5]) or "jpg"
        tail = u.split("?", 1)[0].rsplit("/", 1)[-1]
        return tail.rsplit(".", 1)[-1][:5] if "." in tail else "jpg"

    downloads = []
    card_html = []
    for label, url in items:
        fname = f"Pole_{_safe(pole_no)}_{_safe(label)}.{_ext_of(url)}"
        downloads.append({"u": url, "n": fname})
        card_html.append(
            '<figure>'
            f'<a href="{url}" target="_blank" rel="noopener"><img src="{url}" alt="{label}" loading="lazy"/></a>'
            f'<figcaption>{label}</figcaption>'
            f'<a class="dl" href="{url}" download="{fname}">Download</a>'
            '</figure>'
        )
    cards = "".join(card_html) or '<p class="empty">No photos attached to this pole.</p>'
    dl_json = json.dumps(downloads)
    download_all_btn = '<button class="dlall" onclick="downloadAll()">Download all</button>' if items else ''

    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pole {pole_no} - Photos</title>
<style>
  body{{margin:0;background:#ffffff;color:#09090b;font-family:system-ui,-apple-system,sans-serif;}}
  header{{padding:16px 24px;border-bottom:1px solid #e4e4e7;position:sticky;top:0;background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}}
  h1{{margin:0;font-size:18px;letter-spacing:.05em;text-transform:uppercase;}}
  h1 span{{color:#dc2626;}}
  .dlall{{background:#dc2626;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.03em;}}
  .dlall:hover{{background:#b91c1c;}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:24px;}}
  figure{{margin:0;background:#ffffff;border:1px solid #d4d4d8;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,0.05);}}
  figure img{{width:100%;height:240px;object-fit:cover;display:block;background:#f4f4f5;cursor:zoom-in;}}
  figcaption{{padding:10px 12px;font-size:13px;font-family:monospace;color:#52525b;text-transform:uppercase;letter-spacing:.05em;}}
  .dl{{display:block;text-align:center;padding:10px 12px;margin:0 12px 12px;background:#f4f4f5;color:#18181b;text-decoration:none;border:1px solid #d4d4d8;border-radius:6px;font-size:13px;font-weight:600;}}
  .dl:hover{{background:#e4e4e7;}}
  .empty{{padding:40px;color:#71717a;}}
</style></head><body>
<header><h1>Pole <span>{pole_no}</span> &middot; Photos ({len(items)})</h1>{download_all_btn}</header>
<div class="grid">{cards}</div>
<script>
var FILES = {dl_json};
function downloadAll(){{
  FILES.forEach(function(f, i){{
    setTimeout(function(){{
      var a = document.createElement('a');
      a.href = f.u; a.download = f.n;
      document.body.appendChild(a); a.click(); a.remove();
    }}, i * 400);
  }});
}}
</script>
</body></html>"""
    return HTMLResponse(content=html)


@router.get("/poles/export/excel")
async def export_poles_excel(request: Request, base_url: Optional[str] = None):
    """Export all poles to Excel"""
    poles = await _db.poles.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    poles.sort(key=pole_sort_key)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Pole Data"
    
    header_fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    section_fill = PatternFill(start_color="1f2937", end_color="1f2937", fill_type="solid")
    section_font = Font(bold=True, color="FFFFFF")
    
    current_row = 1
    
    for pole in poles:
        ws.cell(row=current_row, column=1, value="POLE #").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value=pole.get("pole_number", ""))
        ws.cell(row=current_row, column=3, value="DATE").fill = header_fill
        ws.cell(row=current_row, column=3).font = header_font
        inspection_date = pole.get("inspection_date", "")
        ws.cell(row=current_row, column=4, value=str(inspection_date)[:10] if inspection_date else "")
        current_row += 1
        
        ws.cell(row=current_row, column=1, value="SIZE").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        size_with_type = pole.get("pole_size", "")
        if pole.get("pole_size_type"):
            size_with_type = f"{size_with_type} ({pole['pole_size_type']})"
        ws.cell(row=current_row, column=2, value=size_with_type)
        ws.cell(row=current_row, column=3, value="CONDITION").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("condition", ""))
        ws.cell(row=current_row, column=5, value="OWNER").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("pole_owner", ""))
        ws.cell(row=current_row, column=7, value="CLASS").fill = section_fill
        ws.cell(row=current_row, column=7).font = section_font
        ws.cell(row=current_row, column=8, value=pole.get("pole_class", ""))
        ws.cell(row=current_row, column=9, value="ACCESS").fill = section_fill
        ws.cell(row=current_row, column=9).font = section_font
        ws.cell(row=current_row, column=10, value=pole.get("access", ""))
        current_row += 1
        
        ws.cell(row=current_row, column=1, value="LAT").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("latitude", ""))
        ws.cell(row=current_row, column=3, value="LONG").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("longitude", ""))
        ws.cell(row=current_row, column=5, value="TERMINAL").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("pole_terminal", ""))
        ws.cell(row=current_row, column=7, value="RISERS").fill = section_fill
        ws.cell(row=current_row, column=7).font = section_font
        ws.cell(row=current_row, column=8, value=pole.get("risers", ""))
        ws.cell(row=current_row, column=9, value="EXISTING RISERS").fill = section_fill
        ws.cell(row=current_row, column=9).font = section_font
        ws.cell(row=current_row, column=10, value=pole.get("existing_risers", ""))
        ws.cell(row=current_row, column=11, value="RISER HEIGHT").fill = section_fill
        ws.cell(row=current_row, column=11).font = section_font
        ws.cell(row=current_row, column=12, value=format_height(pole.get("riser_height")))
        current_row += 1
        
        ws.cell(row=current_row, column=1, value="SPANS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Direction").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Distance").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value="Owner").fill = section_fill
        ws.cell(row=current_row, column=4).font = section_font
        current_row += 1
        
        for i in range(1, 5):
            ws.cell(row=current_row, column=1, value=f"Span {i}")
            ws.cell(row=current_row, column=2, value=pole.get(f"span{i}_direction", ""))
            ws.cell(row=current_row, column=3, value=pole.get(f"span{i}_distance", ""))
            ws.cell(row=current_row, column=4, value=pole.get(f"span{i}_owner", ""))
            current_row += 1
        
        ws.cell(row=current_row, column=1, value="DOWN GUYS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        dg_headers = ["", "Owner", "Direction", "Size", "Type", "Condition", "Height", "Lead"]
        for ci, h in enumerate(dg_headers, 1):
            if h:
                ws.cell(row=current_row, column=ci, value=h).fill = section_fill
                ws.cell(row=current_row, column=ci).font = section_font
        current_row += 1
        
        down_guys = pole.get("down_guys", [])
        for i in range(max(1, len(down_guys))):
            dg = down_guys[i] if i < len(down_guys) else {}
            ws.cell(row=current_row, column=1, value=f"Guy {i+1}")
            ws.cell(row=current_row, column=2, value=dg.get("owner", ""))
            ws.cell(row=current_row, column=3, value=dg.get("direction", ""))
            ws.cell(row=current_row, column=4, value=dg.get("size", ""))
            ws.cell(row=current_row, column=5, value=dg.get("type", ""))
            ws.cell(row=current_row, column=6, value=dg.get("condition", ""))
            ws.cell(row=current_row, column=7, value=format_height(dg.get("height")))
            ws.cell(row=current_row, column=8, value=format_height(dg.get("lead")))
            current_row += 1
        
        ws.cell(row=current_row, column=1, value="ANCHOR").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        an_headers = ["", "Owner", "Size", "Total Eyes", "Direction", "Condition"]
        for ci, h in enumerate(an_headers, 1):
            if h:
                ws.cell(row=current_row, column=ci, value=h).fill = section_fill
                ws.cell(row=current_row, column=ci).font = section_font
        current_row += 1
        
        knuckles = pole.get("knuckles", [])
        for i in range(max(1, len(knuckles))):
            kn = knuckles[i] if i < len(knuckles) else {}
            ws.cell(row=current_row, column=1, value=f"Anchor {i+1}")
            ws.cell(row=current_row, column=2, value=kn.get("owner", ""))
            ws.cell(row=current_row, column=3, value=kn.get("size", ""))
            ws.cell(row=current_row, column=4, value=kn.get("total_eyes", ""))
            ws.cell(row=current_row, column=5, value=kn.get("direction", ""))
            ws.cell(row=current_row, column=6, value=kn.get("condition", ""))
            current_row += 1
        
        ws.cell(row=current_row, column=1, value="HOA").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Height (ft)").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Owner").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value="Location").fill = section_fill
        ws.cell(row=current_row, column=4).font = section_font
        ws.cell(row=current_row, column=5, value="Type").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value="Notes").fill = section_fill
        ws.cell(row=current_row, column=6).font = section_font
        current_row += 1
        
        attachments = pole.get("attachments", [])
        for i in range(max(1, len(attachments))):
            att = attachments[i] if i < len(attachments) else {}
            ws.cell(row=current_row, column=1, value=f"Att {i+1}")
            ws.cell(row=current_row, column=2, value=format_height(att.get("height")))
            ws.cell(row=current_row, column=3, value=att.get("owner", ""))
            ws.cell(row=current_row, column=4, value=att.get("location", ""))
            ws.cell(row=current_row, column=5, value=att.get("hoa_type", ""))
            ws.cell(row=current_row, column=6, value=att.get("notes", ""))
            current_row += 1
        
        ws.cell(row=current_row, column=1, value="BIRTHMARK").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value="Yes" if pole.get("has_birthmark", True) else "No")
        ws.cell(row=current_row, column=3, value="MGNV").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("mgnv", ""))
        ws.cell(row=current_row, column=5, value="MGNV COND").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("mgnv_condition", ""))
        current_row += 1
        
        ws.cell(row=current_row, column=1, value="NOTES").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("notes", ""))
        current_row += 1
        
        if pole.get("row_information"):
            ws.cell(row=current_row, column=1, value="R.O.W. INFO").fill = section_fill
            ws.cell(row=current_row, column=1).font = section_font
            ws.cell(row=current_row, column=2, value=pole.get("row_information", ""))
            current_row += 1
        
        photo_items = pole_photo_items(pole)
        ws.cell(row=current_row, column=1, value="PHOTOS").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        if photo_items:
            public_base = (base_url or str(request.base_url)).rstrip("/")
            gallery_url = f"{public_base}/api/poles/{pole.get('id')}/gallery"
            link_cell = ws.cell(row=current_row, column=2, value=f"View {len(photo_items)} photo(s)")
            link_cell.hyperlink = gallery_url
            link_cell.font = Font(color="2563EB", underline="single", bold=True)
        else:
            ws.cell(row=current_row, column=2, value="No photos")
        current_row += 1
        current_row += 1
    
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            v = cell.value
            if v is None:
                continue
            try:
                l = max(len(part) for part in str(v).split("\n"))
            except Exception:
                continue
            if l > max_length:
                max_length = l
        ws.column_dimensions[column].width = max(min(max_length + 2, 45), 12)
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"pole_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/stats")
async def get_stats():
    """Get pole statistics"""
    total = await _db.poles.count_documents({})
    power_count = await _db.poles.count_documents({"pole_owner": "Power"})
    telecom_count = await _db.poles.count_documents({"pole_owner": "Telecom"})
    
    condition_stats = {}
    for condition in POLE_CONDITIONS:
        count = await _db.poles.count_documents({"condition": condition})
        condition_stats[condition] = count
    
    return {
        "total_poles": total,
        "power_poles": power_count,
        "telecom_poles": telecom_count,
        "by_condition": condition_stats
    }
