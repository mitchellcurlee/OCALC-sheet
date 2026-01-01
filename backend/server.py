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
from openpyxl.styles import Font, PatternFill

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
    # Title Info
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    
    # Basic Info - Pole Owner moved to Height of Attachments section
    pole_size: str
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
    inspection_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Health check endpoint for Kubernetes
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes deployment"""
    return {"status": "healthy"}

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
    """Export all poles to Excel - simple spreadsheet format"""
    poles = await db.poles.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Pole Data"
    
    # Define headers
    headers = [
        "Pole #", "Job #", "Pole Owner", "Pole Size", "Condition",
        "Latitude", "Longitude",
        "Span 1 Dir", "Span 1 Dist", "Span 1 Owner",
        "Span 2 Dir", "Span 2 Dist", "Span 2 Owner",
        "Span 3 Dir", "Span 3 Dist", "Span 3 Owner",
        "Span 4 Dir", "Span 4 Dist", "Span 4 Owner",
        "Down Guy 1 Size", "Down Guy 1 Dir", "Down Guy 1 Owner", "Down Guy 1 Height", "Down Guy 1 Lead",
        "Down Guy 2 Size", "Down Guy 2 Dir", "Down Guy 2 Owner", "Down Guy 2 Height", "Down Guy 2 Lead",
        "Down Guy 3 Size", "Down Guy 3 Dir", "Down Guy 3 Owner", "Down Guy 3 Height", "Down Guy 3 Lead",
        "Down Guy 4 Size", "Down Guy 4 Dir", "Down Guy 4 Owner", "Down Guy 4 Height", "Down Guy 4 Lead",
        "Knuckle 1 Count", "Knuckle 1 Condition",
        "Knuckle 2 Count", "Knuckle 2 Condition",
        "Knuckle 3 Count", "Knuckle 3 Condition",
        "Knuckle 4 Count", "Knuckle 4 Condition",
        "Attachment 1 Height", "Attachment 1 Owner",
        "Attachment 2 Height", "Attachment 2 Owner",
        "Attachment 3 Height", "Attachment 3 Owner",
        "Attachment 4 Height", "Attachment 4 Owner",
        "Attachment 5 Height", "Attachment 5 Owner",
        "Pole Terminal", "Risers",
        "Has Birthmark", "MGNV", "MGNV Condition",
        "Notes", "Inspection Date"
    ]
    
    # Write header row with styling
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF")
    
    # Write data rows
    for row_num, pole in enumerate(poles, 2):
        ws.cell(row=row_num, column=1, value=pole.get("pole_number", ""))
        ws.cell(row=row_num, column=2, value=pole.get("job_number", ""))
        ws.cell(row=row_num, column=3, value=pole.get("pole_owner", ""))
        ws.cell(row=row_num, column=4, value=pole.get("pole_size", ""))
        ws.cell(row=row_num, column=5, value=pole.get("condition", ""))
        ws.cell(row=row_num, column=6, value=pole.get("latitude", ""))
        ws.cell(row=row_num, column=7, value=pole.get("longitude", ""))
        
        # Spans
        col = 8
        for i in range(1, 5):
            ws.cell(row=row_num, column=col, value=pole.get(f"span{i}_direction", ""))
            ws.cell(row=row_num, column=col+1, value=pole.get(f"span{i}_distance", ""))
            ws.cell(row=row_num, column=col+2, value=pole.get(f"span{i}_owner", ""))
            col += 3
        
        # Down Guys
        for i in range(1, 5):
            ws.cell(row=row_num, column=col, value=pole.get(f"down_guy{i}_size", ""))
            ws.cell(row=row_num, column=col+1, value=pole.get(f"down_guy{i}_direction", ""))
            ws.cell(row=row_num, column=col+2, value=pole.get(f"down_guy{i}_owner", ""))
            ws.cell(row=row_num, column=col+3, value=pole.get(f"down_guy{i}_height", ""))
            ws.cell(row=row_num, column=col+4, value=pole.get(f"down_guy{i}_lead", ""))
            col += 5
        
        # Knuckles
        for i in range(1, 5):
            ws.cell(row=row_num, column=col, value=pole.get(f"knuckle{i}_count", ""))
            ws.cell(row=row_num, column=col+1, value=pole.get(f"knuckle{i}_condition", ""))
            col += 2
        
        # Attachments
        for i in range(1, 6):
            ws.cell(row=row_num, column=col, value=pole.get(f"attachment{i}_height", ""))
            ws.cell(row=row_num, column=col+1, value=pole.get(f"attachment{i}_owner", ""))
            col += 2
        
        # Pole Terminal, Risers
        ws.cell(row=row_num, column=col, value=pole.get("pole_terminal", ""))
        ws.cell(row=row_num, column=col+1, value=pole.get("risers", ""))
        col += 2
        
        # Birthmark, MGNV
        ws.cell(row=row_num, column=col, value="Yes" if pole.get("has_birthmark", True) else "No")
        ws.cell(row=row_num, column=col+1, value=pole.get("mgnv", ""))
        ws.cell(row=row_num, column=col+2, value=pole.get("mgnv_condition", ""))
        col += 3
        
        # Notes, Inspection Date
        ws.cell(row=row_num, column=col, value=pole.get("notes", ""))
        inspection_date = pole.get("inspection_date", "")
        if inspection_date:
            ws.cell(row=row_num, column=col+1, value=str(inspection_date)[:19])
    
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
        adjusted_width = min(max_length + 2, 25)
        ws.column_dimensions[column].width = max(adjusted_width, 10)
    
    # Freeze header row
    ws.freeze_panes = 'A2'
    
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
