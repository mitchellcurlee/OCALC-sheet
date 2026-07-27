"""Iteration 43 - Trash / Deleted Items feature tests.
Covers: delete->trash for pole/underground/job, restore, per-user isolation,
orphan restore rejection, purge, empty trash, feature verify (Culvert/Drainage,
PFP job type, options endpoint)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_A = ("mitchell.curlee@byers.com", "Dawson@2016")
USER_B = ("Admin@mastec.com", "Mastecbyers12345")

SEED_JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"  # DO NOT touch


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def token_a():
    return login(*USER_A)


@pytest.fixture(scope="module")
def token_b():
    return login(*USER_B)


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# Track created ids for cleanup
_cleanup_jobs = []
_cleanup_trash_by_user = {"a": [], "b": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(token_a, token_b):
    yield
    # purge remaining trash for both users
    for tok in (token_a, token_b):
        try:
            requests.delete(f"{API}/trash", headers=H(tok), timeout=30)
        except Exception:
            pass
    # hard-delete any leftover jobs we created (should be none since deletion archives)
    for jid in _cleanup_jobs:
        try:
            requests.delete(f"{API}/jobs/{jid}", headers=H(token_a), timeout=30)
        except Exception:
            pass


def _make_job(tok, name_suffix="", job_type="OCALC"):
    payload = {"name": f"TEST_TRASH_{name_suffix}_{uuid.uuid4().hex[:6]}", "description": "trash test", "location": "L", "job_type": job_type}
    r = requests.post(f"{API}/jobs", headers=H(tok), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    _cleanup_jobs.append(j["id"])
    return j


def _make_pole(tok, job_id, num="P1"):
    payload = {"job_id": job_id, "pole_number": num, "pole_size": "40", "condition": "Good"}
    r = requests.post(f"{API}/poles", headers=H(tok), json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _make_ug(tok, job_id, typ="Culvert", label="L1"):
    payload = {"job_id": job_id, "type": typ, "label": label, "latitude": 30.1, "longitude": -95.1}
    r = requests.post(f"{API}/underground", headers=H(tok), json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---------------- Feature verify: options endpoint ----------------
class TestOptions:
    def test_underground_types_include_culvert_drainage(self, token_a):
        r = requests.get(f"{API}/poles/options", headers=H(token_a), timeout=30)
        assert r.status_code == 200
        ug = r.json().get("underground_types", [])
        for t in ("Culvert", "Drainage Start", "Drainage End"):
            assert t in ug, f"missing {t} in underground_types"


# ---------------- Pole delete -> trash -> restore ----------------
class TestPoleTrash:
    def test_delete_pole_archives(self, token_a):
        job = _make_job(token_a, "pole")
        pole = _make_pole(token_a, job["id"], num="A1")
        r = requests.delete(f"{API}/poles/{pole['id']}", headers=H(token_a), timeout=30)
        assert r.status_code == 200, r.text

        # pole removed from job
        rp = requests.get(f"{API}/jobs/{job['id']}/poles", headers=H(token_a), timeout=30)
        assert rp.status_code == 200
        assert all(p["id"] != pole["id"] for p in rp.json())

        # trash lists it
        rt = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        assert rt.status_code == 200
        items = rt.json()
        found = [x for x in items if x.get("entity_id") == pole["id"]]
        assert found, "pole not in trash"
        it = found[0]
        assert it["entity_type"] == "pole"
        assert it["job_name"] == job["name"]
        assert "Pole" in it["name"]

        # restore
        rr = requests.post(f"{API}/trash/{it['id']}/restore", headers=H(token_a), timeout=30)
        assert rr.status_code == 200, rr.text

        # verify back on job
        rp2 = requests.get(f"{API}/jobs/{job['id']}/poles", headers=H(token_a), timeout=30)
        assert any(p["id"] == pole["id"] for p in rp2.json())

        # cleanup: delete job (will archive) then purge
        requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)


# ---------------- Underground delete/restore + orphan restore ----------------
class TestUndergroundTrash:
    def test_delete_ug_archive_restore(self, token_a):
        job = _make_job(token_a, "ug")
        ug = _make_ug(token_a, job["id"], "Drainage Start", "DS1")
        r = requests.delete(f"{API}/underground/{ug['id']}", headers=H(token_a), timeout=30)
        assert r.status_code == 200, r.text

        rt = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        items = [x for x in rt.json() if x.get("entity_id") == ug["id"]]
        assert items and items[0]["entity_type"] == "underground"
        trash_id = items[0]["id"]

        rr = requests.post(f"{API}/trash/{trash_id}/restore", headers=H(token_a), timeout=30)
        assert rr.status_code == 200

        requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)

    def test_orphan_ug_restore_returns_400(self, token_a):
        job = _make_job(token_a, "orph")
        ug = _make_ug(token_a, job["id"], "Culvert", "C1")
        # delete ug then delete job -> ug trash entry now references missing job
        r1 = requests.delete(f"{API}/underground/{ug['id']}", headers=H(token_a), timeout=30)
        assert r1.status_code == 200
        r2 = requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        assert r2.status_code == 200

        rt = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        ug_entries = [x for x in rt.json() if x.get("entity_id") == ug["id"] and x["entity_type"] == "underground"]
        assert ug_entries, "expected orphan ug entry"
        rr = requests.post(f"{API}/trash/{ug_entries[0]['id']}/restore", headers=H(token_a), timeout=30)
        assert rr.status_code == 400
        assert "job" in rr.json().get("detail", "").lower()

        # purge everything created
        requests.delete(f"{API}/trash", headers=H(token_a), timeout=30)


# ---------------- Job cascade delete & restore ----------------
class TestJobCascade:
    def test_job_cascade_archive_and_restore(self, token_a):
        job = _make_job(token_a, "cascade", job_type="PFP")
        assert job["job_type"] == "PFP"
        p1 = _make_pole(token_a, job["id"], "C1")
        p2 = _make_pole(token_a, job["id"], "C2")
        u1 = _make_ug(token_a, job["id"], "Culvert", "U1")

        r = requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        assert r.status_code == 200

        # job gone
        rj = requests.get(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        assert rj.status_code == 404

        # trash entry with pole_count/underground_count
        rt = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        job_entries = [x for x in rt.json() if x.get("entity_id") == job["id"] and x["entity_type"] == "job"]
        assert job_entries, "job trash entry missing"
        je = job_entries[0]
        assert je.get("pole_count") == 2, f"pole_count={je.get('pole_count')}"
        assert je.get("underground_count") == 1, f"underground_count={je.get('underground_count')}"

        # restore
        rr = requests.post(f"{API}/trash/{je['id']}/restore", headers=H(token_a), timeout=30)
        assert rr.status_code == 200, rr.text
        restored = rr.json().get("restored") or {}
        assert restored.get("poles") == 2
        assert restored.get("underground") == 1

        # verify job & children back
        rj2 = requests.get(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        assert rj2.status_code == 200
        rp = requests.get(f"{API}/jobs/{job['id']}/poles", headers=H(token_a), timeout=30)
        assert len(rp.json()) == 2

        # cleanup
        requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        requests.delete(f"{API}/trash", headers=H(token_a), timeout=30)


# ---------------- Per-user isolation ----------------
class TestIsolation:
    def test_user_b_cannot_see_or_restore_user_a_trash(self, token_a, token_b):
        job = _make_job(token_a, "iso")
        pole = _make_pole(token_a, job["id"], "IS1")
        r = requests.delete(f"{API}/poles/{pole['id']}", headers=H(token_a), timeout=30)
        assert r.status_code == 200

        rt_a = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        a_entries = [x for x in rt_a.json() if x.get("entity_id") == pole["id"]]
        assert a_entries
        trash_id = a_entries[0]["id"]

        rt_b = requests.get(f"{API}/trash", headers=H(token_b), timeout=30)
        b_entries = [x for x in rt_b.json() if x.get("entity_id") == pole["id"]]
        assert not b_entries, "user B saw user A's trash"

        # B tries to restore -> 404
        rr = requests.post(f"{API}/trash/{trash_id}/restore", headers=H(token_b), timeout=30)
        assert rr.status_code == 404

        # B tries to purge -> 404
        rd = requests.delete(f"{API}/trash/{trash_id}", headers=H(token_b), timeout=30)
        assert rd.status_code == 404

        # cleanup: restore then delete job
        requests.post(f"{API}/trash/{trash_id}/restore", headers=H(token_a), timeout=30)
        requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        requests.delete(f"{API}/trash", headers=H(token_a), timeout=30)


# ---------------- Purge single & empty trash ----------------
class TestPurgeEmpty:
    def test_purge_one_and_empty(self, token_a):
        job = _make_job(token_a, "purge")
        p1 = _make_pole(token_a, job["id"], "PR1")
        requests.delete(f"{API}/poles/{p1['id']}", headers=H(token_a), timeout=30)
        rt = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        tid = [x for x in rt.json() if x["entity_id"] == p1["id"]][0]["id"]
        rd = requests.delete(f"{API}/trash/{tid}", headers=H(token_a), timeout=30)
        assert rd.status_code == 200

        # empty trash
        requests.delete(f"{API}/jobs/{job['id']}", headers=H(token_a), timeout=30)
        rt2 = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        assert len(rt2.json()) >= 1
        re = requests.delete(f"{API}/trash", headers=H(token_a), timeout=30)
        assert re.status_code == 200
        rt3 = requests.get(f"{API}/trash", headers=H(token_a), timeout=30)
        assert rt3.json() == []


# ---------------- Restore conflict (409) ----------------
class TestConflict:
    def test_restore_conflict_returns_409(self, token_a):
        # Create job, delete it, insert new job with same id via POST (can't - id is server-generated).
        # Alternative: restore twice - after first restore, entry gone, so re-create pole with same id somehow.
        # Approach: delete pole -> get trash entry -> create new pole with same id via direct API? id is server-generated.
        # Use underground with client id? Also server-generated. Skip if not possible.
        # We simulate: create pole, delete (archived), restore -> ok. Then delete again -> new trash entry.
        # For 409, we need same-id existence. We'll create pole, delete (archived), then manually recreate underground with same id? Not possible via API.
        # Instead: create job, delete it (archived), create new job with the SAME id via ... not possible. Skip.
        pytest.skip("Cannot force id collision via public API (ids are server-generated)")
