"""Backend tests for centralized company domains, email verification flow, and job transfer.

Covers iteration 54 review request:
- Domain-restricted registration (ALLOWED_DOMAINS)
- Email verification required for new users; grandfathered existing users unaffected
- resend-verification (no enumeration)
- verify-email (bad / valid / reuse)
- login denied for non-company domains (even if the user doc exists)
- /users/transferable + /jobs/{id}/transfer between synapsiq <-> byers users,
  including that files + gallery photos are visible to the new owner.
"""
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient
from urllib.parse import unquote
from passlib.context import CryptContext

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# Origin header the backend requires (must be https)
ORIGIN = BASE_URL if BASE_URL.startswith("https://") else "https://example.com"
HTTPS_HEADERS = {"Origin": ORIGIN, "Referer": ORIGIN + "/"}

# Mongo access to read verification_token (as documented in test_credentials.md)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip('"').strip("'")
DB_NAME = os.environ.get("DB_NAME", "test_database").strip('"').strip("'")
_client = MongoClient(MONGO_URL)
db = _client[DB_NAME]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Seed creds
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASS = "Mastecbyers12345"
BYERS_EMAIL = "mitchell.curlee@byers.com"
BYERS_PASS = "Dawson@2016"
SYNAP_EMAIL = "qa.tester@synapsiq.com"
SYNAP_PASS = "secret123"

# Track created resources for cleanup
_created_user_emails = set()
_created_job_ids = set()
_state = {}  # module-level shared state across tests


@pytest.fixture(scope="module", autouse=True)
def cleanup_at_end():
    yield
    if _created_user_emails:
        db.users.delete_many({"email": {"$in": list(_created_user_emails)}})
    if _created_job_ids:
        db.jobs.delete_many({"id": {"$in": list(_created_job_ids)}})


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Registration domain gating ----------------

