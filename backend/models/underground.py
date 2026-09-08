from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class UndergroundBase(BaseModel):
    type: str
    material_type: Optional[str] = None  # Subtype: Handhole (Concrete/Bi-fold, etc), Hoffman Box (Community/Private), Pedestal (Copper/Fiber)
    owner: Optional[str] = None  # Owner (Handhole/Manhole)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    photos: Optional[List[str]] = []
    staged_photos: Optional[List[str]] = []  # Unsorted photos from the form's top gallery
    auto_label_unsorted: Optional[bool] = False  # Label unsorted photos with the item name in exports
    sort_order: Optional[int] = None
    tie_in_measurements: Optional[str] = None  # For Handhole/Pole tie-in measurements
    fid: Optional[str] = None
    primary_fid: Optional[bool] = False
    path_measurements: Optional[List[dict]] = []  # [{direction: In/Over/Up/Down, feet: float}]
    soc_start: Optional[bool] = False
    soc_end: Optional[bool] = False
    start_path: Optional[bool] = False
    end_path: Optional[bool] = False
    standalone: Optional[bool] = False
    marker_color: Optional[str] = None
    aerial_override: Optional[str] = None  # "aerial" | "underground" | None (default by type)


class UndergroundCreate(UndergroundBase):
    job_id: str


class UndergroundUpdate(BaseModel):
    type: Optional[str] = None
    material_type: Optional[str] = None
    owner: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    photos: Optional[List[str]] = None
    staged_photos: Optional[List[str]] = None
    auto_label_unsorted: Optional[bool] = None
    sort_order: Optional[int] = None
    tie_in_measurements: Optional[str] = None
    fid: Optional[str] = None
    primary_fid: Optional[bool] = None
    path_measurements: Optional[List[dict]] = None
    soc_start: Optional[bool] = None
    soc_end: Optional[bool] = None
    start_path: Optional[bool] = None
    end_path: Optional[bool] = None
    standalone: Optional[bool] = None
    marker_color: Optional[str] = None
    aerial_override: Optional[str] = None


class Underground(UndergroundBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_modified_by: Optional[str] = None
