from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from datetime import datetime, timezone
import uuid
import asyncio
import re
import logging
import requests

from services.storage import put_object, get_object, MIME_TYPES, APP_NAME
from services.auth import get_current_user
from fastapi import Depends

router = APIRouter(tags=["files"])
logger = logging.getLogger(__name__)

_db = None


def set_db(db):
    global _db
    _db = db


@router.post("/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    """Upload a photo to object storage and return a servable URL."""
    ext = (file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg")
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    try:
        result = await asyncio.to_thread(put_object, path, data, content_type)
    except Exception as e:
        logger.error(f"Photo upload failed: {e}")
        raise HTTPException(status_code=502, detail="Photo upload failed")
    stored_path = result.get("path", path)
    await _db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": stored_path,
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size"),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": f"/api/files/{stored_path}", "path": stored_path}


@router.post("/jobs/{job_id}/files")
async def upload_job_file(job_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload any file type and attach it to a job."""
    ext = (file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin")
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    path = f"{APP_NAME}/jobfiles/{job_id}/{uuid.uuid4()}.{ext}"
    try:
        result = await asyncio.to_thread(put_object, path, data, content_type)
    except Exception as e:
        logger.error(f"Job file upload failed: {e}")
        raise HTTPException(status_code=502, detail="File upload failed")
    stored_path = result.get("path", path)
    doc = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "storage_path": stored_path,
        "original_filename": file.filename or f"file.{ext}",
        "content_type": content_type,
        "size": result.get("size") or len(data),
        "uploaded_by": current_user.get("email", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db.job_files.insert_one(dict(doc))
    doc["url"] = f"/api/files/{stored_path}"
    return doc


@router.get("/jobs/{job_id}/files")
async def list_job_files(job_id: str, current_user: dict = Depends(get_current_user)):
    docs = await _db.job_files.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        d["url"] = f"/api/files/{d['storage_path']}"
    return docs


@router.delete("/jobs/{job_id}/files/{file_id}")
async def delete_job_file(job_id: str, file_id: str, current_user: dict = Depends(get_current_user)):
    result = await _db.job_files.delete_one({"id": file_id, "job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"deleted": True}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    """Publicly serve a stored file (no auth so <img> tags and Excel links work)."""
    record = await _db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    try:
        data, content_type = await asyncio.to_thread(get_object, path)
        ct = (record or {}).get("content_type") or content_type
        return Response(
            content=data, 
            media_type=ct, 
            headers={
                "Cache-Control": "public, max-age=31536000",
                "Access-Control-Allow-Origin": "*"
            }
        )
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


@router.get("/maps/static")
async def maps_static(bbox: str, size: str = "1400,1050", source: str = "esri"):
    """Proxy a single satellite image from Esri World Imagery or USGS Imagery export services."""
    if not re.fullmatch(r"-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}", bbox or ""):
        raise HTTPException(status_code=400, detail="Invalid bbox")
    m = re.fullmatch(r"(\d{2,4}),(\d{2,4})", size or "")
    if not m or int(m.group(1)) > 2048 or int(m.group(2)) > 2048:
        raise HTTPException(status_code=400, detail="Invalid size")
    if source == "usgs":
        base = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export"
    else:
        base = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
    url = f"{base}?bbox={bbox}&bboxSR=3857&imageSR=3857&size={size}&format=png&transparent=false&f=image"
    last_err = None
    for attempt in range(3):
        try:
            resp = await asyncio.to_thread(lambda: requests.get(url, timeout=30))
            resp.raise_for_status()
            return Response(content=resp.content, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})
        except Exception as e:
            last_err = e
            if attempt < 2:
                await asyncio.sleep(0.8 * (attempt + 1))
    logger.error(f"Static map fetch failed after retries: {last_err}")
    raise HTTPException(status_code=502, detail="Map image fetch failed")
