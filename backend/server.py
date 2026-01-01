from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import io
from openpyxl import Workbook

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

# Models
class PoleBase(BaseModel):
    # Title Info
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    
    # Basic Info
    pole_owner: str  # Foreign Owned or ATT
    pole_size: str
    condition: str
    
    # OCALC Photos
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    
    # Birthmark
    has_birthmark: bool = True
    birthmark_photo: Optional[str] = None
    
    # MGNV
    mgnv: Optional[str] = None  # Yes/No
    mgnv_condition: Optional[str] = None  # Good/Broken
    mgnv_photo: Optional[str] = None
    
    # Height of Attachment (5 rows)
    attachment1_height: Optional[float] = None
    attachment1_owner: Optional[str] = None
    attachment1_photo: Optional[str] = None
    attachment2_height: Optional[float] = None
    attachment2_owner: Optional[str] = None
    attachment2_photo: Optional[str] = None
    attachment3_height: Optional[float] = None
    attachment3_owner: Optional[str] = None
    attachment3_photo: Optional[str] = None
    attachment4_height: Optional[float] = None
    attachment4_owner: Optional[str] = None
    attachment4_photo: Optional[str] = None
    attachment5_height: Optional[float] = None
    attachment5_owner: Optional[str] = None
    attachment5_photo: Optional[str] = None
    
    # Pole Terminal
    pole_terminal: Optional[str] = None  # Yes/No
    
    # Risers
    risers: Optional[str] = None  # 1-6
    
    # Telecom Attachment Photo
    telecom_attachment_photo: Optional[str] = None
    
    # Down Guy (4 rows)
    down_guy1_size: Optional[str] = None
    down_guy1_direction: Optional[str] = None
    down_guy1_owner: Optional[str] = None
    down_guy1_height: Optional[float] = None
    down_guy1_lead: Optional[str] = None
    down_guy2_size: Optional[str] = None
    down_guy2_direction: Optional[str] = None
    down_guy2_owner: Optional[str] = None
    down_guy2_height: Optional[float] = None
    down_guy2_lead: Optional[str] = None
    down_guy3_size: Optional[str] = None
    down_guy3_direction: Optional[str] = None
    down_guy3_owner: Optional[str] = None
    down_guy3_height: Optional[float] = None
    down_guy3_lead: Optional[str] = None
    down_guy4_size: Optional[str] = None
    down_guy4_direction: Optional[str] = None
    down_guy4_owner: Optional[str] = None
    down_guy4_height: Optional[float] = None
    down_guy4_lead: Optional[str] = None
    
    # Knuckles (4 rows)
    knuckle1_count: Optional[str] = None
    knuckle1_condition: Optional[str] = None
    knuckle1_photo: Optional[str] = None
    knuckle2_count: Optional[str] = None
    knuckle2_condition: Optional[str] = None
    knuckle2_photo: Optional[str] = None
    knuckle3_count: Optional[str] = None
    knuckle3_condition: Optional[str] = None
    knuckle3_photo: Optional[str] = None
    knuckle4_count: Optional[str] = None
    knuckle4_condition: Optional[str] = None
    knuckle4_photo: Optional[str] = None
    
    # Span (4 spans)
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
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    pole_owner: Optional[str] = None
    pole_size: Optional[str] = None
    condition: Optional[str] = None
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    has_birthmark: Optional[bool] = None
    birthmark_photo: Optional[str] = None
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photo: Optional[str] = None
    attachment1_height: Optional[float] = None
    attachment1_owner: Optional[str] = None
    attachment1_photo: Optional[str] = None
    attachment2_height: Optional[float] = None
    attachment2_owner: Optional[str] = None
    attachment2_photo: Optional[str] = None
    attachment3_height: Optional[float] = None
    attachment3_owner: Optional[str] = None
    attachment3_photo: Optional[str] = None
    attachment4_height: Optional[float] = None
    attachment4_owner: Optional[str] = None
    attachment4_photo: Optional[str] = None
    attachment5_height: Optional[float] = None
    attachment5_owner: Optional[str] = None
    attachment5_photo: Optional[str] = None
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    telecom_attachment_photo: Optional[str] = None
    down_guy1_size: Optional[str] = None
    down_guy1_direction: Optional[str] = None
    down_guy1_owner: Optional[str] = None
    down_guy1_height: Optional[float] = None
    down_guy1_lead: Optional[str] = None
    down_guy2_size: Optional[str] = None
    down_guy2_direction: Optional[str] = None
    down_guy2_owner: Optional[str] = None
    down_guy2_height: Optional[float] = None
    down_guy2_lead: Optional[str] = None
    down_guy3_size: Optional[str] = None
    down_guy3_direction: Optional[str] = None
    down_guy3_owner: Optional[str] = None
    down_guy3_height: Optional[float] = None
    down_guy3_lead: Optional[str] = None
    down_guy4_size: Optional[str] = None
    down_guy4_direction: Optional[str] = None
    down_guy4_owner: Optional[str] = None
    down_guy4_height: Optional[float] = None
    down_guy4_lead: Optional[str] = None
    knuckle1_count: Optional[str] = None
    knuckle1_condition: Optional[str] = None
    knuckle1_photo: Optional[str] = None
    knuckle2_count: Optional[str] = None
    knuckle2_condition: Optional[str] = None
    knuckle2_photo: Optional[str] = None
    knuckle3_count: Optional[str] = None
    knuckle3_condition: Optional[str] = None
    knuckle3_photo: Optional[str] = None
    knuckle4_count: Optional[str] = None
    knuckle4_condition: Optional[str] = None
    knuckle4_photo: Optional[str] = None
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
    inspection_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# API Endpoints
