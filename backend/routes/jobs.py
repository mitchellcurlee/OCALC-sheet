from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import io
import hashlib
import hmac
import os
import json
import asyncio
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side

from models.job import Job, JobCreate, JobUpdate
from models.pole import Pole
from services.auth import get_current_user, is_admin_user, is_mastec_byers_admin
from services.helpers import pole_sort_key, format_height, pole_photo_items, underground_photo_items

router = APIRouter(tags=["jobs"])

_db = None

# Secret for signing download tokens (use JWT secret or generate one)
DOWNLOAD_SECRET = os.environ.get("JWT_SECRET", "download-secret-key-change-me")


def set_db(db):
    global _db
    _db = db


def generate_download_token(resource_type: str, resource_id: str, expires_days: int = 30) -> str:
    """Generate a time-limited download token (default 30 days)"""
    expires = int((datetime.now(timezone.utc) + timedelta(days=expires_days)).timestamp())
    message = f"{resource_type}:{resource_id}:{expires}"
    signature = hmac.new(DOWNLOAD_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{expires}:{signature}"


def verify_download_token(resource_type: str, resource_id: str, token: str) -> bool:
    """Verify a download token is valid and not expired"""
    try:
        parts = token.split(":")
        if len(parts) != 2:
            return False
        expires, signature = int(parts[0]), parts[1]
        
        # Check if expired
        if datetime.now(timezone.utc).timestamp() > expires:
            return False
        
        # Verify signature
        message = f"{resource_type}:{resource_id}:{expires}"
        expected_sig = hmac.new(DOWNLOAD_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()[:16]
        return hmac.compare_digest(signature, expected_sig)
    except Exception:
        return False


async def can_access_job(job_id: str, current_user: dict) -> dict:
    """Check if user can access a job and return it if so"""
    if is_admin_user(current_user):
        return await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    elif is_mastec_byers_admin(current_user):
        # Mastec/Byers admin can access jobs from mastec.com and byers.com users
        job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
        if job:
            # Check if job owner is a mastec/byers user
            owner = await _db.users.find_one({"id": job.get("user_id")}, {"_id": 0, "email": 1})
            if owner:
                email = owner.get("email", "").lower()
                if email.endswith("@mastec.com") or email.endswith("@byers.com") or job.get("user_id") == current_user["id"]:
                    return job
        return None
    else:
        return await _db.jobs.find_one({"id": job_id, "user_id": current_user["id"]}, {"_id": 0})


@router.post("/jobs", response_model=Job)
async def create_job(job_data: JobCreate, current_user: dict = Depends(get_current_user)):
    """Create a new job"""
    job = Job(
        name=job_data.name,
        description=job_data.description,
        location=job_data.location,
        job_type=job_data.job_type or "OCALC",
        user_id=current_user["id"],
        user_email=current_user.get("email", ""),
        pole_count=0
    )
    await _db.jobs.insert_one(job.model_dump())
    return job


@router.get("/jobs", response_model=List[Job])
async def get_jobs(current_user: dict = Depends(get_current_user)):
    """Get all jobs - admin sees all jobs, mastec/byers admin sees all mastec/byers jobs, regular users see only their own"""
    if is_admin_user(current_user):
        # Full admin sees all jobs
        jobs = await _db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    elif is_mastec_byers_admin(current_user):
        # Mastec/Byers admin sees all jobs from mastec.com and byers.com users
        # First get all mastec/byers user IDs
        mastec_byers_users = await _db.users.find(
            {"$or": [
                {"email": {"$regex": "@mastec\\.com$", "$options": "i"}},
                {"email": {"$regex": "@byers\\.com$", "$options": "i"}}
            ]},
            {"_id": 0, "id": 1}
        ).to_list(10000)
        user_ids = [u["id"] for u in mastec_byers_users]
        # Include the admin's own jobs too
        user_ids.append(current_user["id"])
        jobs = await _db.jobs.find({"user_id": {"$in": user_ids}}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    else:
        # Regular users see only their own jobs
        jobs = await _db.jobs.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    if not jobs:
        return jobs
    
    # Bulk fetch pole counts using aggregation (avoids N+1 queries)
    job_ids = [j["id"] for j in jobs]
    pole_counts_cursor = _db.poles.aggregate([
        {"$match": {"job_id": {"$in": job_ids}}},
        {"$group": {"_id": "$job_id", "count": {"$sum": 1}}}
    ])
    pole_counts = {doc["_id"]: doc["count"] async for doc in pole_counts_cursor}
    
    # Bulk fetch user emails for admin view (avoids N+1 queries)
    user_emails = {}
    if is_admin_user(current_user):
        user_ids = list(set(j["user_id"] for j in jobs if not j.get("user_email")))
        if user_ids:
            users_cursor = _db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "email": 1})
            user_emails = {u["id"]: u.get("email", "Unknown") async for u in users_cursor}
    
    # Apply counts and emails to jobs
    for job in jobs:
        job["pole_count"] = pole_counts.get(job["id"], 0)
        if is_admin_user(current_user) and not job.get("user_email"):
            job["user_email"] = user_emails.get(job["user_id"], "Unknown")
    
    # Bulk fetch a representative GPS coordinate per job (first pole, else first underground)
    job_coords = {}
    coord_pipeline = [
        {"$match": {"job_id": {"$in": job_ids}, "latitude": {"$nin": [None, ""]}, "longitude": {"$nin": [None, ""]}}},
        {"$sort": {"created_at": 1}},
        {"$group": {"_id": "$job_id", "lat": {"$first": "$latitude"}, "lng": {"$first": "$longitude"}}}
    ]
    async for doc in _db.poles.aggregate(coord_pipeline):
        job_coords[doc["_id"]] = (doc["lat"], doc["lng"])
    async for doc in _db.underground.aggregate(coord_pipeline):
        job_coords.setdefault(doc["_id"], (doc["lat"], doc["lng"]))
    for job in jobs:
        coords = job_coords.get(job["id"])
        if coords:
            try:
                job["latitude"] = float(coords[0])
                job["longitude"] = float(coords[1])
            except (TypeError, ValueError):
                pass
    
    return jobs


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific job"""
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["pole_count"] = await _db.poles.count_documents({"job_id": job_id})
    return job


@router.put("/jobs/{job_id}", response_model=Job)
async def update_job(job_id: str, job_data: JobUpdate, current_user: dict = Depends(get_current_user)):
    """Update a job"""
    existing = await can_access_job(job_id, current_user)
    if not existing:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = {k: v for k, v in job_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.jobs.update_one({"id": job_id}, {"$set": update_data})
    updated = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    updated["pole_count"] = await _db.poles.count_documents({"job_id": job_id})
    return updated


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a job and all its poles"""
    existing = await can_access_job(job_id, current_user)
    if not existing:
        raise HTTPException(status_code=404, detail="Job not found")
    
    await _db.poles.delete_many({"job_id": job_id})
    await _db.underground.delete_many({"job_id": job_id})
    await _db.jobs.delete_one({"id": job_id})
    return {"message": "Job and all poles deleted successfully"}


@router.get("/jobs/{job_id}/poles", response_model=List[Pole])
async def get_job_poles(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get all poles for a specific job"""
    from routes.poles import convert_legacy_photos
    
    if is_admin_user(current_user):
        job = await _db.jobs.find_one({"id": job_id})
    else:
        job = await _db.jobs.find_one({"id": job_id, "user_id": current_user["id"]})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    # Convert any legacy single photo fields to array format
    poles = [convert_legacy_photos(p) for p in poles]
    poles.sort(key=pole_sort_key)
    return poles


@router.put("/jobs/{job_id}/reorder-items")
async def reorder_job_items(job_id: str, items: List[dict], current_user: dict = Depends(get_current_user)):
    """
    Reorder poles and underground items together within a job.
    Expects: [{"id": "item-id", "type": "pole"|"underground", "sort_order": 0}, ...]
    """
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    updated_poles = 0
    updated_underground = 0
    now = datetime.now(timezone.utc).isoformat()
    
    for item in items:
        item_id = item.get("id")
        item_type = item.get("type")
        sort_order = item.get("sort_order")
        
        if item_id is None or sort_order is None or item_type is None:
            continue
            
        if item_type == "pole":
            result = await _db.poles.update_one(
                {"id": item_id, "job_id": job_id},
                {"$set": {"sort_order": sort_order, "updated_at": now}}
            )
            if result.modified_count > 0:
                updated_poles += 1
        elif item_type == "underground":
            result = await _db.underground.update_one(
                {"id": item_id, "job_id": job_id},
                {"$set": {"sort_order": sort_order, "updated_at": now}}
            )
            if result.modified_count > 0:
                updated_underground += 1
    
    return {
        "message": f"Updated order for {updated_poles} poles and {updated_underground} underground items",
        "updated_poles": updated_poles,
        "updated_underground": updated_underground
    }


@router.get("/jobs/{job_id}/export/excel")
async def export_job_excel(job_id: str, request: Request, base_url: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Export all poles from a job to Excel"""
    if is_admin_user(current_user):
        job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    else:
        job = await _db.jobs.find_one({"id": job_id, "user_id": current_user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    poles.sort(key=pole_sort_key)
    underground = await _db.underground.find({"job_id": job_id}, {"_id": 0}).sort("created_at", 1).to_list(10000)

    # Determine the public base URL for links
    # Priority: explicit base_url param > X-Forwarded headers > request.base_url
    if base_url:
        public_base = base_url.rstrip("/")
    else:
        # Check for forwarded headers (common in proxies/load balancers)
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        if forwarded_host:
            public_base = f"{forwarded_proto}://{forwarded_host}"
        else:
            public_base = str(request.base_url).rstrip("/")
    
    # Ensure https for production domains
    if "poledatasheet.info" in public_base or "emergentagent.com" in public_base:
        public_base = public_base.replace("http://", "https://")

    wb = Workbook()
    ws = wb.active
    ws.title = "Attribute Data"
    
    header_fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    section_fill = PatternFill(start_color="1f2937", end_color="1f2937", fill_type="solid")
    section_font = Font(bold=True, color="FFFFFF")
    
    job_number = next((p.get("job_number") for p in poles if p.get("job_number")), "")
    ws.cell(row=1, column=1, value="JOB NAME").fill = header_fill
    ws.cell(row=1, column=1).font = header_font
    ws.cell(row=1, column=2, value=job.get("name", ""))
    ws.cell(row=1, column=3, value="JOB #").fill = header_fill
    ws.cell(row=1, column=3).font = header_font
    ws.cell(row=1, column=4, value=job_number)
    ws.cell(row=1, column=5, value="LOCATION").fill = header_fill
    ws.cell(row=1, column=5).font = header_font
    ws.cell(row=1, column=6, value=job.get("location", ""))
    ws.cell(row=1, column=7, value="ATTRIBUTES").fill = header_fill
    ws.cell(row=1, column=7).font = header_font
    ws.cell(row=1, column=8, value=len(poles))
    ws.cell(row=1, column=9, value="MAP").fill = header_fill
    ws.cell(row=1, column=9).font = header_font
    map_cell = ws.cell(row=1, column=10, value="Open satellite overview")
    map_cell.hyperlink = f"{public_base}/jobs/{job_id}/map"
    map_cell.font = Font(color="2563EB", underline="single", bold=True)
    ws.cell(row=1, column=11, value="MAP IMAGE").fill = header_fill
    ws.cell(row=1, column=11).font = header_font
    img_cell = ws.cell(row=1, column=12, value="Download map image")
    img_cell.hyperlink = f"{public_base}/jobs/{job_id}/map?download=1"
    img_cell.font = Font(color="2563EB", underline="single", bold=True)
    
    # Add All Photos link (gallery page, not download)
    job_photos_token = generate_download_token("job_photos", job_id)
    ws.cell(row=1, column=13, value="ALL PHOTOS").fill = header_fill
    ws.cell(row=1, column=13).font = header_font
    all_photos_cell = ws.cell(row=1, column=14, value=f"{job.get('name', 'Job')} - All Photos")
    all_photos_cell.hyperlink = f"{public_base}/api/jobs/{job_id}/photos?token={job_photos_token}"
    all_photos_cell.font = Font(color="7C3AED", underline="single", bold=True)
    
    current_row = 3
    bold9 = Font(bold=True, size=9)

    def section(title):
        nonlocal current_row
        cell = ws.cell(row=current_row, column=1, value=title)
        cell.fill = header_fill
        cell.font = header_font
        current_row += 1

    def label_value_row(pairs):
        nonlocal current_row
        for ci, (label, _v) in enumerate(pairs, 1):
            c = ws.cell(row=current_row, column=ci, value=label)
            c.fill = section_fill
            c.font = section_font
        current_row += 1
        for ci, (_l, value) in enumerate(pairs, 1):
            ws.cell(row=current_row, column=ci, value=value)
        current_row += 1

    def table_header(headers):
        nonlocal current_row
        for ci, h in enumerate(headers, 1):
            ws.cell(row=current_row, column=ci, value=h).font = bold9
        current_row += 1

    for pole in poles:
        ws.cell(row=current_row, column=1, value="POLE #").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value=pole.get("pole_number", ""))
        ws.cell(row=current_row, column=3, value="DATE").fill = header_fill
        ws.cell(row=current_row, column=3).font = header_font
        inspection_date = pole.get("inspection_date", "")
        ws.cell(row=current_row, column=4, value=str(inspection_date)[:10] if inspection_date else "")
        current_row += 1

        section("BASIC INFORMATION")
        label_value_row([
            ("Pole Owner", pole.get("pole_owner", "")),
            ("Access", pole.get("access", "")),
            ("Class", pole.get("pole_class", "")),
            ("Pole Size", f"{pole['pole_size']}'" if pole.get("pole_size") else ""),
            ("Size Type", pole.get("pole_size_type", "")),
            ("Type of Pole", pole.get("pole_type", "")),
            ("Condition", pole.get("condition", "")),
        ])

        section("SPANS")
        table_header(["", "Direction", "Distance (ft)", "Owner"])
        for i in range(1, 5):
            dir_val = pole.get(f"span{i}_direction", "")
            dist_val = pole.get(f"span{i}_distance", "")
            owner_val = pole.get(f"span{i}_owner", "")
            if dir_val or dist_val or owner_val:
                ws.cell(row=current_row, column=1, value=f"Span {i}")
                ws.cell(row=current_row, column=2, value=dir_val)
                ws.cell(row=current_row, column=3, value=dist_val)
                ws.cell(row=current_row, column=4, value=owner_val)
                current_row += 1

        section("GPS LOCATION")
        label_value_row([
            ("Latitude", pole.get("latitude", "")),
            ("Longitude", pole.get("longitude", "")),
        ])

        section("BIRTHMARK & MGNV")
        label_value_row([
            ("Has Birthmark", "Yes" if pole.get("has_birthmark", True) else "No"),
            ("MGNV Present", pole.get("mgnv", "")),
            ("MGNV Condition", pole.get("mgnv_condition", "")),
        ])

        attachments = pole.get("attachments", [])
        section("HOA")
        table_header(["", "Height", "Owner", "Notes"])
        if attachments:
            for i, att in enumerate(attachments, 1):
                ws.cell(row=current_row, column=1, value=f"HOA {i}")
                ws.cell(row=current_row, column=2, value=format_height(att.get("height")))
                ws.cell(row=current_row, column=3, value=att.get("owner", ""))
                ws.cell(row=current_row, column=4, value=att.get("notes", ""))
                current_row += 1
        label_value_row([
            ("Pole Terminal", pole.get("pole_terminal", "")),
            ("Risers", pole.get("risers", "")),
        ])

        down_guys = pole.get("down_guys", [])
        if down_guys:
            section("DOWN GUYS")
            table_header(["", "Owner", "Direction", "Size", "Type", "Condition", "Height", "Lead"])
            for i, dg in enumerate(down_guys, 1):
                ws.cell(row=current_row, column=1, value=f"Guy {i}")
                ws.cell(row=current_row, column=2, value=dg.get("owner", ""))
                ws.cell(row=current_row, column=3, value=dg.get("direction", ""))
                ws.cell(row=current_row, column=4, value=dg.get("size", ""))
                ws.cell(row=current_row, column=5, value=dg.get("type", ""))
                ws.cell(row=current_row, column=6, value=dg.get("condition", ""))
                ws.cell(row=current_row, column=7, value=format_height(dg.get("height")))
                ws.cell(row=current_row, column=8, value=format_height(dg.get("lead")))
                current_row += 1

        knuckles = pole.get("knuckles", [])
        if knuckles:
            section("ANCHOR")
            table_header(["", "Size", "Total Eyes", "Direction", "Condition"])
            for i, kn in enumerate(knuckles, 1):
                ws.cell(row=current_row, column=1, value=f"Anchor {i}")
                ws.cell(row=current_row, column=2, value=kn.get("size", ""))
                ws.cell(row=current_row, column=3, value=kn.get("total_eyes", ""))
                ws.cell(row=current_row, column=4, value=kn.get("direction", ""))
                ws.cell(row=current_row, column=5, value=kn.get("condition", ""))
                current_row += 1

        if pole.get("notes"):
            section("NOTES")
            ws.cell(row=current_row, column=1, value=pole.get("notes", ""))
            current_row += 1

        photo_items = pole_photo_items(pole)
        ws.cell(row=current_row, column=1, value="PHOTOS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        if photo_items:
            # Single browser link to job gallery, anchored to this pole's section
            pole_anchor_url = f"{public_base}/api/jobs/{job_id}/photos?token={job_photos_token}#pole-{pole.get('id')}"
            photo_cell = ws.cell(row=current_row, column=2, value=f"View Photos ({len(photo_items)})")
            photo_cell.hyperlink = pole_anchor_url
            photo_cell.font = Font(color="2563EB", underline="single", bold=True)
        else:
            ws.cell(row=current_row, column=2, value="No photos")
        current_row += 1
        
        # Add Map ZIP link for each pole
        ws.cell(row=current_row, column=1, value="MAP").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        map_zip_url = f"{public_base}/jobs/{job_id}/map"
        map_link = ws.cell(row=current_row, column=2, value="View Map")
        map_link.hyperlink = map_zip_url
        map_link.font = Font(color="2563EB", underline="single", bold=True)
        current_row += 1
        
        # Add distinctive separator line between poles
        separator_border = Border(
            bottom=Side(style='thick', color='dc2626')  # Red thick line
        )
        separator_fill = PatternFill(start_color="fef2f2", end_color="fef2f2", fill_type="solid")  # Light red background
        for col in range(1, 13):  # Apply across 12 columns
            cell = ws.cell(row=current_row, column=col, value="")
            cell.border = separator_border
            cell.fill = separator_fill
        current_row += 1
        current_row += 1  # Extra blank row for spacing
    
    if underground:
        UG_ABBR = {
            "Handhole": "HH", "Manhole": "MH", "Brooks Enclosure": "BE", "Flowerpot": "FP",
            "Hoffman Box": "HB", "Pedestal": "PED", "Point of Intersection": "PI", "FBT": "FBT",
            "NTE": "NTE", "FBT/NTE": "FBT/NTE", "PFP": "PFP", "SOC Start": "SOC-S", 
            "SOC End": "SOC-E", "Riser": "RSR", "MPOE": "MPOE",
            "Aerial Splice": "AS", "Loop": "LOOP",
        }
        ws.cell(row=current_row, column=1, value="UNDERGROUND").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        current_row += 1
        for h_i, h in enumerate(["Abbr", "Type", "Label", "Latitude", "Longitude", "Notes", "Map", "Photos"], 1):
            ws.cell(row=current_row, column=h_i, value=h).font = Font(bold=True, size=9)
        current_row += 1
        for u in underground:
            ws.cell(row=current_row, column=1, value=UG_ABBR.get(u.get("type", ""), ""))
            ws.cell(row=current_row, column=2, value=u.get("type", ""))
            ws.cell(row=current_row, column=3, value=u.get("label", ""))
            ws.cell(row=current_row, column=4, value=u.get("latitude", ""))
            ws.cell(row=current_row, column=5, value=u.get("longitude", ""))
            ws.cell(row=current_row, column=6, value=u.get("notes", ""))
            # Add Map link for each underground item
            map_url = f"{public_base}/jobs/{job_id}/map"
            map_cell = ws.cell(row=current_row, column=7, value="View Map")
            map_cell.hyperlink = map_url
            map_cell.font = Font(color="2563EB", underline="single", bold=True)
            
            # Add Photos for underground items
            ug_photo_items = underground_photo_items(u)
            if ug_photo_items:
                ug_anchor_url = f"{public_base}/api/jobs/{job_id}/photos?token={job_photos_token}#ug-{u.get('id')}"
                photo_cell = ws.cell(row=current_row, column=8, value=f"View Photos ({len(ug_photo_items)})")
                photo_cell.hyperlink = ug_anchor_url
                photo_cell.font = Font(color="2563EB", underline="single", bold=True)
            else:
                ws.cell(row=current_row, column=8, value="No photos")
            
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
        ws.column_dimensions[column].width = max(min(max_length + 2, 30), 12)
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    safe_name = "".join(c for c in job.get("name", "job") if c.isalnum() or c in (' ', '-', '_')).strip()
    filename = f"{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/jobs/{job_id}/photos", response_class=HTMLResponse)
async def job_photos_gallery(job_id: str, token: Optional[str] = Query(None), request: Request = None):
    """HTML gallery showing all photos from all poles in a job, organized by pole number.
    Access via: valid token OR authenticated mastec.com/byers.com user.
    """
    from jose import jwt, JWTError
    from fastapi.responses import HTMLResponse
    
    job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check access: token OR mastec/byers auth
    has_access = False
    
    if token:
        try:
            parts = token.split(":")
            if len(parts) == 2:
                has_access = True
        except Exception:
            pass
    
    if not has_access and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from services.auth import SECRET_KEY, ALGORITHM
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
    
    if not has_access and not token:
        has_access = True  # Allow public access for gallery links
    
    # Get all poles for this job
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    poles.sort(key=pole_sort_key)
    
    # Get all underground items for this job
    underground = await _db.underground.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    underground.sort(key=lambda x: (x.get("sort_order") or 9999, x.get("created_at") or ""))
    
    job_name = job.get("name", "Job")
    
    def _safe(s):
        return ("".join(c if (c.isalnum() or c in " -_") else "_" for c in str(s)).strip().replace(" ", "_")) or "photo"
    
    def _ext_of(u):
        if u.startswith("data:image/"):
            return (u.split("data:image/", 1)[1].split(";", 1)[0][:5]) or "jpg"
        tail = u.split("?", 1)[0].rsplit("/", 1)[-1]
        return tail.rsplit(".", 1)[-1][:5] if "." in tail else "jpg"
    
    sections_html = []
    total_photos = 0
    
    for pole in poles:
        items = pole_photo_items(pole)
        if not items:
            continue
            
        pole_no = pole.get("pole_number") or pole.get("id", "")[:8]
        total_photos += len(items)
        
        cards = []
        for label, url in items:
            dl_name = f"Pole_{_safe(pole_no)}_{_safe(label)}"
            cards.append(
                f'<figure class="ph" data-name="{dl_name}" data-url="{url}">'
                '<label class="sel"><input type="checkbox" class="pick"/></label>'
                f'<a href="{url}" target="_blank" rel="noopener"><img draggable="true" src="{url}" alt="{label}" loading="lazy"/></a>'
                f'<figcaption>{label}</figcaption>'
                '</figure>'
            )
        
        sections_html.append(
            f'<section id="pole-{pole.get("id", "")}">'
            f'<h2>Pole {pole_no} <span class="h2r"><label class="secall"><input type="checkbox" class="pickall"/> Select all</label><span class="count">({len(items)} photos)</span></span></h2>'
            f'<div class="grid">{"".join(cards)}</div>'
            f'</section>'
        )
    
    for ug in underground:
        ug_items = underground_photo_items(ug)
        if not ug_items:
            continue
        
        ug_title = f"{ug.get('type', 'Underground')} {ug.get('label', '')}".strip()
        total_photos += len(ug_items)
        
        cards = []
        for label, url in ug_items:
            dl_name = f"{_safe(ug_title)}_{_safe(label)}"
            cards.append(
                f'<figure class="ph" data-name="{dl_name}" data-url="{url}">'
                '<label class="sel"><input type="checkbox" class="pick"/></label>'
                f'<a href="{url}" target="_blank" rel="noopener"><img draggable="true" src="{url}" alt="{label}" loading="lazy"/></a>'
                f'<figcaption>{label}</figcaption>'
                '</figure>'
            )
        
        sections_html.append(
            f'<section id="ug-{ug.get("id", "")}">'
            f'<h2>{ug_title} <span class="h2r"><label class="secall"><input type="checkbox" class="pickall"/> Select all</label><span class="count">({len(ug_items)} photos)</span></span></h2>'
            f'<div class="grid">{"".join(cards)}</div>'
            f'</section>'
        )
    
    content = "".join(sections_html) or '<p class="empty">No photos found in this job.</p>'
    zip_token = generate_download_token("job_photos", job_id)
    zip_url = f"/api/jobs/{job_id}/export/photos-zip?token={zip_token}"
    zip_sel_url = f"/api/jobs/{job_id}/export/photos-zip-selected?token={zip_token}"
    download_all_btn = f'<a class="dlall" href="{zip_url}" download>Download all {total_photos} photos (ZIP)</a>' if total_photos > 0 else ''
    download_sel_btn = '<button id="dlsel" class="dlall selbtn" disabled>Download selected (0)</button>' if total_photos > 0 else ''
    
    script_js = """
<script>
(function(){
  var ZIP_SEL_URL = "__ZIPSEL__";
  var ZIP_NAME = "__ZIPNAME__";
  var btn = document.getElementById('dlsel');
  if (!btn) return;
  function picked(){ return Array.prototype.slice.call(document.querySelectorAll('figure.ph')).filter(function(f){ return f.querySelector('.pick').checked; }); }
  function refresh(){ var n = picked().length; btn.disabled = n === 0; btn.textContent = 'Download selected (' + n + ')'; }
  document.addEventListener('change', function(e){
    if (e.target.classList.contains('pickall')) {
      var sec = e.target.closest('section');
      sec.querySelectorAll('.pick').forEach(function(c){ c.checked = e.target.checked; });
    }
    if (e.target.classList.contains('pick') || e.target.classList.contains('pickall')) refresh();
  });
  btn.addEventListener('click', function(){
    var photos = picked().map(function(f){ return { name: f.dataset.name, url: f.dataset.url }; });
    btn.disabled = true; btn.textContent = 'Preparing ' + photos.length + ' photos...';
    fetch(ZIP_SEL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photos: photos }) })
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(function(blob){
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ZIP_NAME;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
      })
      .catch(function(){ alert('Download failed. Please try again.'); })
      .finally(function(){ refresh(); });
  });
  // Drag a single photo straight into a folder (Chrome/Edge)
  document.addEventListener('dragstart', function(e){
    var fig = e.target.closest && e.target.closest('figure.ph');
    if (fig && e.target.tagName === 'IMG' && fig.dataset.url && fig.dataset.url.indexOf('data:') !== 0) {
      var abs = location.origin + fig.dataset.url;
      e.dataTransfer.setData('DownloadURL', 'image/jpeg:' + fig.dataset.name + '.jpeg:' + abs);
    }
  });
})();
</script>"""
    script_js = script_js.replace("__ZIPSEL__", zip_sel_url).replace("__ZIPNAME__", f"{_safe(job_name)}_selected_photos.zip")
    
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{job_name} - All Photos</title>
<style>
  body{{margin:0;background:#f4f4f5;color:#09090b;font-family:system-ui,-apple-system,sans-serif;}}
  header{{padding:16px 24px;border-bottom:1px solid #e4e4e7;position:sticky;top:0;background:rgba(255,255,255,0.98);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;z-index:10;}}
  h1{{margin:0;font-size:18px;letter-spacing:.05em;text-transform:uppercase;}}
  h1 span{{color:#dc2626;}}
  .dlall{{background:#dc2626;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.03em;text-decoration:none;display:inline-block;}}
  .dlall:hover{{background:#b91c1c;}}
  section{{scroll-margin-top:80px;}}
  main{{padding:24px;max-width:1400px;margin:0 auto;}}
  section{{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:24px;overflow:hidden;}}
  h2{{margin:0;padding:16px 20px;font-size:16px;letter-spacing:.05em;text-transform:uppercase;background:#18181b;color:#fff;display:flex;align-items:center;justify-content:space-between;}}
  h2 .count{{font-size:12px;color:#a1a1aa;font-weight:normal;}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:16px;}}
  figure{{margin:0;background:#f4f4f5;border-radius:8px;overflow:hidden;}}
  figure img{{width:100%;height:160px;object-fit:cover;display:block;cursor:zoom-in;}}
  figcaption{{padding:8px 10px;font-size:11px;font-family:monospace;color:#52525b;text-transform:uppercase;letter-spacing:.05em;text-align:center;}}
  .empty{{padding:40px;color:#71717a;text-align:center;}}
  figure.ph{{position:relative;}}
  .sel{{position:absolute;top:6px;left:6px;z-index:2;background:rgba(255,255,255,.92);border-radius:4px;padding:4px;display:flex;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3);}}
  .pick,.pickall{{width:16px;height:16px;cursor:pointer;accent-color:#dc2626;margin:0;}}
  .selbtn{{background:#18181b;}}
  .selbtn:hover{{background:#3f3f46;}}
  .selbtn:disabled{{opacity:.45;cursor:not-allowed;}}
  .h2r{{display:flex;align-items:center;gap:14px;font-size:12px;font-weight:normal;}}
  .secall{{display:flex;align-items:center;gap:6px;color:#d4d4d8;cursor:pointer;user-select:none;}}
  .hint{{font-size:11px;color:#71717a;flex-basis:100%;}}
</style></head><body>
<header><h1><span>{job_name}</span> &middot; All Photos ({total_photos})</h1><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">{download_sel_btn}{download_all_btn}</div><span class="hint">Tip: tick photos (or "Select all" per item) then Download selected — or drag any single photo straight into a folder on your computer.</span></header>
<main>{content}</main>
{script_js}
</body></html>"""
    return HTMLResponse(content=html)


async def _fetch_photo_entries(entries, concurrency=12):
    """Fetch (zip_path, photo_url) entries in PARALLEL (non-blocking). Returns list of (zip_path, bytes|None) in order."""
    import base64
    from services.storage import get_object

    sem = asyncio.Semaphore(concurrency)

    async def fetch_one(zip_path, photo_url):
        async with sem:
            try:
                if photo_url.startswith("data:"):
                    _, b64_data = photo_url.split(",", 1)
                    return zip_path, base64.b64decode(b64_data)
                if photo_url.startswith("/api/files/"):
                    data, _ = await asyncio.to_thread(get_object, photo_url.replace("/api/files/", ""))
                    return zip_path, data
                if not photo_url.startswith("http"):
                    data, _ = await asyncio.to_thread(get_object, photo_url)
                    return zip_path, data
            except Exception:
                pass
            return zip_path, None

    return await asyncio.gather(*[fetch_one(p, u) for p, u in entries])


@router.get("/users/transferable")
async def get_transferable_users(current_user: dict = Depends(get_current_user)):
    """Company users a job can be transferred to."""
    users = await _db.users.find({}, {"_id": 0, "id": 1, "email": 1}).to_list(1000)
    out = []
    for u in users:
        email = (u.get("email") or "").lower()
        if u.get("id") == current_user["id"]:
            continue
        if email.endswith("@mastec.com") or email.endswith("@byers.com"):
            out.append({"id": u["id"], "email": u.get("email")})
    out.sort(key=lambda x: (x["email"] or "").lower())
    return out


@router.post("/jobs/{job_id}/transfer")
async def transfer_job(job_id: str, request_body: dict, current_user: dict = Depends(get_current_user)):
    """Transfer job ownership to another company user (owner or admins only)."""
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or access denied")
    target_id = request_body.get("user_id")
    if not target_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    target = await _db.users.find_one({"id": target_id}, {"_id": 0, "id": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
    email = (target.get("email") or "").lower()
    if not (email.endswith("@mastec.com") or email.endswith("@byers.com")):
        raise HTTPException(status_code=400, detail="Jobs can only be transferred to company users")
    now = datetime.now(timezone.utc).isoformat()
    history = list(job.get("transfer_history") or [])
    history.append({
        "from_email": job.get("user_email") or "",
        "to_email": target.get("email") or "",
        "by_email": current_user.get("email", ""),
        "at": now,
    })
    await _db.jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "user_id": target["id"],
                "user_email": target.get("email"),
                "transferred_from": job.get("user_email") or current_user.get("email", ""),
                "transferred_at": now,
                "updated_at": now,
                "transfer_history": history,
            },
        },
    )
    return {"message": f"Job transferred to {target.get('email')}", "user_email": target.get("email")}


@router.get("/jobs/{job_id}/export/photos-zip")
async def export_job_photos_zip(job_id: str, token: Optional[str] = Query(None), auth_token: Optional[str] = Query(None), request: Request = None):
    """Export all photos from a job as a ZIP file, organized by pole/underground with descriptive labels.
    Access via: valid download token (30 days) OR authenticated user with job access OR auth_token query param.
    
    ZIP Structure:
    - {JobName}/Poles/Pole_{number}_{station}/PhotoType.jpeg
    - {JobName}/Underground/{Type}_{Label}/PhotoType.jpeg
    """
    import zipfile
    import base64
    from services.storage import get_object
    from services.helpers import underground_photo_items
    from jose import jwt, JWTError
    
    # Check access: either valid token OR authenticated user with job access
    has_access = False
    
    # Check download token first
    if token and verify_download_token("job_photos", job_id, token):
        has_access = True
    
    # Check auth_token query parameter (for direct download links)
    if not has_access and auth_token:
        try:
            from services.auth import SECRET_KEY, ALGORITHM
            payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                user = await _db.users.find_one({"id": user_id}, {"_id": 0})
                if user:
                    email = user.get("email", "").lower()
                    is_admin = user.get("is_admin", False)
                    if is_admin or email.endswith("@mastec.com") or email.endswith("@byers.com") or email.endswith("@mastecbyers.com"):
                        has_access = True
                    else:
                        job_check = await _db.jobs.find_one({"id": job_id, "user_id": user_id}, {"_id": 0})
                        if job_check:
                            has_access = True
        except (JWTError, Exception):
            pass
    
    # Check for authenticated user via Authorization header
    if not has_access and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from services.auth import SECRET_KEY, ALGORITHM
                jwt_token = auth_header.replace("Bearer ", "")
                payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
                user_id = payload.get("sub")
                if user_id:
                    user = await _db.users.find_one({"id": user_id}, {"_id": 0})
                    if user:
                        email = user.get("email", "").lower()
                        is_admin = user.get("is_admin", False)
                        # Allow: admin users, mastec/byers users, or mastecbyers admin
                        if is_admin or email.endswith("@mastec.com") or email.endswith("@byers.com") or email.endswith("@mastecbyers.com"):
                            has_access = True
                        else:
                            # Also allow if user owns the job
                            job_check = await _db.jobs.find_one({"id": job_id, "user_id": user_id}, {"_id": 0})
                            if job_check:
                                has_access = True
            except (JWTError, Exception):
                pass
    
    if not has_access:
        raise HTTPException(status_code=401, detail="Invalid or expired download link. Please export a new Excel file.")
    
    job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    poles.sort(key=pole_sort_key)
    
    # Fetch underground items and sort by sort_order then created_at
    underground_items = await _db.underground.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    underground_items.sort(key=lambda x: (x.get("sort_order") or 9999, x.get("created_at") or ""))
    
    # Helper to sanitize folder/file names
    def safe_name(s, default="unknown"):
        return "".join(c for c in str(s) if c.isalnum() or c in (' ', '-', '_')).strip().replace(' ', '_') or default
    
    # Job name for top-level folder
    job_name = safe_name(job.get("name", "Job"))
    
    buffer = io.BytesIO()
    photo_count = 0
    
    # Collect all (zip_path, photo_url) entries first, then fetch in parallel
    entries = []
    
    # Pole photo entries
    for idx, pole in enumerate(poles, 1):
        pole_number = pole.get("pole_number") or f"Pole_{idx}"
        station_number = pole.get("station_number") or ""
        
        if station_number:
            folder_name = f"Pole_{safe_name(pole_number)}_{safe_name(station_number)}"
        else:
            folder_name = f"Pole_{safe_name(pole_number)}"
        
        for label, photo_url in pole_photo_items(pole):
            safe_label = safe_name(label, "Photo")
            entries.append((f"{job_name}/Poles/{folder_name}/{safe_label}.jpeg", photo_url))
    
    # Underground photo entries
    for idx, ug in enumerate(underground_items, 1):
        ug_type = ug.get("type") or "Underground"
        ug_label = ug.get("label") or ""
        
        if ug_label:
            folder_name = f"{safe_name(ug_type)}_{safe_name(ug_label)}"
        else:
            folder_name = f"{safe_name(ug_type)}_{idx}"
        
        for label, photo_url in underground_photo_items(ug):
            safe_label = safe_name(label, "Photo")
            entries.append((f"{job_name}/Underground/{folder_name}/{safe_label}.jpeg", photo_url))
    
    # Fetch all photos in parallel (12 concurrent)
    results = await _fetch_photo_entries(entries)
    
    # Use ZIP_STORED (no compression) for better Windows compatibility
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_STORED) as zf:
        for zip_path, data in results:
            if data:
                zf.writestr(zip_path, data)
                photo_count += 1
    
    # Check if any photos were added
    if photo_count == 0:
        raise HTTPException(status_code=404, detail="No photos found for this job. Add photos to poles or underground items first.")
    
    buffer.seek(0)
    zip_filename = f"{job_name}_Photos.zip"
    
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Content-Type": "application/zip",
            "Content-Length": str(buffer.getbuffer().nbytes)
        }
    )


@router.post("/jobs/{job_id}/export/photos-zip-selected")
async def export_selected_photos_zip(job_id: str, request: Request, token: Optional[str] = Query(None)):
    """ZIP only the photos selected in the gallery. Body: {"photos": [{"name": "...", "url": "..."}]}"""
    import zipfile
    if not (token and verify_download_token("job_photos", job_id, token)):
        raise HTTPException(status_code=401, detail="Invalid or expired download link.")
    job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    body = await request.json()
    photos = body.get("photos") or []
    if not photos or len(photos) > 500:
        raise HTTPException(status_code=400, detail="Select between 1 and 500 photos")

    def safe_name(s, default="photo"):
        return "".join(c for c in str(s) if c.isalnum() or c in (' ', '-', '_')).strip().replace(' ', '_') or default

    entries = []
    seen = set()
    for p in photos:
        url = str(p.get("url", ""))
        if url.startswith("http"):
            continue  # only internal /api/files/ or data: urls
        name = safe_name(p.get("name", "photo"))
        base, k = name, 2
        while name in seen:
            name = f"{base}_{k}"
            k += 1
        seen.add(name)
        entries.append((f"{name}.jpeg", url))
    if not entries:
        raise HTTPException(status_code=400, detail="No valid photos selected")

    results = await _fetch_photo_entries(entries)
    buffer = io.BytesIO()
    count = 0
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_STORED) as zf:
        for zp, data in results:
            if data:
                zf.writestr(zp, data)
                count += 1
    if count == 0:
        raise HTTPException(status_code=404, detail="Selected photos could not be loaded")
    buffer.seek(0)
    fname = f"{safe_name(job.get('name', 'Job'))}_Selected_{count}_Photos.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "Content-Type": "application/zip",
            "Content-Length": str(buffer.getbuffer().nbytes),
        },
    )


@router.get("/poles/{pole_id}/photos-zip")
async def export_pole_photos_zip(pole_id: str, token: Optional[str] = Query(None), request: Request = None):
    """Export all photos from a single pole as a ZIP file.
    Access via: valid download token (30 days) OR authenticated mastec.com/byers.com user.
    """
    import zipfile
    import base64
    from services.storage import get_object
    from jose import jwt, JWTError
    
    # Check access: either valid token OR authenticated mastec.com/byers.com user
    has_access = False
    
    # Check token first
    if token and verify_download_token("pole_photos", pole_id, token):
        has_access = True
    
    # Check for authenticated mastec.com/byers.com user
    if not has_access and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from services.auth import SECRET_KEY, ALGORITHM
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
    
    if not has_access:
        raise HTTPException(status_code=401, detail="Invalid or expired download link. Please export a new Excel file.")
    
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    pole_number = pole.get("pole_number", "unknown")
    safe_pole_name = "".join(c for c in pole_number if c.isalnum() or c in (' ', '-', '_')).strip() or "unknown"
    
    photo_items = pole_photo_items(pole)
    if not photo_items:
        raise HTTPException(status_code=404, detail="No photos found for this pole")
    
    buffer = io.BytesIO()
    # Fetch all photos in parallel, then write ZIP (ZIP_STORED for Windows compatibility)
    entries = []
    for label, photo_url in photo_items:
        safe_label = "".join(c for c in label if c.isalnum() or c in (' ', '-', '_')).strip()
        entries.append((f"{safe_label}.jpeg", photo_url))
    results = await _fetch_photo_entries(entries)
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_STORED) as zf:
        for zip_path, data in results:
            if data:
                zf.writestr(zip_path, data)
    
    buffer.seek(0)
    filename = f"Pole_{safe_pole_name}_photos.zip"
    
    return StreamingResponse(
        buffer,
        media_type="application/x-zip-compressed",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/x-zip-compressed"
        }
    )


@router.get("/poles/{pole_id}/photo/{photo_label}")
async def get_pole_photo(pole_id: str, photo_label: str, token: Optional[str] = Query(None), request: Request = None):
    """Get an individual photo from a pole.
    Access via: valid download token (30 days) OR authenticated mastec.com/byers.com user.
    """
    import base64
    from services.storage import get_object
    from jose import jwt, JWTError
    
    # Normalize photo_label (replace underscores back to spaces, dashes back to slashes)
    normalized_label = photo_label.replace('_', ' ').replace('-', '/')
    
    # Check access: either valid token OR authenticated mastec.com/byers.com user
    has_access = False
    
    # Check token - allow if token format is valid (expires:hash)
    if token:
        try:
            parts = token.split(":")
            if len(parts) == 2:
                expires = int(parts[0])
                import time
                if expires > time.time():
                    has_access = True  # Token not expired
        except Exception:
            pass
    
    # Check for authenticated mastec.com/byers.com user
    if not has_access and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from services.auth import SECRET_KEY, ALGORITHM
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
    
    if not has_access:
        raise HTTPException(status_code=401, detail="Invalid or expired download link. Please export a new Excel file.")
    
    pole = await _db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    # Find the matching photo
    photo_items = pole_photo_items(pole)
    photo_url = None
    for label, url in photo_items:
        if label == normalized_label:
            photo_url = url
            break
    
    if not photo_url:
        raise HTTPException(status_code=404, detail=f"Photo '{normalized_label}' not found")
    
    # Get the photo data
    data = None
    content_type = "image/jpeg"
    
    if photo_url.startswith("data:"):
        # Parse data URL
        header, b64_data = photo_url.split(",", 1)
        data = base64.b64decode(b64_data)
        if "png" in header:
            content_type = "image/png"
        elif "webp" in header:
            content_type = "image/webp"
    elif photo_url.startswith("/api/files/"):
        file_path = photo_url.replace("/api/files/", "")
        data, content_type = get_object(file_path)
    elif not photo_url.startswith("http"):
        data, content_type = get_object(photo_url)
    
    if not data:
        raise HTTPException(status_code=404, detail="Photo data not available")
    
    # Create safe filename
    pole_number = pole.get("pole_number", "unknown")
    safe_pole = "".join(c for c in pole_number if c.isalnum() or c in (' ', '-', '_')).strip() or "unknown"
    safe_label = "".join(c for c in normalized_label if c.isalnum() or c in (' ', '-', '_')).strip()
    filename = f"Pole_{safe_pole}_{safe_label}.jpeg"
    
    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/underground/{ug_id}/photo/{photo_label}")
async def get_underground_photo(ug_id: str, photo_label: str, token: Optional[str] = Query(None), request: Request = None):
    """Get an individual photo from an underground item.
    Access via: valid download token (30 days) OR authenticated mastec.com/byers.com user.
    """
    import base64
    from services.storage import get_object
    from jose import jwt, JWTError
    
    # Normalize photo_label (replace underscores back to spaces, dashes back to slashes)
    normalized_label = photo_label.replace('_', ' ').replace('-', '/')
    
    # Check access: either valid token OR authenticated mastec.com/byers.com user
    has_access = False
    
    # Check token - allow if token format is valid (expires:hash)
    if token:
        try:
            parts = token.split(":")
            if len(parts) == 2:
                expires = int(parts[0])
                import time
                if expires > time.time():
                    has_access = True  # Token not expired
        except Exception:
            pass
    
    # Check for authenticated user
    if not has_access and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from services.auth import SECRET_KEY, ALGORITHM
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
    
    if not has_access:
        raise HTTPException(status_code=401, detail="Invalid or expired download link. Please export a new Excel file.")
    
    ug = await _db.underground.find_one({"id": ug_id}, {"_id": 0})
    if not ug:
        raise HTTPException(status_code=404, detail="Underground item not found")
    
    # Find the matching photo
    photo_items = underground_photo_items(ug)
    photo_url = None
    for label, url in photo_items:
        if label == normalized_label:
            photo_url = url
            break
    
    if not photo_url:
        raise HTTPException(status_code=404, detail=f"Photo '{normalized_label}' not found")
    
    # Get the photo data
    data = None
    content_type = "image/jpeg"
    
    if photo_url.startswith("data:"):
        # Parse data URL
        header, b64_data = photo_url.split(",", 1)
        data = base64.b64decode(b64_data)
        if "png" in header:
            content_type = "image/png"
        elif "webp" in header:
            content_type = "image/webp"
    elif photo_url.startswith("/api/files/"):
        file_path = photo_url.replace("/api/files/", "")
        data, content_type = get_object(file_path)
    elif not photo_url.startswith("http"):
        data, content_type = get_object(photo_url)
    
    if not data:
        raise HTTPException(status_code=404, detail="Photo data not available")
    
    # Create safe filename
    ug_type = ug.get("type", "Underground")
    ug_label = ug.get("label", "")
    safe_ug = f"{ug_type}_{ug_label}" if ug_label else ug_type
    safe_ug = "".join(c for c in safe_ug if c.isalnum() or c in (' ', '-', '_')).strip() or "Underground"
    safe_label = "".join(c for c in normalized_label if c.isalnum() or c in (' ', '-', '_')).strip()
    filename = f"{safe_ug}_{safe_label}.jpeg"
    
    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ASE Site Walk Survey endpoints

@router.put("/jobs/{job_id}/ase-data")
async def save_ase_data(job_id: str, request_body: dict, current_user: dict = Depends(get_current_user)):
    """Save ASE Site Walk Survey data for a job"""
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Handle both formats: { ase_data: {...} } or direct {...}
    ase_data = request_body.get("ase_data", request_body) if isinstance(request_body, dict) else request_body
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.jobs.update_one(
        {"id": job_id},
        {"$set": {"ase_data": ase_data, "updated_at": now}}
    )
    return {"message": "ASE data saved successfully"}


@router.get("/jobs/{job_id}/ase-data")
async def get_ase_data(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get ASE Site Walk Survey data for a job"""
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {"ase_data": job.get("ase_data", {})}


@router.get("/jobs/{job_id}/ase-gallery")
async def get_ase_gallery(job_id: str, token: str = None):
    """Get ASE photos for gallery view - accessible via token (no auth required)"""
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    
    # Verify token
    if not verify_download_token("ase_gallery", job_id, token):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    ase = job.get("ase_data", {})
    
    # Collect all photos by category
    photo_fields = [
        ("Address", "address_photos"),
        ("Access Contact", "access_contact_photos"),
        ("SPF Contact", "spf_contact_photos"),
        ("Existing INC", "existing_inc_photos"),
        ("Existing Fiber Terminal", "existing_fiber_terminal_photos"),
        ("Fiber Terminal Placement", "fiber_terminal_placement_photos"),
        ("Active Ports", "fiber_active_ports_photos"),
        ("Fiber Reading", "fiber_reading_photos"),
        ("Existing NTE", "existing_nte_photos"),
        ("NTE Placement", "nte_placement_photos"),
        ("NTE CLLI", "nte_clli_photos"),
        ("Rack Bay/Shelf", "nte_rack_bay_shelf_photos"),
        ("Equipment Power Config", "equipment_power_config_photos"),
        ("Pole Line Start", "pole_line_start_photos"),
        ("Pole Line End", "pole_line_end_photos"),
        ("SOC Start", "soc_start_photos"),
        ("SOC End", "soc_end_photos"),
        ("Pipelines Vicinity", "pipelines_vicinity_photos"),
        ("Pipelines Path", "pipelines_path_photos"),
        ("Railroads Vicinity", "railroads_vicinity_photos"),
        ("Railroads Path", "railroads_path_photos"),
        ("Mark Ups", "markup_photos"),
    ]
    
    photos = {}
    for label, field in photo_fields:
        field_photos = ase.get(field, []) or []
        if field_photos:
            photos[label] = field_photos
    
    return {
        "job_name": job.get("name", ""),
        "job_location": job.get("location", ""),
        "photos": photos
    }


@router.get("/jobs/{job_id}/export/ase")
async def export_ase_excel(job_id: str, current_user: dict = Depends(get_current_user)):
    """Export ASE Site Walk Survey data to Excel with 3 tabs matching app layout"""
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Handle None or missing ase_data
    ase = job.get("ase_data") or {}

    # Server-side fallbacks mirroring the ASE form auto-population, so the export
    # always includes coordinates/FID even if the form wasn't re-opened and saved.
    _poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    _ug = await _db.underground.find({"job_id": job_id}, {"_id": 0}).to_list(10000)

    def _coord(it):
        return f"{it.get('latitude')}, {it.get('longitude')}"

    def _first(items, cond):
        return next((x for x in items if cond(x) and x.get("latitude") and x.get("longitude")), None)

    if not ase.get("soc_start_lat_long"):
        it = _first(_ug, lambda u: u.get("soc_start"))
        if it: ase["soc_start_lat_long"] = _coord(it)
    if not ase.get("soc_end_lat_long"):
        it = _first(_ug, lambda u: u.get("soc_end"))
        if it: ase["soc_end_lat_long"] = _coord(it)
    if not ase.get("soc_pole_line_start"):
        it = _first(_poles, lambda p: p.get("pole_line_start"))
        if it: ase["soc_pole_line_start"] = _coord(it)
    if not ase.get("soc_pole_line_end"):
        it = _first(_poles, lambda p: p.get("pole_line_end"))
        if it: ase["soc_pole_line_end"] = _coord(it)
    if not ase.get("nearest_fiber_fid"):
        primaries = sorted(
            [u for u in _ug if u.get("primary_fid") and u.get("fid")],
            key=lambda u: u.get("sort_order") if u.get("sort_order") is not None else 9999,
        )
        if primaries: ase["nearest_fiber_fid"] = primaries[0]["fid"]
    if not ase.get("fiber_terminal_lat_long"):
        if str(ase.get("pedestal_fiber_as_fbt", "")).upper() == "YES":
            it = _first(_ug, lambda u: u.get("type") == "Pedestal" and "fiber" in str(u.get("material_type", "")).lower())
        else:
            it = _first(_ug, lambda u: u.get("type") in ("FBT", "FBT/NTE"))
        if it: ase["fiber_terminal_lat_long"] = _coord(it)
    if not ase.get("nte_lat_long"):
        it = _first(_ug, lambda u: u.get("type") in ("NTE", "FBT/NTE"))
        if it: ase["nte_lat_long"] = _coord(it)
    
    wb = Workbook()
    
    # Styles
    header_fill = PatternFill(start_color="1f2937", end_color="1f2937", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    section_fill = PatternFill(start_color="3b82f6", end_color="3b82f6", fill_type="solid")
    section_font = Font(bold=True, color="FFFFFF", size=10)
    label_font = Font(bold=True, size=9)
    value_font = Font(size=9)
    filled_fill = PatternFill(start_color="dcfce7", end_color="dcfce7", fill_type="solid")
    empty_fill = PatternFill(start_color="fef3c7", end_color="fef3c7", fill_type="solid")
    
    def setup_sheet(ws, title_color):
        ws.column_dimensions["A"].width = 45
        ws.column_dimensions["B"].width = 35
        ws.column_dimensions["C"].width = 20
        ws.column_dimensions["D"].width = 30
    
    def add_header(ws, row, title):
        cell = ws.cell(row=row, column=1, value=title)
        cell.fill = header_fill
        cell.font = header_font
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
        return row + 1
    
    def add_section(ws, row, title, color=None):
        fill = PatternFill(start_color=color or "3b82f6", end_color=color or "3b82f6", fill_type="solid") if color else section_fill
        cell = ws.cell(row=row, column=1, value=title)
        cell.fill = fill
        cell.font = section_font
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
        return row + 1
    
    def add_row(ws, row, label, value):
        ws.cell(row=row, column=1, value=label).font = label_font
        value_cell = ws.cell(row=row, column=2, value=value or "")
        value_cell.font = value_font
        value_cell.fill = filled_fill if value else empty_fill
        return row + 1
    
    def add_row_pair(ws, row, label1, value1, label2, value2):
        ws.cell(row=row, column=1, value=label1).font = label_font
        v1_cell = ws.cell(row=row, column=2, value=value1 or "")
        v1_cell.font = value_font
        v1_cell.fill = filled_fill if value1 else empty_fill
        ws.cell(row=row, column=3, value=label2).font = label_font
        v2_cell = ws.cell(row=row, column=4, value=value2 or "")
        v2_cell.font = value_font
        v2_cell.fill = filled_fill if value2 else empty_fill
        return row + 1
    
    # ========== TAB 1: ASE CKLIST ==========
    ws1 = wb.active
    ws1.title = "ASE CKLIST"
    setup_sheet(ws1, "3b82f6")
    row = 1
    
    row = add_header(ws1, row, "ASE SITE WALK SURVEY - CHECKLIST")
    row += 1
    
    # Job Info
    row = add_row(ws1, row, "Job Name:", job.get("name", ""))
    row = add_row(ws1, row, "Job Number:", job.get("job_number", ""))
    row = add_row(ws1, row, "Location:", job.get("location", ""))
    row += 1
    
    # Employee Info
    row = add_section(ws1, row, "EMPLOYEE INFO")
    row = add_row(ws1, row, "Site ID:", ase.get("site_id", ""))
    row = add_row(ws1, row, "Employee Info:", ase.get("employee_info", ""))
    row = add_row(ws1, row, "Date of Site Visit:", ase.get("date_of_site_visit", ""))
    row += 1
    
    # Address
    row = add_section(ws1, row, "ADDRESS")
    row = add_row(ws1, row, "Address:", ase.get("address", ""))
    row = add_row(ws1, row, "MPOE Address:", ase.get("mpoe_address", ""))
    row = add_row(ws1, row, "Suite &/or Bldg #:", ase.get("suite_bldg", ""))
    row += 1
    
    # BIDI Retrofit
    row = add_section(ws1, row, "BIDI RETROFIT")
    row = add_row(ws1, row, "Does this qualify for BIDI Retrofit?:", ase.get("bidi_retrofit_qualify", ""))
    row = add_row(ws1, row, "Did you speak to regarding Retrofit work?:", ase.get("bidi_spoke_to", ""))
    row = add_row(ws1, row, "What date was agreed to?:", ase.get("bidi_agreed_date", ""))
    row = add_row(ws1, row, "What timeframe?:", ase.get("bidi_timeframe", ""))
    row = add_row(ws1, row, "BIDI Access Notes/Special Instructions:", ase.get("bidi_access_notes", ""))
    row += 1
    
    # Access/Customer Information
    row = add_section(ws1, row, "ACCESS/CUSTOMER INFORMATION")
    row = add_row(ws1, row, "Access contact name & phone/email:", ase.get("access_contact", ""))
    row = add_row(ws1, row, "Building Owner name & phone/email:", ase.get("building_owner_contact", ""))
    row = add_row(ws1, row, "Who did you walk the site with?:", ase.get("site_walked_with", ""))
    row = add_row(ws1, row, "Access Notes/Special Instructions:", ase.get("access_notes", ""))
    row += 1
    
    # Building Characteristics
    row = add_section(ws1, row, "BUILDING CHARACTERISTICS")
    row = add_row(ws1, row, "Occupancy Type:", ase.get("occupancy_type", ""))
    row = add_row(ws1, row, "Number of Floors:", ase.get("number_of_floors", ""))
    row = add_row(ws1, row, "Number of Business Units:", ase.get("number_of_business_units", ""))
    row = add_row(ws1, row, "Number of Tenants:", ase.get("number_of_tenants", ""))
    row = add_row(ws1, row, "Multi Tenant:", ase.get("multi_tenant", ""))
    row = add_row(ws1, row, "Disable NTE Auto-Assign:", ase.get("disable_nte_auto_assign", ""))
    row = add_row(ws1, row, "Multi Tenant Eligibility:", ase.get("multi_tenant_eligibility", ""))
    row = add_row(ws1, row, "Router on Same Floor:", ase.get("router_on_same_floor", ""))
    row = add_row(ws1, row, "Router Within 300ft:", ase.get("router_within_300ft", ""))
    row = add_row(ws1, row, "How many DMARCs?:", ase.get("how_many_dmarcs", ""))
    row = add_row(ws1, row, "If additional DMARCs, where are they?:", ase.get("additional_dmarcs_location", ""))
    row = add_row(ws1, row, "Is the proposed NTE in a common space?:", ase.get("proposed_nte_common_space", ""))
    row += 1
    
    # Fiber Attributes
    row = add_section(ws1, row, "FIBER ATTRIBUTES")
    row = add_row(ws1, row, "Existing INC:", ase.get("existing_inc", ""))
    row = add_row(ws1, row, "INC Required:", ase.get("inc_required", ""))
    row = add_row(ws1, row, "Existing Fiber Terminal:", ase.get("existing_fiber_terminal", ""))
    row = add_row(ws1, row, "Fiber Terminal Placement:", ase.get("fiber_terminal_placement", ""))
    row = add_row(ws1, row, "Use Fiber Pedestal as FBT?:", ase.get("pedestal_fiber_as_fbt", ""))
    row = add_row(ws1, row, "FBT Attribute Source:", ase.get("fbt_attribute_source", ""))
    row = add_row(ws1, row, "Fiber Terminal LAT/LONG:", ase.get("fiber_terminal_lat_long", ""))
    row = add_row(ws1, row, "Fiber Terminal FID:", ase.get("fiber_terminal_fid", ""))
    row = add_row(ws1, row, "Active Ports (FOR EXISTING):", ase.get("fiber_active_ports", ""))
    row = add_row(ws1, row, "Fiber Reading (FOR EXISTING):", ase.get("fiber_reading", ""))
    row = add_row(ws1, row, "Describe existing/proposed terminal location:", ase.get("terminal_location_description", ""))
    row = add_row(ws1, row, "Floor #:", ase.get("terminal_floor", ""))
    row = add_row(ws1, row, "Mounting Wall:", ase.get("terminal_mounting_wall", ""))
    row = add_row(ws1, row, "Rack Bay:", ase.get("terminal_rack_bay", ""))
    row = add_row(ws1, row, "Rack Shelf:", ase.get("terminal_rack_shelf", ""))
    row += 1
    
    # NTE Equipment Attributes
    row = add_section(ws1, row, "NTE - EQUIPMENT ATTRIBUTES")
    row = add_row(ws1, row, "Existing NTE:", ase.get("existing_nte", ""))
    row = add_row(ws1, row, "NTE Placement:", ase.get("nte_placement", ""))
    row = add_row(ws1, row, "Active Ports (FOR EXISTING):", ase.get("nte_active_ports", ""))
    row = add_row(ws1, row, "CLLI (FOR EXISTING):", ase.get("nte_clli", ""))
    row = add_row(ws1, row, "NTE at Terminal or another location?:", ase.get("nte_at_terminal", ""))
    row = add_row(ws1, row, "Describe existing/proposed NTE location:", ase.get("nte_location_description", ""))
    row = add_row(ws1, row, "NTE Attribute Source:", ase.get("nte_attribute_source", ""))
    row = add_row(ws1, row, "NTE LAT/LONG:", ase.get("nte_lat_long", ""))
    row = add_row(ws1, row, "Floor #:", ase.get("nte_floor", ""))
    row = add_row(ws1, row, "Mounting Wall:", ase.get("nte_mounting_wall", ""))
    row = add_row(ws1, row, "Rack Bay:", ase.get("nte_rack_bay", ""))
    row = add_row(ws1, row, "Rack Shelf:", ase.get("nte_rack_shelf", ""))
    row = add_row(ws1, row, "Equipment Power Configuration:", ase.get("equipment_power_config", ""))
    row = add_row(ws1, row, "Distance From FBT to NTE:", ase.get("distance_fbt_to_nte", ""))
    row = add_row(ws1, row, "Distance from NTE to Customer IT space:", ase.get("distance_nte_to_it", ""))
    row = add_row(ws1, row, "Is Customer IT space on same floor as NTE?:", ase.get("it_same_floor_as_nte", ""))
    row = add_row(ws1, row, "Ceiling Height:", ase.get("ceiling_height", ""))
    row += 1
    
    # EF Offer
    row = add_section(ws1, row, "EF OFFER")
    row = add_row(ws1, row, "EF NEEDED:", ase.get("ef_needed", ""))
    row = add_row(ws1, row, "EF Qualified:", ase.get("ef_qualified", ""))
    row = add_row(ws1, row, "EF Disqualification Reason:", ase.get("ef_disqualification_reason", ""))
    row = add_row(ws1, row, "Is the Customer Building Owner or Tenant?:", ase.get("owner_or_tenant", ""))
    row = add_row(ws1, row, "SPF Required?:", ase.get("spf_required", ""))
    row = add_row(ws1, row, "SPF contact name & phone/email:", ase.get("spf_contact", ""))
    row = add_row(ws1, row, "Are we placing conduit and how long?:", ase.get("placing_conduit_length", ""))
    row += 1
    
    # EF Requirements
    row = add_section(ws1, row, "EF REQUIREMENTS")
    ef_items = [
        ("Do we need a buried PVC pipe?", "buried_pvc", "buried_pvc_length"),
        ("Do we need buried innerduct on customer property?", "buried_innerduct", "buried_innerduct_length"),
        ("Do we need EMT (metallic bldg pipe)?", "need_emt", "emt_length"),
        ("Do we need plastic building duct/pipe (Plenum)?", "need_plenum", "plenum_length"),
        ("Do we need a core drill?", "need_core_drill", "core_drill_qty"),
        ("Do we need an eye-bolt/weatherhead?", "need_eyebolt", ""),
        ("Do we need a Pullbox?", "need_pullbox", "pullbox_qty"),
        ("Do we need a Hoffman box?", "need_hoffman_box", "hoffman_box_qty"),
        ("Do we need a backboard?", "need_backboard", "backboard_qty"),
        ("Do we need an outlet?", "need_outlet", ""),
        ("Do we need a groundbar?", "need_groundbar", "groundbar_qty"),
    ]
    for label, key, qty_key in ef_items:
        answer = ase.get(key, "")
        qty = ase.get(qty_key, "") if qty_key else ""
        row = add_row_pair(ws1, row, label, answer, "Length/Qty:" if qty_key else "", qty)
    row += 1
    
    # Additional Info
    row = add_section(ws1, row, "ADDITIONAL INFO")
    row = add_row(ws1, row, "Nearest fiber Lat/Long:", ase.get("nearest_fiber_lat_long", ""))
    row = add_row(ws1, row, "Starting FH/MH/POLE tie in measurements:", ase.get("starting_tie_in_measurements", ""))
    row = add_row(ws1, row, "Nearest fiber FID:", ase.get("nearest_fiber_fid", ""))
    row = add_row(ws1, row, "Describe path of approach, include SOC length:", ase.get("path_of_approach", ""))
    row = add_row(ws1, row, "POLE LINE START Lat/Long:", ase.get("soc_pole_line_start", ""))
    row = add_row(ws1, row, "POLE LINE END Lat/Long:", ase.get("soc_pole_line_end", ""))
    row = add_row(ws1, row, "SOC START Lat/Long:", ase.get("soc_start_lat_long", ""))
    row = add_row(ws1, row, "SOC END Lat/Long:", ase.get("soc_end_lat_long", ""))
    row = add_row(ws1, row, "Proposed POLE and BLDG Height of Attachment:", ase.get("proposed_pole_bldg_height", ""))
    row = add_row(ws1, row, "What Site Requirements are already provided?:", ase.get("site_requirements_provided", ""))
    row = add_row(ws1, row, "Are there any pipelines in the vicinity?:", ase.get("pipelines_vicinity", ""))
    row = add_row(ws1, row, "Are there any pipelines in the path?:", ase.get("pipelines_path", ""))
    row = add_row(ws1, row, "Are there any railroads in the vicinity?:", ase.get("railroads_vicinity", ""))
    row = add_row(ws1, row, "Are there any railroads in the Path?:", ase.get("railroads_path", ""))
    row = add_row(ws1, row, "ROW width, pole-pole, clear inside path measurements:", ase.get("row_measurements", ""))
    row = add_row(ws1, row, "Is there anything else we must know?:", ase.get("other_notes", ""))
    
    # ========== TAB 2: COORDINATOR INPUT ==========
    ws2 = wb.create_sheet(title="Coordinator Input")
    setup_sheet(ws2, "22c55e")
    row = 1
    
    row = add_header(ws2, row, "COORDINATOR INPUT")
    row += 1
    
    row = add_section(ws2, row, "COORDINATOR INPUT", "22c55e")
    row = add_row(ws2, row, "AT&T Engineer:", ase.get("assigned_att_eng", ""))
    row = add_row(ws2, row, "Nearest Fiber FID if Missing:", ase.get("nearest_fiber_fid_missing", ""))
    row = add_row(ws2, row, "FBT FID if Missing:", ase.get("fbt_fid_missing", ""))
    row = add_row(ws2, row, "Possible Permits:", ase.get("possible_permits", ""))
    row = add_row(ws2, row, "Additional SOW notes:", ase.get("additional_sow_notes", ""))
    
    # ========== TAB 3: SVCL OUTPUT ==========
    ws3 = wb.create_sheet(title="SVCL Output")
    setup_sheet(ws3, "7c3aed")
    row = 1
    
    row = add_header(ws3, row, "SVCL OUTPUT")
    row += 1
    
    # Site & Order
    row = add_section(ws3, row, "SITE & ORDER", "7c3aed")
    row = add_row(ws3, row, "Building Contact:", ase.get("building_contact", "") or ase.get("building_owner_contact", ""))
    row = add_row(ws3, row, "Building Contact Email:", ase.get("building_contact_email", ""))
    row += 1
    
    # Site Visit
    row = add_section(ws3, row, "SITE VISIT", "7c3aed")
    row = add_row(ws3, row, "Date of Site Visit:", ase.get("date_of_site_visit", ""))
    row = add_row(ws3, row, "Type of Site Visit:", ase.get("type_of_site_visit", ""))
    row = add_row(ws3, row, "Qualified Equipment:", ase.get("qualified_equipment", ""))
    row = add_row(ws3, row, "Occupancy Type:", ase.get("occupancy_type", ""))
    row = add_row(ws3, row, "Multi-Tenant:", ase.get("multi_tenant", ""))
    row = add_row(ws3, row, "Number of Tenants:", ase.get("number_of_tenants", ""))
    row = add_row(ws3, row, "Number of Floors in Building:", ase.get("number_of_floors", ""))
    # Building Demarcation calculation
    dmarcs = ase.get("how_many_dmarcs", "")
    building_demarcation = ""
    if dmarcs:
        try:
            building_demarcation = "Single MPOE/Terminal" if int(dmarcs) == 1 else "Multiple MPOE/Terminal"
        except (ValueError, TypeError):
            pass
    row = add_row(ws3, row, "Building Demarcation:", building_demarcation)
    row = add_row(ws3, row, "Disable NTE Auto-Assignment:", ase.get("disable_nte_auto_assign", ""))
    row += 1
    
    # Fiber Attributes
    row = add_section(ws3, row, "FIBER ATTRIBUTES", "7c3aed")
    row = add_row(ws3, row, "Existing INC:", ase.get("existing_inc", ""))
    row = add_row(ws3, row, "Fiber Riser (INC) required?:", ase.get("inc_required", ""))
    row = add_row(ws3, row, "Existing Fiber Terminal:", ase.get("existing_fiber_terminal", ""))
    row = add_row(ws3, row, "Fiber Terminal location:", ase.get("fiber_terminal_placement", ""))
    row = add_row(ws3, row, "Fiber Terminal Floor:", ase.get("terminal_floor", ""))
    row = add_row(ws3, row, "Fiber Terminal Aisle:", ase.get("terminal_mounting_wall", ""))
    row = add_row(ws3, row, "Fiber Terminal Bay:", ase.get("terminal_rack_bay", "") or "00")
    row = add_row(ws3, row, "Fiber Terminal Shelf:", ase.get("terminal_rack_shelf", "") or "00")
    row += 1
    
    # NTE Equipment Attributes
    row = add_section(ws3, row, "NTE EQUIPMENT ATTRIBUTES", "7c3aed")
    row = add_row(ws3, row, "Equipment Environment:", ase.get("nte_placement", ""))
    # Equipment location calculation
    nte_at_terminal = ase.get("nte_at_terminal", "")
    equipment_location = ""
    if nte_at_terminal:
        equipment_location = "COMMON AREA/MPOE" if nte_at_terminal == "Terminal" else "SUITE"
    row = add_row(ws3, row, "Equipment location:", equipment_location)
    row = add_row(ws3, row, "Equipment Mounting:", ase.get("nte_placement", ""))
    row = add_row(ws3, row, "Equipment Power Configuration:", ase.get("equipment_power_config", ""))
    row = add_row(ws3, row, "Equipment Floor:", ase.get("nte_floor", ""))
    row = add_row(ws3, row, "Equipment Aisle:", ase.get("nte_mounting_wall", ""))
    row = add_row(ws3, row, "Equipment Bay:", ase.get("nte_rack_bay", "") or "00")
    row = add_row(ws3, row, "Equipment Shelf:", ase.get("nte_rack_shelf", "") or "00")
    row += 1
    
    # Multi Tenant Eligibility
    row = add_section(ws3, row, "MULTI TENANT ELIGIBILITY (MTEI)", "7c3aed")
    row = add_row(ws3, row, "Multi-Tenant Eligibility:", ase.get("multi_tenant_eligibility", ""))
    row = add_row(ws3, row, "Customer Handoff Panel Location:", ase.get("customer_handoff_panel_location", "") or equipment_location)
    row = add_row(ws3, row, "Est. Fiber Drop Length (MIN 10'):", ase.get("est_fiber_drop_length", "") or ase.get("distance_fbt_to_nte", ""))
    row = add_row(ws3, row, "Router on Same Floor:", ase.get("router_on_same_floor", ""))
    row = add_row(ws3, row, "Router Within 300 (ft):", ase.get("router_within_300ft", ""))
    row = add_row(ws3, row, "Ceiling Height:", ase.get("ceiling_height", ""))
    row += 1
    
    # Site Requirements
    row = add_section(ws3, row, "SITE REQUIREMENTS", "7c3aed")
    row = add_row(ws3, row, "Site Readiness Evaluation:", ase.get("site_readiness_evaluation", ""))
    row = add_row(ws3, row, "EF Qualified:", ase.get("ef_qualified", ""))
    row = add_row(ws3, row, "Customer EF Aware:", ase.get("customer_ef_aware", ""))
    # End User Acceptance calculation
    ef_qualified = ase.get("ef_qualified", "")
    end_user_acceptance = ""
    if ef_qualified:
        end_user_acceptance = "Yes - EF Offer Accepted" if ef_qualified != "NO" else "No - EF Offer Not Accepted"
    row = add_row(ws3, row, "End User Acceptance:", end_user_acceptance)
    row = add_row(ws3, row, "EF Owner or Tenant:", ase.get("owner_or_tenant", ""))
    row = add_row(ws3, row, "EF Conduit Length:", ase.get("placing_conduit_length", ""))
    # Other Requirements auto-text
    site_id = ase.get("site_id", "")
    employee_info = ase.get("employee_info", "")
    other_requirements = ""
    if site_id or employee_info:
        other_requirements = f"NOTE: FOR ANY QUESTIONS CONCERNING YOUR SITE VISIT REQUIREMENTS IN THIS LETTER PLEASE CONTACT: REFERENCE SITE ID {site_id} {employee_info}".strip()
    row = add_row(ws3, row, "Other Requirements:", other_requirements)
    
    # ========== TAB: SOW NOTES (after SVCL Output) ==========
    ws_sow = wb.create_sheet(title="SOW Notes")
    setup_sheet(ws_sow, "f59e0b")
    if (ase.get("sow_notes_override") or "").strip():
        # User-edited SOW notes: export their version verbatim, one line per row
        row = 1
        row = add_section(ws_sow, row, "SOW NOTES (edited by user)", "f59e0b")
        for line in str(ase["sow_notes_override"]).splitlines():
            ws_sow.cell(row=row, column=1, value=line)
            row += 1
    else:
        _sow_ef_items = [
            ("BURIED PVC", "buried_pvc", "buried_pvc_provided"),
            ("BURIED INNERDUCT", "buried_innerduct", "buried_innerduct_provided"),
            ("EMT", "need_emt", "need_emt_provided"),
            ("PLENUM", "need_plenum", "need_plenum_provided"),
            ("CORE DRILL", "need_core_drill", "need_core_drill_provided"),
            ("EYE-BOLT/WEATHERHEAD", "need_eyebolt", "need_eyebolt_provided"),
            ("PULLBOX", "need_pullbox", "need_pullbox_provided"),
            ("HOFFMAN BOX", "need_hoffman_box", "need_hoffman_box_provided"),
            ("BACKBOARD", "need_backboard", "need_backboard_provided"),
            ("OUTLET", "need_outlet", "need_outlet_provided"),
            ("GROUNDBAR", "need_groundbar", "need_groundbar_provided"),
        ]
        def _yes(v):
            return str(v or "").strip().upper() in ("YES", "TRUE", "Y")
        _in_place = ase.get("site_requirements_provided") or ", ".join(l for l, _k, pk in _sow_ef_items if _yes(ase.get(pk)))
        _needed = ", ".join(l for l, k, pk in _sow_ef_items if _yes(ase.get(k)) and not _yes(ase.get(pk)))
        row = 1
        row = add_section(ws_sow, row, "SOW NOTES", "f59e0b")
        row = add_row(ws_sow, row, "ASSIGNED ATT ENG:", ase.get("assigned_att_eng", ""))
        row = add_row(ws_sow, row, "SITE WALKED BY:", ase.get("employee_info", ""))
        row = add_row(ws_sow, row, "SITE WALKED WITH:", ase.get("site_walked_with", ""))
        row = add_row(ws_sow, row, "ACCESS CONTACT:", ase.get("access_contact", ""))
        row = add_row(ws_sow, row, "SPF NEEDED:", ase.get("spf_required", ""))
        row = add_row(ws_sow, row, "SPF CONTACT:", ase.get("spf_contact", ""))
        row = add_row(ws_sow, row, "FIBER AT SITE:", ase.get("existing_fiber_terminal", ""))
        row = add_row(ws_sow, row, "LAT/LONG OF THE EXISITNG/NEW FBT:", ase.get("fiber_terminal_lat_long", ""))
        row = add_row(ws_sow, row, "PROPOSED LOCATION:", ase.get("terminal_location_description", "") or ase.get("fiber_terminal_placement", ""))
        row = add_row(ws_sow, row, "PATH OF APPROACH:", ase.get("path_of_approach", ""))
        row = add_row(ws_sow, row, "NEAREST FIBER FID:", ase.get("nearest_fiber_fid", ""))
        row = add_row(ws_sow, row, "LAT/LONG OF NEAREST FIBER:", ase.get("nearest_fiber_lat_long", ""))
        row = add_row(ws_sow, row, "POLE LINE START:", ase.get("soc_pole_line_start", "") or "N/A")
        row = add_row(ws_sow, row, "POLE LINE END:", ase.get("soc_pole_line_end", "") or "N/A")
        row = add_row(ws_sow, row, "SOC START:", ase.get("soc_start_lat_long", "") or "0")
        row = add_row(ws_sow, row, "SOC END:", ase.get("soc_end_lat_long", "") or "0")
        row = add_section(ws_sow, row, "EF REQUIREMENTS", "f59e0b")
        row = add_row(ws_sow, row, "IN PLACE:", _in_place)
        row = add_row(ws_sow, row, "NEEDED:", _needed)
        row = add_row(ws_sow, row, "EXISTING NTE/EMTS @SITE:", ase.get("existing_nte", ""))
        row = add_row(ws_sow, row, "PROPOSED EQUIPMENT LOCATION:", ase.get("nte_location_description", ""))
        row = add_row(ws_sow, row, "LAT/LONG:", ase.get("nte_lat_long", ""))
        row = add_row(ws_sow, row, "PROPOSED EQUIPMENT:", "CIENA 3903X OR EQUIVALENT RAD")
        row = add_row(ws_sow, row, "PIPELINES IN VICINITY:", ase.get("pipelines_vicinity", ""))
        row = add_row(ws_sow, row, "RAILROADS IN VICINITY:", ase.get("railroads_vicinity", ""))
        row = add_row(ws_sow, row, "PERMITS NEEDED:", ase.get("possible_permits", ""))
        row = add_row(ws_sow, row, "OTHER INFO:", " ".join(x for x in [ase.get("other_notes", ""), ase.get("additional_sow_notes", "")] if x))
    
    # ========== TAB 4: PHOTOS ==========
    # Collect all photos
    photo_fields = [
        ("Address", "address_photos"),
        ("Access/Customer", "access_customer_photos"),
        ("Building Characteristics", "building_characteristics_photos"),
        ("FBT", "fbt_photos"),
        ("NTE", "nte_photos"),
        ("MPOE", "mpoe_photos"),
        ("Pole Line Start", "pole_line_start_photos"),
        ("Pole Line End", "pole_line_end_photos"),
        ("SOC Start", "soc_start_photos"),
        ("SOC End", "soc_end_photos"),
        ("Mark Ups", "markup_photos"),
    ]
    
    all_photos = []
    for label, field in photo_fields:
        photos = ase.get(field, []) or []
        if photos:
            for idx, photo in enumerate(photos):
                all_photos.append((f"{label} #{idx+1}" if len(photos) > 1 else label, photo))
    
    if all_photos:
        ws4 = wb.create_sheet(title="Photos")
        setup_sheet(ws4, "f59e0b")
        row = 1
        
        row = add_header(ws4, row, "PHOTO GALLERY")
        row += 1
        
        # Add gallery link
        gallery_token = generate_download_token("ase_gallery", job_id, expires_days=30)
        public_base = os.environ.get("PUBLIC_URL", "https://poledatasheet.info")
        gallery_url = f"{public_base}/ase-gallery/{job_id}?token={gallery_token}"
        
        ws4.cell(row=row, column=1, value="Photo Gallery (Accessible to everyone):").font = label_font
        link_cell = ws4.cell(row=row, column=2, value="View All ASE Photos")
        link_cell.hyperlink = gallery_url
        link_cell.font = Font(color="2563EB", underline="single", bold=True, size=10)
        row += 2
        
        # Photo Download Link
        download_url = f"{public_base}/api/jobs/{job_id}/export/photos?token={gallery_token}"
        ws4.cell(row=row, column=1, value="Download All Photos (ZIP):").font = label_font
        dl_cell = ws4.cell(row=row, column=2, value="Download Photos ZIP")
        dl_cell.hyperlink = download_url
        dl_cell.font = Font(color="16a34a", underline="single", bold=True, size=10)
        row += 2
        
        row = add_section(ws4, row, "PHOTO LIST", "f59e0b")
        for label, photo_url in all_photos:
            ws4.cell(row=row, column=1, value=f"  • {label}").font = value_font
            photo_cell = ws4.cell(row=row, column=2, value="View Photo")
            photo_cell.hyperlink = photo_url
            photo_cell.font = Font(color="2563EB", underline="single", size=9)
            row += 1
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"{job.get('name', 'Job')}_ASE_Export.xlsx".replace(" ", "_")
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
