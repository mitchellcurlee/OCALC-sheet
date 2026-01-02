from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from jose import JWTError, jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# JWT Configuration
SECRET_KEY = os.environ.get("JWT_SECRET", "pole-data-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Master Admin Credentials
MASTER_ADMIN_EMAIL = "tim.gables@byers.com"
MASTER_ADMIN_PASSWORD = "Byers@13430"
MASTER_ADMIN_NAME = "Master Admin"

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Auth Models
class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: Optional[str] = None
    hashed_password: str
    is_admin: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Auth Helper Functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def is_admin_user(user: dict) -> bool:
    """Check if user is the master admin"""
    return user.get("is_admin", False) or user.get("email", "").lower() == MASTER_ADMIN_EMAIL.lower()
    return user

# Options
POLE_OWNERS = ["Foreign Owned", "ATT"]
POLE_CONDITIONS = ["Excellent", "Good", "Bad"]
POLE_SIZES = [
    "1-25", "1-30", "1-35", "1-40", "1-45", "1-50", "1-55", "1-60",
    "2-25", "2-30", "2-35", "2-40", "2-45", "2-50", "2-55", "2-60",
    "3-25", "3-30", "3-35", "3-40", "3-45", "3-50", "3-55", "3-60",
    "4-25", "4-30", "4-35", "4-40", "4-45", "4-50", "4-55", "4-60",
    "5-25", "5-30", "5-35", "5-40", "5-45", "5-50", "5-55", "5-60"
]
DOWN_GUY_OWNERS = ["Power", "ATT", "Comcast", "Lightwave", "Logix", "PS"]
DOWN_GUY_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
DOWN_GUY_SIZES = ["1/4", "3/8", "1/2", "5/8", "3/4"]
KNUCKLE_OPTIONS = ["0", "1", "2", "3", "4", "5", "6"]
YES_NO = ["Yes", "No"]
GOOD_BROKEN = ["Good", "Broken"]
SPAN_OWNERS = ["Power", "ATT", "Comcast", "Lightwave", "Logix", "PS"]
SPAN_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
ATTACHMENT_OWNERS = ["Power", "ATT", "Comcast", "Lightwave", "Logix", "PS"]
RISER_OPTIONS = ["1", "2", "3", "4", "5", "6"]

# Models for dynamic arrays
class DownGuy(BaseModel):
    size: Optional[str] = None
    direction: Optional[str] = None
    owner: Optional[str] = None
    height: Optional[float] = None
    lead: Optional[str] = None

class Knuckle(BaseModel):
    count: Optional[str] = None
    condition: Optional[str] = None
    photo: Optional[str] = None

class Attachment(BaseModel):
    height: Optional[float] = None
    owner: Optional[str] = None
    photo: Optional[str] = None

# Models
class PoleBase(BaseModel):
    # Job Reference
    job_id: Optional[str] = None
    
    # Title Info
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    
    # Basic Info - Pole Owner moved to Height of Attachments section
    pole_size: str
    pole_size_type: Optional[str] = None  # Actual, Estimate, Proposed
    condition: str
    pole_owner: Optional[str] = None  # Now in Height of Attachments section
    
    # OCALC Photos
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    
    # Birthmark
    has_birthmark: bool = True
    birthmark_photo: Optional[str] = None
    
    # MGNV
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photo: Optional[str] = None
    
    # Dynamic arrays
    down_guys: Optional[List[DownGuy]] = []
    knuckles: Optional[List[Knuckle]] = []
    attachments: Optional[List[Attachment]] = []
    
    # Pole Terminal & Risers (in Height of Attachments section)
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    
    # Spans (4 fixed)
    span1_direction: Optional[str] = None
    span1_distance: Optional[float] = None
    span1_owner: Optional[str] = None
    span2_direction: Optional[str] = None
    span2_distance: Optional[float] = None
    span2_owner: Optional[str] = None
    span3_direction: Optional[str] = None
    span3_distance: Optional[float] = None
    span3_owner: Optional[str] = None
    span4_direction: Optional[str] = None
    span4_distance: Optional[float] = None
    span4_owner: Optional[str] = None
    
    # GPS
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    notes: Optional[str] = None

class PoleCreate(PoleBase):
    pass

class PoleUpdate(BaseModel):
    job_id: Optional[str] = None
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    pole_owner: Optional[str] = None
    pole_size: Optional[str] = None
    pole_size_type: Optional[str] = None
    condition: Optional[str] = None
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    has_birthmark: Optional[bool] = None
    birthmark_photo: Optional[str] = None
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photo: Optional[str] = None
    down_guys: Optional[List[DownGuy]] = None
    knuckles: Optional[List[Knuckle]] = None
    attachments: Optional[List[Attachment]] = None
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    span1_direction: Optional[str] = None
    span1_distance: Optional[float] = None
    span1_owner: Optional[str] = None
    span2_direction: Optional[str] = None
    span2_distance: Optional[float] = None
    span2_owner: Optional[str] = None
    span3_direction: Optional[str] = None
    span3_distance: Optional[float] = None
    span3_owner: Optional[str] = None
    span4_direction: Optional[str] = None
    span4_distance: Optional[float] = None
    span4_owner: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None

class Pole(PoleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: Optional[str] = None  # Reference to parent job
    inspection_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Job Models
class JobCreate(BaseModel):
    name: str
    description: Optional[str] = None
    location: Optional[str] = None

class JobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None

class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    user_id: str  # Owner of the job
    user_email: Optional[str] = None  # For admin view
    pole_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Startup event to create master admin
@app.on_event("startup")
async def create_master_admin():
    """Create master admin account on startup if it doesn't exist"""
    existing = await db.users.find_one({"email": MASTER_ADMIN_EMAIL.lower()})
    if not existing:
        admin_user = User(
            email=MASTER_ADMIN_EMAIL.lower(),
            name=MASTER_ADMIN_NAME,
            hashed_password=get_password_hash(MASTER_ADMIN_PASSWORD),
            is_admin=True
        )
        await db.users.insert_one(admin_user.model_dump())
        logging.info(f"Master admin account created: {MASTER_ADMIN_EMAIL}")
    else:
        # Ensure existing user has admin flag
        if not existing.get("is_admin"):
            await db.users.update_one(
                {"email": MASTER_ADMIN_EMAIL.lower()},
                {"$set": {"is_admin": True}}
            )
            logging.info(f"Master admin flag updated for: {MASTER_ADMIN_EMAIL}")

# Health check endpoint for Kubernetes
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes deployment"""
    return {"status": "healthy"}

# API Endpoints
@api_router.get("/")
async def root():
    return {"message": "Power Pole Data Collection API"}

# Auth Endpoints
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    """Register a new user"""
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email.lower(),
        name=user_data.name or user_data.email.split("@")[0],
        hashed_password=get_password_hash(user_data.password)
    )
    await db.users.insert_one(user.model_dump())
    
    # Create token
    token = create_access_token({"sub": user.id})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "name": user.name, "is_admin": user.is_admin}
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    """Login and get access token"""
    user = await db.users.find_one({"email": credentials.email.lower()}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": user["id"]})
    user_is_admin = is_admin_user(user)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name", ""), "is_admin": user_is_admin}
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    current_user["is_admin"] = is_admin_user(current_user)
    return current_user

# Job Endpoints
@api_router.post("/jobs", response_model=Job)
async def create_job(job_data: JobCreate, current_user: dict = Depends(get_current_user)):
    """Create a new job"""
    job = Job(
        name=job_data.name,
        description=job_data.description,
        location=job_data.location,
        user_id=current_user["id"],
        user_email=current_user.get("email", ""),
        pole_count=0
    )
    await db.jobs.insert_one(job.model_dump())
    return job

@api_router.get("/jobs", response_model=List[Job])
async def get_jobs(current_user: dict = Depends(get_current_user)):
    """Get all jobs - admin sees all jobs, regular users see only their own"""
    if is_admin_user(current_user):
        # Admin sees all jobs from all users
        jobs = await db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
        # Add user email to each job for admin view
        for job in jobs:
            count = await db.poles.count_documents({"job_id": job["id"]})
            job["pole_count"] = count
            # Get user email if not already set
            if not job.get("user_email"):
                owner = await db.users.find_one({"id": job["user_id"]}, {"_id": 0, "email": 1})
                job["user_email"] = owner.get("email", "Unknown") if owner else "Unknown"
    else:
        # Regular user sees only their jobs
        jobs = await db.jobs.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        for job in jobs:
            count = await db.poles.count_documents({"job_id": job["id"]})
            job["pole_count"] = count
    return jobs

@api_router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific job - admin can access any job"""
    if is_admin_user(current_user):
        job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    else:
        job = await db.jobs.find_one({"id": job_id, "user_id": current_user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["pole_count"] = await db.poles.count_documents({"job_id": job_id})
    return job

@api_router.put("/jobs/{job_id}", response_model=Job)
async def update_job(job_id: str, job_data: JobUpdate, current_user: dict = Depends(get_current_user)):
    """Update a job - admin can update any job"""
    if is_admin_user(current_user):
        existing = await db.jobs.find_one({"id": job_id})
    else:
        existing = await db.jobs.find_one({"id": job_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = {k: v for k, v in job_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.jobs.update_one({"id": job_id}, {"$set": update_data})
    updated = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    updated["pole_count"] = await db.poles.count_documents({"job_id": job_id})
    return updated

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a job and all its poles - admin can delete any job"""
    if is_admin_user(current_user):
        existing = await db.jobs.find_one({"id": job_id})
    else:
        existing = await db.jobs.find_one({"id": job_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete all poles in this job
    await db.poles.delete_many({"job_id": job_id})
    # Delete the job
    await db.jobs.delete_one({"id": job_id})
    return {"message": "Job and all poles deleted successfully"}

@api_router.get("/jobs/{job_id}/poles", response_model=List[Pole])
async def get_job_poles(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get all poles for a specific job - admin can access any job's poles"""
    if is_admin_user(current_user):
        job = await db.jobs.find_one({"id": job_id})
    else:
        job = await db.jobs.find_one({"id": job_id, "user_id": current_user["id"]})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await db.poles.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return poles

@api_router.get("/jobs/{job_id}/export/excel")
async def export_job_excel(job_id: str, current_user: dict = Depends(get_current_user)):
    """Export all poles from a job to Excel - admin can export any job"""
    if is_admin_user(current_user):
        job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    else:
        job = await db.jobs.find_one({"id": job_id, "user_id": current_user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    poles = await db.poles.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Pole Data"
    
    # Styling
    header_fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    section_fill = PatternFill(start_color="1f2937", end_color="1f2937", fill_type="solid")
    section_font = Font(bold=True, color="FFFFFF")
    
    # Job info at top
    ws.cell(row=1, column=1, value="JOB NAME").fill = header_fill
    ws.cell(row=1, column=1).font = header_font
    ws.cell(row=1, column=2, value=job.get("name", ""))
    ws.cell(row=1, column=3, value="LOCATION").fill = header_fill
    ws.cell(row=1, column=3).font = header_font
    ws.cell(row=1, column=4, value=job.get("location", ""))
    ws.cell(row=1, column=5, value="POLES").fill = header_fill
    ws.cell(row=1, column=5).font = header_font
    ws.cell(row=1, column=6, value=len(poles))
    
    current_row = 3
    
    for pole in poles:
        start_row = current_row
        
        # Row 1: Pole Header
        ws.cell(row=current_row, column=1, value="POLE #").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value=pole.get("pole_number", ""))
        ws.cell(row=current_row, column=3, value="JOB #").fill = header_fill
        ws.cell(row=current_row, column=3).font = header_font
        ws.cell(row=current_row, column=4, value=pole.get("job_number", ""))
        ws.cell(row=current_row, column=5, value="DATE").fill = header_fill
        ws.cell(row=current_row, column=5).font = header_font
        inspection_date = pole.get("inspection_date", "")
        ws.cell(row=current_row, column=6, value=str(inspection_date)[:10] if inspection_date else "")
        current_row += 1
        
        # Row 2: Basic Info
        ws.cell(row=current_row, column=1, value="SIZE").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("pole_size", ""))
        ws.cell(row=current_row, column=3, value="CONDITION").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("condition", ""))
        ws.cell(row=current_row, column=5, value="OWNER").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("pole_owner", ""))
        current_row += 1
        
        # Row 3: GPS & Terminal/Risers
        ws.cell(row=current_row, column=1, value="LAT").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("latitude", ""))
        ws.cell(row=current_row, column=3, value="LONG").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("longitude", ""))
        ws.cell(row=current_row, column=5, value="TERMINAL").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("pole_terminal", ""))
        ws.cell(row=current_row, column=7, value="RISERS").fill = section_fill
        ws.cell(row=current_row, column=7).font = section_font
        ws.cell(row=current_row, column=8, value=pole.get("risers", ""))
        current_row += 1
        
        # Spans
        ws.cell(row=current_row, column=1, value="SPANS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        current_row += 1
        for i in range(1, 5):
            dir_val = pole.get(f"span{i}_direction", "")
            dist_val = pole.get(f"span{i}_distance", "")
            owner_val = pole.get(f"span{i}_owner", "")
            if dir_val or dist_val or owner_val:
                ws.cell(row=current_row, column=1, value=f"Span {i}")
                ws.cell(row=current_row, column=2, value=dir_val)
                ws.cell(row=current_row, column=3, value=dist_val)
                ws.cell(row=current_row, column=4, value=owner_val)
                current_row += 1
        
        # Down Guys
        down_guys = pole.get("down_guys", [])
        if down_guys:
            ws.cell(row=current_row, column=1, value="DOWN GUYS").fill = header_fill
            ws.cell(row=current_row, column=1).font = header_font
            current_row += 1
            for i, dg in enumerate(down_guys, 1):
                ws.cell(row=current_row, column=1, value=f"Guy {i}")
                ws.cell(row=current_row, column=2, value=dg.get("size", ""))
                ws.cell(row=current_row, column=3, value=dg.get("direction", ""))
                ws.cell(row=current_row, column=4, value=dg.get("owner", ""))
                ws.cell(row=current_row, column=5, value=dg.get("height", ""))
                ws.cell(row=current_row, column=6, value=dg.get("lead", ""))
                current_row += 1
        
        # Knuckles
        knuckles = pole.get("knuckles", [])
        if knuckles:
            ws.cell(row=current_row, column=1, value="KNUCKLES").fill = header_fill
            ws.cell(row=current_row, column=1).font = header_font
            current_row += 1
            link_font = Font(color="0066CC", underline="single")
            for i, kn in enumerate(knuckles, 1):
                ws.cell(row=current_row, column=1, value=f"Knuckle {i}")
                ws.cell(row=current_row, column=2, value=kn.get("count", ""))
                ws.cell(row=current_row, column=3, value=kn.get("condition", ""))
                # Add photo link if exists
                if kn.get("photo"):
                    cell = ws.cell(row=current_row, column=4, value="📷 View Photo")
                    cell.hyperlink = kn["photo"]
                    cell.font = link_font
                current_row += 1
        
        # Attachments
        attachments = pole.get("attachments", [])
        if attachments:
            ws.cell(row=current_row, column=1, value="ATTACHMENTS").fill = header_fill
            ws.cell(row=current_row, column=1).font = header_font
            current_row += 1
            link_font = Font(color="0066CC", underline="single")
            for i, att in enumerate(attachments, 1):
                ws.cell(row=current_row, column=1, value=f"Att {i}")
                ws.cell(row=current_row, column=2, value=att.get("height", ""))
                ws.cell(row=current_row, column=3, value=att.get("owner", ""))
                # Add photo link if exists
                if att.get("photo"):
                    cell = ws.cell(row=current_row, column=4, value="📷 View Photo")
                    cell.hyperlink = att["photo"]
                    cell.font = link_font
                current_row += 1
        
        # Birthmark & MGNV
        ws.cell(row=current_row, column=1, value="BIRTHMARK").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value="Yes" if pole.get("has_birthmark", True) else "No")
        ws.cell(row=current_row, column=3, value="MGNV").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("mgnv", ""))
        current_row += 1
        
        # Notes
        if pole.get("notes"):
            ws.cell(row=current_row, column=1, value="NOTES").fill = section_fill
            ws.cell(row=current_row, column=1).font = section_font
            ws.cell(row=current_row, column=2, value=pole.get("notes", ""))
            current_row += 1
        
        # Photos
        photos = []
        if pole.get("ocalc_left_photo"): photos.append(("📷 OCALC Left", pole["ocalc_left_photo"]))
        if pole.get("ocalc_middle_photo"): photos.append(("📷 OCALC Mid", pole["ocalc_middle_photo"]))
        if pole.get("ocalc_right_photo"): photos.append(("📷 OCALC Right", pole["ocalc_right_photo"]))
        if pole.get("birthmark_photo"): photos.append(("📷 Birthmark", pole["birthmark_photo"]))
        if pole.get("mgnv_photo"): photos.append(("📷 MGNV", pole["mgnv_photo"]))
        
        if photos:
            ws.cell(row=current_row, column=1, value="PHOTOS").fill = header_fill
            ws.cell(row=current_row, column=1).font = header_font
            current_row += 1
            link_font = Font(color="0066CC", underline="single")
            col = 1
            for label, url in photos:
                cell = ws.cell(row=current_row, column=col, value=label)
                cell.hyperlink = url
                cell.font = link_font
                col += 1
            current_row += 1
        
        # Blank row separator
        current_row += 1
    
    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        ws.column_dimensions[column].width = max(min(max_length + 2, 30), 12)
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    safe_name = "".join(c for c in job.get("name", "job") if c.isalnum() or c in (' ', '-', '_')).strip()
    filename = f"{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/poles/options")
