"""Iteration 34 — Offline capture backend sync tests.

Verifies /api/sync/push honors client-provided uuid for pole, underground and job creates,
and full offline lifecycle (create -> update -> delete via sync). Also verifies that
offline-created items appear via the normal REST GET after sync.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")

USER_EMAIL = "mitchell.curlee@byers.com"
USER_PASSWORD = "Dawson@2016"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def temp_job(headers):
    # Create a temp job via sync push with a client-provided id
    job_id = str(uuid.uuid4())
    action_id = str(uuid.uuid4())
    payload = {
        "actions": [{
            "id": action_id,
            "action": "create",
            "entity": "job",
            "entity_id": job_id,
            "data": {"id": job_id, "name": f"TEST_offline_sync_{int(time.time())}"},
            "timestamp": "2026-01-01T00:00:00Z"
        }],
        "last_sync": None
    }
    r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, f"sync push job create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["results"][0]["success"] is True, data
    assert data["results"][0]["server_id"] == job_id, "server_id should equal client-provided uuid"

    yield job_id

    # Teardown: delete via sync
    del_action = {
        "actions": [{
            "id": str(uuid.uuid4()),
            "action": "delete",
            "entity": "job",
            "entity_id": job_id,
            "timestamp": "2026-01-01T00:00:00Z"
        }],
        "last_sync": None
    }
    requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=del_action, timeout=30)


class TestSyncPushPole:
    def test_pole_create_with_client_uuid(self, headers, temp_job):
        pole_id = str(uuid.uuid4())
        action_id = str(uuid.uuid4())
        payload = {
            "actions": [{
                "id": action_id,
                "action": "create",
                "entity": "pole",
                "entity_id": pole_id,
                "data": {
                    "id": pole_id,
                    "job_id": temp_job,
                    "pole_number": "TEST-P1",
                    "pole_size": "40",
                    "condition": "Good"
                },
                "timestamp": "2026-01-01T00:00:00Z"
            }],
            "last_sync": None
        }
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        result = data["results"][0]
        assert result["success"] is True, result
        assert result["server_id"] == pole_id, f"server_id={result.get('server_id')} != client={pole_id}"
        assert result["action_id"] == action_id

        # Verify via normal REST GET that this exact id exists server side
        g = requests.get(f"{BASE_URL}/api/jobs/{temp_job}/poles", headers=headers, timeout=30)
        assert g.status_code == 200, g.text
        ids = [p["id"] for p in g.json()]
        assert pole_id in ids, f"created pole {pole_id} not present in job poles list: {ids}"

    def test_pole_update_via_sync(self, headers, temp_job):
        # Create pole first via sync
        pole_id = str(uuid.uuid4())
        create = {
            "actions": [{"id": str(uuid.uuid4()), "action": "create", "entity": "pole", "entity_id": pole_id,
                          "data": {"id": pole_id, "job_id": temp_job, "pole_number": "TEST-P2", "pole_size": "45",
                                    "condition": "Good"},
                          "timestamp": "2026-01-01T00:00:00Z"}], "last_sync": None}
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=create, timeout=30)
        assert r.status_code == 200
        assert r.json()["results"][0]["success"] is True

        # Update via sync
        update = {"actions": [{"id": str(uuid.uuid4()), "action": "update", "entity": "pole", "entity_id": pole_id,
                                "data": {"notes": "updated offline"}, "timestamp": "2026-01-01T00:00:00Z"}],
                   "last_sync": None}
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=update, timeout=30)
        assert r.status_code == 200
        assert r.json()["results"][0]["success"] is True

        # Verify update persisted
        g = requests.get(f"{BASE_URL}/api/poles/{pole_id}", headers=headers, timeout=30)
        assert g.status_code == 200
        assert g.json().get("notes") == "updated offline"

    def test_pole_delete_via_sync(self, headers, temp_job):
        pole_id = str(uuid.uuid4())
        create = {"actions": [{"id": str(uuid.uuid4()), "action": "create", "entity": "pole", "entity_id": pole_id,
                                "data": {"id": pole_id, "job_id": temp_job, "pole_number": "TEST-P3", "pole_size": "40",
                                          "condition": "Good"},
                                "timestamp": "2026-01-01T00:00:00Z"}], "last_sync": None}
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=create, timeout=30)
        assert r.json()["results"][0]["success"] is True

        delete = {"actions": [{"id": str(uuid.uuid4()), "action": "delete", "entity": "pole", "entity_id": pole_id,
                                "timestamp": "2026-01-01T00:00:00Z"}], "last_sync": None}
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=delete, timeout=30)
        assert r.status_code == 200
        assert r.json()["results"][0]["success"] is True

        g = requests.get(f"{BASE_URL}/api/poles/{pole_id}", headers=headers, timeout=30)
        assert g.status_code == 404


class TestSyncPushUnderground:
    def test_underground_create_with_client_uuid(self, headers, temp_job):
        ug_id = str(uuid.uuid4())
        payload = {"actions": [{"id": str(uuid.uuid4()), "action": "create", "entity": "underground",
                                 "entity_id": ug_id,
                                 "data": {"id": ug_id, "job_id": temp_job, "type": "Handhole",
                                           "label": "TEST-UG1", "latitude": 29.76, "longitude": -95.36},
                                 "timestamp": "2026-01-01T00:00:00Z"}], "last_sync": None}
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        result = r.json()["results"][0]
        assert result["success"] is True, result
        assert result["server_id"] == ug_id

        g = requests.get(f"{BASE_URL}/api/jobs/{temp_job}/underground", headers=headers, timeout=30)
        assert g.status_code == 200
        assert ug_id in [u["id"] for u in g.json()]


class TestSyncPushJob:
    def test_job_create_honors_client_id(self, headers):
        job_id = str(uuid.uuid4())
        payload = {"actions": [{"id": str(uuid.uuid4()), "action": "create", "entity": "job",
                                 "entity_id": job_id,
                                 "data": {"id": job_id, "name": f"TEST_job_client_id_{int(time.time())}"},
                                 "timestamp": "2026-01-01T00:00:00Z"}], "last_sync": None}
        r = requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        result = r.json()["results"][0]
        assert result["success"] is True
        assert result["server_id"] == job_id, "client-provided job id must be honored"

        # Verify via GET /api/jobs
        g = requests.get(f"{BASE_URL}/api/jobs", headers=headers, timeout=30)
        assert g.status_code == 200
        assert job_id in [j["id"] for j in g.json()]

        # cleanup
        requests.post(f"{BASE_URL}/api/sync/push", headers=headers, json={
            "actions": [{"id": str(uuid.uuid4()), "action": "delete", "entity": "job", "entity_id": job_id,
                          "timestamp": "2026-01-01T00:00:00Z"}], "last_sync": None}, timeout=30)


class TestOnlineRegression:
    """Spot check: online create still works via REST (not sync)."""

    def test_online_pole_create(self, headers, temp_job):
        payload = {"job_id": temp_job, "pole_number": "TEST-REG-1", "pole_size": "40", "condition": "Good"}
        r = requests.post(f"{BASE_URL}/api/poles", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "id" in data
        # Fetch via GET
        g = requests.get(f"{BASE_URL}/api/poles/{data['id']}", headers=headers, timeout=30)
        assert g.status_code == 200
        assert g.json()["pole_number"] == "TEST-REG-1"
