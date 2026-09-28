import secrets
from datetime import datetime, timezone, timedelta
from html import escape
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from models.user import User, UserCreate, UserLogin
from services.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, is_admin_user, is_mastec_byers_admin,
    is_company_email, ACCESS_RESTRICTED_MSG, ALLOWED_DOMAINS,
)
from services.email import send_email, EMAIL_FROM_NAME

router = APIRouter(prefix="/auth", tags=["auth"])

# Database reference (set from server.py)
_db = None

VERIFY_TOKEN_HOURS = 24


def set_db(db):
    global _db
    _db = db


class EmailOnly(BaseModel):
    email: str


class VerifyBody(BaseModel):
    token: str


def _app_origin(request: Request) -> str:
    origin = request.headers.get("origin") or ""
    if not origin:
        ref = request.headers.get("referer") or ""
        p = urlparse(ref)
        origin = f"{p.scheme}://{p.netloc}" if p.netloc else ""
    if not origin.startswith("https://"):
        raise HTTPException(status_code=400, detail="Verification links require a secure (https) app address")
    return origin.rstrip("/")


async def _send_verification(user: dict, origin: str) -> None:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_HOURS)).isoformat()
    await _db.users.update_one({"id": user["id"]}, {"$set": {"verification_token": token, "verification_expires": expires}})
    link = f"{origin}/verify-email?token={token}"
    name = escape(user.get("name") or user["email"].split("@")[0])
    subject = f"Verify your {EMAIL_FROM_NAME} account"
    html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#18181b">'
        f'<h2 style="margin:0 0 12px;font-size:18px">Welcome to {escape(EMAIL_FROM_NAME)}</h2>'
        f'<p>Hi {name}, confirm your email address to activate your account.</p>'
        f'<p style="margin:20px 0"><a href="{link}" style="background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:bold;display:inline-block">Verify email address</a></p>'
        f'<p style="font-size:12px;color:#52525b">This link expires in {VERIFY_TOKEN_HOURS} hours. If you did not create an account, you can ignore this email.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password by email.</p>'
        '</td></tr></table>'
    )
    await send_email(to=user["email"], subject=subject, html=html)


def _token_response(user: dict) -> dict:
    token = create_access_token({"sub": user["id"]})
    user_is_admin = is_admin_user(user) or is_mastec_byers_admin(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name", ""), "is_admin": user_is_admin},
    }


@router.get("/allowed-domains")
async def allowed_domains():
    return {"domains": list(ALLOWED_DOMAINS)}


@router.post("/register")
async def register(user_data: UserCreate, request: Request):
    """Register a new company user; account stays locked until the emailed link is clicked."""
    email = user_data.email.strip().lower()
    if not is_company_email(email):
        raise HTTPException(status_code=403, detail=ACCESS_RESTRICTED_MSG)
    existing = await _db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        if existing.get("email_verified") is False:
            raise HTTPException(status_code=400, detail="This email is already registered but not verified. Use “Resend verification email”.")
        raise HTTPException(status_code=400, detail="Email already registered")
    origin = _app_origin(request)
    user = User(email=email, name=user_data.name or email.split("@")[0], hashed_password=get_password_hash(user_data.password))
    doc = user.model_dump()
    doc["email_verified"] = False
    await _db.users.insert_one(doc)
    try:
        await _send_verification(doc, origin)
    except HTTPException:
        await _db.users.delete_one({"id": doc["id"]})
        raise HTTPException(status_code=424, detail="We couldn't send a verification email to that address right now. Double-check the email and try again in a few minutes.")
    return {"verification_required": True, "email": email, "message": "Check your inbox for a verification link to activate your account."}


@router.post("/resend-verification")
async def resend_verification(body: EmailOnly, request: Request):
    email = body.email.strip().lower()
    user = await _db.users.find_one({"email": email}, {"_id": 0})
    # Same response whether or not the account exists (no enumeration)
    if user and user.get("email_verified") is False and is_company_email(email):
        await _send_verification(user, _app_origin(request))
    return {"message": "If that account is awaiting verification, a new link has been sent."}


@router.post("/verify-email")
async def verify_email(body: VerifyBody):
    user = await _db.users.find_one({"verification_token": body.token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has already been used.")
    if (user.get("verification_expires") or "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="This verification link has expired. Request a new one from the sign-in page.")
    await _db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email_verified": True, "verified_at": datetime.now(timezone.utc).isoformat()}, "$unset": {"verification_token": "", "verification_expires": ""}},
    )
    user["email_verified"] = True
    return _token_response(user)


@router.post("/login")
async def login(credentials: UserLogin):
    """Login and get access token"""
    email = credentials.email.strip().lower()
    user = await _db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not is_admin_user(user) and not is_company_email(email):
        raise HTTPException(status_code=403, detail=ACCESS_RESTRICTED_MSG)
    if user.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
    return _token_response(user)


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    current_user["is_admin"] = is_admin_user(current_user) or is_mastec_byers_admin(current_user)
    current_user.pop("verification_token", None)
    return current_user
