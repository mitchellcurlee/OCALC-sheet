import io
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from pydantic import BaseModel, Field

from services.auth import get_current_user, is_admin_user, is_mastec_byers_admin
from services.geocode import geocode

router = APIRouter(tags=["field-reports"])
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


def _rows_date(rows: List[dict]) -> Optional[str]:
    """The one date every filled-in row carries, or None when rows disagree / are blank."""
    dates = {str(r.get("date") or "").strip() for r in (rows or []) if any(str(r.get(k) or "").strip() for k in ("job", "job_id", "job_address", "status", "comments", "miles", "footage", "poles"))}
    dates.discard("")
    return next(iter(dates)) if len(dates) == 1 else None


async def _effective_date(user_id: str, report_id: Optional[str], date: str, rows: List[dict]) -> str:
    """A report belongs to the date its rows show. Falls back to `date` when another report already owns that day."""
    rd = _rows_date(rows)
    if not rd or rd == date:
        return date
    q: Dict[str, Any] = {"user_id": user_id, "date": rd}
    if report_id:
        q["id"] = {"$ne": report_id}
    return date if await _db.field_reports.find_one(q, {"_id": 0, "id": 1}) else rd


async def migrate_report_dates(db) -> int:
    """One-time fix: old reports whose rows all show a different date move to that date."""
    n = 0
    async for doc in db.field_reports.find({}, {"_id": 0, "id": 1, "user_id": 1, "date": 1, "rows": 1}):
        eff = await _effective_date(doc.get("user_id"), doc["id"], doc.get("date"), doc.get("rows") or [])
        if eff != doc.get("date"):
            await db.field_reports.update_one({"id": doc["id"]}, {"$set": {"date": eff}})
            n += 1
    return n


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


@router.get("/field-reports/geocode")
async def geocode_address(q: str, current_user: dict = Depends(get_current_user)):
    q = (q or "").strip()
    if len(q) < 4:
        raise HTTPException(status_code=400, detail="Enter a fuller address")
    hit = await geocode(q)
    if not hit:
        raise HTTPException(status_code=404, detail="Address not found — try adding city and state")
    return hit


def _require_admin(user: dict):
    """Team Reports: admins, or users an admin has flagged as supervisor."""
    if not (is_admin_user(user) or is_mastec_byers_admin(user) or user.get("is_supervisor")):
        raise HTTPException(status_code=403, detail="Admin or supervisor access required")


