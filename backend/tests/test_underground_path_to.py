"""Backend tests for underground path_measurements 'to' target field (iter40).

Verifies that path_measurements accept and persist a 'to' key like
{direction: 'Up', feet: 6, to: 'MPOE'} through POST/PUT/GET.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
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
    """Create a fresh test job and return {id,name}; delete at end."""
    payload = {
        "name": f"TEST_UG_TO_{int(time.time())}",
        "description": "Underground path to-target test",
        "location": "Test",
        "job_type": "OCALC",
    }
    r = api.post(f"{api.base}/jobs", json=payload, timeout=30)
    assert r.status_code == 200, f"create job failed: {r.status_code} {r.text}"
    j = r.json()
    yield j
    # cleanup
    api.delete(f"{api.base}/jobs/{j['id']}", timeout=30)


@pytest.fixture(scope="module")
def seeded(api, job):
    """Create poles P1,P2,P3 and undergrounds HH-1 and MPOE along a line."""
    ids = {}
    # Poles P1 (sort 0), P2 (sort 1), P3 (sort 4)
    pole_defs = [
        ("1", 0, 30.2100),
        ("2", 1, 30.2110),
        ("3", 4, 30.2140),
    ]
    for num, sort, lat in pole_defs:
        pr = api.post(
            f"{api.base}/poles",
            json={
                "job_id": job["id"],
                "pole_number": num,
                "pole_size": "40",
                "condition": "Good",
                "latitude": lat,
                "longitude": -95.31,
                "sort_order": sort,
            },
            timeout=30,
        )
        assert pr.status_code in (200, 201), f"create pole {num} failed: {pr.status_code} {pr.text}"
        ids[f"P{num}"] = pr.json()["id"]

    # Handhole HH-1 (sort 2)
    hr = api.post(
        f"{api.base}/underground",
        json={
            "job_id": job["id"],
            "type": "Handhole",
            "label": "HH-1",
            "latitude": 30.2120,
            "longitude": -95.31,
            "sort_order": 2,
        },
        timeout=30,
    )
    assert hr.status_code == 201, f"create HH-1 failed: {hr.status_code} {hr.text}"
    ids["HH-1"] = hr.json()["id"]

    # MPOE (sort 3)
    mr = api.post(
        f"{api.base}/underground",
        json={
            "job_id": job["id"],
            "type": "MPOE",
            "latitude": 30.2130,
            "longitude": -95.31,
            "sort_order": 3,
        },
        timeout=30,
    )
    assert mr.status_code == 201, f"create MPOE failed: {mr.status_code} {mr.text}"
    ids["MPOE"] = mr.json()["id"]
    return ids


class TestPathTo:
    def test_seed_created(self, seeded):
        assert set(seeded.keys()) == {"P1", "P2", "P3", "HH-1", "MPOE"}

    def test_put_path_measurements_with_to(self, api, seeded):
        """PUT underground with path_measurements including 'to' should persist."""
        payload = {"path_measurements": [{"direction": "Up", "feet": 6, "to": "MPOE"}]}
        r = api.put(f"{api.base}/underground/{seeded['HH-1']}", json=payload, timeout=30)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data.get("path_measurements"), list)
        assert len(data["path_measurements"]) == 1
        m = data["path_measurements"][0]
        assert m["direction"] == "Up"
        assert float(m["feet"]) == 6.0
        assert m["to"] == "MPOE", f"'to' key missing/wrong: {m}"

    def test_get_returns_to(self, api, seeded):
        r = api.get(f"{api.base}/underground/{seeded['HH-1']}", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data.get("path_measurements", [])) == 1
        assert data["path_measurements"][0]["to"] == "MPOE"

    def test_job_ug_list_returns_to(self, api, job, seeded):
        r = api.get(f"{api.base}/jobs/{job['id']}/underground", timeout=30)
        assert r.status_code == 200
        arr = r.json()
        hh = next((u for u in arr if u["id"] == seeded["HH-1"]), None)
        assert hh is not None
        assert hh["path_measurements"][0]["to"] == "MPOE"

    def test_multi_path_measurements_with_various_targets(self, api, seeded):
        """PUT multiple path rows with different 'to' targets (poles and UG)."""
        payload = {
            "path_measurements": [
                {"direction": "Up", "feet": 6, "to": "MPOE"},
                {"direction": "Over", "feet": 12, "to": "P2"},
            ]
        }
        r = api.put(f"{api.base}/underground/{seeded['HH-1']}", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data["path_measurements"]) == 2
        assert data["path_measurements"][0]["to"] == "MPOE"
        assert data["path_measurements"][1]["to"] == "P2"

        # verify persistence via GET
        gr = api.get(f"{api.base}/underground/{seeded['HH-1']}", timeout=30)
        assert gr.status_code == 200
        got = gr.json()["path_measurements"]
        assert [m["to"] for m in got] == ["MPOE", "P2"]

    def test_clear_path_measurements(self, api, seeded):
        """PUT empty list should clear rows and allow outgoing auto GPS to render again."""
        r = api.put(
            f"{api.base}/underground/{seeded['HH-1']}",
            json={"path_measurements": []},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["path_measurements"] == []

    def test_regression_underground_without_path(self, api, seeded):
        """MPOE has no path_measurements; GET should return empty list — unaffected."""
        r = api.get(f"{api.base}/underground/{seeded['MPOE']}", timeout=30)
        assert r.status_code == 200
        assert r.json().get("path_measurements", []) == []

    def test_restore_path_for_ui_run(self, api, seeded):
        """Restore HH-1 -> Up 6ft to MPOE so UI-phase tests find data."""
        r = api.put(
            f"{api.base}/underground/{seeded['HH-1']}",
            json={"path_measurements": [{"direction": "Up", "feet": 6, "to": "MPOE"}]},
            timeout=30,
        )
        assert r.status_code == 200
