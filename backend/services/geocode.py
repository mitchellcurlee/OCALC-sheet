import asyncio
import logging
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)


def geocode_sync(q: str) -> Optional[dict]:
    """US Census geocoder first (good for Texas street addresses), OSM Nominatim as fallback."""
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
        r = requests.get("https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates",
                         params={"SingleLine": q, "f": "json", "maxLocations": 1, "outFields": "Match_addr"}, timeout=12)
        c = (r.json().get("candidates") or [])
        if c and c[0].get("score", 0) >= 80:
            loc = c[0]["location"]
            return {"address": c[0].get("address") or q, "lat": float(loc["y"]), "lng": float(loc["x"])}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"arcgis geocode failed: {e}")
    try:
        r = requests.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "json", "limit": 1},
                         headers={"User-Agent": "PoleTracker/1.0"}, timeout=12)
        hits = r.json()
        if hits:
            return {"address": hits[0].get("display_name") or q, "lat": float(hits[0]["lat"]), "lng": float(hits[0]["lon"])}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"nominatim geocode failed: {e}")
    return None


async def geocode(q: str) -> Optional[dict]:
    return await asyncio.to_thread(geocode_sync, q)


async def ensure_job_geo(db, job: dict) -> Optional[tuple]:
    """Cached geocode of job.location (jobs.geo = {q, lat, lng}); re-geocodes when the address changes. Returns (lat, lng) or None."""
    q = (job.get("location") or "").strip()
    if len(q) < 4:
        return None
    geo = job.get("geo") or {}
    if geo.get("q") == q:
        if geo.get("lat") is not None:
            return (geo["lat"], geo["lng"])
        if time.time() - (geo.get("at") or 0) < 86400:  # failed lookup: retry once a day
            return None
    hit = await geocode(q)
    geo = {"q": q, "lat": hit["lat"] if hit else None, "lng": hit["lng"] if hit else None, "at": time.time()}
    await db.jobs.update_one({"id": job["id"]}, {"$set": {"geo": geo}})
    job["geo"] = geo
    return (geo["lat"], geo["lng"]) if hit else None
