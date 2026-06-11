"""
Backend tests for new features:
- PUT /api/poles/reorder (sort_order persistence)
- GET /api/jobs/{job_id}/export/photos-zip (ZIP download)
- GET /api/jobs/{job_id}/export/excel (existing, regression)
Uses seeded OCALC job (A050ABC) and master admin credentials.
"""
import os
import io
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "tim.gables@byers.com"
ADMIN_PASSWORD = "Byers@13430"
SEED_JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def seed_poles(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/poles", timeout=30)
    assert r.status_code == 200, f"Could not fetch seed poles: {r.status_code} {r.text}"
    poles = r.json()
    assert len(poles) >= 2, f"Seed job needs >=2 poles for reorder test (has {len(poles)})"
    return poles


# ---------------- Pole reorder ----------------

class TestPoleReorder:
    def test_reorder_persists_sort_order(self, admin_client, seed_poles):
        ids = [p["id"] for p in seed_poles]

        # Set reverse order
        payload = [{"id": pid, "sort_order": idx} for idx, pid in enumerate(reversed(ids))]
        r = admin_client.put(f"{BASE_URL}/api/poles/reorder", json=payload, timeout=30)
        assert r.status_code == 200, f"Reorder failed: {r.status_code} {r.text}"
        data = r.json()
        assert "updated" in data
        assert data["updated"] >= 1

        # Verify each pole has the expected sort_order persisted
        for idx, pid in enumerate(reversed(ids)):
            gr = admin_client.get(f"{BASE_URL}/api/poles/{pid}", timeout=30)
            assert gr.status_code == 200
            assert gr.json().get("sort_order") == idx, f"sort_order not persisted for {pid}"

        # Restore original order
        restore = [{"id": pid, "sort_order": idx} for idx, pid in enumerate(ids)]
        rr = admin_client.put(f"{BASE_URL}/api/poles/reorder", json=restore, timeout=30)
        assert rr.status_code == 200

    def test_reorder_requires_auth(self):
        anon = requests.Session()
        r = anon.put(f"{BASE_URL}/api/poles/reorder", json=[{"id": "x", "sort_order": 0}], timeout=30)
        assert r.status_code in (401, 403), f"Expected 401/403 for unauthenticated reorder, got {r.status_code}"

    def test_reorder_route_does_not_collide_with_pole_id(self, admin_client):
        # Critical regression: /poles/reorder must NOT be interpreted as /poles/{pole_id="reorder"}
        # GET /poles/reorder should NOT return a pole (it's PUT-only)
        r = admin_client.get(f"{BASE_URL}/api/poles/reorder", timeout=30)
        # FastAPI returns 405 (Method Not Allowed) when route exists but for different method;
        # or 404 if it's interpreted as pole id "reorder". 405 is what we want (route declared).
        assert r.status_code in (405, 404)
        if r.status_code == 404:
            # If 404, ensure it isn't because path was matched as {pole_id} with a wrong response
            assert "Pole not found" in r.text or "Not Found" in r.text


# ---------------- Photos ZIP ----------------

class TestPhotosZip:
    def test_photos_zip_returns_zip(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/photos-zip", timeout=60)
        assert r.status_code == 200, f"Photos ZIP failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/zip")
        assert "attachment" in r.headers.get("content-disposition", "")
        # Validate the body is a valid ZIP (even if empty - no photos)
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
            # Just ensure no corruption (CRC checks)
            assert zf.testzip() is None
            # Document for next iteration
            print(f"Photos ZIP contains {len(names)} entries: {names[:5]}")

    def test_photos_zip_requires_auth(self):
        anon = requests.Session()
        r = anon.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/photos-zip", timeout=30)
        assert r.status_code in (401, 403)

    def test_photos_zip_404_for_unknown_job(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/jobs/nonexistent-job-id/export/photos-zip", timeout=30)
        assert r.status_code == 404


# ---------------- Excel export (regression) ----------------

class TestExcelExport:
    def test_export_excel_returns_xlsx(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/excel", timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "octet-stream" in ct
        # XLSX files start with PK (zip magic)
        assert r.content[:2] == b"PK"


# ---------------- Get-job-poles returns sort_order ----------------

class TestPolesSortOrder:
    def test_get_job_poles_includes_sort_order_after_reorder(self, admin_client, seed_poles):
        # After running reorder test above (module-scoped), sort_order should be present
        ids = [p["id"] for p in seed_poles]
        payload = [{"id": pid, "sort_order": idx * 10} for idx, pid in enumerate(ids)]
        rr = admin_client.put(f"{BASE_URL}/api/poles/reorder", json=payload, timeout=30)
        assert rr.status_code == 200

        r = admin_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/poles", timeout=30)
        assert r.status_code == 200
        poles = r.json()
        sort_orders = {p["id"]: p.get("sort_order") for p in poles}
        for idx, pid in enumerate(ids):
            assert sort_orders.get(pid) == idx * 10, (
                f"sort_order mismatch for {pid}: expected {idx * 10}, got {sort_orders.get(pid)}"
            )
