from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
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
import base64
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

# Pole Types
POLE_TYPES = ["Power", "Telecom"]
POLE_CONDITIONS = ["Excellent", "Good", "Bad"]
POLE_SIZES = [
    "1-25", "1-30", "1-35", "1-40", "1-45", "1-50", "1-55", "1-60",
    "2-25", "2-30", "2-35", "2-40", "2-45", "2-50", "2-55", "2-60",
    "3-25", "3-30", "3-35", "3-40", "3-45", "3-50", "3-55", "3-60",
    "4-25", "4-30", "4-35", "4-40", "4-45", "4-50", "4-55", "4-60",
    "5-25", "5-30", "5-35", "5-40", "5-45", "5-50", "5-55", "5-60"
]

# Models
class PoleBase(BaseModel):
    pole_type: str
    pole_size: str
    telecom_attachments: int = 0
    condition: str
    down_guy_height: Optional[float] = None
    lead_anchor_characteristics: Optional[str] = None
    ground_type: Optional[str] = None
    riser_number: Optional[int] = None
    height_of_attachment: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_base64: Optional[str] = None
    notes: Optional[str] = None

class PoleCreate(PoleBase):
    pass

class PoleUpdate(BaseModel):
    pole_type: Optional[str] = None
    pole_size: Optional[str] = None
    telecom_attachments: Optional[int] = None
    condition: Optional[str] = None
    down_guy_height: Optional[float] = None
    lead_anchor_characteristics: Optional[str] = None
    ground_type: Optional[str] = None
    riser_number: Optional[int] = None
    height_of_attachment: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_base64: Optional[str] = None
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
        "pole_types": POLE_TYPES,
        "conditions": POLE_CONDITIONS,
        "sizes": POLE_SIZES
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
    pole_type: Optional[str] = None,
    condition: Optional[str] = None,
    search: Optional[str] = None
):
    """Get all poles with optional filtering"""
    query = {}
    if pole_type:
        query["pole_type"] = pole_type
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
    poles = await db.poles.find({}, {"_id": 0, "photo_base64": 0}).sort("created_at", -1).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Pole Data"
    
    # Headers
    headers = [
        "ID", "Pole Type", "Pole Size", "Telecom Attachments", "Condition",
        "Down Guy Height (ft)", "Lead/Anchor Characteristics", "Ground Type",
        "Riser Number", "Height of Attachment (ft)", "Latitude", "Longitude",
        "Inspection Date", "Notes", "Created At", "Updated At"
    ]
    ws.append(headers)
    
    # Data rows
    for pole in poles:
        ws.append([
            pole.get("id", ""),
            pole.get("pole_type", ""),
            pole.get("pole_size", ""),
            pole.get("telecom_attachments", 0),
            pole.get("condition", ""),
            pole.get("down_guy_height", ""),
            pole.get("lead_anchor_characteristics", ""),
            pole.get("ground_type", ""),
            pole.get("riser_number", ""),
            pole.get("height_of_attachment", ""),
            pole.get("latitude", ""),
            pole.get("longitude", ""),
            pole.get("inspection_date", ""),
            pole.get("notes", ""),
            pole.get("created_at", ""),
            pole.get("updated_at", "")
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
    power_count = await db.poles.count_documents({"pole_type": "Power"})
    telecom_count = await db.poles.count_documents({"pole_type": "Telecom"})
    
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