async def _team_rows(date_from: str, date_to: str):
    """All fielders' DFR rows between two dates (inclusive), each row tagged with fielder / user email / date."""
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    docs = await _db.field_reports.find({"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0, "track": 0}).sort([("date", 1), ("fielder", 1)]).to_list(5000)
    users = {u["id"]: u for u in await _db.users.find({}, {"_id": 0, "id": 1, "email": 1, "name": 1, "full_name": 1}).to_list(5000)}
    rows: List[Dict[str, Any]] = []
    for d in docs:
        u = users.get(d.get("user_id"), {})
        who = d.get("fielder") or u.get("full_name") or u.get("name") or u.get("email") or ""
        for r in d.get("rows") or []:
            if not any(str(r.get(k) or "").strip() for k in ("job", "job_id", "job_address", "work_hrs", "travel_hrs", "miles", "comments")):
                continue
            rows.append({**r, "date": r.get("date") or d.get("date"), "fielder": r.get("fielder") or who, "report_fielder": who, "user_email": u.get("email", ""), "report_id": d.get("id")})
    return rows, date_from, date_to


@router.get("/field-reports/team")
async def team_field_reports(date_from: str, date_to: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    rows, f, t = await _team_rows(date_from, date_to)
    totals = {k: round(sum(_num(r.get(k)) for r in rows), 2) for k in TOTAL_KEYS}
    fielders = sorted({r["report_fielder"] for r in rows if r.get("report_fielder")})
    return {"date_from": f, "date_to": t, "rows": rows, "totals": totals, "fielders": fielders, "count": len(rows)}


@router.get("/field-reports/team/export")
async def team_field_reports_export(date_from: str, date_to: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    rows, f, t = await _team_rows(date_from, date_to)
    if not rows:
        raise HTTPException(status_code=404, detail="No report rows between those dates")
    wb = build_dfr_workbook({"rows": rows, "date": f, "fielder": "Team"}, title=f"Team {f} to {t}")
    return _xlsx_response(wb, f"Team_Field_Report_{f}_to_{t}.xlsx")


@router.get("/field-reports/{report_id}")
async def get_field_report(report_id: str, current_user: dict = Depends(get_current_user)):
    return await _get_report(report_id, current_user)


@router.put("/field-reports/{report_id}")
async def update_field_report(report_id: str, body: FieldReportIn, current_user: dict = Depends(get_current_user)):
    doc = await _get_report(report_id, current_user, write=True)
    date = await _effective_date(doc.get("user_id"), report_id, body.date, body.rows)
    upd = {"date": date, "fielder": body.fielder or "", "rows": body.rows, "track": body.track,
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


TOTAL_KEYS = ("travel_hrs", "work_hrs", "return_hrs", "miles", "footage", "poles", "computer_hrs")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def build_dfr_workbook(report: dict, title: str = "Daily Field Report") -> Workbook:
    """One sheet: header, one line per used row (no padding), then a TOTALS line."""
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    header_fill = PatternFill("solid", fgColor="000000")
    grey_fill = PatternFill("solid", fgColor="D9D9D9")
    total_fill = PatternFill("solid", fgColor="FFF2CC")
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
    rows = [r for r in (report.get("rows") or []) if any(str(r.get(k) or "").strip() for k, _, _ in DFR_COLUMNS if k != "date")]
    for ri, row in enumerate(rows):
        for ci, (key, _, _) in enumerate(DFR_COLUMNS, 1):
            val = row.get(key, "") if key != "date" else (row.get("date") or report.get("date") or "")
            c = ws.cell(row=ri + 2, column=ci, value=_fmt(val))
            c.border = border
            c.alignment = Alignment(horizontal="center" if key not in ("job_address", "comments", "status") else "left", vertical="center", wrap_text=True)
            if ri % 2 == 0:
                c.fill = grey_fill
    # TOTALS line
    tr = len(rows) + 2
    totals = {k: sum(_num(r.get(k)) for r in rows) for k in TOTAL_KEYS}
    for ci, (key, _, _) in enumerate(DFR_COLUMNS, 1):
        val = "TOTALS" if key == "date" else (_fmt(round(totals[key], 2)) if key in totals else "")
        c = ws.cell(row=tr, column=ci, value=val)
        c.fill = total_fill
        c.font = Font(bold=True)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = Border(left=thin, right=thin, top=thick, bottom=thick)
    n = len(rows) + 1  # data rows + totals
    # thick separators after Fielder and after Return (as on the reference sheet)
    for ci in (7, 10):
        for ri in range(1, n + 2):
            cell = ws.cell(row=ri, column=ci)
            cell.border = Border(left=cell.border.left, right=thick, top=cell.border.top, bottom=cell.border.bottom)
    ws.freeze_panes = "A2"
    return wb


def _xlsx_response(wb: Workbook, fname: str) -> StreamingResponse:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@router.get("/field-reports/export/range")
async def export_field_reports_range(date_from: str, date_to: str, current_user: dict = Depends(get_current_user)):
    """One combined sheet for all of the caller's reports between two dates (inclusive), rows in date order, with totals."""
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    docs = await _db.field_reports.find({"user_id": current_user["id"], "date": {"$gte": date_from, "$lte": date_to}},
                                        {"_id": 0, "track": 0}).sort("date", 1).to_list(1000)
    rows: List[Dict[str, Any]] = []
    fielders: List[str] = []
    for d in docs:
        for r in d.get("rows") or []:
            rows.append({**r, "date": r.get("date") or d.get("date")})
        if d.get("fielder") and d["fielder"] not in fielders:
            fielders.append(d["fielder"])
    if not rows:
        raise HTTPException(status_code=404, detail="No report rows between those dates")
    wb = build_dfr_workbook({"rows": rows, "date": date_from, "fielder": ", ".join(fielders)}, title=f"DFR {date_from} to {date_to}")
    fielder = (fielders[0] if len(fielders) == 1 else "combined").replace(" ", "_")
    return _xlsx_response(wb, f"Daily_Field_Report_{date_from}_to_{date_to}_{fielder}.xlsx")


@router.get("/field-reports/{report_id}/export/xlsx")
async def export_field_report_xlsx(report_id: str, current_user: dict = Depends(get_current_user)):
    report = await _get_report(report_id, current_user)
    wb = build_dfr_workbook(report)
    fielder = (report.get("fielder") or "").replace(" ", "_") or "fielder"
    return _xlsx_response(wb, f"Daily_Field_Report_{report.get('date', '')}_{fielder}.xlsx")