async def get_pole_options():
    """Get dropdown options for pole form"""
    return {
        "pole_owners": POLE_OWNERS,
        "conditions": POLE_CONDITIONS,
        "sizes": POLE_SIZES,
        "down_guy_owners": DOWN_GUY_OWNERS,
        "down_guy_directions": DOWN_GUY_DIRECTIONS,
        "down_guy_sizes": DOWN_GUY_SIZES,
        "knuckle_options": KNUCKLE_OPTIONS,
        "yes_no": YES_NO,
        "good_broken": GOOD_BROKEN,
        "span_owners": SPAN_OWNERS,
        "span_directions": SPAN_DIRECTIONS,
        "attachment_owners": ATTACHMENT_OWNERS,
        "riser_options": RISER_OPTIONS
    }

@api_router.post("/poles", response_model=Pole, status_code=201)
async def create_pole(pole_data: PoleCreate):
    """Create a new pole entry"""
    pole = Pole(**pole_data.model_dump())
    doc = pole.model_dump()
    await db.poles.insert_one(doc)
    return pole

@api_router.get("/poles", response_model=List[Pole])
async def get_poles(
    pole_owner: Optional[str] = None,
    condition: Optional[str] = None
):
    """Get all poles with optional filtering"""
    query = {}
    if pole_owner:
        query["pole_owner"] = pole_owner
    if condition:
        query["condition"] = condition
    
    poles = await db.poles.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return poles

