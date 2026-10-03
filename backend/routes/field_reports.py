import asyncio
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from pydantic import BaseModel, Field

from services.auth import get_current_user, is_admin_user, is_mastec_byers_admin

router = APIRouter(tags=["field-reports"])
logger = logging.getLogger(__name__)
_db = None


def set_db(db):
    global _db
    _db = db


# Column layout (order matters — matches the reference sheet and the UI table)
DFR_COLUMNS = [
    ("date", "Date", 11), ("job", "Job", 12), ("market", "Market", 9), ("sow", "SOW", 9), ("job_type", "Job Type", 10),
    ("job_address", "Job Address", 30), ("fielder", "Fielder at Site", 18), ("travel_hrs", "Travel to site (hrs)", 10),
    ("work_hrs", "Work @job (hrs)", 10), ("return_hrs", "Return to Home/next Site (hrs)", 12), ("miles", "Total miles driven", 10),
    ("footage", "Job footage (ft)", 11), ("poles", "# Poles", 8), ("computer_hrs", "Time on computer for Job", 12),
    ("status", "Status", 14), ("comments", "Comments", 40),
]


class FieldReportIn(BaseModel):
    date: str
    fielder: Optional[str] = ""
    rows: List[Dict[str, Any]] = Field(default_factory=list)
    track: List[Dict[str, Any]] = Field(default_factory=list)  # [{lat, lng, t, row_id}]


def _is_admin(user: dict) -> bool:
    return is_admin_user(user) or is_mastec_byers_admin(user)


async def _get_report(report_id: str, user: dict, write: bool = False) -> dict:
    """Any company user may view a report; only its owner or an admin may change it."""
    doc = await _db.field_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")
    if write and doc.get("user_id") != user["id"] and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the report owner or an admin can change it")
    return doc


@router.get("/field-reports")
async def list_field_reports(date: Optional[str] = None, all: bool = False, current_user: dict = Depends(get_current_user)):
    """Own reports by default; ?all=1 lists every company user's reports."""
    q: Dict[str, Any] = {}
    if not all:
        q["user_id"] = current_user["id"]
    if date:
        q["date"] = date
    docs = await _db.field_reports.find(q, {"_id": 0, "track": 0}).sort("date", -1).to_list(500)
    return docs


@router.post("/field-reports", status_code=201)
async def create_field_report(body: FieldReportIn, current_user: dict = Depends(get_current_user)):
    existing = await _db.field_reports.find_one({"user_id": current_user["id"], "date": body.date}, {"_id": 0})
    if existing:
        return existing
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "user_id": current_user["id"], "user_email": current_user.get("email", ""),
        "date": body.date, "fielder": body.fielder or "", "rows": body.rows, "track": body.track,
        "created_at": now, "updated_at": now,
    }
    await _db.field_reports.insert_one(dict(doc))
    return doc


class HomeIn(BaseModel):
    address: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.get("/field-reports/home")
async def get_home(current_user: dict = Depends(get_current_user)):
    """Fielder's saved home / start address (per user)."""
    doc = await _db.users.find_one({"id": current_user["id"]}, {"_id": 0, "dfr_home": 1})
    return (doc or {}).get("dfr_home") or {"address": "", "lat": None, "lng": None}


@router.put("/field-reports/home")
async def set_home(body: HomeIn, current_user: dict = Depends(get_current_user)):
    home = {"address": (body.address or "").strip(), "lat": body.lat, "lng": body.lng}
    await _db.users.update_one({"id": current_user["id"]}, {"$set": {"dfr_home": home}})
    return home


