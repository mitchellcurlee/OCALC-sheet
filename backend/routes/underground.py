from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone

from models.underground import Underground, UndergroundCreate, UndergroundUpdate
from services.auth import get_current_user
from services.helpers import pole_sort_key

router = APIRouter(tags=["underground"])

_db = None


def set_db(db):
    global _db
    _db = db


def _pos(doc):
    try:
        lat, lng = float(doc.get("latitude")), float(doc.get("longitude"))
        return (lat, lng)
    except (TypeError, ValueError):
        return None


def _dist2(p, a):
    dy = (p[0] - a[0]) * 364000.0
    dx = (p[1] - a[1]) * 288200.0
    return dx * dx + dy * dy


def _seg_dist2(p, a, b):
    ax, ay = a[1] * 288200.0, a[0] * 364000.0
    bx, by = b[1] * 288200.0, b[0] * 364000.0
    px, py = p[1] * 288200.0, p[0] * 364000.0
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2


async def _insert_into_route_order(item):
    """Slot a new GPS attribute into the job's combined order at its nearest route position.

    Returns the sort_order to assign, renumbering existing items as needed, or None."""
    try:
        lat, lng = float(item.latitude), float(item.longitude)
    except (TypeError, ValueError):
        return None
    p = (lat, lng)
    fields = {"_id": 0, "id": 1, "sort_order": 1, "latitude": 1, "longitude": 1, "created_at": 1}
    poles = await _db.poles.find({"job_id": item.job_id}, dict(fields, pole_number=1)).to_list(10000)
    ugs = await _db.underground.find({"job_id": item.job_id}, fields).to_list(10000)
    poles.sort(key=pole_sort_key)
    ugs.sort(key=lambda x: (x.get("sort_order") if x.get("sort_order") is not None else float("inf"), x.get("created_at") or ""))
    all_items = [dict(x, kind="pole") for x in poles] + [dict(x, kind="ug") for x in ugs]
    all_items.sort(key=lambda x: x.get("sort_order") if x.get("sort_order") is not None else float("inf"))
    chain = [x for x in all_items if _pos(x)]
    if len(chain) < 2:
        return None
    n = len(chain)
    best_k, best = n, _dist2(p, _pos(chain[-1]))
    c0 = _dist2(p, _pos(chain[0]))
    if c0 < best - 0.01:
        best, best_k = c0, 0
    for i in range(n - 1):
        c = _seg_dist2(p, _pos(chain[i]), _pos(chain[i + 1]))
        if c < best - 0.01:
            best, best_k = c, i + 1
    if best_k >= n:
        full_idx = len(all_items)
    elif best_k == 0:
        full_idx = all_items.index(chain[0])
    else:
        full_idx = all_items.index(chain[best_k - 1]) + 1
    all_items.insert(full_idx, {"id": item.id, "kind": "new"})
    assigned = None
    for i, x in enumerate(all_items):
        if x["kind"] == "new":
            assigned = i
        elif x.get("sort_order") != i:
            coll = _db.poles if x["kind"] == "pole" else _db.underground
            await coll.update_one({"id": x["id"]}, {"$set": {"sort_order": i}})
    return assigned


@router.post("/underground", response_model=Underground, status_code=201)
async def create_underground(data: UndergroundCreate):
    item = Underground(**data.model_dump())
    if item.sort_order is None:
        assigned = await _insert_into_route_order(item)
        if assigned is not None:
            item.sort_order = assigned
    await _db.underground.insert_one(item.model_dump())
    return item


@router.get("/jobs/{job_id}/underground", response_model=List[Underground])
async def get_job_underground(job_id: str):
    items = await _db.underground.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    # Sort by sort_order if set, then by created_at
    items.sort(key=lambda x: (x.get("sort_order") if x.get("sort_order") is not None else float('inf'), x.get("created_at", "")))
    return items


@router.get("/underground/{item_id}", response_model=Underground)
async def get_underground(item_id: str):
    item = await _db.underground.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Underground item not found")
    return item


@router.put("/underground/{item_id}", response_model=Underground)
async def update_underground(item_id: str, data: UndergroundUpdate, current_user: dict = Depends(get_current_user)):
    existing = await _db.underground.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Underground item not found")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["last_modified_by"] = current_user.get("email", "")
    await _db.underground.update_one({"id": item_id}, {"$set": updates})
    merged = {**existing, **updates}
    return Underground(**merged)


@router.delete("/underground/{item_id}")
async def delete_underground(item_id: str, current_user: dict = Depends(get_current_user)):
    from routes.trash import archive_entity
    existing = await _db.underground.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Underground item not found")
    await archive_entity(_db, "underground", existing, current_user)
    await _db.underground.delete_one({"id": item_id})
    return {"message": "Underground item moved to Deleted Items"}
