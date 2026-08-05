"""Backend tests for the new staged_photos (Photo Gallery) feature on poles and underground items."""
import os
import re
import io
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"
JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"

ADMIN = {"email": "Admin@mastec.com", "password": "Mastecbyers12345"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def sample_photo_url(headers):
    # 1x1 JPEG
    jpg = bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b0801000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b510000201030302040305050404000001027700010203110405213112410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfbffd9"
    )
    files = {"file": ("test.jpg", io.BytesIO(jpg), "image/jpeg")}
    r = requests.post(f"{API}/upload-photo", files=files, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert url
    return url


# ----- POLE staged_photos -----
class TestPoleStagedPhotos:
    def test_get_pole_has_staged_photos_field(self, headers):
        r = requests.get(f"{API}/jobs/{JOB_ID}/poles", headers=headers, timeout=30)
        assert r.status_code == 200
        poles = r.json()
        assert len(poles) >= 1
        assert "staged_photos" in poles[0]

    def test_put_pole_staged_photos_persists(self, headers, sample_photo_url):
        poles = requests.get(f"{API}/jobs/{JOB_ID}/poles", headers=headers).json()
        pid = poles[0]["id"]
        r = requests.put(f"{API}/poles/{pid}", json={"staged_photos": [sample_photo_url]}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("staged_photos") == [sample_photo_url]

        # Persist across GET
        g = requests.get(f"{API}/poles/{pid}", headers=headers, timeout=30)
        assert g.status_code == 200
        assert g.json().get("staged_photos") == [sample_photo_url]

    def test_clear_pole_staged_photos(self, headers):
        poles = requests.get(f"{API}/jobs/{JOB_ID}/poles", headers=headers).json()
        pid = poles[0]["id"]
        r = requests.put(f"{API}/poles/{pid}", json={"staged_photos": []}, headers=headers, timeout=30)
        assert r.status_code == 200
        assert r.json().get("staged_photos") == []


# ----- UNDERGROUND staged_photos -----
class TestUgStagedPhotos:
    def test_put_ug_staged_photos_persists(self, headers, sample_photo_url):
        ugs = requests.get(f"{API}/jobs/{JOB_ID}/underground", headers=headers).json()
        assert len(ugs) >= 1
        uid = ugs[0]["id"]
        r = requests.put(f"{API}/underground/{uid}", json={"staged_photos": [sample_photo_url]}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("staged_photos") == [sample_photo_url]

        g = requests.get(f"{API}/underground/{uid}", headers=headers, timeout=30)
        assert g.json().get("staged_photos") == [sample_photo_url]

    def test_clear_ug_staged_photos(self, headers):
        ugs = requests.get(f"{API}/jobs/{JOB_ID}/underground", headers=headers).json()
        uid = ugs[0]["id"]
        r = requests.put(f"{API}/underground/{uid}", json={"staged_photos": []}, headers=headers, timeout=30)
        assert r.status_code == 200
        assert r.json().get("staged_photos") == []


# ----- Job photo gallery + ZIP -----
class TestJobPhotoGallery:
    def test_gallery_lists_unsorted(self, headers, sample_photo_url):
        # Add staged photo on the first pole
        poles = requests.get(f"{API}/jobs/{JOB_ID}/poles", headers=headers).json()
        pid = poles[0]["id"]
        r = requests.put(f"{API}/poles/{pid}", json={"staged_photos": [sample_photo_url]}, headers=headers, timeout=30)
        assert r.status_code == 200

        # Gallery page returns HTML with 'Unsorted' label somewhere
        g = requests.get(f"{API}/jobs/{JOB_ID}/photos", headers=headers, timeout=30)
        assert g.status_code == 200
        body = g.text
        assert "Unsorted" in body, "Gallery should include Unsorted label for staged photos"

    def test_photos_zip_contains_unsorted(self, headers):
        # Get gallery html and extract token
        g = requests.get(f"{API}/jobs/{JOB_ID}/photos", headers=headers, timeout=30)
        assert g.status_code == 200
        m = re.search(r"photos-zip\?token=([A-Za-z0-9_\-\.:]+)", g.text)
        assert m, "Gallery HTML should contain a photos-zip token"
        token = m.group(1)

        z = requests.get(f"{API}/jobs/{JOB_ID}/export/photos-zip?token={token}", timeout=60)
        assert z.status_code == 200, z.text
        # Look for Unsorted in the zip's binary names (avoid full unzip complexity)
        assert b"Unsorted" in z.content, "ZIP should contain a file with 'Unsorted' in its filename"

    def test_cleanup(self, headers):
        poles = requests.get(f"{API}/jobs/{JOB_ID}/poles", headers=headers).json()
        for p in poles:
            requests.put(f"{API}/poles/{p['id']}", json={"staged_photos": []}, headers=headers)
        ugs = requests.get(f"{API}/jobs/{JOB_ID}/underground", headers=headers).json()
        for u in ugs:
            requests.put(f"{API}/underground/{u['id']}", json={"staged_photos": []}, headers=headers)
