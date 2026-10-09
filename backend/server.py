"""
Power Pole Data Collection API - Main Application

This is the entry point for the FastAPI application.
Route handlers are organized in the routes/ directory.
Models are in models/ and services in services/.
"""

from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(
    title="Power Pole Data Collection API",
    description="API for collecting and managing power pole inspection data",
    version="2.0.0"
)


# Middleware to prevent caching of API responses
class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Add no-cache headers to all API responses (except file downloads)
        if request.url.path.startswith("/api/") and "files/" not in request.url.path:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheMiddleware)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import services and set db reference
from services import auth as auth_service
from services import storage as storage_service

auth_service.set_db(db)

# Import route modules and set db references
from routes import auth as auth_routes
from routes import jobs as jobs_routes
from routes import poles as poles_routes
from routes import underground as underground_routes
from routes import files as files_routes
from routes import sync as sync_routes
from routes import routes as routes_routes
from routes import annotations as annotations_routes
from routes import field_reports as field_reports_routes
from routes import connections as connections_routes
from routes import import_excel as import_excel_routes
from routes import trash as trash_routes
from routes import backup as backup_routes
from routes import cloud_exports as cloud_exports_routes
from routes import addresses as addresses_routes
from routes import kmz as kmz_routes
from routes import kml_import as kml_import_routes
from routes import ase2 as ase2_routes
from routes import spf as spf_routes

auth_routes.set_db(db)
jobs_routes.set_db(db)
poles_routes.set_db(db)
underground_routes.set_db(db)
files_routes.set_db(db)
sync_routes.set_db(db)
routes_routes.set_db(db)
annotations_routes.set_db(db)
field_reports_routes.set_db(db)
connections_routes.set_db(db)
import_excel_routes.set_db(db)
addresses_routes.set_db(db)
kmz_routes.set_db(db)
kml_import_routes.set_db(db)
ase2_routes.set_db(db)
spf_routes.set_db(db)
trash_routes.set_db(db)
backup_routes.set_db(db)
cloud_exports_routes.set_db(db)

# Include all routers
api_router.include_router(auth_routes.router)
api_router.include_router(field_reports_routes.router)
api_router.include_router(jobs_routes.router)
api_router.include_router(poles_routes.router)
api_router.include_router(underground_routes.router)
api_router.include_router(files_routes.router)
api_router.include_router(sync_routes.router)
api_router.include_router(routes_routes.router)
api_router.include_router(annotations_routes.router)
api_router.include_router(connections_routes.router)
api_router.include_router(import_excel_routes.router)
api_router.include_router(trash_routes.router)
api_router.include_router(backup_routes.router)
api_router.include_router(cloud_exports_routes.router)
api_router.include_router(addresses_routes.router)
api_router.include_router(kmz_routes.router)
api_router.include_router(kml_import_routes.router)
api_router.include_router(ase2_routes.router)
api_router.include_router(spf_routes.router)


# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Power Pole Data Collection API", "version": "2.0.0"}


# Health check endpoint for Kubernetes
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes deployment"""
    return {"status": "healthy"}


# Startup events
@app.on_event("startup")
async def create_master_admin():
    """Create or update master admin account on startup"""
    from models.user import User
    from services.auth import (
        get_password_hash, MASTER_ADMIN_EMAIL, 
        MASTER_ADMIN_PASSWORD, MASTER_ADMIN_NAME
    )
    
    existing = await db.users.find_one({"email": MASTER_ADMIN_EMAIL.lower()})
    if not existing:
        admin_user = User(
            email=MASTER_ADMIN_EMAIL.lower(),
            name=MASTER_ADMIN_NAME,
            hashed_password=get_password_hash(MASTER_ADMIN_PASSWORD),
            is_admin=True
        )
        await db.users.insert_one(admin_user.model_dump())
        logger.info(f"Master admin account created: {MASTER_ADMIN_EMAIL}")
    else:
        # Always update the password and admin flag to match .env config
        await db.users.update_one(
            {"email": MASTER_ADMIN_EMAIL.lower()},
            {"$set": {
                "is_admin": True,
                "hashed_password": get_password_hash(MASTER_ADMIN_PASSWORD),
                "name": MASTER_ADMIN_NAME
            }}
        )
        logger.info(f"Master admin credentials updated for: {MASTER_ADMIN_EMAIL}")


@app.on_event("startup")
async def startup_storage():
    """Initialize object storage and create master admin on startup"""
    # Create/update master admin
    await create_master_admin()
    
    # Initialize storage
    try:
        await asyncio.to_thread(storage_service.init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed (will retry on first upload): {e}")

    # Nightly Atlas backup scheduler
    app.state.backup_scheduler = asyncio.create_task(backup_routes.scheduler_loop())
    logger.info("Atlas backup scheduler started")

    # One-time data fix: legacy "Address pins" were stored as blue poles → convert to the Address attribute type
    try:
        from services.address_migration import migrate_address_poles
        n = await migrate_address_poles(db)
        if n:
            logger.info(f"Converted {n} legacy address pole(s) to Address attributes")
    except Exception as e:
        logger.error(f"Address pole migration failed: {e}")

    # One-time data fix: Daily Field Reports belong to the date their rows show, not the day they were opened
    try:
        from routes.field_reports import migrate_report_dates
        n = await migrate_report_dates(db)
        if n:
            logger.info(f"Re-dated {n} Daily Field Report(s) to the date on their rows")
    except Exception as e:
        logger.error(f"Field report date migration failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown"""
    task = getattr(app.state, "backup_scheduler", None)
    if task:
        task.cancel()
    client.close()


# Include the API router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
