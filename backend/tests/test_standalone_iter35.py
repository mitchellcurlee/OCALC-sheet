"""Iteration 35: standalone flag PUT round-trip for poles and underground."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
EMAIL = "mitchell.curlee@byers.com"
PASSWORD = "Dawson@2016"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def job(headers):
    r = requests.post(f"{BASE_URL}/api/jobs", json={"name": "TEST_iter35_standalone", "location": "TEST"}, headers=headers)
    assert r.status_code in (200, 201), r.text
    j = r.json()
    yield j
    requests.delete(f"{BASE_URL}/api/jobs/{j['id']}", headers=headers)


class TestStandaloneField:
    def test_create_pole_default_false(self, headers, job):
        payload = {"job_id": job["id"], "pole_size": "40", "condition": "Good", "pole_number": "TEST_P1"}
        r = requests.post(f"{BASE_URL}/api/poles", json=payload, headers=headers)
        assert r.status_code in (200, 201), r.text
        p = r.json()
        assert p.get("standalone") in (False, None)
        # cleanup handled via job delete cascade if any; also try direct
        requests.delete(f"{BASE_URL}/api/poles/{p['id']}", headers=headers)

    def test_create_pole_with_standalone_true(self, headers, job):
        payload = {"job_id": job["id"], "pole_size": "40", "condition": "Good", "pole_number": "TEST_P2", "standalone": True}
        r = requests.post(f"{BASE_URL}/api/poles", json=payload, headers=headers)
        assert r.status_code in (200, 201), r.text
        p = r.json()
        assert p.get("standalone") is True

        # GET to confirm persistence
        g = requests.get(f"{BASE_URL}/api/poles/{p['id']}", headers=headers)
        assert g.status_code == 200
        assert g.json().get("standalone") is True

        # PUT toggle to False
        u = requests.put(f"{BASE_URL}/api/poles/{p['id']}", json={"standalone": False}, headers=headers)
        assert u.status_code == 200, u.text
        assert u.json().get("standalone") is False

        # PUT back to True
        u2 = requests.put(f"{BASE_URL}/api/poles/{p['id']}", json={"standalone": True}, headers=headers)
        assert u2.status_code == 200
        assert u2.json().get("standalone") is True

        # Final GET
        g2 = requests.get(f"{BASE_URL}/api/poles/{p['id']}", headers=headers)
        assert g2.json().get("standalone") is True

        requests.delete(f"{BASE_URL}/api/poles/{p['id']}", headers=headers)

    def test_create_underground_with_standalone(self, headers, job):
        payload = {"job_id": job["id"], "type": "Handhole", "label": "TEST_UG1", "standalone": True}
        r = requests.post(f"{BASE_URL}/api/underground", json=payload, headers=headers)
        assert r.status_code in (200, 201), r.text
        u = r.json()
        assert u.get("standalone") is True

        # PUT toggle
        upd = requests.put(f"{BASE_URL}/api/underground/{u['id']}", json={"standalone": False}, headers=headers)
        assert upd.status_code == 200, upd.text
        assert upd.json().get("standalone") is False

        upd2 = requests.put(f"{BASE_URL}/api/underground/{u['id']}", json={"standalone": True}, headers=headers)
        assert upd2.status_code == 200
        assert upd2.json().get("standalone") is True

        # Verify persistence via LIST endpoint
        lst = requests.get(f"{BASE_URL}/api/jobs/{job['id']}/underground", headers=headers)
        found = [x for x in lst.json() if x["id"] == u["id"]]
        assert len(found) == 1
        assert found[0].get("standalone") is True

        requests.delete(f"{BASE_URL}/api/underground/{u['id']}", headers=headers)
