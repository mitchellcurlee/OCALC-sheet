"""Tests for new features: POST /poles/{id}/sync-distances + Excel export with Photos ZIP / Map links per pole."""
import io
import os
import re
import zipfile
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "tim.gables@byers.com"
ADMIN_PASS = "Byers@13430"
SEED_JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"


@pytest.fixture(scope="module")
def auth_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        pytest.skip("No access_token in login response")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def pole_ids(auth_client):
    r = auth_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/poles")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1, "Need at least 1 seed pole"
    return [p["id"] for p in data]


# ---- POST /api/poles/{pole_id}/sync-distances ----
class TestSyncSinglePole:
    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/poles/any-pole/sync-distances")
        assert r.status_code in (401, 403), f"Unauthenticated should be 401/403, got {r.status_code}"

    def test_unknown_pole_returns_404_or_no_op(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/poles/nonexistent-pole-id-xyz/sync-distances")
        # Either 404 or 200/no-op; must not be 500
        assert r.status_code in (200, 404), f"Got {r.status_code}: {r.text}"
        assert r.status_code != 500

    def test_sync_existing_pole_returns_success_shape(self, auth_client, pole_ids):
        pole_id = pole_ids[0]
        r = auth_client.post(f"{BASE_URL}/api/poles/{pole_id}/sync-distances")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "message" in body
        assert "updated" in body
        assert isinstance(body["updated"], bool)


# ---- GET /api/jobs/{job_id}/export/excel (per-pole Photos ZIP + Map link) ----
class TestExcelExportLinks:
    def test_excel_downloads_xlsx(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/excel")
        assert r.status_code == 200, r.text
        # XLSX = zip; check PK magic bytes
        assert r.content[:2] == b"PK", "Excel must be a valid XLSX/zip"
        assert "spreadsheet" in r.headers.get("Content-Type", "") or r.headers.get("Content-Type", "").endswith("xlsx") or "officedocument" in r.headers.get("Content-Type", "")

    def test_excel_contains_photos_zip_and_map_links(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/excel")
        assert r.status_code == 200
        # Parse the xlsx (zip of XML) and search for hyperlinks/text
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        # sharedStrings.xml or sheet1.xml will contain link text
        text_blob = ""
        for n in names:
            if n.endswith(".xml") or n.endswith(".rels"):
                try:
                    text_blob += z.read(n).decode("utf-8", errors="ignore")
                except Exception:
                    pass

        assert "Photos ZIP" in text_blob, "Excel should contain 'Photos ZIP' link text per pole"
        assert "View Map" in text_blob, "Excel should contain 'View Map' link text per pole"
        # Confirm hyperlink to photos-zip and to map page exist
        assert re.search(r"/api/poles/[\w\-]+/photos-zip", text_blob), "Excel should include /api/poles/{id}/photos-zip hyperlink"
        assert re.search(r"/jobs/[\w\-]+/map", text_blob), "Excel should include /jobs/{id}/map hyperlink"


# ---- GET /api/poles/{pole_id}/photos-zip used by Excel link ----
class TestPolePhotosZipEndpoint:
    def test_photos_zip_endpoint_returns_zip_or_404(self, auth_client, pole_ids):
        pole_id = pole_ids[0]
        r = auth_client.get(f"{BASE_URL}/api/poles/{pole_id}/photos-zip")
        # Either valid ZIP (PK header) or 404 if pole has no photos
        assert r.status_code in (200, 404), f"Got {r.status_code}: {r.text[:200]}"
        if r.status_code == 200:
            assert r.content[:2] == b"PK"
            assert "zip" in r.headers.get("Content-Type", "").lower()