@api_router.get("/")
async def root():
    return {"message": "Power Pole Data Collection API"}

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
    """Export all poles to Excel"""
    poles = await db.poles.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Pole Data"
    
    # Headers
    headers = [
        "ID", "Job Number", "Pole Number", "Pole Owner", "Pole Size", "Condition",
        "Telecom Attachments", "Has Birthmark", "MGNV", "Height of Attachment (ft)",
        "Down Guy 1 Size", "Down Guy 1 Direction", "Down Guy 1 Owner", "Down Guy 1 Height", "Down Guy 1 Lead",
        "Down Guy 2 Size", "Down Guy 2 Direction", "Down Guy 2 Owner", "Down Guy 2 Height", "Down Guy 2 Lead",
        "Down Guy 3 Size", "Down Guy 3 Direction", "Down Guy 3 Owner", "Down Guy 3 Height", "Down Guy 3 Lead",
        "Down Guy 4 Size", "Down Guy 4 Direction", "Down Guy 4 Owner", "Down Guy 4 Height", "Down Guy 4 Lead",
        "Anchor Knuckles",
        "Span 1 Direction", "Span 1 Distance (ft)", "Span 1 Owner",
        "Span 2 Direction", "Span 2 Distance (ft)", "Span 2 Owner",
        "Span 3 Direction", "Span 3 Distance (ft)", "Span 3 Owner",
        "Span 4 Direction", "Span 4 Distance (ft)", "Span 4 Owner",
        "Lead/Anchor Characteristics", "Ground Type", "Riser Number",
        "Latitude", "Longitude", "Inspection Date", "Notes"
    ]
    ws.append(headers)
    
    # Data rows (exclude photo fields)
    for pole in poles:
        ws.append([
            pole.get("id", ""),
            pole.get("job_number", ""),
            pole.get("pole_number", ""),
            pole.get("pole_owner", ""),
            pole.get("pole_size", ""),
            pole.get("condition", ""),
            pole.get("telecom_attachments", 0),
            "Yes" if pole.get("has_birthmark", True) else "No",
            pole.get("mgnv", ""),
            pole.get("height_of_attachment", ""),
            pole.get("down_guy1_size", ""),
            pole.get("down_guy1_direction", ""),
            pole.get("down_guy1_owner", ""),
            pole.get("down_guy1_height", ""),
            pole.get("down_guy1_lead", ""),
            pole.get("down_guy2_size", ""),
            pole.get("down_guy2_direction", ""),
            pole.get("down_guy2_owner", ""),
            pole.get("down_guy2_height", ""),
            pole.get("down_guy2_lead", ""),
            pole.get("down_guy3_size", ""),
            pole.get("down_guy3_direction", ""),
            pole.get("down_guy3_owner", ""),
            pole.get("down_guy3_height", ""),
            pole.get("down_guy3_lead", ""),
            pole.get("down_guy4_size", ""),
            pole.get("down_guy4_direction", ""),
            pole.get("down_guy4_owner", ""),
            pole.get("down_guy4_height", ""),
            pole.get("down_guy4_lead", ""),
            pole.get("anchor_knuckles", ""),
            pole.get("span1_direction", ""),
            pole.get("span1_distance", ""),
            pole.get("span1_owner", ""),
            pole.get("span2_direction", ""),
            pole.get("span2_distance", ""),
            pole.get("span2_owner", ""),
            pole.get("span3_direction", ""),
            pole.get("span3_distance", ""),
            pole.get("span3_owner", ""),
            pole.get("span4_direction", ""),
            pole.get("span4_distance", ""),
            pole.get("span4_owner", ""),
            pole.get("lead_anchor_characteristics", ""),
            pole.get("ground_type", ""),
            pole.get("riser_number", ""),
            pole.get("latitude", ""),
            pole.get("longitude", ""),
            pole.get("inspection_date", ""),
            pole.get("notes", "")
        ])
    
    # Adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column].width = adjusted_width
    
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
