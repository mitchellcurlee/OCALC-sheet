from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import uuid


# Job Types
JOB_TYPES = ["OCALC", "DMG", "ABF", "BAU", "ASE", "PBB", "SEAL", "SV", "CELL SITE"]


class JobCreate(BaseModel):
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = "OCALC"


class JobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    completed: Optional[bool] = None
    ase_data: Optional[Dict[str, Any]] = None  # ASE Site Walk Survey data


class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = "OCALC"
    user_id: str
    user_email: Optional[str] = None
    pole_count: int = 0
    completed: Optional[bool] = False
    transferred_from: Optional[str] = None
    transferred_at: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ase_data: Optional[Dict[str, Any]] = None  # ASE Site Walk Survey data
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
