"""Backend tests for /api/jobs/{id}/routes/bulk waypoint persistence (iter42).

Verifies waypoints on underground segments (pole -> handhole) can be saved via
the bulk endpoint using generic ids (from_pole_id can be an underground id) and
read back from GET /jobs/{id}/routes.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "mitchell.curlee@byers.com"
PASSWORD = "Dawson@2016"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def api(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    s.base = API
    return s


@pytest.fixture(scope="module")
def job(api):
    payload = {
        "name": f"TEST_ROUTES_BULK_{int(time.time())}",
        "description": "Bulk routes waypoint test",
        "location": "Test",
        "job_type": "OCALC",
    }
    r = api.post(f"{api.base}/jobs", json=payload, timeout=30)
    assert r.status_code == 200, f"create job failed: {r.status_code} {r.text}"
    j = r.json()
    yield j
    api.delete(f"{api.base}/jobs/{j['id']}", timeout=30)


@pytest.fixture(scope="module")
def seeded(api, job):
    """Create P1, P2, HH-1 per problem statement."""
    ids = {}
    # P1 sort 0
    r = api.post(f"{api.base}/poles", json={
        "job_id": job["id"], "pole_number": "1", "pole_size": "30",
        "condition": "Excellent", "latitude": 30.2100, "longitude": -95.31, "sort_order": 0,
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    ids["P1"] = r.json()["id"]

    # P2 sort 1
    r = api.post(f"{api.base}/poles", json={
        "job_id": job["id"], "pole_number": "2", "pole_size": "30",
        "condition": "Excellent", "latitude": 30.2110, "longitude": -95.31, "sort_order": 1,
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    ids["P2"] = r.json()["id"]

    # HH-1 sort 2
    r = api.post(f"{api.base}/underground", json={
        "job_id": job["id"], "type": "Handhole", "label": "HH-1",
        "latitude": 30.2120, "longitude": -95.31, "sort_order": 2,
    }, timeout=30)
    assert r.status_code == 201, r.text
    ids["HH-1"] = r.json()["id"]
    return ids


class TestRoutesBulk:
    def test_seeded(self, seeded):
        assert set(seeded.keys()) == {"P1", "P2", "HH-1"}

    def test_bulk_save_ug_waypoint(self, api, job, seeded):
        """POST /jobs/{id}/routes/bulk with P2->HH waypoint returns 200 with waypoint."""
        payload = [{
            "job_id": job["id"],
            "from_pole_id": seeded["P2"],
            "to_pole_id": seeded["HH-1"],
            "waypoints": [{"lat": 30.2115, "lng": -95.3095}],
        }]
        r = api.post(f"{api.base}/jobs/{job['id']}/routes/bulk", json=payload, timeout=30)
        assert r.status_code == 200, f"bulk save failed: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1
        seg = data[0]
        assert seg["from_pole_id"] == seeded["P2"]
        assert seg["to_pole_id"] == seeded["HH-1"]
        assert len(seg["waypoints"]) == 1
        assert abs(seg["waypoints"][0]["lat"] - 30.2115) < 1e-6
        assert abs(seg["waypoints"][0]["lng"] - (-95.3095)) < 1e-6

    def test_get_routes_returns_waypoint(self, api, job, seeded):
        r = api.get(f"{api.base}/jobs/{job['id']}/routes", timeout=30)
        assert r.status_code == 200
        arr = r.json()
        match = [s for s in arr
                 if s["from_pole_id"] == seeded["P2"] and s["to_pole_id"] == seeded["HH-1"]]
        assert len(match) == 1, f"expected 1 P2->HH segment, got: {arr}"
        wps = match[0]["waypoints"]
        assert len(wps) == 1
        assert abs(wps[0]["lat"] - 30.2115) < 1e-6
        assert abs(wps[0]["lng"] - (-95.3095)) < 1e-6

    def test_bulk_save_multiple_segments_including_aerial_and_ug(self, api, job, seeded):
        """Save waypoints for both aerial P1->P2 and UG P2->HH; both persist."""
        payload = [
            {"job_id": job["id"], "from_pole_id": seeded["P1"], "to_pole_id": seeded["P2"],
             "waypoints": [{"lat": 30.2105, "lng": -95.3098}]},
            {"job_id": job["id"], "from_pole_id": seeded["P2"], "to_pole_id": seeded["HH-1"],
             "waypoints": [{"lat": 30.2115, "lng": -95.3095}]},
        ]
        r = api.post(f"{api.base}/jobs/{job['id']}/routes/bulk", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert len(r.json()) == 2

        # GET verify persistence of both
        gr = api.get(f"{api.base}/jobs/{job['id']}/routes", timeout=30)
        assert gr.status_code == 200
        arr = gr.json()
        aerial = next((s for s in arr if s["from_pole_id"] == seeded["P1"] and s["to_pole_id"] == seeded["P2"]), None)
        ug = next((s for s in arr if s["from_pole_id"] == seeded["P2"] and s["to_pole_id"] == seeded["HH-1"]), None)
        assert aerial is not None and len(aerial["waypoints"]) == 1
        assert ug is not None and len(ug["waypoints"]) == 1

    def test_bulk_save_replaces_existing(self, api, job, seeded):
        """Bulk endpoint deletes existing routes for the job then inserts new set."""
        payload = [
            {"job_id": job["id"], "from_pole_id": seeded["P1"], "to_pole_id": seeded["P2"],
             "waypoints": []},
        ]
        r = api.post(f"{api.base}/jobs/{job['id']}/routes/bulk", json=payload, timeout=30)
        assert r.status_code == 200
        gr = api.get(f"{api.base}/jobs/{job['id']}/routes", timeout=30)
        arr = gr.json()
        assert len(arr) == 1
        assert arr[0]["from_pole_id"] == seeded["P1"]
        assert arr[0]["waypoints"] == []

    def test_restore_waypoint_for_ui_phase(self, api, job, seeded):
        """Restore P2->HH waypoint so subsequent UI test sees the bent line."""
        payload = [
            {"job_id": job["id"], "from_pole_id": seeded["P1"], "to_pole_id": seeded["P2"],
             "waypoints": []},
            {"job_id": job["id"], "from_pole_id": seeded["P2"], "to_pole_id": seeded["HH-1"],
             "waypoints": [{"lat": 30.2115, "lng": -95.3095}]},
        ]
        r = api.post(f"{api.base}/jobs/{job['id']}/routes/bulk", json=payload, timeout=30)
        assert r.status_code == 200
