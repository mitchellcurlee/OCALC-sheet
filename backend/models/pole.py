from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class AdditionalPhoto(BaseModel):
    label: Optional[str] = None
    photo: Optional[str] = None


class DownGuy(BaseModel):
    owner: Optional[str] = None
    direction: Optional[str] = None
    size: Optional[str] = None
    type: Optional[str] = None
    condition: Optional[str] = None
    height: Optional[float] = None
    lead: Optional[str] = None


class Knuckle(BaseModel):
    count: Optional[str] = None
    size: Optional[str] = None
    total_eyes: Optional[str] = None
    direction: Optional[str] = None
    lead: Optional[str] = None
    condition: Optional[str] = None
    photo: Optional[str] = None


class Attachment(BaseModel):
    height: Optional[float] = None
    owner: Optional[str] = None
    photo: Optional[str] = None
    notes: Optional[str] = None


class PoleBase(BaseModel):
    job_id: Optional[str] = None
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    pole_size: str
    pole_size_type: Optional[str] = None
    pole_class: Optional[str] = None
    pole_type: Optional[str] = None
    condition: str
    pole_owner: Optional[str] = None
    access: Optional[str] = None
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    has_birthmark: bool = True
    birthmark_photo: Optional[str] = None
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photo: Optional[str] = None
    down_guys: Optional[List[DownGuy]] = []
    knuckles: Optional[List[Knuckle]] = []
    attachments: Optional[List[Attachment]] = []
    additional_photos: Optional[List[AdditionalPhoto]] = []
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    riser_height: Optional[float] = None
    use_manual_spans: Optional[bool] = False
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
    sort_order: Optional[int] = None  # Custom sort order for manual reordering


class PoleCreate(PoleBase):
    pass


class PoleUpdate(BaseModel):
    job_id: Optional[str] = None
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    pole_owner: Optional[str] = None
    access: Optional[str] = None
    pole_size: Optional[str] = None
    pole_size_type: Optional[str] = None
    pole_class: Optional[str] = None
    pole_type: Optional[str] = None
    condition: Optional[str] = None
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    has_birthmark: Optional[bool] = None
    birthmark_photo: Optional[str] = None
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photo: Optional[str] = None
    down_guys: Optional[List[DownGuy]] = None
    knuckles: Optional[List[Knuckle]] = None
    attachments: Optional[List[Attachment]] = None
    additional_photos: Optional[List[AdditionalPhoto]] = None
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    riser_height: Optional[float] = None
    use_manual_spans: Optional[bool] = None
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
    sort_order: Optional[int] = None


class Pole(PoleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: Optional[str] = None
    inspection_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
