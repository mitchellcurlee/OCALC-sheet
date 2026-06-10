# Map annotation API endpoints
from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime, timezone
import math

from models.annotation import MapAnnotation, MapAnnotationCreate, MapAnnotationUpdate

router = APIRouter()

# Database reference (set by server.py)
_db = None

def set_db(database):
    global _db
    _db = database


def haversine_feet(lat1, lon1, lat2, lon2):
    """Calculate distance in feet between two GPS coordinates"""
    R = 6371000  # Earth radius in meters
    FEET_PER_METER = 3.28084
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c * FEET_PER_METER


@router.get("/jobs/{job_id}/annotations", response_model=List[MapAnnotation])
async def get_job_annotations(job_id: str):
    """Get all annotations for a job"""
    annotations = await _db.annotations.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    return annotations


@router.post("/jobs/{job_id}/annotations", response_model=MapAnnotation, status_code=201)
async def create_annotation(job_id: str, data: MapAnnotationCreate):
    """Create a new annotation"""
    if data.job_id != job_id:
        data.job_id = job_id
    
    annotation = MapAnnotation(**data.model_dump())
    
    # Auto-calculate distance for measurements
    if annotation.type == "measurement" and annotation.end_latitude and annotation.end_longitude:
        annotation.distance_ft = round(haversine_feet(
            annotation.latitude, annotation.longitude,
            annotation.end_latitude, annotation.end_longitude
        ), 1)
    
    doc = annotation.model_dump()
    await _db.annotations.insert_one(doc)
    return annotation


@router.put("/jobs/{job_id}/annotations/{annotation_id}", response_model=MapAnnotation)
async def update_annotation(job_id: str, annotation_id: str, data: MapAnnotationUpdate):
    """Update an annotation"""
    existing = await _db.annotations.find_one({"id": annotation_id, "job_id": job_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Recalculate distance if coordinates changed
    new_lat = update_data.get("latitude", existing.get("latitude"))
    new_lon = update_data.get("longitude", existing.get("longitude"))
    new_end_lat = update_data.get("end_latitude", existing.get("end_latitude"))
    new_end_lon = update_data.get("end_longitude", existing.get("end_longitude"))
    
    if existing.get("type") == "measurement" and new_end_lat and new_end_lon:
        update_data["distance_ft"] = round(haversine_feet(new_lat, new_lon, new_end_lat, new_end_lon), 1)
    
    await _db.annotations.update_one({"id": annotation_id}, {"$set": update_data})
    updated = await _db.annotations.find_one({"id": annotation_id}, {"_id": 0})
    return updated


@router.delete("/jobs/{job_id}/annotations/{annotation_id}")
async def delete_annotation(job_id: str, annotation_id: str):
    """Delete an annotation"""
    result = await _db.annotations.delete_one({"id": annotation_id, "job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"message": "Annotation deleted"}
