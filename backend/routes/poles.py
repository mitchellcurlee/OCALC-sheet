from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from typing import List, Optional
from datetime import datetime, timezone
import json
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from models.pole import Pole, PoleCreate, PoleUpdate
from models.options import POLE_CONDITIONS
from services.helpers import pole_sort_key, format_height, pole_photo_items, haversine_feet, has_gps

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


async def _sync_job_distances(job_id: str):
    """
    Internal helper to sync GPS-calculated distances for a job.
    Returns dict with message, updated count, and pole details.
    Skips poles that have use_manual_spans enabled.
    """
    import math
    
    # Get all poles for this job
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    if not poles:
        return {"message": "No poles found for this job", "updated": 0, "poles": []}
    
    # Create a lookup for manual spans setting
    manual_spans_lookup = {p["id"]: p.get("use_manual_spans", False) for p in poles}
    
    # Sort poles by natural order (same as map display)
    sorted_poles = sorted(poles, key=pole_sort_key)
    
    # Filter to only poles with valid GPS
    route_poles = []
    for p in sorted_poles:
        if has_gps(p):
            route_poles.append({
                "id": p["id"],
                "pole_number": p.get("pole_number", ""),
                "lat": float(p.get("latitude")),
                "lon": float(p.get("longitude")),
            })
    
    if len(route_poles) < 2:
        return {"message": "Need at least 2 poles with GPS to sync distances", "updated": 0, "poles": []}
    
    updates = []
    
    for i, pole in enumerate(route_poles):
        # Skip if this pole has manual spans enabled
        if manual_spans_lookup.get(pole["id"], False):
            continue
            
        update_data = {}
        
        # Calculate distance/direction to NEXT pole (span1)
        if i < len(route_poles) - 1:
            next_pole = route_poles[i + 1]
            dist_to_next = haversine_feet(pole["lat"], pole["lon"], next_pole["lat"], next_pole["lon"])
            
            # Calculate bearing to next pole
            lat1 = math.radians(pole["lat"])
            lat2 = math.radians(next_pole["lat"])
            dlon = math.radians(next_pole["lon"] - pole["lon"])
            y = math.sin(dlon) * math.cos(lat2)
            x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
            bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
            
            update_data["span1_distance"] = str(round(dist_to_next))
            update_data["span1_direction"] = bearing_to_direction(bearing)
        
        # Calculate distance/direction to PREVIOUS pole (span2)
        if i > 0:
            prev_pole = route_poles[i - 1]
            dist_to_prev = haversine_feet(pole["lat"], pole["lon"], prev_pole["lat"], prev_pole["lon"])
            
            # Calculate bearing to previous pole
            lat1 = math.radians(pole["lat"])
            lat2 = math.radians(prev_pole["lat"])
            dlon = math.radians(prev_pole["lon"] - pole["lon"])
            y = math.sin(dlon) * math.cos(lat2)
            x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
            bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
            
            update_data["span2_distance"] = str(round(dist_to_prev))
            update_data["span2_direction"] = bearing_to_direction(bearing)
        
        if update_data:
            update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            await _db.poles.update_one(
                {"id": pole["id"]},
                {"$set": update_data}
            )
            updates.append({
                "pole_number": pole["pole_number"],
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
    return poles


@router.get("/poles/{pole_id}", response_model=Pole)
async def get_pole(pole_id: str):
    """Get a single pole by ID"""
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
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
async def delete_pole(pole_id: str):
    """Delete a pole entry"""
    result = await _db.poles.delete_one({"id": pole_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pole not found")
    return {"message": "Pole deleted successfully"}


@router.get("/poles/{pole_id}/gallery", response_class=HTMLResponse)
async def pole_gallery(pole_id: str):
    """Public HTML gallery showing every photo attached to a pole"""
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
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
        an_headers = ["", "Size", "Total Eyes", "Direction", "Condition"]
        for ci, h in enumerate(an_headers, 1):
            if h:
                ws.cell(row=current_row, column=ci, value=h).fill = section_fill
                ws.cell(row=current_row, column=ci).font = section_font
        current_row += 1
        
        knuckles = pole.get("knuckles", [])
        for i in range(max(1, len(knuckles))):
            kn = knuckles[i] if i < len(knuckles) else {}
            ws.cell(row=current_row, column=1, value=f"Anchor {i+1}")
            ws.cell(row=current_row, column=2, value=kn.get("size", ""))
            ws.cell(row=current_row, column=3, value=kn.get("total_eyes", ""))
            ws.cell(row=current_row, column=4, value=kn.get("direction", ""))
            ws.cell(row=current_row, column=5, value=kn.get("condition", ""))
            current_row += 1
        
        ws.cell(row=current_row, column=1, value="HOA").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Height (ft)").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Owner").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value="Notes").fill = section_fill
        ws.cell(row=current_row, column=4).font = section_font
        current_row += 1
        
        attachments = pole.get("attachments", [])
        for i in range(max(1, len(attachments))):
            att = attachments[i] if i < len(attachments) else {}
            ws.cell(row=current_row, column=1, value=f"Att {i+1}")
            ws.cell(row=current_row, column=2, value=format_height(att.get("height")))
            ws.cell(row=current_row, column=3, value=att.get("owner", ""))
            ws.cell(row=current_row, column=4, value=att.get("notes", ""))
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
        
        photo_items = pole_photo_items(pole)
        ws.cell(row=current_row, column=1, value="PHOTOS").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        if photo_items:
            # Create direct links to each photo file
            public_base = (base_url or str(request.base_url)).rstrip("/")
            col = 2
            for label, photo_url in photo_items:
                # Ensure photo URL is absolute
                if photo_url.startswith("/"):
                    full_url = f"{public_base}{photo_url}"
                elif photo_url.startswith("http"):
                    full_url = photo_url
                else:
                    full_url = f"{public_base}/api/files/{photo_url}"
                
                link_cell = ws.cell(row=current_row, column=col, value=label)
                link_cell.hyperlink = full_url
                link_cell.font = Font(color="2563EB", underline="single", bold=True)
                col += 1
                if col > 12:  # Don't exceed column limit, wrap to next row
                    current_row += 1
                    col = 2
        else:
            ws.cell(row=current_row, column=2, value="No photos")
        current_row += 1
        current_row += 1
    
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except Exception:
                pass
        adjusted_width = min(max_length + 2, 30)
        ws.column_dimensions[column].width = max(adjusted_width, 12)
    
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
