from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid


# Job Types
JOB_TYPES = ["OCALC", "DMG", "ABF", "BAU", "ASE", "PBB", "SEAL", "SV", "CELL SITE", "PFP", "F1", "F2", "ACB"]


class JobCreate(BaseModel):
    name: Optional[str] = ""  # Wire Center (optional)
    description: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = "OCALC"
    site_id: Optional[str] = None
    employee_info: Optional[str] = None


class JobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    site_id: Optional[str] = None
    employee_info: Optional[str] = None
    completed: Optional[bool] = None
    started: Optional[bool] = None
    folder_month: Optional[str] = None
    span_notes: Optional[List[Dict[str, Any]]] = None
    span_order: Optional[List[str]] = None  # user-swapped span numbering (direction-free pair keys)
    route_sequence: Optional[List[str]] = None  # Draw Route: item ids in tapped order (overall job sequence)
    draw_routes: Optional[List[List[str]]] = None  # Draw Route: each separately drawn route
    route_mode: Optional[bool] = None  # Draw Route has been used: only drawn spans count, no auto chaining
    ase_data: Optional[Dict[str, Any]] = None  # ASE Site Walk Survey data
    permission_stamp: Optional[Dict[str, Any]] = None  # Permission Stamp form data


class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""  # Wire Center (optional)
    description: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = "OCALC"
    site_id: Optional[str] = None
    employee_info: Optional[str] = None
    user_id: str
    user_email: Optional[str] = None
    pole_count: int = 0
    completed: Optional[bool] = False
    started: Optional[bool] = False  # partial / in-progress job (tile shows yellow)
    folder_month: Optional[str] = None
    span_notes: Optional[List[Dict[str, Any]]] = []
    span_order: Optional[List[str]] = []
    route_sequence: Optional[List[str]] = []
    draw_routes: Optional[List[List[str]]] = []
    route_mode: Optional[bool] = False
    shared_with: Optional[List[str]] = []
    last_modified_by: Optional[str] = None
    transferred_from: Optional[str] = None
    transferred_at: Optional[str] = None
    transfer_history: Optional[List[dict]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    pinned_by_address: Optional[bool] = None  # dashboard pin comes from the geocoded job address (no attribute GPS yet)
    pin_approx: Optional[bool] = None  # address not found exactly — pinned at the closest match (street/ZIP/city)
    pin_matched_address: Optional[str] = None
    ase_data: Optional[Dict[str, Any]] = None  # ASE Site Walk Survey data
    permission_stamp: Optional[Dict[str, Any]] = None  # Permission Stamp form data
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
