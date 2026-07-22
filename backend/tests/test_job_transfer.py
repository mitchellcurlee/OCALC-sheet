"""Tests for Job Transfer feature.

Covers:
- GET /api/users/transferable (auth + company filter + sort)
- POST /api/jobs/{job_id}/transfer (owner + admin permission, edge cases)
- Ownership flow: create as user A -> transfer to user B -> verify visibility
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"
USER_EMAIL = "mitchell.curlee@byers.com"
USER_PASSWORD = "Dawson@2016"

# Fresh @byers.com test user that we register for the transfer target
TARGET_EMAIL = f"test_transfer_{uuid.uuid4().hex[:8]}@byers.com"
TARGET_PASSWORD = "TestTransfer@2026"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def _register(email, password, name=None):
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name or "TestTransfer User"}, timeout=15)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def user_token():
    r = _login(USER_EMAIL, USER_PASSWORD)
    assert r.status_code == 200, f"User login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]["id"]


@pytest.fixture(scope="module")
def target_user():
    """Register a fresh @byers.com user as the transfer target."""
    r = _register(TARGET_EMAIL, TARGET_PASSWORD)
    assert r.status_code in (200, 201), f"Register target failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["access_token"], "id": data["user"]["id"], "email": data["user"]["email"]}


def _h(token):
    return {"Authorization": f"Bearer {token}"}


class TestTransferableUsers:
    def test_no_auth_returns_401_or_403(self):
        r = requests.get(f"{API}/users/transferable", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_admin_gets_company_users_sorted(self, admin_token, target_user):
        r = requests.get(f"{API}/users/transferable", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        emails = [u["email"] for u in data]
        # Excludes caller (admin)
        assert ADMIN_EMAIL not in emails
        # Contains our registered target
        assert target_user["email"] in emails, f"Target {target_user['email']} not in {emails}"
        # All entries are company users
        for u in data:
            e = u["email"].lower()
            assert e.endswith("@mastec.com") or e.endswith("@byers.com"), f"Non-company user leaked: {e}"
            assert "id" in u
        # Sorted ascending by email (case-insensitive)
        low = [e.lower() for e in emails]
        assert low == sorted(low), f"Not sorted: {emails}"

    def test_regular_user_excluded_from_own_list(self, user_token, target_user):
        token, uid = user_token
        r = requests.get(f"{API}/users/transferable", headers=_h(token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        emails = [u["email"] for u in data]
        assert USER_EMAIL not in emails


class TestJobTransfer:
    """CRUD + transfer flow using created (and cleaned-up) jobs."""

    def test_create_transfer_visibility_flow(self, user_token, admin_token, target_user):
        """OWNERSHIP FLOW: mitchell creates job, transfers to fresh target user.
        Verify (a) mitchell no longer sees it, (b) target sees it, (c) admin sees updated email.
        """
        u_token, u_id = user_token
        # Create job as mitchell
        create_payload = {"name": f"TEST_TRANSFER_{uuid.uuid4().hex[:6]}", "location": "TESTLOC", "description": "transfer test"}
        r = requests.post(f"{API}/jobs", json=create_payload, headers=_h(u_token), timeout=15)
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        job = r.json()
        job_id = job["id"]
        assert job["user_id"] == u_id
        assert job["user_email"].lower() == USER_EMAIL.lower()

        try:
            # Verify visible to mitchell
            r = requests.get(f"{API}/jobs", headers=_h(u_token), timeout=15)
            assert r.status_code == 200
            assert any(j["id"] == job_id for j in r.json()), "Job not in owner list"

            # 400 when user_id missing
            r = requests.post(f"{API}/jobs/{job_id}/transfer", json={}, headers=_h(u_token), timeout=15)
            assert r.status_code == 400, f"Expected 400 for missing user_id, got {r.status_code}"

            # 404 for nonexistent target user
            r = requests.post(f"{API}/jobs/{job_id}/transfer", json={"user_id": "no-such-user-xyz"}, headers=_h(u_token), timeout=15)
            assert r.status_code == 404, f"Expected 404 for missing target, got {r.status_code}"

            # SUCCESS: transfer mitchell's job to target
            r = requests.post(f"{API}/jobs/{job_id}/transfer", json={"user_id": target_user["id"]}, headers=_h(u_token), timeout=15)
            assert r.status_code == 200, f"Transfer failed: {r.status_code} {r.text}"
            body = r.json()
            assert body.get("user_email", "").lower() == target_user["email"].lower()

            # (a) mitchell no longer sees the job
            r = requests.get(f"{API}/jobs", headers=_h(u_token), timeout=15)
            assert r.status_code == 200
            assert not any(j["id"] == job_id for j in r.json()), "Job still visible to old owner"

            # (b) target user sees the job in their list
            r = requests.get(f"{API}/jobs", headers=_h(target_user["token"]), timeout=15)
            assert r.status_code == 200
            target_jobs = r.json()
            assert any(j["id"] == job_id for j in target_jobs), "Job not visible to new owner"

            # (c) admin sees the job with updated user_email
            r = requests.get(f"{API}/jobs", headers=_h(admin_token), timeout=15)
            assert r.status_code == 200
            admin_view = [j for j in r.json() if j["id"] == job_id]
            assert admin_view, "Admin cannot see transferred job"
            assert admin_view[0]["user_email"].lower() == target_user["email"].lower()
            assert admin_view[0]["user_id"] == target_user["id"]

            # 404 when a user who does not own the job tries to transfer
            # mitchell is no longer owner, so should get 404
            r = requests.post(f"{API}/jobs/{job_id}/transfer", json={"user_id": u_id}, headers=_h(u_token), timeout=15)
            assert r.status_code == 404, f"Expected 404 for non-owner transfer, got {r.status_code} {r.text}"

            # Admin can transfer it back to mitchell
            r = requests.post(f"{API}/jobs/{job_id}/transfer", json={"user_id": u_id}, headers=_h(admin_token), timeout=15)
            assert r.status_code == 200, f"Admin transfer back failed: {r.status_code} {r.text}"
            assert r.json().get("user_email", "").lower() == USER_EMAIL.lower()

            # Verify GET reflects the transfer back
            r = requests.get(f"{API}/jobs/{job_id}", headers=_h(u_token), timeout=15)
            assert r.status_code == 200
            assert r.json()["user_id"] == u_id
        finally:
            # Cleanup: delete the test job (mitchell or admin)
            requests.delete(f"{API}/jobs/{job_id}", headers=_h(admin_token), timeout=15)

    def test_transfer_to_non_company_user_rejected(self, admin_token):
        """A user without @mastec.com/@byers.com cannot receive transfers."""
        # Register a non-company user
        rand = uuid.uuid4().hex[:8]
        outsider_email = f"outsider_{rand}@example.com"
        r = _register(outsider_email, "Outsider@2026")
        # register may succeed for arbitrary domains; capture id
        if r.status_code not in (200, 201):
            pytest.skip(f"Cannot register outsider ({r.status_code}); skipping test")
        outsider_id = r.json()["user"]["id"]

        # Admin creates a job
        r = requests.post(f"{API}/jobs", json={"name": f"TEST_OUT_{rand}", "location": "X"}, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        job_id = r.json()["id"]
        try:
            r = requests.post(f"{API}/jobs/{job_id}/transfer", json={"user_id": outsider_id}, headers=_h(admin_token), timeout=15)
            assert r.status_code == 400, f"Expected 400 for non-company target, got {r.status_code} {r.text}"
        finally:
            requests.delete(f"{API}/jobs/{job_id}", headers=_h(admin_token), timeout=15)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
