"""
Backend tests for iteration 21:
  - GET /api/poles/options: underground_types must include 'Aerial Splice' and 'Loop'
  - GET /api/jobs: items include latitude/longitude for jobs with GPS, omit/null otherwise
  - Underground CRUD for Aerial Splice item (create + get + delete)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"
SEED_JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in response: {r.json()}"
    return {"Authorization": f"Bearer {token}"}


class TestOptions:
    def test_options_includes_aerial_splice_and_loop(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/poles/options", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        ug = data.get("underground_types") or []
        assert "Aerial Splice" in ug, f"Aerial Splice missing from underground_types: {ug}"
        assert "Loop" in ug, f"Loop missing from underground_types: {ug}"


class TestJobsGps:
    def test_jobs_list_contains_lat_lng_for_jobs_with_gps(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/jobs", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        jobs = r.json()
        assert isinstance(jobs, list) and len(jobs) > 0, "no jobs returned"
        # Ensure at least one job has floats for lat/lng
        with_gps = [j for j in jobs if isinstance(j.get("latitude"), (int, float)) and isinstance(j.get("longitude"), (int, float))]
        assert len(with_gps) >= 1, f"Expected >=1 job with lat/lng floats. Got jobs: {[{'name': j.get('name'), 'lat': j.get('latitude'), 'lng': j.get('longitude')} for j in jobs]}"
        # Confirm seed job A050ABC has coords
        seed = next((j for j in jobs if j["id"] == SEED_JOB_ID), None)
        assert seed is not None, f"Seed job {SEED_JOB_ID} not visible to admin"
        assert isinstance(seed.get("latitude"), (int, float)), f"Seed job missing latitude float: {seed}"
        assert isinstance(seed.get("longitude"), (int, float)), f"Seed job missing longitude float: {seed}"


class TestUndergroundAerialCreate:
    ug_id = None

    def test_create_aerial_splice_underground_item(self, auth_headers):
        payload = {
            "job_id": SEED_JOB_ID,
            "type": "Aerial Splice",
            "label": "TEST_AS_backend",
            "latitude": 30.10050,
            "longitude": -95.73520,
            "notes": "created by iteration_21 backend test",
        }
        r = requests.post(f"{BASE_URL}/api/underground", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        created = r.json()
        assert created.get("type") == "Aerial Splice"
        assert created.get("label") == "TEST_AS_backend"
        assert "id" in created
        TestUndergroundAerialCreate.ug_id = created["id"]

    def test_get_underground_item_persisted(self, auth_headers):
        assert TestUndergroundAerialCreate.ug_id, "no ug_id from previous test"
        r = requests.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/underground", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        found = next((x for x in items if x.get("id") == TestUndergroundAerialCreate.ug_id), None)
        assert found is not None, "created Aerial Splice not returned in /jobs/{id}/underground"
        assert found.get("type") == "Aerial Splice"

    def test_delete_underground_item_cleanup(self, auth_headers):
        assert TestUndergroundAerialCreate.ug_id, "no ug_id from previous test"
        r = requests.delete(f"{BASE_URL}/api/underground/{TestUndergroundAerialCreate.ug_id}", headers=auth_headers, timeout=30)
        assert r.status_code in (200, 204), f"delete failed: {r.status_code} {r.text}"
        # Verify gone
        r2 = requests.get(f"{BASE_URL}/api/jobs/{SEED_JOB_ID}/underground", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        assert not any(x.get("id") == TestUndergroundAerialCreate.ug_id for x in r2.json()), "underground item still present after delete"


class TestJobCreateAndDeleteRegression:
    job_id = None

    def test_create_job(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/jobs", headers=auth_headers, json={"name": "TEST_iteration21_regression", "location": "Testville", "job_type": "OCALC"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created.get("name") == "TEST_iteration21_regression"
        assert "id" in created
        TestJobCreateAndDeleteRegression.job_id = created["id"]

    def test_new_job_appears_in_list(self, auth_headers):
        assert TestJobCreateAndDeleteRegression.job_id
        r = requests.get(f"{BASE_URL}/api/jobs", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        ids = [j["id"] for j in r.json()]
        assert TestJobCreateAndDeleteRegression.job_id in ids

    def test_delete_created_job_cleanup(self, auth_headers):
        assert TestJobCreateAndDeleteRegression.job_id
        r = requests.delete(f"{BASE_URL}/api/jobs/{TestJobCreateAndDeleteRegression.job_id}", headers=auth_headers, timeout=30)
        assert r.status_code in (200, 204), r.text