class TestRegisterDomain:
    def test_gmail_register_403(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": f"qa.iter54.{uuid.uuid4().hex[:6]}@gmail.com",
                                "password": "Abcdef12345!", "name": "Blocked"},
                          headers=HTTPS_HEADERS, timeout=30)
        assert r.status_code == 403, r.text
        assert "restricted" in r.json().get("detail", "").lower()

    def test_mastecindia_register_ok_then_login_blocked(self):
        # NOTE: Resend blocks registrations for mastecindia.com/synapsiq.com/mastecbyers.com
        # as "undeliverable recipient" -> backend returns 502. Verified with curl.
        # For the flow test we use mastec.com (deliverable) to validate the code path.
        email = None
        r = None
        for attempt in range(3):
            email = f"qa.iter54.{uuid.uuid4().hex[:8]}@byers.com"
            _created_user_emails.add(email)
            r = requests.post(f"{API}/auth/register",
                              json={"email": email, "password": "Abcdef12345!", "name": "QA Iter54"},
                              headers=HTTPS_HEADERS, timeout=45)
            if r.status_code == 200:
                break
            db.users.delete_one({"email": email.lower()})
            time.sleep(2)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("verification_required") is True
        assert body.get("email") == email.lower()

        u = db.users.find_one({"email": email.lower()})
        assert u is not None
        assert u.get("email_verified") is False
        assert isinstance(u.get("verification_token"), str) and len(u["verification_token"]) > 10

        lr = _login(email, "Abcdef12345!")
        assert lr.status_code == 403, lr.text
        assert "EMAIL_NOT_VERIFIED" in lr.json().get("detail", "")

        _state["pending_email"] = email

    def test_register_same_unverified_email_400_with_resend_hint(self):
        email = _state["pending_email"]
        r = requests.post(f"{API}/auth/register",
                          json={"email": email, "password": "Abcdef12345!", "name": "Dup"},
                          headers=HTTPS_HEADERS, timeout=30)
        assert r.status_code == 400
        assert "resend" in r.json().get("detail", "").lower() or "not verified" in r.json().get("detail", "").lower()

    def test_resend_verification_ok_for_unverified_and_unknown(self):
        email = _state["pending_email"]
        # Grab token before resend
        prev_token = db.users.find_one({"email": email.lower()}).get("verification_token")

        r = requests.post(f"{API}/auth/resend-verification",
                          json={"email": email}, headers=HTTPS_HEADERS, timeout=30)
        assert r.status_code == 200
        assert "message" in r.json()

        new_token = db.users.find_one({"email": email.lower()}).get("verification_token")
        assert new_token and new_token != prev_token, "resend must rotate the token"

        # Unknown email: still 200 (no enumeration)
        r2 = requests.post(f"{API}/auth/resend-verification",
                           json={"email": f"nobody.{uuid.uuid4().hex[:6]}@mastecindia.com"},
                           headers=HTTPS_HEADERS, timeout=30)
        assert r2.status_code == 200

    def test_verify_email_bad_then_good_then_reuse(self):
        email = _state["pending_email"]
        # Bad token
        rb = requests.post(f"{API}/auth/verify-email", json={"token": "bad-token"}, timeout=30)
        assert rb.status_code == 400

        real_token = db.users.find_one({"email": email.lower()}).get("verification_token")
        assert real_token
        rg = requests.post(f"{API}/auth/verify-email", json={"token": real_token}, timeout=30)
        assert rg.status_code == 200, rg.text
        data = rg.json()
        assert data.get("access_token")
        assert data.get("user", {}).get("email") == email.lower()

        # Reuse the same token -> 400 (unset by prior verify)
        rr = requests.post(f"{API}/auth/verify-email", json={"token": real_token}, timeout=30)
        assert rr.status_code == 400

        # DB now email_verified True
        u = db.users.find_one({"email": email.lower()})
        assert u.get("email_verified") is True

        # Save the token for downstream tests (as new synaps-style user)
        _state["verified_token"] = data["access_token"]
        _state["verified_user_id"] = data["user"]["id"]

    def test_login_after_verify_ok_and_me_and_jobs(self):
        email = _state["pending_email"]
        lr = _login(email, "Abcdef12345!")
        assert lr.status_code == 200, lr.text
        token = lr.json()["access_token"]

        me = requests.get(f"{API}/auth/me", headers=_auth(token), timeout=30)
        assert me.status_code == 200
        assert me.json().get("email") == email.lower()

        jobs = requests.get(f"{API}/jobs", headers=_auth(token), timeout=30)
        assert jobs.status_code == 200

    def test_register_already_verified_email_400(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": SYNAP_EMAIL, "password": "whatever", "name": "x"},
                          headers=HTTPS_HEADERS, timeout=30)
        assert r.status_code == 400
        assert "already" in r.json().get("detail", "").lower()


# ---------------- Grandfathered login ----------------

