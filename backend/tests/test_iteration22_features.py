"""Iteration 22 - Tests for the four new features:
1) ASE Checklist Pedestal->FBT toggle prep (underground POST/DELETE with material_type=Fiber)
2) attribute source persist on ASE
3) NTE attribute source persist on ASE
4) Nearest fiber auto-populate persistence
5) ASE PUT save/load with new keys
6) Job PUT completed toggle (regression)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"
ASE_JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"       # A050ABC
COMPLETE_JOB_ID = "b53859c8-a112-47ce-b9da-bac9a101122d"  # A05A123


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Underground Fiber Pedestal seed ------------------
@pytest.fixture(scope="module")
def fiber_pedestal(headers):
    """Create a temporary Fiber Pedestal on A050ABC, yield item, delete after."""
    payload = {
        "job_id": ASE_JOB_ID,
        "type": "Pedestal",
        "material_type": "Fiber",
        "label": "PED-FIBER-TEST",
        "latitude": 30.1005,
        "longitude": -95.7351,
    }
    r = requests.post(f"{BASE_URL}/api/underground",
                      headers=headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    item = r.json()
    yield item
    # Cleanup
    try:
        requests.delete(f"{BASE_URL}/api/underground/{item['id']}",
                        headers=headers, timeout=30)
    except Exception:
        pass


class TestUndergroundPedestalSeed:
    def test_pedestal_created_with_material_type_fiber(self, fiber_pedestal, headers):
        # Verify GET returns the seeded pedestal
        r = requests.get(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/underground",
                         headers=headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        peds = [u for u in items if u.get("id") == fiber_pedestal["id"]]
        assert len(peds) == 1
        p = peds[0]
        assert p["type"] == "Pedestal"
        assert "fiber" in (p.get("material_type") or "").lower()
        assert p["latitude"] == 30.1005
        assert p["longitude"] == -95.7351


class TestASEJobAttributes:
    """Verify job attributes list is retrievable for ASE dropdown seeding."""

    def test_get_underground_returns_gps_items(self, headers, fiber_pedestal):
        r = requests.get(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/underground",
                         headers=headers, timeout=30)
        assert r.status_code == 200
        ug = r.json()
        # At least our seeded pedestal must be present
        assert any(u.get("id") == fiber_pedestal["id"] for u in ug)

    def test_get_poles_returns_list(self, headers):
        r = requests.get(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/poles",
                         headers=headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestASEDataPersistNewKeys:
    """New ASE keys pedestal_fiber_as_fbt, fbt_attribute_source, nte_attribute_source
    must round-trip through PUT /api/jobs/{id} ase_data and GET /api/jobs/{id}/ase-data."""

    def test_get_ase_data_endpoint_available(self, headers):
        r = requests.get(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/ase-data",
                         headers=headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_persist_new_ase_fields_via_job_put(self, headers):
        """Save new keys and verify readback"""
        new_data = {
            "pedestal_fiber_as_fbt": "YES",
            "fbt_attribute_source": "Pedestal PED-FIBER-TEST",
            "nte_attribute_source": "Pole 1",
            "fiber_terminal_lat_long": "30.1005, -95.7351",
            "nte_lat_long": "30.1000, -95.7300",
            "nearest_fiber_lat_long": "30.1005, -95.7351",
            "fiber_terminal_placement": "PEDESTAL",
        }
        # Fetch current ase_data so we merge instead of overwrite
        get_r = requests.get(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/ase-data",
                             headers=headers, timeout=30)
        current = (get_r.json() or {}).get("ase_data", {}) if get_r.status_code == 200 else {}
        # Unwrap accidental double-nested
        while isinstance(current.get("ase_data"), dict):
            current = current["ase_data"]
        merged = {**current, **new_data}
        # Frontend uses PUT /api/jobs/{id}/ase-data
        r = requests.put(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/ase-data",
                         headers=headers,
                         json={"ase_data": merged}, timeout=30)
        assert r.status_code == 200, r.text
        # Verify readback
        g = requests.get(f"{BASE_URL}/api/jobs/{ASE_JOB_ID}/ase-data",
                        headers=headers, timeout=30)
        assert g.status_code == 200
        saved = (g.json() or {}).get("ase_data", {})
        for k, v in new_data.items():
            assert saved.get(k) == v, f"key {k} did not persist: got {saved.get(k)}"


class TestJobCompletedToggle:
    """PUT /api/jobs/{id} with {completed: true|false} must update and persist."""

    def test_toggle_to_true(self, headers):
        r = requests.put(f"{BASE_URL}/api/jobs/{COMPLETE_JOB_ID}",
                         headers=headers, json={"completed": True}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("completed") is True
        # Verify GET reflects the change
        g = requests.get(f"{BASE_URL}/api/jobs/{COMPLETE_JOB_ID}",
                        headers=headers, timeout=30)
        assert g.status_code == 200
        assert g.json().get("completed") is True

    def test_toggle_back_to_false(self, headers):
        r = requests.put(f"{BASE_URL}/api/jobs/{COMPLETE_JOB_ID}",
                         headers=headers, json={"completed": False}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # NOTE: server filters None but False should pass through
        assert body.get("completed") is False, f"Expected completed=False, got {body.get('completed')}"
        g = requests.get(f"{BASE_URL}/api/jobs/{COMPLETE_JOB_ID}",
                        headers=headers, timeout=30)
        assert g.status_code == 200
        assert g.json().get("completed") is False

    def test_jobs_listing_returns_completed_flag(self, headers):
        r = requests.get(f"{BASE_URL}/api/jobs", headers=headers, timeout=30)
        assert r.status_code == 200
        jobs = r.json()
        assert isinstance(jobs, list)
        # Every job dict should have a 'completed' field (may be False/None)
        target = next((j for j in jobs if j.get("id") == COMPLETE_JOB_ID), None)
        assert target is not None, "A05A123 job should be present in jobs list"
        assert "completed" in target
