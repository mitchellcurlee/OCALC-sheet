"""Tests for the photo ZIP export endpoint (/api/jobs/{job_id}/export/photos-zip)
and the new Pole Mark Ups field on PoleForm/Pole model.
"""
import os
import io
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@mastecbyers.com"
ADMIN_PASSWORD = "Mastecbyers@12345"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}: {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def target_job(auth_headers):
    """Pick job '123456' if present, else fallback to the first available job."""
    r = requests.get(f"{BASE_URL}/api/jobs", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"GET /jobs failed: {r.status_code} {r.text[:200]}"
    jobs = r.json()
    assert isinstance(jobs, list) and len(jobs) > 0, "No jobs available for admin"
    chosen = None
    for j in jobs:
        if j.get("name") == "123456" or j.get("job_number") == "123456":
            chosen = j
            break
    return chosen or jobs[0]


# --- photo ZIP export endpoint ----------------------------------------------

class TestPhotosZipExport:
    def test_unauthenticated_returns_401(self, target_job):
        url = f"{BASE_URL}/api/jobs/{target_job['id']}/export/photos-zip"
        r = requests.get(url, timeout=60)
        assert r.status_code == 401, f"expected 401 got {r.status_code}"

    def test_authenticated_returns_zip(self, auth_headers, target_job):
        url = f"{BASE_URL}/api/jobs/{target_job['id']}/export/photos-zip"
        r = requests.get(url, headers=auth_headers, timeout=120)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
        # content-type should be a zip / octet-stream
        ctype = r.headers.get("content-type", "")
        assert "zip" in ctype or "octet-stream" in ctype, f"unexpected content-type: {ctype}"
        # body must be a valid (possibly empty) zip
        body = r.content
        assert len(body) > 0, "empty body returned"
        # ZIP magic header is 'PK'
        assert body[:2] == b"PK", f"body is not a zip (first bytes: {body[:8]!r})"
        # Verify ZIP is readable
        zf = zipfile.ZipFile(io.BytesIO(body))
        names = zf.namelist()
        # Either empty (job has no photos) or has entries under Poles/ or Underground/
        for n in names:
            assert n.startswith(("Poles/", "Underground/")) or n.endswith((".jpeg", ".jpg", ".png")), n

    def test_invalid_job_returns_404(self, auth_headers):
        url = f"{BASE_URL}/api/jobs/nonexistent-job-id-xyz/export/photos-zip"
        r = requests.get(url, headers=auth_headers, timeout=30)
        assert r.status_code in (404, 401), f"expected 404/401 got {r.status_code}"


# --- pole_markup_photos field round-trip ------------------------------------

class TestPoleMarkupPhotosField:
    """Verify the pole model accepts and round-trips pole_markup_photos."""

    def test_create_pole_with_markup_photos(self, auth_headers, target_job):
        # 1x1 transparent png as data URL (smallest possible payload)
        tiny_png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        payload = {
            "job_id": target_job["id"],
            "pole_number": "TEST_PMARKUP",
            "pole_size": "30",
            "condition": "Good",
            "pole_markup_photos": [tiny_png],
            "hoa_markup_photos": [tiny_png],
        }
        r = requests.post(f"{BASE_URL}/api/poles", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), f"create pole failed: {r.status_code} {r.text[:200]}"
        created = r.json()
        pole_id = created.get("id")
        assert pole_id, f"no id in created pole: {created}"
        try:
            # GET back to verify persistence
            g = requests.get(f"{BASE_URL}/api/poles/{pole_id}", headers=auth_headers, timeout=30)
            assert g.status_code == 200, f"get pole failed: {g.status_code}"
            fetched = g.json()
            assert "pole_markup_photos" in fetched, "pole_markup_photos field missing from response"
            assert isinstance(fetched["pole_markup_photos"], list)
            assert len(fetched["pole_markup_photos"]) == 1, "markup photo not persisted"
            assert "hoa_markup_photos" in fetched
            assert len(fetched["hoa_markup_photos"]) == 1
        finally:
            requests.delete(f"{BASE_URL}/api/poles/{pole_id}", headers=auth_headers, timeout=30)
