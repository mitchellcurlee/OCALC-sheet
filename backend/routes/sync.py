"""
Offline Sync API endpoints.

This module handles syncing data between offline clients and the server.
Clients queue changes locally in IndexedDB when offline, then sync when back online.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime, timezone
import uuid

from services.auth import get_current_user, is_admin_user

router = APIRouter(prefix="/sync", tags=["sync"])

_db = None


def set_db(db):
    global _db
    _db = db


class SyncAction(BaseModel):
    """A single queued action from the offline client"""
    id: str  # Client-generated action ID
    action: str  # "create", "update", "delete"
    entity: str  # "pole", "job", "underground"
    entity_id: Optional[str] = None  # ID of entity (for update/delete)
    data: Optional[dict] = None  # Payload for create/update
    timestamp: str  # When action was queued offline


class SyncRequest(BaseModel):
    """Batch of offline actions to sync"""
    actions: List[SyncAction]
    last_sync: Optional[str] = None  # ISO timestamp of last successful sync


class SyncResult(BaseModel):
    """Result of a single sync action"""
    action_id: str
    success: bool
    server_id: Optional[str] = None  # Server-assigned ID for creates
    error: Optional[str] = None


class SyncResponse(BaseModel):
    """Response to a sync request"""
    results: List[SyncResult]
    server_time: str
    changes: dict  # Changes from server since last_sync


@router.post("/push", response_model=SyncResponse)
async def push_sync(request: SyncRequest, current_user: dict = Depends(get_current_user)):
    """
    Push offline changes to the server.
    
    Processes each action in order and returns results.
    Actions that fail don't block subsequent actions.
    """
    results = []
    
    for action in request.actions:
        try:
            result = await _process_action(action, current_user)
            results.append(result)
        except Exception as e:
            results.append(SyncResult(
                action_id=action.id,
                success=False,
                error=str(e)
            ))
    
    # Get changes since last sync for bidirectional sync
    changes = {}
    if request.last_sync:
        changes = await _get_changes_since(request.last_sync, current_user)
    
    return SyncResponse(
        results=results,
        server_time=datetime.now(timezone.utc).isoformat(),
        changes=changes
    )


@router.get("/pull")
async def pull_sync(since: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """
    Pull all data or changes since a timestamp.
    
    If `since` is provided, returns only items updated after that time.
    Otherwise returns all user's data for initial sync.
    """
    if since:
        changes = await _get_changes_since(since, current_user)
    else:
        changes = await _get_full_data(current_user)
    
    return {
        "data": changes,
        "server_time": datetime.now(timezone.utc).isoformat()
    }


async def _process_action(action: SyncAction, user: dict) -> SyncResult:
    """Process a single sync action"""
    
    if action.entity == "pole":
        return await _sync_pole(action, user)
    elif action.entity == "job":
        return await _sync_job(action, user)
    elif action.entity == "underground":
        return await _sync_underground(action, user)
    else:
        return SyncResult(
            action_id=action.id,
            success=False,
            error=f"Unknown entity type: {action.entity}"
        )


async def _sync_pole(action: SyncAction, user: dict) -> SyncResult:
    """Handle pole sync actions"""
    from models.pole import Pole
    
    if action.action == "create":
        data = action.data or {}
        # Verify user has access to the job
        job = await _db.jobs.find_one({"id": data.get("job_id")})
        if not job:
            return SyncResult(action_id=action.id, success=False, error="Job not found")
        if job["user_id"] != user["id"] and not is_admin_user(user):
            return SyncResult(action_id=action.id, success=False, error="Access denied")
        
        pole = Pole(**data)
        await _db.poles.insert_one(pole.model_dump())
        return SyncResult(action_id=action.id, success=True, server_id=pole.id)
    
    elif action.action == "update":
        existing = await _db.poles.find_one({"id": action.entity_id})
        if not existing:
            return SyncResult(action_id=action.id, success=False, error="Pole not found")
        
        update_data = {k: v for k, v in (action.data or {}).items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _db.poles.update_one({"id": action.entity_id}, {"$set": update_data})
        return SyncResult(action_id=action.id, success=True, server_id=action.entity_id)
    
    elif action.action == "delete":
        result = await _db.poles.delete_one({"id": action.entity_id})
        if result.deleted_count == 0:
            return SyncResult(action_id=action.id, success=False, error="Pole not found")
        return SyncResult(action_id=action.id, success=True)
    
    return SyncResult(action_id=action.id, success=False, error=f"Unknown action: {action.action}")


async def _sync_job(action: SyncAction, user: dict) -> SyncResult:
    """Handle job sync actions"""
    from models.job import Job
    
    if action.action == "create":
        data = action.data or {}
        job_kwargs = {}
        if data.get("id"):
            job_kwargs["id"] = data["id"]
        job = Job(
            name=data.get("name", "Untitled"),
            description=data.get("description"),
            location=data.get("location"),
            user_id=user["id"],
            user_email=user.get("email", ""),
            **job_kwargs
        )
        await _db.jobs.insert_one(job.model_dump())
        return SyncResult(action_id=action.id, success=True, server_id=job.id)
    
    elif action.action == "update":
        if is_admin_user(user):
            existing = await _db.jobs.find_one({"id": action.entity_id})
        else:
            existing = await _db.jobs.find_one({"id": action.entity_id, "user_id": user["id"]})
        if not existing:
            return SyncResult(action_id=action.id, success=False, error="Job not found")
        
        update_data = {k: v for k, v in (action.data or {}).items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _db.jobs.update_one({"id": action.entity_id}, {"$set": update_data})
        return SyncResult(action_id=action.id, success=True, server_id=action.entity_id)
    
    elif action.action == "delete":
        if is_admin_user(user):
            existing = await _db.jobs.find_one({"id": action.entity_id})
        else:
            existing = await _db.jobs.find_one({"id": action.entity_id, "user_id": user["id"]})
        if not existing:
            return SyncResult(action_id=action.id, success=False, error="Job not found")
        
        await _db.poles.delete_many({"job_id": action.entity_id})
        await _db.underground.delete_many({"job_id": action.entity_id})
        await _db.jobs.delete_one({"id": action.entity_id})
        return SyncResult(action_id=action.id, success=True)
    
    return SyncResult(action_id=action.id, success=False, error=f"Unknown action: {action.action}")


async def _sync_underground(action: SyncAction, user: dict) -> SyncResult:
    """Handle underground sync actions"""
    from models.underground import Underground
    
    if action.action == "create":
        data = action.data or {}
        job = await _db.jobs.find_one({"id": data.get("job_id")})
        if not job:
            return SyncResult(action_id=action.id, success=False, error="Job not found")
        if job["user_id"] != user["id"] and not is_admin_user(user):
            return SyncResult(action_id=action.id, success=False, error="Access denied")
        item = Underground(**data)
        await _db.underground.insert_one(item.model_dump())
        return SyncResult(action_id=action.id, success=True, server_id=item.id)
    
    elif action.action == "update":
        existing = await _db.underground.find_one({"id": action.entity_id})
        if not existing:
            return SyncResult(action_id=action.id, success=False, error="Underground item not found")
        
        updates = {k: v for k, v in (action.data or {}).items() if v is not None}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _db.underground.update_one({"id": action.entity_id}, {"$set": updates})
        return SyncResult(action_id=action.id, success=True, server_id=action.entity_id)
    
    elif action.action == "delete":
        result = await _db.underground.delete_one({"id": action.entity_id})
        if result.deleted_count == 0:
            return SyncResult(action_id=action.id, success=False, error="Underground item not found")
        return SyncResult(action_id=action.id, success=True)
    
    return SyncResult(action_id=action.id, success=False, error=f"Unknown action: {action.action}")


async def _get_changes_since(since: str, user: dict) -> dict:
    """Get all changes since a timestamp"""
    query_filter = {"updated_at": {"$gt": since}}
    
    if is_admin_user(user):
        jobs = await _db.jobs.find(query_filter, {"_id": 0}).to_list(10000)
    else:
        jobs = await _db.jobs.find({**query_filter, "user_id": user["id"]}, {"_id": 0}).to_list(10000)
    
    job_ids = [j["id"] for j in jobs]
    if is_admin_user(user):
        all_user_jobs = await _db.jobs.find({}, {"_id": 0, "id": 1}).to_list(10000)
    else:
        all_user_jobs = await _db.jobs.find({"user_id": user["id"]}, {"_id": 0, "id": 1}).to_list(10000)
    all_job_ids = [j["id"] for j in all_user_jobs]
    
    poles = await _db.poles.find({**query_filter, "job_id": {"$in": all_job_ids}}, {"_id": 0}).to_list(10000)
    underground = await _db.underground.find({**query_filter, "job_id": {"$in": all_job_ids}}, {"_id": 0}).to_list(10000)
    
    return {
        "jobs": jobs,
        "poles": poles,
        "underground": underground
    }


async def _get_full_data(user: dict) -> dict:
    """Get all user data for initial sync"""
    if is_admin_user(user):
        jobs = await _db.jobs.find({}, {"_id": 0}).to_list(10000)
    else:
        jobs = await _db.jobs.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)
    
    job_ids = [j["id"] for j in jobs]
    poles = await _db.poles.find({"job_id": {"$in": job_ids}}, {"_id": 0}).to_list(10000)
    underground = await _db.underground.find({"job_id": {"$in": job_ids}}, {"_id": 0}).to_list(10000)
    
    return {
        "jobs": jobs,
        "poles": poles,
        "underground": underground
    }
