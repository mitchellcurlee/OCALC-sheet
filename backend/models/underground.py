from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class UndergroundBase(BaseModel):
    type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    photo: Optional[str] = None


class UndergroundCreate(UndergroundBase):
    job_id: str


class UndergroundUpdate(BaseModel):
    type: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    photo: Optional[str] = None


class Underground(UndergroundBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
