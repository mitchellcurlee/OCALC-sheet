# Map annotation model for measurements and notes on the interactive map
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid


class MapAnnotation(BaseModel):
    """An annotation (measurement or note) on the map"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    type: str  # "measurement" or "note"
    latitude: float
    longitude: float
    # For measurements: end point coordinates
    end_latitude: Optional[float] = None
    end_longitude: Optional[float] = None
    # Content
    text: str = ""  # For notes, or custom label for measurements
    distance_ft: Optional[float] = None  # Auto-calculated for measurements
    color: str = "#f59e0b"  # Default amber/orange color
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MapAnnotationCreate(BaseModel):
    """Schema for creating an annotation"""
    job_id: str
    type: str
    latitude: float
    longitude: float
    end_latitude: Optional[float] = None
    end_longitude: Optional[float] = None
    text: str = ""
    color: str = "#f59e0b"


class MapAnnotationUpdate(BaseModel):
    """Schema for updating an annotation"""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    end_latitude: Optional[float] = None
    end_longitude: Optional[float] = None
    text: Optional[str] = None
    color: Optional[str] = None