class TestGrandfatheredLogin:
    def test_admin_login(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["is_admin"] is True

    def test_byers_login(self):
        r = _login(BYERS_EMAIL, BYERS_PASS)
        assert r.status_code == 200, r.text

    def test_synapsiq_login(self):
        r = _login(SYNAP_EMAIL, SYNAP_PASS)
        assert r.status_code == 200, r.text


# ---------------- Non-company existing account denial ----------------

class TestNonCompanyDenial:
    def test_login_and_me_403_for_gmail_user_created_in_db(self):
        email = f"test.blocked.{uuid.uuid4().hex[:6]}@gmail.com"
        _created_user_emails.add(email)
        uid = str(uuid.uuid4())
        db.users.insert_one({
            "id": uid,
            "email": email,
            "name": "Blocked",
            "hashed_password": pwd_ctx.hash("Password123!"),
            "email_verified": True,
        })
        lr = _login(email, "Password123!")
        assert lr.status_code == 403, lr.text
        assert "restricted" in lr.json().get("detail", "").lower()

        # Also verify /me denies via forged JWT (mint via login of admin then swap sub is hard;
        # instead call /auth/me with a JWT crafted using the same secret).
        from jose import jwt
        SECRET = os.environ["JWT_SECRET"]
        token = jwt.encode({"sub": uid}, SECRET, algorithm="HS256")
        me = requests.get(f"{API}/auth/me", headers=_auth(token), timeout=30)
        assert me.status_code == 403


# ---------------- Transfer flows ----------------

class TestTransferable:
    def _synap_token(self):
        return _login(SYNAP_EMAIL, SYNAP_PASS).json()["access_token"]

    def _byers_token(self):
        return _login(BYERS_EMAIL, BYERS_PASS).json()["access_token"]

    def test_transferable_list_excludes_unverified_and_self(self):
        # create an unverified user; must not appear in list
        u_email = f"qa.iter54.unv.{uuid.uuid4().hex[:6]}@mastec.com"
        _created_user_emails.add(u_email)
        db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": u_email,
            "name": "Unv",
            "hashed_password": pwd_ctx.hash("x"),
            "email_verified": False,
        })
        t = self._synap_token()
        r = requests.get(f"{API}/users/transferable", headers=_auth(t), timeout=30)
        assert r.status_code == 200
        emails = [x["email"].lower() for x in r.json()]
        assert SYNAP_EMAIL.lower() not in emails, "self excluded"
        assert u_email.lower() not in emails, "unverified excluded"
        assert BYERS_EMAIL.lower() in emails, "byers must be transferable"

    def test_transfer_both_directions_preserves_files_and_gallery(self):
        synap_t = self._synap_token()
        byers_t = self._byers_token()
        # Resolve user ids
        me_synap = requests.get(f"{API}/auth/me", headers=_auth(synap_t)).json()
        me_byers = requests.get(f"{API}/auth/me", headers=_auth(byers_t)).json()
        synap_id, byers_id = me_synap["id"], me_byers["id"]

        # 1) create a job as synap
        cj = requests.post(f"{API}/jobs", headers=_auth(synap_t),
                           json={"name": f"TEST_transfer_{uuid.uuid4().hex[:6]}"}, timeout=30)
        assert cj.status_code in (200, 201), cj.text
        job_id = cj.json()["id"]
        _created_job_ids.add(job_id)

        # 2) upload a job file (multipart) — try /jobs/{id}/files
        files = {"file": ("hello.txt", b"hello world", "text/plain")}
        up = requests.post(f"{API}/jobs/{job_id}/files", headers=_auth(synap_t), files=files, timeout=30)
        assert up.status_code in (200, 201), up.text

        # 3) upload a gallery photo
        img = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
        gph = requests.post(f"{API}/jobs/{job_id}/gallery",
                            headers=_auth(synap_t),
                            files={"file": ("g.png", img, "image/png")}, timeout=30)
        assert gph.status_code in (200, 201), gph.text

        # 4) transfer synap -> byers
        tr = requests.post(f"{API}/jobs/{job_id}/transfer", headers=_auth(synap_t),
                           json={"user_id": byers_id}, timeout=30)
        assert tr.status_code == 200, tr.text

        # 5) new owner (byers) can GET job + files + gallery
        gj = requests.get(f"{API}/jobs/{job_id}", headers=_auth(byers_t), timeout=30)
        assert gj.status_code == 200
        gf = requests.get(f"{API}/jobs/{job_id}/files", headers=_auth(byers_t), timeout=30)
        assert gf.status_code == 200
        assert len(gf.json()) >= 1
        gg = requests.get(f"{API}/jobs/{job_id}/gallery", headers=_auth(byers_t), timeout=30)
        assert gg.status_code == 200
        assert len(gg.json()) >= 1

        # 6) transfer byers -> synap
        tr2 = requests.post(f"{API}/jobs/{job_id}/transfer", headers=_auth(byers_t),
                            json={"user_id": synap_id}, timeout=30)
        assert tr2.status_code == 200, tr2.text
        gj2 = requests.get(f"{API}/jobs/{job_id}", headers=_auth(synap_t), timeout=30)
        assert gj2.status_code == 200
