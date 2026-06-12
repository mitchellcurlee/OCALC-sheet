"""
Tests for:
1) Additional Photos feature on Pole (create, update, get, gallery HTML)
2) Underground types should NOT contain 'Pole Term.'
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@mastecbyers.com"
ADMIN_PASSWORD = "Mastecbyers12345"

# 1x1 PNG base64 sample
TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    }, timeout=30)
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_pole_id(auth_headers):
    payload = {
        "pole_size": "40",
        "condition": "Good",
        "pole_number": "TEST_AP_POLE_1",
        "additional_photos": [
            {"label": "Damage Side", "photo": TINY_PNG},
            {"label": "Top View", "photo": TINY_PNG},
        ],
    }
    r = requests.post(f"{BASE_URL}/api/poles", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 201, f"create failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data
    pid = data["id"]
    yield pid
    # cleanup
    try:
        requests.delete(f"{BASE_URL}/api/poles/{pid}", headers=auth_headers, timeout=15)
    except Exception:
        pass


# --- 1. UNDERGROUND TYPES ---
class TestUndergroundTypes:
    def test_pole_term_not_in_underground_types(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/poles/options", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "underground_types" in data
        ut = data["underground_types"]
        assert isinstance(ut, list)
        # Should NOT contain 'Pole Term.' (any variant)
        lowered = [str(x).lower().strip() for x in ut]
        assert "pole term." not in lowered
        assert "pole terminal" not in lowered
        # And some expected entries
        assert "Handhole" in ut
        assert "Manhole" in ut


# --- 2. ADDITIONAL PHOTOS ---
class TestAdditionalPhotos:
    def test_pole_create_with_additional_photos(self, auth_headers, created_pole_id):
        # GET right away and verify persistence with labels
        r = requests.get(f"{BASE_URL}/api/poles/{created_pole_id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "additional_photos" in data
        ap = data["additional_photos"]
        assert isinstance(ap, list)
        assert len(ap) == 2
        labels = [p.get("label") for p in ap]
        assert "Damage Side" in labels
        assert "Top View" in labels
        for p in ap:
            assert p.get("photo") and p.get("photo").startswith("data:image/")

    def test_pole_update_add_additional_photo(self, auth_headers, created_pole_id):
        # Append another photo via PUT
        new_list = [
            {"label": "Damage Side", "photo": TINY_PNG},
            {"label": "Top View", "photo": TINY_PNG},
            {"label": "Base View", "photo": TINY_PNG},
        ]
        r = requests.put(
            f"{BASE_URL}/api/poles/{created_pole_id}",
            json={"additional_photos": new_list},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert len(updated.get("additional_photos", [])) == 3
        labels = [p.get("label") for p in updated["additional_photos"]]
        assert "Base View" in labels

        # GET to verify persistence
        g = requests.get(f"{BASE_URL}/api/poles/{created_pole_id}", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        gdata = g.json()
        assert len(gdata.get("additional_photos", [])) == 3

    def test_pole_update_clear_additional_photos(self, auth_headers, created_pole_id):
        r = requests.put(
            f"{BASE_URL}/api/poles/{created_pole_id}",
            json={"additional_photos": []},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("additional_photos") == []
        # Restore non-empty list for gallery test
        restore = [{"label": "Gallery Test Photo", "photo": TINY_PNG}]
        r2 = requests.put(
            f"{BASE_URL}/api/poles/{created_pole_id}",
            json={"additional_photos": restore},
            headers=auth_headers,
            timeout=20,
        )
        assert r2.status_code == 200
        assert len(r2.json().get("additional_photos", [])) == 1

    def test_pole_gallery_html_includes_additional_photo_label(self, auth_headers, created_pole_id):
        # Gallery endpoint is HTML and accepts a token in 'name:id' format
        token = f"pole_gallery:{created_pole_id}"
        r = requests.get(
            f"{BASE_URL}/api/poles/{created_pole_id}/gallery",
            params={"token": token},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        html = r.text
        # Gallery should include the additional photo label we set
        assert "Gallery Test Photo" in html, "Additional photo label missing in gallery HTML"

    def test_additional_photo_with_no_label_uses_default(self, auth_headers):
        # Pole with an unlabeled additional photo -> gallery shows "Additional 1"
        payload = {
            "pole_size": "35",
            "condition": "Good",
            "pole_number": "TEST_AP_POLE_2",
            "additional_photos": [
                {"label": None, "photo": TINY_PNG},
                {"label": "", "photo": TINY_PNG},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/poles", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        try:
            g = requests.get(
                f"{BASE_URL}/api/poles/{pid}/gallery",
                params={"token": f"pole_gallery:{pid}"},
                headers=auth_headers,
                timeout=20,
            )
            assert g.status_code == 200
            assert "Additional 1" in g.text or "Additional 2" in g.text
        finally:
            requests.delete(f"{BASE_URL}/api/poles/{pid}", headers=auth_headers, timeout=15)
