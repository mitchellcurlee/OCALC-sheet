# Connection API endpoints for custom map item connections
from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime, timezone

from models.connection import Connection, ConnectionCreate, ConnectionUpdate

router = APIRouter()

# Database reference (set by server.py)
_db = None

def set_db(database):
    global _db
    _db = database


@router.get("/jobs/{job_id}/connections", response_model=List[Connection])
async def get_job_connections(job_id: str):
    """Get all custom connections for a job"""
    connections = await _db.connections.find({"job_id": job_id}, {"_id": 0}).to_list(1000)
    return connections


@router.post("/jobs/{job_id}/connections", response_model=Connection, status_code=201)
async def create_connection(job_id: str, conn_data: ConnectionCreate):
    """Create a new connection between items"""
    if conn_data.job_id != job_id:
        conn_data.job_id = job_id
    
    conn = Connection(**conn_data.model_dump())
    doc = conn.model_dump()
    await _db.connections.insert_one(doc)
    return conn


@router.put("/jobs/{job_id}/connections/{connection_id}", response_model=Connection)
async def update_connection(job_id: str, connection_id: str, conn_data: ConnectionUpdate):
    """Update a connection"""
    existing = await _db.connections.find_one({"id": connection_id, "job_id": job_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    update_data = {k: v for k, v in conn_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.connections.update_one({"id": connection_id}, {"$set": update_data})
    updated = await _db.connections.find_one({"id": connection_id}, {"_id": 0})
    return updated


@router.delete("/jobs/{job_id}/connections/{connection_id}")
async def delete_connection(job_id: str, connection_id: str):
    """Delete a connection"""
    result = await _db.connections.delete_one({"id": connection_id, "job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"message": "Connection deleted"}


@router.post("/jobs/{job_id}/connections/bulk", response_model=List[Connection])
async def bulk_save_connections(job_id: str, connections: List[ConnectionCreate]):
    """Bulk save/update connections for a job - replaces all existing"""
    # Delete existing connections for this job
    await _db.connections.delete_many({"job_id": job_id})
    
    # Insert new connections
    saved = []
    for conn_data in connections:
        if conn_data.job_id != job_id:
            conn_data.job_id = job_id
        conn = Connection(**conn_data.model_dump())
        doc = conn.model_dump()
        await _db.connections.insert_one(doc)
        saved.append(conn)
    
    return saved
