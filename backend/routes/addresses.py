from fastapi import APIRouter, HTTPException, Depends, Query
import asyncio
import logging
import time
import requests

from services.auth import get_current_user, is_admin_user

router = APIRouter()
logger = logging.getLogger(__name__)

NAD_URL = "https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Address_Points_from_National_Address_Database_view/FeatureServer/0/query"
_cache: dict = {}  # bbox key -> (expires_at, rows)
CACHE_TTL = 6 * 3600
MAX_SPAN_DEG = 0.03  # ~2 miles; keeps the NAD query fast


def _title(s: str) -> str:
    return " ".join(w.capitalize() if not w.isdigit() else w for w in (s or "").split())


@router.get("/maps/addresses")
async def map_addresses(
    south: float = Query(...), west: float = Query(...), north: float = Query(...), east: float = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Home address points (USDOT National Address Database) inside a map viewport"""
    if north <= south or east <= west:
        raise HTTPException(status_code=400, detail="Invalid bounds")
    if (north - south) > MAX_SPAN_DEG or (east - west) > MAX_SPAN_DEG:
        return {"addresses": [], "too_wide": True}
    key = f"{south:.4f},{west:.4f},{north:.4f},{east:.4f}"
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return {"addresses": hit[1], "too_wide": False}
    params = {
        "f": "json",
        "where": "1=1",
        "geometry": f'{{"xmin":{west},"ymin":{south},"xmax":{east},"ymax":{north},"spatialReference":{{"wkid":4326}}}}',
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "AddNo_Full,StNam_Full,Unit,Post_City,Zip_Code",
        "returnGeometry": "true",
        "resultRecordCount": "2000",
    }
    try:
        resp = await asyncio.to_thread(lambda: requests.get(NAD_URL, params=params, timeout=40))
        data = resp.json()
    except Exception as e:
        logger.warning(f"NAD address query failed: {e}")
        raise HTTPException(status_code=502, detail="Address service unavailable")
    if "error" in data:
        raise HTTPException(status_code=502, detail="Address service error")
    rows = []
    for f in data.get("features", []):
        a = f.get("attributes") or {}
        g = f.get("geometry") or {}
        num = (a.get("AddNo_Full") or "").strip()
        if not num or "x" not in g:
            continue
        rows.append({
            "lat": g["y"], "lng": g["x"], "num": num, "unit": (a.get("Unit") or "").strip(),
            "street": _title(a.get("StNam_Full")), "city": _title(a.get("Post_City")), "zip": a.get("Zip_Code") or "",
        })
    _cache[key] = (time.time() + CACHE_TTL, rows)
    if len(_cache) > 500:
        for k in list(_cache)[:100]:
            _cache.pop(k, None)
    return {"addresses": rows, "too_wide": False}


STREET_SUFFIXES = {
    "LN", "LANE", "DR", "DRIVE", "RD", "ROAD", "ST", "STREET", "CT", "COURT", "CIR", "CIRCLE", "AVE", "AVENUE", "BLVD",
    "BOULEVARD", "PL", "PLACE", "TRL", "TRAIL", "PKWY", "PARKWAY", "HWY", "HIGHWAY", "WAY", "LOOP", "TER", "TERRACE",
    "CV", "COVE", "PASS", "PATH", "RUN", "BND", "BEND", "XING", "CROSSING", "PT", "POINT", "HL", "HILL", "HOLW", "HOLLOW",
    "VW", "VIEW", "ROW", "SQ", "SQUARE", "RDG", "RIDGE", "GRV", "GROVE", "CRK", "CREEK", "EST", "ESTATES", "MNR", "MANOR",
    "PK", "PARK", "ALY", "ALLEY", "EXPY", "EXPRESSWAY", "FWY", "FREEWAY", "BYP", "BYPASS", "PLZ", "PLAZA", "SPUR",
}
DIRECTIONS = {"N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"}


def street_base_upper(street: str) -> str:
    """'Misty Morning Ln' -> 'MISTY MORNING' (drop trailing street type / direction, uppercase)"""
    parts = [w for w in (street or "").upper().replace(".", "").split() if w]
    while len(parts) > 1 and parts[-1] in DIRECTIONS:
        parts.pop()
    if len(parts) > 1 and parts[-1] in STREET_SUFFIXES:
        parts.pop()
    return " ".join(parts)


async def nearest_address(lat: float, lng: float, max_m: float = 90.0) -> str:
    """Building number + street of the closest NAD address point (empty string if none nearby)"""
    try:
        d = 0.0009
        params = {
            "f": "json", "where": "1=1",
            "geometry": f'{{"xmin":{lng - d},"ymin":{lat - d},"xmax":{lng + d},"ymax":{lat + d},"spatialReference":{{"wkid":4326}}}}',
            "geometryType": "esriGeometryEnvelope", "inSR": "4326", "outSR": "4326", "spatialRel": "esriSpatialRelIntersects",
            "outFields": "AddNo_Full,StNam_Full,Unit", "returnGeometry": "true", "resultRecordCount": "200",
        }
        resp = await asyncio.to_thread(lambda: requests.get(NAD_URL, params=params, timeout=12))
        feats = resp.json().get("features", [])
    except Exception as e:
        logger.warning(f"nearest_address failed: {e}")
        return ""
    best, best_m = None, None
    for f in feats:
        g = f.get("geometry") or {}
        a = f.get("attributes") or {}
        if "x" not in g or not a.get("AddNo_Full"):
            continue
        dy = (g["y"] - lat) * 111320.0
        dx = (g["x"] - lng) * 111320.0 * 0.865
        m = (dx * dx + dy * dy) ** 0.5
        if best_m is None or m < best_m:
            best, best_m = a, m
    if not best or best_m > max_m:
        return ""
    unit = (best.get("Unit") or "").strip()
    # Format used in the span list: "7123 MISTY MORNING"
    return f"{best['AddNo_Full'].strip()}{f' #{unit}' if unit else ''} {street_base_upper(best.get('StNam_Full'))}".strip()


@router.get("/maps/address-at")
async def address_at(lat: float = Query(...), lng: float = Query(...), current_user: dict = Depends(get_current_user)):
    """Nearest home address for a point (used to auto-fill the item's Address box)"""
    return {"address": await nearest_address(lat, lng)}


_db = None


def set_db(db):
    global _db
    _db = db


@router.post("/maps/backfill-addresses")
async def backfill_addresses(force: bool = False, current_user: dict = Depends(get_current_user)):
    """Fill the address of every GPS'd pole/attribute (on jobs this user can see) that has none yet"""
    email = (current_user.get("email") or "").lower()
    q = {"latitude": {"$ne": None}, "longitude": {"$ne": None}}
    if is_admin_user(current_user):
        job_ids = [j["id"] for j in await _db.jobs.find({}, {"_id": 0, "id": 1}).to_list(5000)]  # admins: every job
    else:
        jobs = await _db.jobs.find({"$or": [{"user_id": current_user["id"]}, {"shared_with": email}]}, {"_id": 0, "id": 1}).to_list(5000)
        job_ids = [j["id"] for j in jobs]
        q["job_id"] = {"$in": job_ids}
    if not force:
        q["$or"] = [{"address": None}, {"address": ""}, {"address": {"$exists": False}}]
    poles = await _db.poles.find(q, {"_id": 0, "id": 1, "latitude": 1, "longitude": 1}).to_list(20000)
    ugs = await _db.underground.find(q, {"_id": 0, "id": 1, "latitude": 1, "longitude": 1}).to_list(20000)
    sem = asyncio.Semaphore(6)
    stats = {"jobs": len(job_ids), "poles_checked": len(poles), "attributes_checked": len(ugs), "filled": 0, "no_match": 0}

    async def fill(coll, it):
        async with sem:
            addr = await nearest_address(float(it["latitude"]), float(it["longitude"]))
        if addr:
            await coll.update_one({"id": it["id"]}, {"$set": {"address": addr}})
            stats["filled"] += 1
        else:
            stats["no_match"] += 1

    await asyncio.gather(*[fill(_db.poles, p) for p in poles], *[fill(_db.underground, u) for u in ugs])
    return stats
