import os
import re
from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# JWT Configuration
SECRET_KEY = os.environ.get("JWT_SECRET", "pole-data-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Master Admin Credentials
MASTER_ADMIN_EMAIL = os.environ.get("MASTER_ADMIN_EMAIL", "admin@poledata.com")
MASTER_ADMIN_PASSWORD = os.environ.get("MASTER_ADMIN_PASSWORD", "ChangeMe123!")
MASTER_ADMIN_NAME = os.environ.get("MASTER_ADMIN_NAME", "Master Admin")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Database reference (will be set from server.py)
_db = None


def set_db(db):
    global _db
    _db = db


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await _db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not is_admin_user(user) and not is_company_user(user):
        raise HTTPException(status_code=403, detail=ACCESS_RESTRICTED_MSG)
    if user.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="Please verify your email address before signing in.")
    return user


# Company domains that may use the app. Add new companies here only.
ALLOWED_DOMAINS = ("mastec.com", "byers.com", "mastecbyers.com", "synapsiq.com", "mastecindia.com", "att.com")
ACCESS_RESTRICTED_MSG = "This app is restricted to authorized company accounts."


def is_company_email(email: str) -> bool:
    e = (email or "").strip().lower()
    return any(e.endswith("@" + d) for d in ALLOWED_DOMAINS)


def is_company_user(user: dict) -> bool:
    return is_company_email(user.get("email", ""))


def company_email_regex() -> dict:
    """Mongo filter matching any user whose email is on an allowed company domain."""
    pattern = "@(" + "|".join(re.escape(d) for d in ALLOWED_DOMAINS) + ")$"
    return {"email": {"$regex": pattern, "$options": "i"}}


def is_admin_user(user: dict) -> bool:
    """Check if user is the master admin"""
    return user.get("is_admin", False) or user.get("email", "").lower() == MASTER_ADMIN_EMAIL.lower()


def is_mastec_byers_admin(user: dict) -> bool:
    """Check if user is the mastec/byers admin who can see all mastec.com and byers.com jobs"""
    email = user.get("email", "").lower()
    return email == "admin@mastec.com"


def is_mastec_byers_user(user: dict) -> bool:
    """Check if user belongs to an allowed company domain"""
    return is_company_user(user)
