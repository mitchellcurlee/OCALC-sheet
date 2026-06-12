from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime, timezone

from models.underground import Underground, UndergroundCreate, UndergroundUpdate

router = APIRouter(tags=["underground"])

_db = None


def set_db(db):
    global _db
    _db = db


@router.post("/underground", response_model=Underground, status_code=201)
async def create_underground(data: UndergroundCreate):
    item = Underground(**data.model_dump())
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
async def update_underground(item_id: str, data: UndergroundUpdate):
    existing = await _db.underground.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Underground item not found")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.underground.update_one({"id": item_id}, {"$set": updates})
    merged = {**existing, **updates}
    return Underground(**merged)


@router.delete("/underground/{item_id}")
async def delete_underground(item_id: str):
    result = await _db.underground.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Underground item not found")
    return {"message": "Underground item deleted successfully"}
