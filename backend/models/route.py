# Route waypoints model for custom editable paths between poles
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class Waypoint(BaseModel):
    """A single waypoint (lat/lng coordinate) in a route segment"""
    lat: float
    lng: float


class RouteSegment(BaseModel):
    """A route segment between two poles with optional waypoints"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    from_pole_id: str  # Starting pole ID
    to_pole_id: str    # Ending pole ID (empty string for standalone segments)
    waypoints: List[Waypoint] = []  # Intermediate points between poles
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RouteSegmentCreate(BaseModel):
    """Schema for creating a route segment"""
    job_id: str
    from_pole_id: str
    to_pole_id: str = ""
    waypoints: List[Waypoint] = []


class RouteSegmentUpdate(BaseModel):
    """Schema for updating a route segment"""
    waypoints: Optional[List[Waypoint]] = None
