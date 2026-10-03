"""Backend tests for iteration 56: DFR Home address, geocode, and track persistence."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "mitchell.curlee@byers.com"
USER_PASS = "Dawson@2016"
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASS = "Mastecbyers12345"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def user_token():
    return _login(USER_EMAIL, USER_PASS)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def user_h(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ========== HOME (literal route must not be shadowed) ==========
class TestHome:
    def test_get_home_requires_auth(self):
        r = requests.get(f"{API}/field-reports/home", timeout=10)
        assert r.status_code in (401, 403)

    def test_put_home_requires_auth(self):
        r = requests.put(f"{API}/field-reports/home", json={"address": "x"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_get_home_returns_shape(self, user_h):
        r = requests.get(f"{API}/field-reports/home", headers=user_h, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert set(d.keys()) >= {"address", "lat", "lng"}

    def test_put_home_persists(self, user_h):
        payload = {"address": "100 Main St, Tomball, TX", "lat": 30.098, "lng": -95.613}
        r = requests.put(f"{API}/field-reports/home", json=payload, headers=user_h, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["address"] == payload["address"]
        assert abs(d["lat"] - 30.098) < 1e-6
        assert abs(d["lng"] + 95.613) < 1e-6
        # Verify via GET
        r2 = requests.get(f"{API}/field-reports/home", headers=user_h, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["address"] == payload["address"]

    def test_home_is_per_user(self, user_h, admin_h):
        # Set admin to a distinct address
        admin_addr = {"address": "ADMIN TEST ADDR, Austin, TX", "lat": 30.27, "lng": -97.74}
        r = requests.put(f"{API}/field-reports/home", json=admin_addr, headers=admin_h, timeout=10)
        assert r.status_code == 200
        # User's home should still be Tomball
        r2 = requests.get(f"{API}/field-reports/home", headers=user_h, timeout=10)
        assert r2.json()["address"] != admin_addr["address"]
        # Admin sees admin addr
        r3 = requests.get(f"{API}/field-reports/home", headers=admin_h, timeout=10)
        assert r3.json()["address"] == admin_addr["address"]


# ========== GEOCODE ==========
class TestGeocode:
    def test_geocode_requires_auth(self):
        r = requests.get(f"{API}/field-reports/geocode", params={"q": "100 Main St, Tomball, TX"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_geocode_short_query_400(self, user_h):
        r = requests.get(f"{API}/field-reports/geocode", params={"q": "ab"}, headers=user_h, timeout=15)
        assert r.status_code == 400

    def test_geocode_valid_us_address(self, user_h):
        r = requests.get(f"{API}/field-reports/geocode", params={"q": "100 Main St, Tomball, TX"},
                         headers=user_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "lat" in d and "lng" in d
        # Tomball, TX ~30.097, -95.616
        assert 29.5 < float(d["lat"]) < 30.7
        assert -96.2 < float(d["lng"]) < -95.0

    def test_geocode_gibberish_404(self, user_h):
        r = requests.get(f"{API}/field-reports/geocode",
                         params={"q": "zzqxqwzzqxqwzzqxqw gibberish nothing"}, headers=user_h, timeout=30)
        assert r.status_code == 404


# ========== TRACK PERSISTENCE ==========
class TestTrack:
    report_id = None
    date = "2030-02-20"

    def test_create_report_with_track(self, user_h):
        payload = {
            "date": self.date,
            "fielder": "TEST_fielder",
            "rows": [{"id": "r1", "job_id": "jobX", "job_address": "TEST ADDR"}],
            "track": [
                {"lat": 29.76, "lng": -95.37, "t": 1700000000, "row_id": "r1"},
                {"lat": 29.77, "lng": -95.38, "t": 1700000060, "row_id": "r1"},
            ],
        }
        r = requests.post(f"{API}/field-reports", json=payload, headers=user_h, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        TestTrack.report_id = d["id"]
        assert len(d.get("track") or []) >= 2

    def test_get_report_returns_track(self, user_h):
        assert TestTrack.report_id
        r = requests.get(f"{API}/field-reports/{TestTrack.report_id}", headers=user_h, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("track"), list)
        assert len(d["track"]) == 2
        assert d["track"][0]["lat"] == 29.76

    def test_list_omits_track(self, user_h):
        r = requests.get(f"{API}/field-reports", params={"date": TestTrack.date}, headers=user_h, timeout=10)
        assert r.status_code == 200
        for doc in r.json():
            assert "track" not in doc

    def test_put_updates_track(self, user_h):
        assert TestTrack.report_id
        payload = {
            "date": TestTrack.date,
            "fielder": "TEST_fielder",
            "rows": [{"id": "r1", "job_id": "jobX"}],
            "track": [
                {"lat": 29.76, "lng": -95.37, "t": 1700000000, "row_id": "r1"},
                {"lat": 29.77, "lng": -95.38, "t": 1700000060, "row_id": "r1"},
                {"lat": 29.78, "lng": -95.39, "t": 1700000120, "row_id": "r1"},
            ],
        }
        r = requests.put(f"{API}/field-reports/{TestTrack.report_id}", json=payload, headers=user_h, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert len(d["track"]) == 3
        # Re-GET
        r2 = requests.get(f"{API}/field-reports/{TestTrack.report_id}", headers=user_h, timeout=10)
        assert len(r2.json()["track"]) == 3

    def test_cleanup_delete(self, user_h):
        if TestTrack.report_id:
            r = requests.delete(f"{API}/field-reports/{TestTrack.report_id}", headers=user_h, timeout=10)
            assert r.status_code == 200


# ========== Restore home to Tomball for user at end ==========
def test_zz_restore_home(user_h):
    payload = {"address": "100 Main St, Tomball, TX", "lat": 30.097, "lng": -95.616}
    r = requests.put(f"{API}/field-reports/home", json=payload, headers=user_h, timeout=10)
    assert r.status_code == 200
