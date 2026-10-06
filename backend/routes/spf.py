import base64
import io
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.auth import get_current_user

router = APIRouter(tags=["spf"])
_db = None

INTRO = [
    "A tenant in your building has ordered an AT&T service that requires a pathway be placed between the property line and the Minimum "
    "Point of Entry (MPOE) of your building to facilitate placement of a new AT&T fiber cable needed to accommodate the order. The "
    "pathway is the responsibility of the tenant to provide, however, the tenant has asked AT&T to place the pathway, with no cost to you, "
    "and AT&T is willing to do so if we have your approval. The pathway will automatically convey to owner at completion, and upgrades "
    "or maintenance will be at the owner's discretion; however, it will be placed in accordance with local standards and the area will be "
    "restored to original or better condition.",
    "The permission we seek is for the physical structure we will be placing for your tenant only. If we do not receive permission using this "
    "form within ten (10) days, the tenant will need to hire another vendor to complete the requirements prior to AT&T delivering the "
    "service. AT&T (*Operator) will provide a scope of work prior to installation.",
]
BULLETS = [
    "OWNER grants the OPERATOR the right to install conduit or innerduct from the property line to the point of initial demarcation in accordance with the sketch provided by the AT&T representative.",
    "OPERATOR will restore the affected area to like or better condition and will seal any wall penetrations, if applicable. If OPERATOR damages the PREMISES during the installation process, or if damages are discovered after completion, the OPERATOR shall promptly repair such damage at OPERATOR'S sole cost and expense.",
    "OWNER shall provide reasonable access to the PREMISES.",
    "This System Permission is the entire agreement between the parties respecting the matters herein and may be modified by written agreement only.",
]


def set_db(db):
    global _db
    _db = db


@router.get("/spf-text")
async def spf_text(current_user: dict = Depends(get_current_user)):
    return {"title": "SYSTEM PERMISSION FORM", "intro": INTRO, "bullets": BULLETS}


@router.get("/jobs/{job_id}/spf-data")
async def get_spf(job_id: str, current_user: dict = Depends(get_current_user)):
    from routes.jobs import can_view_job
    job = await can_view_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.get("spf_data") or {}


class SpfBody(BaseModel):
    data: Dict[str, Any]


@router.put("/jobs/{job_id}/spf-data")
async def save_spf(job_id: str, body: SpfBody, current_user: dict = Depends(get_current_user)):
    from routes.jobs import can_view_job
    if not await can_view_job(job_id, current_user):
        raise HTTPException(status_code=404, detail="Job not found")
    await _db.jobs.update_one({"id": job_id}, {"$set": {"spf_data": body.data, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return body.data


def _sig_image(data_url: str):
    from reportlab.lib.utils import ImageReader
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        return ImageReader(io.BytesIO(raw))
    except Exception:  # noqa: BLE001
        return None


@router.get("/jobs/{job_id}/export/spf")
async def export_spf(job_id: str, current_user: dict = Depends(get_current_user)):
    """SPF Form - Right of Entry Agreement as a one-page PDF (typed fields + drawn signatures)."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph
    from reportlab.pdfgen import canvas
    from routes.jobs import can_view_job
    job = await can_view_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    d = job.get("spf_data") or {}
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    W, H = letter
    x0, width = 54, W - 108
    body = ParagraphStyle("b", fontName="Helvetica", fontSize=9.2, leading=12)
    bul = ParagraphStyle("bl", parent=body, leftIndent=14, bulletIndent=2)
    y = H - 54
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, y, "SYSTEM PERMISSION FORM")
    y -= 22
    for para in INTRO:
        p = Paragraph(para, body)
        _, h = p.wrap(width, 400)
        p.drawOn(c, x0, y - h)
        y -= h + 8

    def line(label, value, yy, lab_w=130):
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x0, yy, label)
        c.setFont("Helvetica", 10)
        c.drawString(x0 + lab_w, yy, value or "")
        c.setLineWidth(0.6)
        c.line(x0 + lab_w, yy - 2, x0 + width, yy - 2)

    y -= 6
    line("Date:", d.get("date", ""), y); y -= 20
    line("Parties: OPERATOR (AT&T) –", d.get("operator", ""), y, 150); y -= 20
    line("OWNER –", d.get("owner", ""), y); y -= 20
    line("PREMISES (address) –", d.get("premises", ""), y); y -= 24
    for b in BULLETS:
        p = Paragraph(b, bul, bulletText="•")
        _, h = p.wrap(width, 400)
        p.drawOn(c, x0, y - h)
        y -= h + 6
    y -= 14
    colw = width / 2 - 10
    for i, (key, title) in enumerate((("owner", "OWNER"), ("operator", "OPERATOR"))):
        cx = x0 + i * (colw + 20)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(cx, y, title)
        sig = _sig_image(d.get(f"{key}_signature", "")) if d.get(f"{key}_signature") else None
        c.setFont("Helvetica", 10)
        c.drawString(cx, y - 44, "By:")
        if sig:
            try:
                c.drawImage(sig, cx + 24, y - 50, width=colw - 30, height=40, preserveAspectRatio=True, anchor="sw", mask="auto")
            except Exception:  # noqa: BLE001 — unreadable signature image: leave the line blank
                pass
        c.line(cx + 24, y - 52, cx + colw, y - 52)
        c.setFont("Helvetica", 9.5)
        c.drawString(cx + 24, y - 68, d.get(f"{key}_name_title", "") or "")
        c.line(cx + 24, y - 70, cx + colw, y - 70)
        c.setFont("Helvetica-Oblique", 8.5)
        c.drawString(cx + 24, y - 80, "Printed Name/Title")
    c.showPage()
    c.save()
    buf.seek(0)
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (job.get("site_id") or job.get("name") or "Job"))
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="SPF_Right_of_Entry_{safe}.pdf"'})
