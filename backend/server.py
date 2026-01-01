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
        ws['B1'] = "EWO:"
        ws['D1'] = "DATE:"
        ws['F1'] = "NUMBER OF POLES:"
        ws['H1'] = str(len(poles))
        ws['I1'] = "PAGE:"
        ws['J1'] = str(sheet_num + 1)
        ws['K1'] = "OF"
        ws['L1'] = str(total_sheets)
        
        # Process poles in pairs (2 poles per block, 4 blocks per sheet)
        row_offset = 4
        for block_idx in range(4):
            pole_left_idx = block_idx * 2
            pole_right_idx = block_idx * 2 + 1
            
            pole_left = sheet_poles[pole_left_idx] if pole_left_idx < len(sheet_poles) else None
            pole_right = sheet_poles[pole_right_idx] if pole_right_idx < len(sheet_poles) else None
            
            base_row = row_offset + (block_idx * 18)
            
            # Row 1: P#, SIZE, TYPE, A E P headers
            ws[f'A{base_row}'] = "P#"
            ws[f'B{base_row}'] = "SIZE"
            ws[f'C{base_row}'] = "TYPE"
            ws[f'D{base_row}'] = "A  E  P"
            ws[f'G{base_row}'] = "P#"
            ws[f'H{base_row}'] = "SIZE"
            ws[f'I{base_row}'] = "TYPE"
            ws[f'J{base_row}'] = "A  E  P"
            
            # Row 2: P# data, SIZE data, etc
            if pole_left:
                ws[f'A{base_row+1}'] = pole_left.get("pole_number", "")
                ws[f'B{base_row+1}'] = pole_left.get("pole_size", "")
                ws[f'C{base_row+1}'] = pole_left.get("pole_owner", "")
                cond = pole_left.get("condition", "")
                ws[f'D{base_row+1}'] = "A" if cond == "Excellent" else ("E" if cond == "Good" else ("P" if cond == "Bad" else ""))
            if pole_right:
                ws[f'G{base_row+1}'] = pole_right.get("pole_number", "")
                ws[f'H{base_row+1}'] = pole_right.get("pole_size", "")
                ws[f'I{base_row+1}'] = pole_right.get("pole_owner", "")
                cond = pole_right.get("condition", "")
                ws[f'J{base_row+1}'] = "A" if cond == "Excellent" else ("E" if cond == "Good" else ("P" if cond == "Bad" else ""))
            
            # Span rows (N, E, S, W)
            span_dirs = ["N", "E", "S", "W"]
            for i, dir_label in enumerate(span_dirs):
                row = base_row + 2 + i
                ws[f'A{row}'] = dir_label
                ws[f'B{row}'] = "SP"
                ws[f'C{row}'] = "AT"
                ws[f'G{row}'] = dir_label
                ws[f'H{row}'] = "SP"
                ws[f'I{row}'] = "AT"
                
                # Fill span data based on direction
                if pole_left:
                    for span_num in range(1, 5):
                        span_dir = pole_left.get(f"span{span_num}_direction", "")
                        if span_dir == dir_label:
                            ws[f'D{row}'] = pole_left.get(f"span{span_num}_distance", "")
                            break
                if pole_right:
                    for span_num in range(1, 5):
                        span_dir = pole_right.get(f"span{span_num}_direction", "")
                        if span_dir == dir_label:
                            ws[f'J{row}'] = pole_right.get(f"span{span_num}_distance", "")
                            break
            
            # LOC row
            row = base_row + 6
            ws[f'A{row}'] = "LOC"
            ws[f'G{row}'] = "LOC"
            if pole_left:
                lat = pole_left.get("latitude", "")
                lng = pole_left.get("longitude", "")
                ws[f'B{row}'] = f"{lat}, {lng}" if lat and lng else ""
            if pole_right:
                lat = pole_right.get("latitude", "")
                lng = pole_right.get("longitude", "")
                ws[f'H{row}'] = f"{lat}, {lng}" if lat and lng else ""
            
            # GUY row
            row = base_row + 7
            ws[f'A{row}'] = "GUY"
            ws[f'B{row}'] = "AT"
            ws[f'C{row}'] = "DIR"
            ws[f'D{row}'] = "SIZE"
            ws[f'E{row}'] = "EYES"
            ws[f'G{row}'] = "GUY"
            ws[f'H{row}'] = "AT"
            ws[f'I{row}'] = "DIR"
            ws[f'J{row}'] = "SIZE"
            ws[f'K{row}'] = "EYES"
            
            # Guy data rows
            for guy_num in range(1, 5):
                guy_row = base_row + 7 + guy_num
                if pole_left:
                    ws[f'A{guy_row}'] = str(guy_num)
                    ws[f'B{guy_row}'] = pole_left.get(f"down_guy{guy_num}_height", "")
                    ws[f'C{guy_row}'] = pole_left.get(f"down_guy{guy_num}_direction", "")
                    ws[f'D{guy_row}'] = pole_left.get(f"down_guy{guy_num}_size", "")
                    ws[f'E{guy_row}'] = pole_left.get(f"down_guy{guy_num}_lead", "")
                if pole_right:
                    ws[f'G{guy_row}'] = str(guy_num)
                    ws[f'H{guy_row}'] = pole_right.get(f"down_guy{guy_num}_height", "")
                    ws[f'I{guy_row}'] = pole_right.get(f"down_guy{guy_num}_direction", "")
                    ws[f'J{guy_row}'] = pole_right.get(f"down_guy{guy_num}_size", "")
                    ws[f'K{guy_row}'] = pole_right.get(f"down_guy{guy_num}_lead", "")
            
            # RISER row
            row = base_row + 12
            ws[f'A{row}'] = "RISER(S)"
            ws[f'G{row}'] = "RISER(S)"
            if pole_left:
                ws[f'B{row}'] = pole_left.get("risers", "")
            if pole_right:
                ws[f'H{row}'] = pole_right.get("risers", "")
            
            # LEAD/HEIGHT row (Height of attachments)
            row = base_row + 13
            ws[f'A{row}'] = "LEAD/HEIGHT"
            ws[f'G{row}'] = "LEAD/HEIGHT"
            if pole_left:
                heights = []
                for att_num in range(1, 6):
                    h = pole_left.get(f"attachment{att_num}_height")
                    if h:
                        heights.append(str(h))
                ws[f'B{row}'] = ", ".join(heights) if heights else ""
            if pole_right:
                heights = []
                for att_num in range(1, 6):
                    h = pole_right.get(f"attachment{att_num}_height")
                    if h:
                        heights.append(str(h))
                ws[f'H{row}'] = ", ".join(heights) if heights else ""
            
            # OWN row
            row = base_row + 14
            ws[f'A{row}'] = "OWN"
            ws[f'G{row}'] = "OWN"
            if pole_left:
                owners = []
                for att_num in range(1, 6):
                    o = pole_left.get(f"attachment{att_num}_owner")
                    if o:
                        owners.append(o)
                ws[f'B{row}'] = ", ".join(owners) if owners else pole_left.get("pole_owner", "")
            if pole_right:
                owners = []
                for att_num in range(1, 6):
                    o = pole_right.get(f"attachment{att_num}_owner")
                    if o:
                        owners.append(o)
                ws[f'H{row}'] = ", ".join(owners) if owners else pole_right.get("pole_owner", "")
            
            # NOTES row
            row = base_row + 15
            ws[f'A{row}'] = "NOTES"
            ws[f'G{row}'] = "NOTES"
            if pole_left:
                ws[f'B{row}'] = pole_left.get("notes", "")
            if pole_right:
                ws[f'H{row}'] = pole_right.get("notes", "")
            
            # P.TERMINAL and GROUND row
            row = base_row + 16
            ws[f'A{row}'] = "P.TERMINAL"
            ws[f'B{row}'] = "YES/NO"
            ws[f'C{row}'] = "GROUND"
            ws[f'D{row}'] = "Y/N/B"
            ws[f'G{row}'] = "P.TERMINAL"
            ws[f'H{row}'] = "YES/NO"
            ws[f'I{row}'] = "GROUND"
            ws[f'J{row}'] = "Y/N/B"
            
            if pole_left:
                ws[f'B{row+1}'] = pole_left.get("pole_terminal", "")
                mgnv_cond = pole_left.get("mgnv_condition", "")
                ws[f'D{row+1}'] = "Y" if mgnv_cond == "Good" else ("B" if mgnv_cond == "Broken" else "N")
            if pole_right:
                ws[f'H{row+1}'] = pole_right.get("pole_terminal", "")
                mgnv_cond = pole_right.get("mgnv_condition", "")
                ws[f'J{row+1}'] = "Y" if mgnv_cond == "Good" else ("B" if mgnv_cond == "Broken" else "N")
        
        # Adjust column widths
        for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']:
            ws.column_dimensions[col].width = 12
    
    # Also create a flat DATA sheet for easy viewing
    data_ws = wb.create_sheet("DATA")
    data_headers = [
        "Pole #", "Job #", "Size", "Type/Owner", "Condition", 
        "N Span", "E Span", "S Span", "W Span",
        "Latitude", "Longitude",
        "Guy 1 Dir", "Guy 1 Size", "Guy 1 Height", "Guy 1 Lead",
        "Guy 2 Dir", "Guy 2 Size", "Guy 2 Height", "Guy 2 Lead",
        "Guy 3 Dir", "Guy 3 Size", "Guy 3 Height", "Guy 3 Lead",
        "Guy 4 Dir", "Guy 4 Size", "Guy 4 Height", "Guy 4 Lead",
        "Risers", "Pole Terminal", "MGNV", "MGNV Condition",
        "Att 1 Height", "Att 1 Owner", "Att 2 Height", "Att 2 Owner",
        "Att 3 Height", "Att 3 Owner", "Att 4 Height", "Att 4 Owner",
        "Att 5 Height", "Att 5 Owner",
        "Birthmark", "Notes"
    ]
    data_ws.append(data_headers)
    
    for pole in poles:
        data_ws.append([
            pole.get("pole_number", ""),
            pole.get("job_number", ""),
            pole.get("pole_size", ""),
            pole.get("pole_owner", ""),
            pole.get("condition", ""),
            pole.get("span1_distance", ""),
            pole.get("span2_distance", ""),
            pole.get("span3_distance", ""),
            pole.get("span4_distance", ""),
            pole.get("latitude", ""),
            pole.get("longitude", ""),
            pole.get("down_guy1_direction", ""),
            pole.get("down_guy1_size", ""),
            pole.get("down_guy1_height", ""),
            pole.get("down_guy1_lead", ""),
            pole.get("down_guy2_direction", ""),
            pole.get("down_guy2_size", ""),
            pole.get("down_guy2_height", ""),
            pole.get("down_guy2_lead", ""),
            pole.get("down_guy3_direction", ""),
            pole.get("down_guy3_size", ""),
            pole.get("down_guy3_height", ""),
            pole.get("down_guy3_lead", ""),
            pole.get("down_guy4_direction", ""),
            pole.get("down_guy4_size", ""),
            pole.get("down_guy4_height", ""),
            pole.get("down_guy4_lead", ""),
            pole.get("risers", ""),
            pole.get("pole_terminal", ""),
            pole.get("mgnv", ""),
            pole.get("mgnv_condition", ""),
            pole.get("attachment1_height", ""),
            pole.get("attachment1_owner", ""),
            pole.get("attachment2_height", ""),
            pole.get("attachment2_owner", ""),
            pole.get("attachment3_height", ""),
            pole.get("attachment3_owner", ""),
            pole.get("attachment4_height", ""),
            pole.get("attachment4_owner", ""),
            pole.get("attachment5_height", ""),
            pole.get("attachment5_owner", ""),
            "Yes" if pole.get("has_birthmark", True) else "No",
            pole.get("notes", "")
        ])
    
    # Adjust DATA sheet column widths
    for col in data_ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 30)
        data_ws.column_dimensions[column].width = adjusted_width
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"pole_fielding_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
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
