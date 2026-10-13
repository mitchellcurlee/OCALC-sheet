import json
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

ATTACHMENT_KEYS = ("owner", "location", "height", "hoa_type", "notes", "address", "photos")


def _norm(v: Any) -> Any:
    if v in (None, ""):
        return None
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def dedupe_attachments(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop exact repeats of an attachment row (same owner/location/height/type/notes/address/photos), keeping first occurrence."""
    seen = set()
    out: List[Dict[str, Any]] = []
    for r in rows or []:
        if not isinstance(r, dict):
            continue
        key = json.dumps({k: _norm(r.get(k)) for k in ATTACHMENT_KEYS}, sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def dedupe_list(items: List[Any]) -> List[Any]:
    seen = set()
    out = []
    for x in items or []:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


async def migrate_duplicate_entries(db) -> Dict[str, int]:
    """One-off cleanup of already-saved duplicates: pole attachment rows / HOA markup photos and underground photo lists."""
    counts = {"poles": 0, "underground": 0}
    async for p in db.poles.find({}, {"_id": 0, "id": 1, "attachments": 1, "hoa_markup_photos": 1}):
        upd = {}
        att = p.get("attachments") or []
        if (d := dedupe_attachments(att)) != att:
            upd["attachments"] = d
        hoa = p.get("hoa_markup_photos") or []
        if (d := dedupe_list(hoa)) != hoa:
            upd["hoa_markup_photos"] = d
        if upd:
            await db.poles.update_one({"id": p["id"]}, {"$set": upd})
            counts["poles"] += 1
    async for u in db.underground.find({}, {"_id": 0, "id": 1, "photos": 1}):
        ph = u.get("photos") or []
        if (d := dedupe_list(ph)) != ph:
            await db.underground.update_one({"id": u["id"]}, {"$set": {"photos": d}})
            counts["underground"] += 1
    return counts
