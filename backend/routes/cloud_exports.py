import io
import os
import uuid
import asyncio
import tempfile
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from services.auth import get_current_user
from services.storage import put_object, get_object, init_storage

router = APIRouter()
_db = None


def set_db(db):
    global _db
    _db = db


def _storage_path(job_id: str, export_type: str) -> str:
    return f"cloud_exports/{job_id}/{export_type}"


async def _get_job(job_id: str, current_user: dict) -> dict:
    from routes.jobs import can_access_job
    job = await can_access_job(job_id, current_user)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _upsert_record(job_id, export_type, filename, size, content_type, user):
    now = datetime.now(timezone.utc).isoformat()
    await _db.cloud_exports.update_one(
        {"job_id": job_id, "export_type": export_type},
        {
            "$set": {
                "job_id": job_id, "export_type": export_type, "filename": filename,
                "size": size, "content_type": content_type,
                "updated_at": now, "updated_by": user.get("email", ""),
            },
            "$setOnInsert": {"id": str(uuid.uuid4())},
        },
        upsert=True,
    )


@router.get("/jobs/{job_id}/cloud-exports")
async def list_cloud_exports(job_id: str, current_user: dict = Depends(get_current_user)):
    await _get_job(job_id, current_user)
    docs = await _db.cloud_exports.find({"job_id": job_id}, {"_id": 0}).to_list(100)
    docs.sort(key=lambda d: d.get("updated_at") or "", reverse=True)
    return docs


ALLOWED_EXPORT_TYPES = {"job_excel", "ase_excel", "sow_docx", "permission_stamp", "photos_zip", "map_image", "map_pages_zip"}


@router.post("/jobs/{job_id}/cloud-exports/upload")
async def upload_cloud_export(
    job_id: str,
    export_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Store a client-generated export file in the app cloud (overwrites previous of the same type)."""
    if export_type not in ALLOWED_EXPORT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown export type")
    await _get_job(job_id, current_user)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    content_type = file.content_type or "application/octet-stream"
    await asyncio.to_thread(put_object, _storage_path(job_id, export_type), data, content_type)
    await _upsert_record(job_id, export_type, file.filename or export_type, len(data), content_type, current_user)
    return {"message": "Saved to cloud", "export_type": export_type, "size": len(data)}


@router.post("/jobs/{job_id}/cloud-exports/photos-zip")
async def cloud_save_photos_zip(job_id: str, current_user: dict = Depends(get_current_user)):
    """Server-side: build the job photos ZIP and store it in the app cloud (overwrites previous)."""
    from routes.jobs import build_job_photo_entries, _stream_zip
    from services.helpers import pole_sort_key

    job = await _get_job(job_id, current_user)
    poles = await _db.poles.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    poles.sort(key=pole_sort_key)
    underground_items = await _db.underground.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    underground_items.sort(key=lambda x: (x.get("sort_order") or 9999, x.get("created_at") or ""))

    entries, zip_filename = build_job_photo_entries(job, poles, underground_items)
    if not entries:
        raise HTTPException(status_code=404, detail="No photos found for this job")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    try:
        async for chunk in _stream_zip(entries):
            tmp.write(chunk)
        tmp.close()
        size = os.path.getsize(tmp.name)
        await asyncio.to_thread(init_storage)

        def _upload():
            with open(tmp.name, "rb") as f:
                put_object(_storage_path(job_id, "photos_zip"), f, "application/zip")

        try:
            await asyncio.to_thread(_upload)
        except Exception:
            await asyncio.to_thread(_upload)
        await _upsert_record(job_id, "photos_zip", zip_filename, size, "application/zip", current_user)
        return {"message": "Photos ZIP saved to cloud", "size": size, "filename": zip_filename}
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@router.get("/jobs/{job_id}/cloud-exports/{export_type}/download")
async def download_cloud_export(job_id: str, export_type: str, current_user: dict = Depends(get_current_user)):
    await _get_job(job_id, current_user)
    rec = await _db.cloud_exports.find_one({"job_id": job_id, "export_type": export_type}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="No cloud export found")
    try:
        data, content_type = await asyncio.to_thread(get_object, _storage_path(job_id, export_type))
    except Exception:
        raise HTTPException(status_code=404, detail="Cloud export file is no longer available")
    return StreamingResponse(
        io.BytesIO(data),
        media_type=rec.get("content_type") or content_type,
        headers={"Content-Disposition": f'attachment; filename="{rec.get("filename") or export_type}"'},
    )


@router.delete("/jobs/{job_id}/cloud-exports/{export_type}")
async def delete_cloud_export(job_id: str, export_type: str, current_user: dict = Depends(get_current_user)):
    await _get_job(job_id, current_user)
    res = await _db.cloud_exports.delete_one({"job_id": job_id, "export_type": export_type})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No cloud export found")
    return {"message": "Cloud export removed"}
