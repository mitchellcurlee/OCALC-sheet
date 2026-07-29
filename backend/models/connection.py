# Custom connections model for linking map items (poles, underground)
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class Connection(BaseModel):
    """A custom connection between two map items"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    from_item_id: str  # Source item ID (pole or underground)
    from_item_type: str  # "pole" or "underground"
    to_item_id: str  # Target item ID (pole or underground)
    to_item_type: str  # "pole" or "underground"
    connection_type: str = "aerial"  # "aerial", "underground", "custom", "removed"
    type_override: Optional[str] = None  # user-forced "aerial" | "underground" classification
    waypoints: List[dict] = []  # Intermediate points [{lat, lng}]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ConnectionCreate(BaseModel):
    """Schema for creating a connection"""
    job_id: str
    from_item_id: str
    from_item_type: str
    to_item_id: str
    to_item_type: str
    connection_type: str = "aerial"
    type_override: Optional[str] = None
    waypoints: List[dict] = []


class ConnectionUpdate(BaseModel):
    """Schema for updating a connection"""
    from_item_id: Optional[str] = None
    from_item_type: Optional[str] = None
    to_item_id: Optional[str] = None
    to_item_type: Optional[str] = None
    waypoints: Optional[List[dict]] = None
    connection_type: Optional[str] = None
    type_override: Optional[str] = None
