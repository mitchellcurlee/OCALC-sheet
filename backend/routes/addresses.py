from fastapi import APIRouter, HTTPException, Depends, Query
import asyncio
import logging
import time
import requests

from services.auth import get_current_user

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
