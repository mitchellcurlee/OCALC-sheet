# Route segment API endpoints for editable map paths
from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime, timezone

from models.route import RouteSegment, RouteSegmentCreate, RouteSegmentUpdate

router = APIRouter()

# Database reference (set by server.py)
_db = None

def set_db(database):
    global _db
    _db = database


@router.get("/jobs/{job_id}/routes", response_model=List[RouteSegment])
async def get_job_routes(job_id: str):
    """Get all custom route segments for a job"""
    routes = await _db.routes.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    return routes


@router.post("/jobs/{job_id}/routes", response_model=RouteSegment, status_code=201)
async def create_route_segment(job_id: str, route_data: RouteSegmentCreate):
    """Create a new route segment"""
    if route_data.job_id != job_id:
        route_data.job_id = job_id
    
    route = RouteSegment(**route_data.model_dump())
    doc = route.model_dump()
    await _db.routes.insert_one(doc)
    return route


@router.put("/jobs/{job_id}/routes/{segment_id}", response_model=RouteSegment)
async def update_route_segment(job_id: str, segment_id: str, route_data: RouteSegmentUpdate):
    """Update a route segment's waypoints"""
    existing = await _db.routes.find_one({"id": segment_id, "job_id": job_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Route segment not found")
    
    update_data = {k: v for k, v in route_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Convert waypoints to dict format
    if "waypoints" in update_data:
        update_data["waypoints"] = [wp.model_dump() if hasattr(wp, 'model_dump') else wp for wp in update_data["waypoints"]]
    
    await _db.routes.update_one({"id": segment_id}, {"$set": update_data})
    updated = await _db.routes.find_one({"id": segment_id}, {"_id": 0})
    return updated


@router.delete("/jobs/{job_id}/routes/{segment_id}")
async def delete_route_segment(job_id: str, segment_id: str):
    """Delete a route segment"""
    result = await _db.routes.delete_one({"id": segment_id, "job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Route segment not found")
    return {"message": "Route segment deleted"}


@router.post("/jobs/{job_id}/routes/bulk", response_model=List[RouteSegment])
async def bulk_save_routes(job_id: str, routes: List[RouteSegmentCreate]):
    """Bulk save/update route segments for a job"""
    # Delete existing routes for this job
    await _db.routes.delete_many({"job_id": job_id})
    
    # Insert new routes
    saved_routes = []
    for route_data in routes:
        if route_data.job_id != job_id:
            route_data.job_id = job_id
        route = RouteSegment(**route_data.model_dump())
        doc = route.model_dump()
        await _db.routes.insert_one(doc)
        saved_routes.append(route)
    
    return saved_routes
