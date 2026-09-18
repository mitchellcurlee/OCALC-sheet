from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class DownGuy(BaseModel):
    owner: Optional[str] = None
    direction: Optional[str] = None
    size: Optional[str] = None
    type: Optional[str] = None
    condition: Optional[str] = None
    height: Optional[float] = None
    lead: Optional[str] = None
    photos: Optional[List[str]] = []


class Knuckle(BaseModel):
    count: Optional[str] = None
    owner: Optional[str] = None
    size: Optional[str] = None
    total_eyes: Optional[str] = None
    direction: Optional[str] = None
    lead: Optional[str] = None
    condition: Optional[str] = None
    photos: Optional[List[str]] = []


class Attachment(BaseModel):
    owner: Optional[str] = None
    location: Optional[str] = None  # Midspan, Building, Driveway, St. Crossing
    height: Optional[float] = None
    hoa_type: Optional[str] = None  # Fiber new strand, Fiber over lashed to copper, Copper
    notes: Optional[str] = None
    address: Optional[str] = None  # nearest home address (building number + street)
    photos: Optional[List[str]] = []


class PoleBase(BaseModel):
    job_id: Optional[str] = None
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    marker_color: Optional[str] = None
    pole_size: Optional[str] = None
    pole_size_type: Optional[str] = None
    pole_class: Optional[str] = None
    pole_type: Optional[str] = None
    condition: Optional[str] = None
    pole_owner: Optional[str] = None
    access: Optional[str] = None
    pole_photo: Optional[str] = None  # Main pole picture
    ocalc_left_photo: Optional[str] = None
    ocalc_middle_photo: Optional[str] = None
    ocalc_right_photo: Optional[str] = None
    has_birthmark: bool = True
    birthmark_photos: Optional[List[str]] = []
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photos: Optional[List[str]] = []
    down_guys: Optional[List[DownGuy]] = []
    knuckles: Optional[List[Knuckle]] = []
    attachments: Optional[List[Attachment]] = []
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    existing_risers: Optional[str] = None
    riser_height: Optional[float] = None
    riser_sort_order: Optional[float] = None
    riser_after: Optional[str] = None  # list anchor: key of the row the riser sits under, '__top__' = top
    last_modified_by: Optional[str] = None
    pole_line_start: Optional[bool] = False
    pole_line_end: Optional[bool] = False
    start_path: Optional[bool] = False
    end_path: Optional[bool] = False
    standalone: Optional[bool] = False
    hoa_markup_photos: Optional[List[str]] = []  # Photos with HOA annotations/markup
    tree_trimming_needed: Optional[bool] = False
    pole_markup_photos: Optional[List[str]] = []  # General pole photos with markup capability
    staged_photos: Optional[List[str]] = []  # Unsorted photos from the form's top gallery
    auto_label_unsorted: Optional[bool] = False  # Label unsorted photos with the item name in exports
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
    address: Optional[str] = None  # nearest home address (building number + street)
    row_information: Optional[str] = None  # R.O.W. Information notes
    sort_order: Optional[int] = None  # Custom sort order for manual reordering


class PoleCreate(PoleBase):
    pass


class PoleUpdate(BaseModel):
    job_id: Optional[str] = None
    staged_photos: Optional[List[str]] = None
    auto_label_unsorted: Optional[bool] = None
    job_number: Optional[str] = None
    pole_number: Optional[str] = None
    marker_color: Optional[str] = None
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
    birthmark_photos: Optional[List[str]] = None
    mgnv: Optional[str] = None
    mgnv_condition: Optional[str] = None
    mgnv_photos: Optional[List[str]] = None
    down_guys: Optional[List[DownGuy]] = None
    knuckles: Optional[List[Knuckle]] = None
    attachments: Optional[List[Attachment]] = None
    pole_terminal: Optional[str] = None
    risers: Optional[str] = None
    existing_risers: Optional[str] = None
    riser_height: Optional[float] = None
    riser_sort_order: Optional[float] = None
    riser_after: Optional[str] = None  # list anchor: key of the row the riser sits under, '__top__' = top
    pole_line_start: Optional[bool] = None
    pole_line_end: Optional[bool] = None
    start_path: Optional[bool] = None
    end_path: Optional[bool] = None
    standalone: Optional[bool] = None
    hoa_markup_photos: Optional[List[str]] = None
    tree_trimming_needed: Optional[bool] = None
    pole_markup_photos: Optional[List[str]] = None
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
    address: Optional[str] = None  # nearest home address (building number + street)
    row_information: Optional[str] = None
    sort_order: Optional[int] = None


class Pole(PoleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: Optional[str] = None
    inspection_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
