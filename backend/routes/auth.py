from fastapi import APIRouter, HTTPException, Depends
from models.user import User, UserCreate, UserLogin
from services.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, is_admin_user
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Database reference (set from server.py)
_db = None


def set_db(db):
    global _db
    _db = db


@router.post("/register")
async def register(user_data: UserCreate):
    """Register a new user"""
    existing = await _db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=user_data.email.lower(),
        name=user_data.name or user_data.email.split("@")[0],
        hashed_password=get_password_hash(user_data.password)
    )
    await _db.users.insert_one(user.model_dump())
    
    token = create_access_token({"sub": user.id})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "name": user.name, "is_admin": user.is_admin}
    }


@router.post("/login")
async def login(credentials: UserLogin):
    """Login and get access token"""
    user = await _db.users.find_one({"email": credentials.email.lower()}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": user["id"]})
    user_is_admin = is_admin_user(user)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name", ""), "is_admin": user_is_admin}
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    current_user["is_admin"] = is_admin_user(current_user)
    return current_user
