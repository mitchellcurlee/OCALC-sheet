from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

DUPLICATE_WINDOW_SECONDS = 20


async def find_duplicate_create(coll, data: Dict[str, Any], match: Dict[str, Any]) -> Optional[dict]:
    """Return an existing doc when this create is a repeat: same client id, or the same job + identifying
    fields + GPS created within the last few seconds (double tap / retried request)."""
    if data.get("id"):
        doc = await coll.find_one({"id": data["id"]}, {"_id": 0})
        if doc:
            return doc
    if not data.get("job_id"):
        return None
    since = (datetime.now(timezone.utc) - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)).isoformat()
    q: Dict[str, Any] = {"job_id": data["job_id"], "latitude": data.get("latitude"), "longitude": data.get("longitude"), "created_at": {"$gte": since}}
    for k, v in match.items():
        q[k] = v
    return await coll.find_one(q, {"_id": 0})
