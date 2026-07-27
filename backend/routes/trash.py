from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from services.auth import get_current_user

router = APIRouter(tags=["trash"])

_db = None

JOB_CHILD_COLLECTIONS = ["poles", "underground", "connections", "routes", "annotations"]


def set_db(db):
    global _db
    _db = db


def _strip(doc):
    return {k: v for k, v in (doc or {}).items() if k != "_id"}


async def archive_entity(db, entity_type, doc, user, children=None, job_name=None):
    """Store a deleted entity in the per-user trash so it can be restored later."""
    doc = _strip(doc)
    if entity_type == "job":
        name = doc.get("name") or "Untitled job"
        job_name = name
    elif entity_type == "pole":
        name = f"Pole {doc.get('pole_number') or (doc.get('id') or '')[:8]}"
    else:
        name = f"{doc.get('type', 'Underground')} {doc.get('label') or ''}".strip()
    if entity_type != "job" and not job_name and doc.get("job_id"):
        j = await db.jobs.find_one({"id": doc["job_id"]}, {"_id": 0, "name": 1})
        if j:
            job_name = j.get("name")
    entry = {
        "id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": doc.get("id"),
        "name": name,
        "job_id": doc.get("id") if entity_type == "job" else doc.get("job_id"),
        "job_name": job_name,
        "deleted_by": user.get("id"),
        "deleted_by_email": user.get("email", ""),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "data": doc,
        "children": {k: [_strip(d) for d in v] for k, v in (children or {}).items()},
    }
    await db.trash.insert_one(dict(entry))
    return entry["id"]


@router.get("/trash")
async def list_trash(current_user: dict = Depends(get_current_user)):
    """List the current user's deleted items (newest first, without heavy payloads)."""
    pipeline = [
        {"$match": {"deleted_by": current_user["id"]}},
        {"$sort": {"deleted_at": -1}},
        {"$project": {
            "_id": 0, "id": 1, "entity_type": 1, "entity_id": 1, "name": 1,
            "job_id": 1, "job_name": 1, "deleted_at": 1,
            "pole_count": {"$size": {"$ifNull": ["$children.poles", []]}},
            "underground_count": {"$size": {"$ifNull": ["$children.underground", []]}},
        }},
    ]
    return [doc async for doc in _db.trash.aggregate(pipeline)]


@router.post("/trash/{trash_id}/restore")
async def restore_trash(trash_id: str, current_user: dict = Depends(get_current_user)):
    """Restore a deleted item back to the app. Jobs restore with everything inside them."""
    entry = await _db.trash.find_one({"id": trash_id, "deleted_by": current_user["id"]}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Deleted item not found")
    etype = entry["entity_type"]
    data = _strip(entry.get("data") or {})
    if not data.get("id"):
        raise HTTPException(status_code=400, detail="Deleted item has no restorable data")

    if etype == "job":
        if await _db.jobs.find_one({"id": data["id"]}):
            raise HTTPException(status_code=409, detail="A job with this ID already exists on the server")
        await _db.jobs.insert_one(dict(data))
        children = entry.get("children") or {}
        restored = {}
        for key in JOB_CHILD_COLLECTIONS:
            coll = _db[key]
            count = 0
            for d in children.get(key) or []:
                d = _strip(d)
                if d.get("id") and not await coll.find_one({"id": d["id"]}):
                    await coll.insert_one(dict(d))
                    count += 1
            restored[key] = count
        await _db.trash.delete_one({"id": trash_id})
        return {"message": f"Restored job '{entry.get('name')}' with everything inside it", "restored": restored}

    coll = _db.poles if etype == "pole" else _db.underground
    job_id = data.get("job_id")
    if job_id and not await _db.jobs.find_one({"id": job_id}):
        raise HTTPException(status_code=400, detail="The job this item belongs to no longer exists. Restore the job first from Deleted Items.")
    if await coll.find_one({"id": data["id"]}):
        raise HTTPException(status_code=409, detail="This item already exists on the server")
    await coll.insert_one(dict(data))
    await _db.trash.delete_one({"id": trash_id})
    return {"message": f"Restored {entry.get('name')}"}


@router.delete("/trash/{trash_id}")
async def purge_trash_item(trash_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a single item from the user's trash."""
    result = await _db.trash.delete_one({"id": trash_id, "deleted_by": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deleted item not found")
    return {"message": "Permanently deleted"}


@router.delete("/trash")
async def empty_trash(current_user: dict = Depends(get_current_user)):
    """Permanently delete everything in the user's trash."""
    result = await _db.trash.delete_many({"deleted_by": current_user["id"]})
    return {"message": f"Permanently deleted {result.deleted_count} item(s)", "deleted": result.deleted_count}
