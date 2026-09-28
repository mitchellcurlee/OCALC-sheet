"""Backend tests for Job Photo Gallery endpoints (iteration 53)."""
import io
import os
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"


def _png_bytes():
    # 1x1 PNG
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    )


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def job(h):
    # Create fresh job
    r = requests.post(f"{API}/jobs", json={"name": "TEST_gallery_iter53", "job_type": "Aerial"}, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    j = r.json()
    job_id = j["id"]
    # Create pole
    rp = requests.post(f"{API}/poles", json={"job_id": job_id, "pole_number": "TP1"}, headers=h, timeout=30)
    assert rp.status_code in (200, 201), rp.text
    pole_id = rp.json()["id"]
    # Create underground
    ru = requests.post(f"{API}/underground", json={"job_id": job_id, "address": "123 Test St", "type": "UGPE"}, headers=h, timeout=30)
    assert ru.status_code in (200, 201), ru.text
    ug_id = ru.json()["id"]
    yield {"job_id": job_id, "pole_id": pole_id, "ug_id": ug_id}
    # cleanup
    try:
        requests.delete(f"{API}/jobs/{job_id}", headers=h, timeout=30)
    except Exception:
        pass


def _upload_photo(h, job_id, name="test.png"):
    files = {"file": (name, _png_bytes(), "image/png")}
    r = requests.post(f"{API}/jobs/{job_id}/gallery", files=files, headers=h, timeout=60)
    return r


# --- Upload / list ---

def test_upload_gallery_photo(h, job):
    r = _upload_photo(h, job["job_id"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["id"] and d["url"].startswith("/api/files/")
    assert d["assigned_to"] == []
    assert d["uploaded_by"]
    job["photo_id"] = d["id"]
    job["photo_url"] = d["url"]


def test_upload_non_image_rejected(h, job):
    files = {"file": ("bad.txt", b"hello", "text/plain")}
    r = requests.post(f"{API}/jobs/{job['job_id']}/gallery", files=files, headers=h, timeout=30)
    assert r.status_code == 400


def test_list_gallery(h, job):
    r = requests.get(f"{API}/jobs/{job['job_id']}/gallery", headers=h, timeout=30)
    assert r.status_code == 200
    lst = r.json()
    assert any(p["id"] == job["photo_id"] for p in lst)
    assert lst[0].get("url", "").startswith("/api/files/")


# --- Assign / unassign ---

def test_assign_invalid_type(h, job):
    r = requests.post(f"{API}/jobs/{job['job_id']}/gallery/{job['photo_id']}/assign",
                      json={"item_type": "bogus", "item_id": job["pole_id"]}, headers=h, timeout=30)
    assert r.status_code == 400


def test_assign_unknown_item(h, job):
    r = requests.post(f"{API}/jobs/{job['job_id']}/gallery/{job['photo_id']}/assign",
                      json={"item_type": "pole", "item_id": "no-such-id"}, headers=h, timeout=30)
    assert r.status_code == 404


def test_assign_pole_and_dedup(h, job):
    for _ in range(2):
        r = requests.post(f"{API}/jobs/{job['job_id']}/gallery/{job['photo_id']}/assign",
                          json={"item_type": "pole", "item_id": job["pole_id"]}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
    doc = r.json()
    refs = [a for a in doc["assigned_to"] if a["item_id"] == job["pole_id"]]
    assert len(refs) == 1
    # Pole should have url in staged_photos
    rp = requests.get(f"{API}/poles/{job['pole_id']}", headers=h, timeout=30)
    assert rp.status_code == 200
    sp = rp.json().get("staged_photos") or []
    assert job["photo_url"] in sp


def test_assign_underground(h, job):
    r = requests.post(f"{API}/jobs/{job['job_id']}/gallery/{job['photo_id']}/assign",
                      json={"item_type": "underground", "item_id": job["ug_id"]}, headers=h, timeout=30)
    assert r.status_code == 200
    ru = requests.get(f"{API}/underground/{job['ug_id']}", headers=h, timeout=30)
    assert ru.status_code == 200
    assert job["photo_url"] in (ru.json().get("staged_photos") or [])


def test_unassign_removes_from_item(h, job):
    r = requests.delete(f"{API}/jobs/{job['job_id']}/gallery/{job['photo_id']}/assign/pole/{job['pole_id']}",
                        headers=h, timeout=30)
    assert r.status_code == 200
    refs = [a for a in r.json()["assigned_to"] if a["item_id"] == job["pole_id"]]
    assert not refs
    rp = requests.get(f"{API}/poles/{job['pole_id']}", headers=h, timeout=30)
    assert job["photo_url"] not in (rp.json().get("staged_photos") or [])


# --- Zip export ---

def test_photos_zip_includes_unassigned(h, job):
    # Upload another photo that stays unassigned
    r = _upload_photo(h, job["job_id"], name="unassigned.png")
    assert r.status_code == 200
    unassigned_id = r.json()["id"]

    # Ensure photo_id is currently assigned to underground only (test above unassigned pole)
    z = requests.get(f"{API}/jobs/{job['job_id']}/export/photos-zip", headers=h, timeout=120)
    assert z.status_code == 200, z.text
    zf = zipfile.ZipFile(io.BytesIO(z.content))
    names = zf.namelist()
    job_photo_entries = [n for n in names if "/Job Photos/" in n]
    # unassigned one must be listed under Job Photos folder
    assert job_photo_entries, f"no Job Photos entries: {names}"
    # cleanup
    requests.delete(f"{API}/jobs/{job['job_id']}/gallery/{unassigned_id}", headers=h, timeout=30)


# --- Delete ---

def test_delete_gallery_photo_only(h, job):
    # After delete, item's staged_photos should still contain the url (since underground assign remains)
    r = requests.delete(f"{API}/jobs/{job['job_id']}/gallery/{job['photo_id']}", headers=h, timeout=30)
    assert r.status_code == 200
    ru = requests.get(f"{API}/underground/{job['ug_id']}", headers=h, timeout=30)
    assert job["photo_url"] in (ru.json().get("staged_photos") or [])
    # gallery list no longer includes it
    lst = requests.get(f"{API}/jobs/{job['job_id']}/gallery", headers=h, timeout=30).json()
    assert not any(p["id"] == job["photo_id"] for p in lst)


def test_delete_missing_returns_404(h, job):
    r = requests.delete(f"{API}/jobs/{job['job_id']}/gallery/nonexistent", headers=h, timeout=30)
    assert r.status_code == 404
