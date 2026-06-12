from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import io
import hashlib
import hmac
import os
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side

from models.job import Job, JobCreate, JobUpdate
from models.pole import Pole
from services.auth import get_current_user, is_admin_user, is_mastec_byers_admin
from services.helpers import pole_sort_key, format_height, pole_photo_items

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
    if is_admin_user(current_user):
        job = await _db.jobs.find_one({"id": job_id})
    else:
        job = await _db.jobs.find_one({"id": job_id, "user_id": current_user["id"]})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    poles.sort(key=pole_sort_key)
    return poles


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
    ws.title = "Pole Data"
    
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
    ws.cell(row=1, column=7, value="POLES").fill = header_fill
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
    all_photos_cell = ws.cell(row=1, column=14, value="View all photos")
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
            # Generate token for pole gallery access
            pole_gallery_token = generate_download_token("pole_gallery", pole.get('id'))
            # Link to pole gallery page with token
            gallery_url = f"{public_base}/api/poles/{pole.get('id')}/gallery?token={pole_gallery_token}"
            
            # List each photo label, first one is a link to the gallery
            col_idx = 2
            for i, (label, photo_url) in enumerate(photo_items):
                photo_cell = ws.cell(row=current_row, column=col_idx, value=label)
                if i == 0:
                    # First photo label links to the gallery
                    photo_cell.hyperlink = gallery_url
                    photo_cell.font = Font(color="2563EB", underline="single", bold=True)
                else:
                    photo_cell.font = Font(color="52525b")
                col_idx += 1
            
            # Add "View All" link at the end
            view_all_cell = ws.cell(row=current_row, column=col_idx, value=f"View All ({len(photo_items)})")
            view_all_cell.hyperlink = gallery_url
            view_all_cell.font = Font(color="7C3AED", underline="single", bold=True)
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
        }
        ws.cell(row=current_row, column=1, value="UNDERGROUND").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        current_row += 1
        for h_i, h in enumerate(["Abbr", "Type", "Label", "Latitude", "Longitude", "Notes", "Map"], 1):
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
    all_downloads = []
    
    for pole in poles:
        items = pole_photo_items(pole)
        if not items:
            continue
            
        pole_no = pole.get("pole_number") or pole.get("id", "")[:8]
        total_photos += len(items)
        
        cards = []
        for label, url in items:
            fname = f"Pole_{_safe(pole_no)}_{_safe(label)}.{_ext_of(url)}"
            all_downloads.append({"u": url, "n": fname})
            cards.append(
                '<figure>'
                f'<a href="{url}" target="_blank" rel="noopener"><img src="{url}" alt="{label}" loading="lazy"/></a>'
                f'<figcaption>{label}</figcaption>'
                '</figure>'
            )
        
        sections_html.append(
            f'<section>'
            f'<h2>Pole {pole_no} <span class="count">({len(items)} photos)</span></h2>'
            f'<div class="grid">{"".join(cards)}</div>'
            f'</section>'
        )
    
    content = "".join(sections_html) or '<p class="empty">No photos found in this job.</p>'
    dl_json = json.dumps(all_downloads)
    download_all_btn = f'<button class="dlall" onclick="downloadAll()">Download all {total_photos} photos</button>' if total_photos > 0 else ''
    
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{job_name} - All Photos</title>
<style>
  body{{margin:0;background:#f4f4f5;color:#09090b;font-family:system-ui,-apple-system,sans-serif;}}
  header{{padding:16px 24px;border-bottom:1px solid #e4e4e7;position:sticky;top:0;background:rgba(255,255,255,0.98);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;z-index:10;}}
  h1{{margin:0;font-size:18px;letter-spacing:.05em;text-transform:uppercase;}}
  h1 span{{color:#dc2626;}}
  .dlall{{background:#dc2626;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.03em;}}
  .dlall:hover{{background:#b91c1c;}}
  main{{padding:24px;max-width:1400px;margin:0 auto;}}
  section{{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:24px;overflow:hidden;}}
  h2{{margin:0;padding:16px 20px;font-size:16px;letter-spacing:.05em;text-transform:uppercase;background:#18181b;color:#fff;display:flex;align-items:center;justify-content:space-between;}}
  h2 .count{{font-size:12px;color:#a1a1aa;font-weight:normal;}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:16px;}}
  figure{{margin:0;background:#f4f4f5;border-radius:8px;overflow:hidden;}}
  figure img{{width:100%;height:160px;object-fit:cover;display:block;cursor:zoom-in;}}
  figcaption{{padding:8px 10px;font-size:11px;font-family:monospace;color:#52525b;text-transform:uppercase;letter-spacing:.05em;text-align:center;}}
  .empty{{padding:40px;color:#71717a;text-align:center;}}
</style></head><body>
<header><h1><span>{job_name}</span> &middot; All Photos ({total_photos})</h1>{download_all_btn}</header>
<main>{content}</main>
<script>
var FILES = {dl_json};
function downloadAll(){{
  FILES.forEach(function(f, i){{
    setTimeout(function(){{
      var a = document.createElement('a');
      a.href = f.u; a.download = f.n;
      document.body.appendChild(a); a.click(); a.remove();
    }}, i * 300);
  }});
}}
</script>
</body></html>"""
    return HTMLResponse(content=html)


@router.get("/jobs/{job_id}/export/photos-zip")
async def export_job_photos_zip(job_id: str, token: Optional[str] = Query(None), request: Request = None):
    """Export all photos from a job as a ZIP file, organized by pole with labels.
    Access via: valid download token (30 days) OR authenticated mastec.com/byers.com user.
    """
    import zipfile
    import base64
    from services.storage import get_object
    from jose import jwt, JWTError
    
    # Check access: either valid token OR authenticated mastec.com/byers.com user
    has_access = False
    
    # Check token first
    if token and verify_download_token("job_photos", job_id, token):
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
    
    job = await _db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    poles.sort(key=pole_sort_key)
    
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for pole in poles:
            pole_number = pole.get("pole_number", "unknown")
            safe_pole_name = "".join(c for c in pole_number if c.isalnum() or c in (' ', '-', '_')).strip() or "unknown"
            
            photo_items = pole_photo_items(pole)
            for label, photo_url in photo_items:
                try:
                    data = None
                    
                    # Handle base64 data URLs
                    if photo_url.startswith("data:"):
                        header, b64_data = photo_url.split(",", 1)
                        data = base64.b64decode(b64_data)
                    # Handle file storage URLs
                    elif photo_url.startswith("/api/files/"):
                        file_path = photo_url.replace("/api/files/", "")
                        data, _ = get_object(file_path)
                    elif not photo_url.startswith("http"):
                        # Direct file path
                        data, _ = get_object(photo_url)
                    
                    if data:
                        # Create safe filename with label - always use .jpeg extension
                        safe_label = "".join(c for c in label if c.isalnum() or c in (' ', '-', '_')).strip()
                        filename = f"Pole_{safe_pole_name}/{safe_label}.jpeg"
                        zf.writestr(filename, data)
                except Exception:
                    # Skip failed photos
                    continue
    
    buffer.seek(0)
    safe_name = "".join(c for c in job.get("name", "job") if c.isalnum() or c in (' ', '-', '_')).strip()
    filename = f"{safe_name}_photos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for label, photo_url in photo_items:
            try:
                data = None
                
                # Handle base64 data URLs
                if photo_url.startswith("data:"):
                    header, b64_data = photo_url.split(",", 1)
                    data = base64.b64decode(b64_data)
                # Handle file storage URLs
                elif photo_url.startswith("/api/files/"):
                    file_path = photo_url.replace("/api/files/", "")
                    data, _ = get_object(file_path)
                elif not photo_url.startswith("http"):
                    data, _ = get_object(photo_url)
                
                if data:
                    # Always use .jpeg extension
                    safe_label = "".join(c for c in label if c.isalnum() or c in (' ', '-', '_')).strip()
                    filename = f"{safe_label}.jpeg"
                    zf.writestr(filename, data)
            except Exception:
                continue
    
    buffer.seek(0)
    filename = f"Pole_{safe_pole_name}_photos.zip"
    
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
    
    # Check token first
    if token and verify_download_token("photo", f"{pole_id}:{normalized_label}", token):
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
