import io
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from models.options import UNDERGROUND_TYPES
from models.pole import Pole
from models.underground import Underground
from services.auth import get_current_user

router = APIRouter(tags=["kml-import"])
_db = None


def set_db(db):
    global _db
    _db = db


_ALIASES = {
    "hh": "Handhole", "handhole": "Handhole", "hand hole": "Handhole", "mh": "Manhole", "manhole": "Manhole", "ped": "Pedestal", "pedestal": "Pedestal",
    "fp": "Flowerpot", "flowerpot": "Flowerpot", "flower pot": "Flowerpot", "be": "Brooks Enclosure", "brooks": "Brooks Enclosure", "hoffman": "Hoffman Box",
    "pi": "Point of Intersection", "poi": "Point of Intersection", "fbt": "FBT", "nte": "NTE", "pfp": "PFP", "riser": "Riser", "mpoe": "MPOE", "eop": "EOP", "row": "ROW",
    "splice": "Aerial Splice", "aerial splice": "Aerial Splice", "loop": "Loop", "power": "Power", "pullbox": "Pullbox", "pull box": "Pullbox", "culvert": "Culvert",
    "gas": "Gas Line", "fdf": "FDF", "fst": "FST", "core": "Core", "pole": "pole", "utility pole": "pole", "telephone pole": "pole", "p": "pole",
}
_TYPE_LOWER = {t.lower(): t for t in UNDERGROUND_TYPES}


def _guess_one(blob: str) -> Optional[Dict[str, str]]:
    blob = (blob or "").lower()
    if not blob.strip():
        return None
    if re.match(r"^\s*(poles?|p)\b", blob):
        return {"kind": "pole", "type": "Pole"}
    for key in sorted(_TYPE_LOWER, key=len, reverse=True):
        if key in blob:
            return {"kind": "underground", "type": _TYPE_LOWER[key]}
    for tok in re.split(r"[^a-z]+", blob):
        if tok in _ALIASES:
            v = _ALIASES[tok]
            return {"kind": "pole", "type": "Pole"} if v == "pole" else {"kind": "underground", "type": v}
    for key, v in _ALIASES.items():
        if " " in key and key in blob:
            return {"kind": "pole", "type": "Pole"} if v == "pole" else {"kind": "underground", "type": v}
    return None


def guess_type(*texts: str) -> Dict[str, str]:
    """Map placemark name → folder → description to {kind: pole|underground, type}. Defaults to pole."""
    for t in texts:
        g = _guess_one(t)
        if g:
            return g
    return {"kind": "pole", "type": "Pole"}


def _strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s or "", flags=re.I)
    s = re.sub(r"</tr>", "\n", s, flags=re.I)
    s = re.sub(r"</t[dh]>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"[ \t]+", " ", s).strip()


def parse_kml(data: bytes) -> List[Dict[str, Any]]:
    """Point placemarks only (lines/polygons ignored). Returns [{name, description, lat, lng, folder, guess}]."""
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            kml_names = [n for n in z.namelist() if n.lower().endswith(".kml")]
            if not kml_names:
                raise HTTPException(status_code=400, detail="KMZ has no .kml inside")
            data = z.read(sorted(kml_names, key=lambda n: (n.lower() != "doc.kml", n))[0])
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Not a valid KML file: {e}")

    def local(tag):
        return tag.split("}", 1)[-1]

    out: List[Dict[str, Any]] = []

    def walk(el, folder: str):
        for ch in el:
            t = local(ch.tag)
            if t in ("Folder", "Document"):
                nm = next((c.text for c in ch if local(c.tag) == "name"), None) or folder
                walk(ch, (nm or "").strip())
            elif t == "Placemark":
                name = desc = ""
                pts = []
                for c in ch.iter():
                    lt = local(c.tag)
                    if lt == "name" and not name and c.text:
                        name = c.text.strip()
                    elif lt == "description" and c.text:
                        desc = _strip_html(c.text)
                    elif lt == "Point":
                        coords = next((cc.text for cc in c.iter() if local(cc.tag) == "coordinates"), "") or ""
                        parts = coords.strip().split(",")
                        if len(parts) >= 2:
                            try:
                                pts.append((float(parts[1]), float(parts[0])))
                            except ValueError:
                                pass
                for lat, lng in pts[:1]:
                    out.append({"name": name or f"Placemark {len(out) + 1}", "description": desc[:1000], "lat": lat, "lng": lng, "folder": folder, **guess_type(name, folder, desc[:200])})
    walk(root, "")
    return out


@router.post("/jobs/{job_id}/import/kml/parse")
async def parse_kml_upload(job_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    from routes.jobs import can_view_job
    if not await can_view_job(job_id, current_user):
        raise HTTPException(status_code=404, detail="Job not found")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (25 MB max)")
    items = parse_kml(data)
    if not items:
        raise HTTPException(status_code=400, detail="No point placemarks found in this file")
    return {"items": items, "count": len(items), "filename": file.filename}


class ImportItem(BaseModel):
    name: str = ""
    description: str = ""
    lat: float
    lng: float
    kind: str = "pole"  # pole | underground
    type: str = "Pole"
    label: Optional[str] = None


class ImportBody(BaseModel):
    items: List[ImportItem]


@router.post("/jobs/{job_id}/import/kml/create")
async def create_from_kml(job_id: str, body: ImportBody, current_user: dict = Depends(get_current_user)):
    """Create poles / underground attributes from reviewed placemarks (same create paths as the forms)."""
    from routes.jobs import can_view_job
    from routes.poles import create_pole
    from routes.underground import create_underground
    from models.pole import PoleCreate
    from models.underground import UndergroundCreate
    if not await can_view_job(job_id, current_user):
        raise HTTPException(status_code=404, detail="Job not found")
    created = {"poles": 0, "underground": 0}
    who = current_user.get("email", "")
    for it in body.items:
        notes = ("Imported from KML" + (f": {it.name}" if it.name else "") + (f"\n{it.description}" if it.description else ""))[:2000]
        # standalone=True: imported items are placed on the map but NOT auto-connected into spans
        if it.kind == "pole":
            await create_pole(PoleCreate(job_id=job_id, pole_number=(it.label or "")[:40], latitude=it.lat, longitude=it.lng, notes=notes, standalone=True, last_modified_by=who))
            created["poles"] += 1
        else:
            t = it.type if it.type in UNDERGROUND_TYPES else "Handhole"
            await create_underground(UndergroundCreate(job_id=job_id, type=t, label=(it.label or "")[:60], latitude=it.lat, longitude=it.lng, notes=notes, standalone=True, last_modified_by=who))
            created["underground"] += 1
    return created
