"""Backend tests for underground FID + Primary FID + Path Measurements (iteration 23)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://utility-pole-map.preview.emergentagent.com').rstrip('/')
JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"  # Seed job A050ABC


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # cleanup
    for iid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/underground/{iid}", timeout=10)
        except Exception:
            pass


class TestUndergroundFidPath:
    def test_create_with_fid_primary_and_path(self, api, created_ids):
        payload = {
            "job_id": JOB_ID,
            "type": "Handhole",
            "material_type": "Concrete",
            "label": "TEST_HH_1",
            "latitude": 30.1,
            "longitude": -95.7,
            "fid": "FID-12345",
            "primary_fid": True,
            "path_measurements": [
                {"direction": "Up", "feet": 25},
                {"direction": "In", "feet": 15},
            ],
        }
        r = api.post(f"{BASE_URL}/api/underground", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["fid"] == "FID-12345"
        assert data["primary_fid"] is True
        assert isinstance(data["path_measurements"], list)
        assert len(data["path_measurements"]) == 2
        assert data["path_measurements"][0]["direction"] == "Up"
        assert data["path_measurements"][0]["feet"] == 25
        created_ids.append(data["id"])

    def test_get_returns_new_fields(self, api, created_ids):
        assert created_ids, "prev create must succeed"
        iid = created_ids[0]
        r = api.get(f"{BASE_URL}/api/underground/{iid}")
        assert r.status_code == 200
        data = r.json()
        assert data["fid"] == "FID-12345"
        assert data["primary_fid"] is True
        assert len(data["path_measurements"]) == 2

    def test_list_by_job_includes_new_fields(self, api, created_ids):
        r = api.get(f"{BASE_URL}/api/jobs/{JOB_ID}/underground")
        assert r.status_code == 200
        items = r.json()
        match = [i for i in items if i["id"] == created_ids[0]]
        assert len(match) == 1
        assert match[0]["fid"] == "FID-12345"
        assert match[0]["primary_fid"] is True

    def test_update_new_fields(self, api, created_ids):
        iid = created_ids[0]
        upd = {
            "fid": "FID-99999",
            "primary_fid": False,
            "path_measurements": [{"direction": "Down", "feet": 40}],
        }
        r = api.put(f"{BASE_URL}/api/underground/{iid}", json=upd)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["fid"] == "FID-99999"
        assert data["primary_fid"] is False
        assert len(data["path_measurements"]) == 1
        assert data["path_measurements"][0]["direction"] == "Down"
        assert data["path_measurements"][0]["feet"] == 40
        # verify persistence
        r2 = api.get(f"{BASE_URL}/api/underground/{iid}")
        assert r2.json()["fid"] == "FID-99999"

    def test_create_no_fid_type_still_works(self, api, created_ids):
        payload = {
            "job_id": JOB_ID,
            "type": "EOP",
            "label": "TEST_EOP_1",
            "latitude": 30.1,
            "longitude": -95.7,
        }
        r = api.post(f"{BASE_URL}/api/underground", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        # Defaults - fid None, primary_fid False, path_measurements []
        assert data.get("fid") in (None, "")
        assert data.get("primary_fid") in (False, None)
        assert data.get("path_measurements", []) == []
        created_ids.append(data["id"])

    def test_create_with_only_path_measurements(self, api, created_ids):
        payload = {
            "job_id": JOB_ID,
            "type": "Handhole",
            "label": "TEST_HH_2",
            "path_measurements": [
                {"direction": "Over", "feet": 20},
                {"direction": "Up", "feet": 20},
            ],
        }
        r = api.post(f"{BASE_URL}/api/underground", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        total = sum(p["feet"] for p in data["path_measurements"])
        assert total == 40
        created_ids.append(data["id"])
