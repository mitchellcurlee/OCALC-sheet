import uuid
from datetime import datetime, timezone

ADDRESS_BLUE = "#2563eb"


def _is_legacy_address_pole(p: dict) -> bool:
    if (p.get("marker_color") or "").lower() != ADDRESS_BLUE:
        return False
    num = (p.get("pole_number") or "").strip()
    if not num:
        return False
    return num == (p.get("address") or "").strip() or (p.get("notes") or "").startswith("Imported from KML")


async def migrate_address_poles(db) -> int:
    """Convert blue 'Address pin' poles (address text as pole number) into underground items of type Address. Idempotent."""
    count = 0
    cursor = db.poles.find({"marker_color": {"$regex": "^#2563eb$", "$options": "i"}}, {"_id": 0})
    async for p in cursor:
        if not _is_legacy_address_pole(p):
            continue
        addr = (p.get("pole_number") or "").strip()
        now = datetime.now(timezone.utc).isoformat()
        item = {
            "id": str(uuid.uuid4()),
            "job_id": p["job_id"],
            "type": "Address",
            "label": addr[:60],
            "address": addr,
            "latitude": p.get("latitude"),
            "longitude": p.get("longitude"),
            "notes": p.get("notes") or "",
            "photos": p.get("photos") or [],
            "standalone": True,
            "label_offset": p.get("label_offset"),
            "label_size": p.get("label_size"),
            "order": p.get("order"),
            "created_at": p.get("created_at") or now,
            "updated_at": now,
            "last_modified_by": p.get("last_modified_by"),
            "converted_from_pole_id": p["id"],
        }
        await db.underground.insert_one(item)
        await db.poles.delete_one({"id": p["id"]})
        count += 1
    return count
