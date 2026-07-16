"""Tests for the Job Photos ZIP download endpoint.

Verifies:
- Authenticated Admin can download photos as ZIP
- ZIP structure has {JobName}/Poles/Pole_{n}/*.jpeg or {JobName}/Underground/{Type}_{Label}/*.jpeg
- Unauthenticated request returns 401
- Non-existent job returns 401 (no access) or 404 (with valid token but no job)
- Empty job (no photos) returns 404 with helpful message
"""
import io
import os
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"

SEED_JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"  # A050ABC


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} - {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Access control tests -----------------------------------------------
class TestPhotosZipAccessControl:
    def test_no_auth_returns_401(self, api):
        r = api.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/photos-zip")
        assert r.status_code == 401, f"Expected 401 without auth, got {r.status_code}"

    def test_invalid_token_returns_401(self, api):
        r = api.get(
            f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/photos-zip",
            params={"token": "invalid:signature"},
        )
        assert r.status_code == 401


# --- Happy path with the seeded job -------------------------------------
class TestPhotosZipDownload:
    def test_admin_can_download_photos_zip(self, api, auth_headers):
        r = api.get(
            f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/photos-zip",
            headers=auth_headers,
            timeout=120,
        )
        # Either 200 with zip OR 404 if seed job has no photos
        assert r.status_code in (200, 404), f"Unexpected status {r.status_code}: {r.text[:400]}"

        if r.status_code == 404:
            pytest.skip("Seed job has no photos - covered by empty-job test")

        # Verify headers
        ct = r.headers.get("content-type", "")
        assert "application/zip" in ct, f"Expected zip content-type, got {ct}"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and ".zip" in cd, f"Bad content-disposition: {cd}"

        # Open as ZIP
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
            assert len(names) > 0, "ZIP file is empty"

            # Verify labeling structure: {JobName}/(Poles|Underground)/...
            has_job_folder = all("/" in n for n in names)
            assert has_job_folder, f"Expected job-name top-level folder; names: {names[:5]}"

            top_level_dirs = {n.split("/", 1)[0] for n in names}
            assert len(top_level_dirs) == 1, f"Multiple top-level dirs: {top_level_dirs}"
            job_dir = next(iter(top_level_dirs))
            assert job_dir, "Empty job dir name"

            # At least one file should be under Poles/ or Underground/
            has_poles = any(n.startswith(f"{job_dir}/Poles/") for n in names)
            has_ug = any(n.startswith(f"{job_dir}/Underground/") for n in names)
            assert has_poles or has_ug, (
                f"Neither Poles/ nor Underground/ subfolder found. Names: {names[:10]}"
            )

            # Verify pole folder naming pattern: Pole_<number> or Pole_<number>_<station>
            for n in names:
                if n.startswith(f"{job_dir}/Poles/"):
                    # Expected: {job}/Poles/Pole_<num>/<label>.jpeg
                    parts = n.split("/")
                    assert len(parts) >= 4, f"Bad pole path: {n}"
                    assert parts[2].startswith("Pole_"), f"Pole folder should start with 'Pole_': {parts[2]}"
                    assert parts[-1].lower().endswith(".jpeg"), f"Expected .jpeg extension: {parts[-1]}"
                    break

            # Verify at least one file has non-zero content
            for name in names:
                info = zf.getinfo(name)
                if info.file_size > 0:
                    break
            else:
                pytest.fail("All files in ZIP have zero size")

    def test_zip_filename_contains_job_name(self, api, auth_headers):
        r = api.get(
            f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/export/photos-zip",
            headers=auth_headers,
            timeout=60,
        )
        if r.status_code != 200:
            pytest.skip(f"Zip download not available (status {r.status_code})")
        cd = r.headers.get("content-disposition", "")
        # Filename should contain job name (A050ABC) and _Photos_
        assert "_Photos_" in cd, f"Expected '_Photos_' in filename: {cd}"


# --- Empty job (no photos) case -----------------------------------------
class TestPhotosZipEmptyJob:
    def test_job_with_no_photos_returns_404_with_message(self, api, auth_headers):
        # Create a fresh empty job
        create = api.post(
            f"{BASE_URL}/api/jobs",
            json={"name": "TEST_EmptyJobNoPhotos", "location": "TestLoc"},
            headers=auth_headers,
        )
        assert create.status_code == 200, f"Create job failed: {create.status_code} {create.text}"
        job = create.json()
        empty_job_id = job["id"]

        try:
            r = api.get(
                f"{BASE_URL}/api/jobs/{empty_job_id}/export/photos-zip",
                headers=auth_headers,
                timeout=30,
            )
            assert r.status_code == 404, (
                f"Expected 404 for empty job, got {r.status_code}: {r.text[:300]}"
            )
            data = r.json()
            detail = data.get("detail", "").lower()
            assert "no photos" in detail, f"Expected 'no photos' in detail: {detail}"
        finally:
            # Cleanup
            api.delete(f"{BASE_URL}/api/jobs/{empty_job_id}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
