"""Tests for multi-photo arrays (birthmark, mgnv, knuckles, attachments, underground)
and combined reorder-items endpoint that handles both poles and underground items.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@mastecbyers.com"
ADMIN_PASSWORD = "Mastecbyers12345"

TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZqHdYUAAAAASUVORK5CYII="


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def job(headers):
    j = requests.post(f"{BASE_URL}/api/jobs", headers=headers,
                      json={"name": "TEST_MULTI_PHOTOS_JOB", "description": "multi photos & reorder", "location": "Test"},
                      timeout=30).json()
    yield j
    requests.delete(f"{BASE_URL}/api/jobs/{j['id']}", headers=headers, timeout=30)


# --- Multi-photo pole tests ---
class TestMultiPhotoPole:
    def test_create_pole_with_multiple_birthmark_and_mgnv_photos(self, headers, job):
        payload = {
            "job_id": job["id"],
            "pole_number": "TEST_MP_1",
            "pole_size": "40",
            "condition": "Good",
            "has_birthmark": True,
            "birthmark_photos": [TINY_PNG, TINY_PNG, TINY_PNG],
            "mgnv": "Yes",
            "mgnv_condition": "Good",
            "mgnv_photos": [TINY_PNG, TINY_PNG],
            "knuckles": [{"size": "10", "photos": [TINY_PNG, TINY_PNG]}],
            "attachments": [{"height": 30.5, "owner": "AT&T", "photos": [TINY_PNG, TINY_PNG, TINY_PNG]}],
        }
        r = requests.post(f"{BASE_URL}/api/poles", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert isinstance(data["birthmark_photos"], list) and len(data["birthmark_photos"]) == 3
        assert isinstance(data["mgnv_photos"], list) and len(data["mgnv_photos"]) == 2
        assert len(data["knuckles"][0]["photos"]) == 2
        assert len(data["attachments"][0]["photos"]) == 3
        # GET back
        g = requests.get(f"{BASE_URL}/api/poles/{data['id']}", headers=headers, timeout=30)
        assert g.status_code == 200
        gd = g.json()
        assert len(gd["birthmark_photos"]) == 3
        assert len(gd["mgnv_photos"]) == 2
        # Cleanup
        requests.delete(f"{BASE_URL}/api/poles/{data['id']}", headers=headers, timeout=30)

    def test_update_pole_photo_arrays(self, headers, job):
        # Create with minimal
        r = requests.post(f"{BASE_URL}/api/poles", headers=headers,
                          json={"job_id": job["id"], "pole_number": "TEST_MP_2",
                                "pole_size": "40", "condition": "Good",
                                "birthmark_photos": [TINY_PNG]}, timeout=30)
        assert r.status_code in (200, 201)
        pid = r.json()["id"]
        # Update with 4 birthmark photos
        u = requests.put(f"{BASE_URL}/api/poles/{pid}", headers=headers,
                        json={"birthmark_photos": [TINY_PNG]*4,
                              "mgnv_photos": [TINY_PNG]*2}, timeout=30)
        assert u.status_code == 200, u.text
        assert len(u.json()["birthmark_photos"]) == 4
        # Verify persisted
        g = requests.get(f"{BASE_URL}/api/poles/{pid}", headers=headers, timeout=30).json()
        assert len(g["birthmark_photos"]) == 4
        assert len(g["mgnv_photos"]) == 2
        requests.delete(f"{BASE_URL}/api/poles/{pid}", headers=headers, timeout=30)

    def test_legacy_single_photo_in_gallery(self, headers, job):
        """Legacy poles with birthmark_photo (singular) should still appear in gallery via helpers."""
        # We can't create via API anymore (model uses plural), but verify pole_photo_items helper supports legacy
        from services.helpers import pole_photo_items
        legacy_pole = {
            "ocalc_left_photo": "url-l",
            "birthmark_photo": "legacy-bm",  # singular
            "mgnv_photo": "legacy-mgnv",
            "knuckles": [{"photo": "legacy-anchor"}],
            "attachments": [{"photo": "legacy-hoa"}],
        }
        items = pole_photo_items(legacy_pole)
        labels = [lbl for lbl, _ in items]
        assert "Birthmark" in labels
        assert "MGNV" in labels
        assert "Anchor 1" in labels
        assert "HOA 1" in labels


# --- Underground multi-photo tests ---
class TestUndergroundPhotos:
    def test_create_underground_with_multiple_photos(self, headers, job):
        payload = {"job_id": job["id"], "type": "Handhole", "label": "HH-1",
                   "latitude": 33.0, "longitude": -84.0,
                   "photos": [TINY_PNG, TINY_PNG, TINY_PNG]}
        r = requests.post(f"{BASE_URL}/api/underground", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert isinstance(d["photos"], list) and len(d["photos"]) == 3
        ug_id = d["id"]
        # Update photos
        u = requests.put(f"{BASE_URL}/api/underground/{ug_id}", headers=headers,
                         json={"photos": [TINY_PNG]*5}, timeout=30)
        assert u.status_code == 200
        assert len(u.json()["photos"]) == 5
        requests.delete(f"{BASE_URL}/api/underground/{ug_id}", headers=headers, timeout=30)


# --- Combined reorder endpoint ---
class TestReorderItems:
    def test_reorder_mixed_pole_and_underground(self, headers, job):
        # Create 2 poles, 2 underground
        p1 = requests.post(f"{BASE_URL}/api/poles", headers=headers,
                           json={"job_id": job["id"], "pole_number": "TEST_R_P1",
                                 "pole_size": "40", "condition": "Good"}, timeout=30).json()
        p2 = requests.post(f"{BASE_URL}/api/poles", headers=headers,
                           json={"job_id": job["id"], "pole_number": "TEST_R_P2",
                                 "pole_size": "40", "condition": "Good"}, timeout=30).json()
        u1 = requests.post(f"{BASE_URL}/api/underground", headers=headers,
                           json={"job_id": job["id"], "type": "Manhole", "label": "TEST_R_U1"},
                           timeout=30).json()
        u2 = requests.post(f"{BASE_URL}/api/underground", headers=headers,
                           json={"job_id": job["id"], "type": "Pedestal", "label": "TEST_R_U2"},
                           timeout=30).json()

        items = [
            {"id": u1["id"], "type": "underground", "sort_order": 0},
            {"id": p2["id"], "type": "pole", "sort_order": 1},
            {"id": u2["id"], "type": "underground", "sort_order": 2},
            {"id": p1["id"], "type": "pole", "sort_order": 3},
        ]
        r = requests.put(f"{BASE_URL}/api/jobs/{job['id']}/reorder-items",
                         headers=headers, json=items, timeout=30)
        assert r.status_code == 200, r.text
        rd = r.json()
        assert rd["updated_poles"] == 2
        assert rd["updated_underground"] == 2

        # Verify persistence
        p1_get = requests.get(f"{BASE_URL}/api/poles/{p1['id']}", headers=headers, timeout=30).json()
        p2_get = requests.get(f"{BASE_URL}/api/poles/{p2['id']}", headers=headers, timeout=30).json()
        assert p1_get["sort_order"] == 3
        assert p2_get["sort_order"] == 1

        # Underground - get list
        ugs = requests.get(f"{BASE_URL}/api/jobs/{job['id']}/underground", headers=headers, timeout=30).json()
        ug_map = {u["id"]: u for u in ugs}
        assert ug_map[u1["id"]]["sort_order"] == 0
        assert ug_map[u2["id"]]["sort_order"] == 2

        # Cleanup
        for pid in (p1["id"], p2["id"]):
            requests.delete(f"{BASE_URL}/api/poles/{pid}", headers=headers, timeout=30)
        for uid in (u1["id"], u2["id"]):
            requests.delete(f"{BASE_URL}/api/underground/{uid}", headers=headers, timeout=30)

    def test_reorder_skips_missing_fields(self, headers, job):
        # Item with missing 'type' should be silently skipped
        r = requests.put(f"{BASE_URL}/api/jobs/{job['id']}/reorder-items", headers=headers,
                         json=[{"id": "bogus", "sort_order": 0}], timeout=30)
        assert r.status_code == 200
        assert r.json()["updated_poles"] == 0
        assert r.json()["updated_underground"] == 0

    def test_reorder_unknown_job(self, headers):
        r = requests.put(f"{BASE_URL}/api/jobs/00000000-0000-0000-0000-000000000000/reorder-items",
                         headers=headers, json=[], timeout=30)
        assert r.status_code == 404
