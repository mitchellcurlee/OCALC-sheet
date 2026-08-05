import os
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from services.auth import get_current_user, is_admin_user, is_mastec_byers_admin

router = APIRouter(tags=["backup"])

_db = None

SETTINGS_KEY = "atlas_backup"


def set_db(db):
    global _db
    _db = db


def _require_admin(user: dict):
    if not (is_admin_user(user) or is_mastec_byers_admin(user)):
        raise HTTPException(status_code=403, detail="Admin access required")


def _mask(uri: str) -> str:
    try:
        if "@" in uri and "://" in uri:
            scheme, rest = uri.split("://", 1)
            creds, host = rest.rsplit("@", 1)
            if ":" in creds:
                username, _pw = creds.split(":", 1)
                return f"{scheme}://{username}:••••••@{host}"
        return uri
    except Exception:
        return "configured"


class BackupConfig(BaseModel):
    atlas_uri: str


@router.get("/admin/backup")
async def get_backup_status(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    cfg = await _db.settings.find_one({"key": SETTINGS_KEY}, {"_id": 0})
    if not cfg or not cfg.get("atlas_uri"):
        return {"configured": False}
    return {
        "configured": True,
        "uri_masked": _mask(cfg.get("atlas_uri", "")),
        "last_backup_at": cfg.get("last_backup_at"),
        "last_backup_summary": cfg.get("last_backup_summary"),
    }


@router.put("/admin/backup/config")
async def save_backup_config(body: BackupConfig, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    uri = body.atlas_uri.strip()
    if not (uri.startswith("mongodb://") or uri.startswith("mongodb+srv://")):
        raise HTTPException(status_code=400, detail="URI must start with mongodb:// or mongodb+srv://")
    if "<db_password>" in uri or "<password>" in uri:
        raise HTTPException(status_code=400, detail="Replace <db_password> with your actual database password")
    own_host = (os.environ.get("MONGO_URL", "").split("://")[-1].split("/")[0].rsplit("@", 1)[-1])
    target_host = uri.split("://")[-1].split("/")[0].rsplit("@", 1)[-1].split("?")[0]
    if own_host and target_host == own_host:
        raise HTTPException(status_code=400, detail="Backup target must be a different MongoDB server than the app's own database")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=10000)
    try:
        await client.admin.command("ping")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not connect to Atlas: {e}")
    finally:
        client.close()
    await _db.settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": {"atlas_uri": uri, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "uri_masked": _mask(uri)}


@router.post("/admin/backup/run")
async def run_backup(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    cfg = await _db.settings.find_one({"key": SETTINGS_KEY})
    if not cfg or not cfg.get("atlas_uri"):
        raise HTTPException(status_code=400, detail="Atlas backup is not configured yet — save your connection string first")
    target_db_name = os.environ.get("DB_NAME", "poletracker")
    client = AsyncIOMotorClient(cfg["atlas_uri"], serverSelectionTimeoutMS=15000)
    started = time.time()
    results = []
    total = 0
    try:
        await client.admin.command("ping")
        target = client[target_db_name]
        names = await _db.list_collection_names()
        for name in sorted(names):
            if name.startswith("system."):
                continue
            docs = await _db[name].find({}).to_list(length=None)
            await target[name].drop()
            count = 0
            for i in range(0, len(docs), 500):
                batch = docs[i:i + 500]
                if batch:
                    await target[name].insert_many(batch, ordered=False)
                    count += len(batch)
            results.append({"collection": name, "documents": count})
            total += count
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")
    finally:
        client.close()
    summary = {
        "total_documents": total,
        "collections": results,
        "duration_seconds": round(time.time() - started, 1),
        "target_db": target_db_name,
    }
    now = datetime.now(timezone.utc).isoformat()
    await _db.settings.update_one({"key": SETTINGS_KEY}, {"$set": {"last_backup_at": now, "last_backup_summary": summary}})
    return {"ok": True, "backed_up_at": now, **summary}