@api_router.get("/poles/{pole_id}", response_model=Pole)
async def get_pole(pole_id: str):
    """Get a single pole by ID"""
    pole = await db.poles.find_one({"id": pole_id}, {"_id": 0})
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    return pole

@api_router.put("/poles/{pole_id}", response_model=Pole)
async def update_pole(pole_id: str, pole_data: PoleUpdate):
    """Update a pole entry"""
    existing = await db.poles.find_one({"id": pole_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    update_data = {k: v for k, v in pole_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.poles.update_one({"id": pole_id}, {"$set": update_data})
    updated = await db.poles.find_one({"id": pole_id}, {"_id": 0})
    return updated

@api_router.delete("/poles/{pole_id}")
async def delete_pole(pole_id: str):
    """Delete a pole entry"""
    result = await db.poles.delete_one({"id": pole_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pole not found")
    return {"message": "Pole deleted successfully"}

@api_router.get("/poles/export/excel")
async def export_poles_excel():
    """Export all poles to Excel - 16 rows per pole format"""
    poles = await db.poles.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Pole Data"
    
    # Styling
    header_fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    section_fill = PatternFill(start_color="1f2937", end_color="1f2937", fill_type="solid")
    section_font = Font(bold=True, color="FFFFFF")
    
    current_row = 1
    
    for pole_idx, pole in enumerate(poles):
        start_row = current_row
        
        # Row 1: Pole Header
        ws.cell(row=current_row, column=1, value="POLE #").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value=pole.get("pole_number", ""))
        ws.cell(row=current_row, column=3, value="JOB #").fill = header_fill
        ws.cell(row=current_row, column=3).font = header_font
        ws.cell(row=current_row, column=4, value=pole.get("job_number", ""))
        ws.cell(row=current_row, column=5, value="DATE").fill = header_fill
        ws.cell(row=current_row, column=5).font = header_font
        inspection_date = pole.get("inspection_date", "")
        ws.cell(row=current_row, column=6, value=str(inspection_date)[:10] if inspection_date else "")
        current_row += 1
        
        # Row 2: Basic Info
        ws.cell(row=current_row, column=1, value="SIZE").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("pole_size", ""))
        ws.cell(row=current_row, column=3, value="CONDITION").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("condition", ""))
        ws.cell(row=current_row, column=5, value="OWNER").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("pole_owner", ""))
        current_row += 1
        
        # Row 3: GPS & Terminal/Risers
        ws.cell(row=current_row, column=1, value="LAT").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("latitude", ""))
        ws.cell(row=current_row, column=3, value="LONG").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("longitude", ""))
        ws.cell(row=current_row, column=5, value="TERMINAL").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("pole_terminal", ""))
        ws.cell(row=current_row, column=7, value="RISERS").fill = section_fill
        ws.cell(row=current_row, column=7).font = section_font
        ws.cell(row=current_row, column=8, value=pole.get("risers", ""))
        current_row += 1
        
        # Row 4: Spans Header
        ws.cell(row=current_row, column=1, value="SPANS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Direction").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Distance").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value="Owner").fill = section_fill
        ws.cell(row=current_row, column=4).font = section_font
        current_row += 1
        
        # Rows 5-8: Spans Data (4 rows)
        for i in range(1, 5):
            ws.cell(row=current_row, column=1, value=f"Span {i}")
            ws.cell(row=current_row, column=2, value=pole.get(f"span{i}_direction", ""))
            ws.cell(row=current_row, column=3, value=pole.get(f"span{i}_distance", ""))
            ws.cell(row=current_row, column=4, value=pole.get(f"span{i}_owner", ""))
            current_row += 1
        
        # Row 9: Down Guys Header
        ws.cell(row=current_row, column=1, value="DOWN GUYS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Size").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Direction").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value="Owner").fill = section_fill
        ws.cell(row=current_row, column=4).font = section_font
        ws.cell(row=current_row, column=5, value="Height").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value="Lead").fill = section_fill
        ws.cell(row=current_row, column=6).font = section_font
        current_row += 1
        
        # Row 10: Down Guys Data (use available data, fill up to show rows)
        down_guys = pole.get("down_guys", [])
        for i in range(max(1, len(down_guys))):
            dg = down_guys[i] if i < len(down_guys) else {}
            ws.cell(row=current_row, column=1, value=f"Guy {i+1}")
            ws.cell(row=current_row, column=2, value=dg.get("size", ""))
            ws.cell(row=current_row, column=3, value=dg.get("direction", ""))
            ws.cell(row=current_row, column=4, value=dg.get("owner", ""))
            ws.cell(row=current_row, column=5, value=dg.get("height", ""))
            ws.cell(row=current_row, column=6, value=dg.get("lead", ""))
            current_row += 1
        
        # Row 11: Knuckles Header
        ws.cell(row=current_row, column=1, value="KNUCKLES").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Count").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Condition").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        current_row += 1
        
        # Row 12: Knuckles Data
        knuckles = pole.get("knuckles", [])
        for i in range(max(1, len(knuckles))):
            kn = knuckles[i] if i < len(knuckles) else {}
            ws.cell(row=current_row, column=1, value=f"Knuckle {i+1}")
            ws.cell(row=current_row, column=2, value=kn.get("count", ""))
            ws.cell(row=current_row, column=3, value=kn.get("condition", ""))
            current_row += 1
        
        # Row 13: Attachments Header
        ws.cell(row=current_row, column=1, value="ATTACHMENTS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="Height (ft)").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="Owner").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        current_row += 1
        
        # Row 14: Attachments Data
        attachments = pole.get("attachments", [])
        for i in range(max(1, len(attachments))):
            att = attachments[i] if i < len(attachments) else {}
            ws.cell(row=current_row, column=1, value=f"Att {i+1}")
            ws.cell(row=current_row, column=2, value=att.get("height", ""))
            ws.cell(row=current_row, column=3, value=att.get("owner", ""))
            current_row += 1
        
        # Row 15: Birthmark & MGNV
        ws.cell(row=current_row, column=1, value="BIRTHMARK").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value="Yes" if pole.get("has_birthmark", True) else "No")
        ws.cell(row=current_row, column=3, value="MGNV").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value=pole.get("mgnv", ""))
        ws.cell(row=current_row, column=5, value="MGNV COND").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value=pole.get("mgnv_condition", ""))
        current_row += 1
        
        # Row 16: Notes
        ws.cell(row=current_row, column=1, value="NOTES").fill = section_fill
        ws.cell(row=current_row, column=1).font = section_font
        ws.cell(row=current_row, column=2, value=pole.get("notes", ""))
        current_row += 1
        
        # Row 17: Photos Header
        ws.cell(row=current_row, column=1, value="PHOTOS").fill = header_fill
        ws.cell(row=current_row, column=1).font = header_font
        ws.cell(row=current_row, column=2, value="OCALC Left").fill = section_fill
        ws.cell(row=current_row, column=2).font = section_font
        ws.cell(row=current_row, column=3, value="OCALC Middle").fill = section_fill
        ws.cell(row=current_row, column=3).font = section_font
        ws.cell(row=current_row, column=4, value="OCALC Right").fill = section_fill
        ws.cell(row=current_row, column=4).font = section_font
        ws.cell(row=current_row, column=5, value="Birthmark").fill = section_fill
        ws.cell(row=current_row, column=5).font = section_font
        ws.cell(row=current_row, column=6, value="MGNV").fill = section_fill
        ws.cell(row=current_row, column=6).font = section_font
        current_row += 1
        
        # Row 18: Photo Links
        link_font = Font(color="0066CC", underline="single")
        photo_fields = [
            ("ocalc_left_photo", 2),
            ("ocalc_middle_photo", 3),
            ("ocalc_right_photo", 4),
            ("birthmark_photo", 5),
            ("mgnv_photo", 6)
        ]
        for field, col in photo_fields:
            photo_url = pole.get(field, "")
            if photo_url:
                cell = ws.cell(row=current_row, column=col, value="📷 Click to Open")
                cell.hyperlink = photo_url
                cell.font = link_font
        current_row += 1
        
        # Add a blank row between poles
        current_row += 1
    
    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 30)
        ws.column_dimensions[column].width = max(adjusted_width, 12)
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"pole_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/stats")
async def get_stats():
    """Get pole statistics"""
    total = await db.poles.count_documents({})
    power_count = await db.poles.count_documents({"pole_owner": "Power"})
    telecom_count = await db.poles.count_documents({"pole_owner": "Telecom"})
    
    condition_stats = {}
    for condition in POLE_CONDITIONS:
        count = await db.poles.count_documents({"condition": condition})
        condition_stats[condition] = count
    
    return {
        "total_poles": total,
        "power_poles": power_count,
        "telecom_poles": telecom_count,
        "by_condition": condition_stats
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
