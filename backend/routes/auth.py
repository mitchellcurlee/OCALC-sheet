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


class ResetBody(BaseModel):
    token: str
    password: str


RESET_TOKEN_HOURS = 1


def _require_admin(user: dict) -> None:
    if not (is_admin_user(user) or is_mastec_byers_admin(user)):
        raise HTTPException(status_code=403, detail="Admin access required")


def _email_shell(title: str, body_html: str) -> str:
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#18181b">'
        f'<h2 style="margin:0 0 12px;font-size:18px">{title}</h2>{body_html}'
        f'<p style="font-size:12px;color:#888">Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password by email.</p>'
        '</td></tr></table>'
    )


def _button(link: str, label: str) -> str:
    return f'<p style="margin:20px 0"><a href="{link}" style="background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:bold;display:inline-block">{label}</a></p>'


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
    html = _email_shell(
        f"Welcome to {escape(EMAIL_FROM_NAME)}",
        f'<p>Hi {name}, confirm your email address to activate your account.</p>'
        + _button(link, "Verify email address")
        + f'<p style="font-size:12px;color:#52525b">This link expires in {VERIFY_TOKEN_HOURS} hours. If you did not create an account, you can ignore this email.</p>',
    )
    await send_email(to=user["email"], subject=subject, html=html)


async def _send_password_reset(user: dict, origin: str) -> None:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_HOURS)).isoformat()
    await _db.users.update_one({"id": user["id"]}, {"$set": {"reset_token": token, "reset_expires": expires}})
    link = f"{origin}/reset-password?token={token}"
    name = escape(user.get("name") or user["email"].split("@")[0])
    html = _email_shell(
        "Reset your password",
        f'<p>Hi {name}, we received a request to reset the password for your {escape(EMAIL_FROM_NAME)} account.</p>'
        + _button(link, "Choose a new password")
        + f'<p style="font-size:12px;color:#52525b">This link expires in {RESET_TOKEN_HOURS} hour. If you did not request a reset, you can ignore this email — your password will not change.</p>',
    )
    await send_email(to=user["email"], subject=f"Reset your {EMAIL_FROM_NAME} password", html=html)


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


@router.post("/forgot-password")
async def forgot_password(body: EmailOnly, request: Request):
    email = body.email.strip().lower()
    user = await _db.users.find_one({"email": email}, {"_id": 0})
    # Same response whether or not the account exists (no enumeration)
    if user and (is_company_email(email) or is_admin_user(user)):
        origin = _app_origin(request)
        try:
            await _send_password_reset(user, origin)
        except HTTPException:
            raise HTTPException(status_code=424, detail="We couldn't send the reset email right now. Please try again in a few minutes.")
    return {"message": "If an account exists for that email, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: ResetBody):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = await _db.users.find_one({"reset_token": body.token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used.")
    if (user.get("reset_expires") or "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="This reset link has expired. Request a new one from the sign-in page.")
    # Following the emailed link proves ownership of the inbox, so it also verifies the address.
    await _db.users.update_one(
        {"id": user["id"]},
        {"$set": {"hashed_password": get_password_hash(body.password), "email_verified": True, "password_changed_at": datetime.now(timezone.utc).isoformat()},
         "$unset": {"reset_token": "", "reset_expires": "", "verification_token": "", "verification_expires": ""}},
    )
    user["email_verified"] = True
    return _token_response(user)


@router.get("/admin/users")
async def admin_list_users(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    users = await _db.users.find({}, {"_id": 0, "hashed_password": 0, "verification_token": 0, "reset_token": 0}).to_list(5000)
    counts = {}
    async for row in _db.jobs.aggregate([{"$match": {"is_deleted": {"$ne": True}}}, {"$group": {"_id": "$user_id", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    out = []
    for u in users:
        email = (u.get("email") or "").lower()
        domain = email.split("@")[-1] if "@" in email else ""
        out.append({
            "id": u["id"], "email": email, "name": u.get("name", ""), "domain": domain,
            "company_allowed": is_company_email(email) or is_admin_user(u),
            "email_verified": u.get("email_verified") is not False,
            "grandfathered": "email_verified" not in u,
            "is_admin": is_admin_user(u) or is_mastec_byers_admin(u),
            "is_supervisor": bool(u.get("is_supervisor")),
            "created_at": u.get("created_at"), "verified_at": u.get("verified_at"),
            "verification_expires": u.get("verification_expires"),
            "job_count": counts.get(u["id"], 0),
        })
    out.sort(key=lambda x: (x["domain"], x["email"]))
    return {"domains": list(ALLOWED_DOMAINS), "users": out}


class SupervisorBody(BaseModel):
    is_supervisor: bool


@router.put("/admin/users/{user_id}/supervisor")
async def admin_set_supervisor(user_id: str, body: SupervisorBody, current_user: dict = Depends(get_current_user)):
    """Supervisors can open Team Reports (all fielders' DFRs) without full admin rights."""
    _require_admin(current_user)
    user = await _db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await _db.users.update_one({"id": user_id}, {"$set": {"is_supervisor": body.is_supervisor}})
    return {"id": user_id, "email": user.get("email"), "is_supervisor": body.is_supervisor}


@router.post("/admin/users/{user_id}/resend-verification")
async def admin_resend_verification(user_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    user = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("email_verified") is not False:
        raise HTTPException(status_code=400, detail="This user is already verified")
    try:
        await _send_verification(user, _app_origin(request))
    except HTTPException:
        raise HTTPException(status_code=424, detail="Email could not be sent to this address right now.")
    return {"message": f"Verification email sent to {user['email']}"}


@router.delete("/admin/users/{user_id}")
async def admin_delete_unverified_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove an account that never verified (e.g. a typo'd email) so the person can register again."""
    _require_admin(current_user)
    user = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("email_verified") is not False:
        raise HTTPException(status_code=400, detail="Only unverified accounts can be removed here")
    await _db.users.delete_one({"id": user_id})
    return {"deleted": True}


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
    current_user["is_supervisor"] = bool(current_user.get("is_supervisor"))
    current_user.pop("verification_token", None)
    return current_user