def _geocode_sync(q: str) -> Optional[dict]:
    # US Census geocoder first (good for Texas street addresses), OSM Nominatim as fallback
    try:
        r = requests.get("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
                         params={"address": q, "benchmark": "Public_AR_Current", "format": "json"}, timeout=12)
        m = (r.json().get("result") or {}).get("addressMatches") or []
        if m:
            c = m[0]["coordinates"]
            return {"address": m[0].get("matchedAddress") or q, "lat": float(c["y"]), "lng": float(c["x"])}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"census geocode failed: {e}")
    try:
        r = requests.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "json", "limit": 1},
                         headers={"User-Agent": "PoleTracker-DFR/1.0"}, timeout=12)
        hits = r.json()
        if hits:
            return {"address": hits[0].get("display_name") or q, "lat": float(hits[0]["lat"]), "lng": float(hits[0]["lon"])}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"nominatim geocode failed: {e}")
    return None


@router.get("/field-reports/geocode")
async def geocode_address(q: str, current_user: dict = Depends(get_current_user)):
    q = (q or "").strip()
    if len(q) < 4:
        raise HTTPException(status_code=400, detail="Enter a fuller address")
    hit = await asyncio.to_thread(_geocode_sync, q)
    if not hit:
        raise HTTPException(status_code=404, detail="Address not found — try adding city and state")
    return hit


@router.get("/field-reports/{report_id}")
async def get_field_report(report_id: str, current_user: dict = Depends(get_current_user)):
    return await _get_report(report_id, current_user)


@router.put("/field-reports/{report_id}")
async def update_field_report(report_id: str, body: FieldReportIn, current_user: dict = Depends(get_current_user)):
    await _get_report(report_id, current_user, write=True)
    upd = {"date": body.date, "fielder": body.fielder or "", "rows": body.rows, "track": body.track,
           "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": current_user.get("email", "")}
    await _db.field_reports.update_one({"id": report_id}, {"$set": upd})
    return await _db.field_reports.find_one({"id": report_id}, {"_id": 0})


@router.delete("/field-reports/{report_id}")
async def delete_field_report(report_id: str, current_user: dict = Depends(get_current_user)):
    await _get_report(report_id, current_user, write=True)
    await _db.field_reports.delete_one({"id": report_id})
    return {"deleted": True}


def _fmt(v):
    if v is None or v == "":
        return ""
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return v


def build_dfr_workbook(report: dict) -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Daily Field Report"
    header_fill = PatternFill("solid", fgColor="000000")
    grey_fill = PatternFill("solid", fgColor="D9D9D9")
    thin = Side(style="thin", color="000000")
    thick = Side(style="medium", color="000000")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for ci, (_, label, width) in enumerate(DFR_COLUMNS, 1):
        c = ws.cell(row=1, column=ci, value=label)
        c.fill = header_fill
        c.font = Font(bold=True, color="FFFFFF", size=11)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        ws.column_dimensions[get_column_letter(ci)].width = width
    ws.row_dimensions[1].height = 78
    rows = report.get("rows") or []
    n = max(len(rows), 6)
    for ri in range(n):
        row = rows[ri] if ri < len(rows) else {}
        for ci, (key, _, _) in enumerate(DFR_COLUMNS, 1):
            val = row.get(key, "") if key != "date" else (row.get("date") or report.get("date") or "")
            c = ws.cell(row=ri + 2, column=ci, value=_fmt(val))
            c.border = border
            c.alignment = Alignment(horizontal="center" if key not in ("job_address", "comments", "status") else "left", vertical="center", wrap_text=True)
            if ri % 2 == 0:
                c.fill = grey_fill
    # thick separators after Fielder and after Return (as on the reference sheet)
    for ci in (7, 10):
        for ri in range(1, n + 2):
            cell = ws.cell(row=ri, column=ci)
            cell.border = Border(left=cell.border.left, right=thick, top=cell.border.top, bottom=cell.border.bottom)
    ws.freeze_panes = "A2"
    return wb


@router.get("/field-reports/{report_id}/export/xlsx")
async def export_field_report_xlsx(report_id: str, current_user: dict = Depends(get_current_user)):
    report = await _get_report(report_id, current_user)
    wb = build_dfr_workbook(report)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fielder = (report.get("fielder") or "").replace(" ", "_") or "fielder"
    fname = f"Daily_Field_Report_{report.get('date', '')}_{fielder}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})
