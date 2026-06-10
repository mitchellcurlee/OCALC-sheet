from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


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
    user_id: str
    user_email: Optional[str] = None
    pole_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
