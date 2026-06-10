from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid


class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: Optional[str] = None
    hashed_password: str
    is_admin: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
