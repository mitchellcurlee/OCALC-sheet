"""
Iter 57 backend tests:
- Job started flag (PUT /api/jobs/{id}) persistence + list/detail returns
- KMZ export with embedded photos
- KML/KMZ import (parse + create) on a temp job
- Team Reports (admin only + export)
"""
import io
import os
import re
import zipfile
import pytest
import requests
import xml.etree.ElementTree as ET

def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL missing"
    return url.rstrip("/") + "/api"

BASE = _get_base()
REG_EMAIL = "mitchell.curlee@byers.com"
REG_PW = "Dawson@2016"
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PW = "Mastecbyers12345"
JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"


def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def reg_token():
    return _login(REG_EMAIL, REG_PW)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def reg_h(reg_token):
    return {"Authorization": f"Bearer {reg_token}"}


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Started flag ----------------
class TestJobStarted:
    def test_put_started_true(self, reg_h):
        r = requests.put(f"{BASE}/jobs/{JOB_ID}", json={"started": True}, headers=reg_h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("started") is True

    def test_list_contains_started(self, reg_h):
        r = requests.get(f"{BASE}/jobs", headers=reg_h, timeout=15)
        assert r.status_code == 200
        jobs = r.json()
        row = next((j for j in jobs if j["id"] == JOB_ID), None)
        assert row is not None, "seed job missing"
        assert row.get("started") is True

    def test_detail_contains_started(self, reg_h):
        r = requests.get(f"{BASE}/jobs/{JOB_ID}", headers=reg_h, timeout=15)
        assert r.status_code == 200
        assert r.json().get("started") is True

    def test_put_started_false(self, reg_h):
        r = requests.put(f"{BASE}/jobs/{JOB_ID}", json={"started": False}, headers=reg_h, timeout=15)
        assert r.status_code == 200
        assert r.json().get("started") is False

    def test_restored_in_list(self, reg_h):
        r = requests.get(f"{BASE}/jobs/{JOB_ID}", headers=reg_h, timeout=15)
        assert r.json().get("started") is False


# ---------------- KMZ export photos ----------------
class TestKmzPhotos:
    def test_kmz_with_photos(self, reg_h):
        r = requests.get(f"{BASE}/jobs/{JOB_ID}/export/kmz", headers=reg_h, timeout=60)
        assert r.status_code == 200, r.text[:200]
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert "doc.kml" in names
        jpgs = [n for n in names if n.startswith("files/") and n.lower().endswith(".jpg")]
        assert len(jpgs) >= 1, f"expected files/*.jpg, got {names}"
        kml = z.read("doc.kml").decode("utf-8", errors="replace")
        # well-formed XML
        ET.fromstring(kml)
        assert "files/" in kml and "<img" in kml.lower()

    def test_kmz_photos_false(self, reg_h):
        r = requests.get(f"{BASE}/jobs/{JOB_ID}/export/kmz?photos=false", headers=reg_h, timeout=30)
        assert r.status_code == 200
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert names == ["doc.kml"], names


# ---------------- KML/KMZ import ----------------
HAND_KML = """<?xml version='1.0' encoding='UTF-8'?>
<kml xmlns='http://www.opengis.net/kml/2.2'>
<Document>
  <Folder><name>Handholes</name>
    <Placemark><name>HH-12</name>
      <description><![CDATA[<b>Handhole</b> 12 details]]></description>
      <Point><coordinates>-95.7352,30.1006,0</coordinates></Point>
    </Placemark>
  </Folder>
  <Placemark><name>P 118</name>
    <Point><coordinates>-95.7353,30.1007,0</coordinates></Point>
  </Placemark>
  <Placemark><name>Pedestal A</name>
    <Point><coordinates>-95.7354,30.1008,0</coordinates></Point>
  </Placemark>
  <Placemark><name>Line segment</name>
    <LineString><coordinates>-95.7355,30.1,0 -95.7356,30.1,0</coordinates></LineString>
  </Placemark>
</Document>
</kml>"""


@pytest.fixture(scope="module")
def temp_job(reg_h):
    payload = {"job_number": "TEST_KMLIMP", "address": "test"}
    r = requests.post(f"{BASE}/jobs", json=payload, headers=reg_h, timeout=15)
    assert r.status_code in (200, 201), r.text
    jid = r.json()["id"]
    yield jid
    # cleanup: delete
    requests.delete(f"{BASE}/jobs/{jid}", headers=reg_h, timeout=15)


class TestKmlImport:
    def test_parse_handwritten_kml(self, reg_h, temp_job):
        files = {"file": ("hand.kml", HAND_KML.encode(), "application/vnd.google-earth.kml+xml")}
        r = requests.post(f"{BASE}/jobs/{temp_job}/import/kml/parse", files=files, headers=reg_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") or []
        assert len(items) == 3, f"expected 3 points (line ignored), got {len(items)}: {items}"
        labels = [i.get("name") for i in items]
        assert "HH-12" in labels
        assert "P 118" in labels
        assert "Pedestal A" in labels
        hh = next(i for i in items if i["name"] == "HH-12")
        assert hh.get("kind") == "underground"
        # type guessed something like 'handhole' / 'Handhole'
        assert hh.get("type") and "handhole" in hh["type"].lower()
        # description HTML stripped
        desc = (hh.get("description") or "")
        assert "<b>" not in desc and "</b>" not in desc

    def test_parse_exported_kmz(self, reg_h, temp_job):
        exp = requests.get(f"{BASE}/jobs/{JOB_ID}/export/kmz", headers=reg_h, timeout=60)
        assert exp.status_code == 200
        files = {"file": ("exp.kmz", exp.content, "application/vnd.google-earth.kmz")}
        r = requests.post(f"{BASE}/jobs/{temp_job}/import/kml/parse", files=files, headers=reg_h, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json().get("items") or []
        assert len(items) >= 1
        kinds = {i.get("kind") for i in items}
        assert kinds & {"pole", "underground"}

    def test_parse_invalid_file(self, reg_h, temp_job):
        files = {"file": ("junk.kml", b"not xml at all", "application/xml")}
        r = requests.post(f"{BASE}/jobs/{temp_job}/import/kml/parse", files=files, headers=reg_h, timeout=15)
        assert r.status_code == 400, r.status_code

    def test_parse_no_points(self, reg_h, temp_job):
        empty = """<?xml version='1.0'?><kml xmlns='http://www.opengis.net/kml/2.2'><Document>
        <Placemark><name>L</name><LineString><coordinates>0,0,0 1,1,0</coordinates></LineString></Placemark>
        </Document></kml>"""
        files = {"file": ("nopts.kml", empty.encode(), "application/vnd.google-earth.kml+xml")}
        r = requests.post(f"{BASE}/jobs/{temp_job}/import/kml/parse", files=files, headers=reg_h, timeout=15)
        assert r.status_code == 400

    def test_create_on_temp_job(self, reg_h, temp_job):
        items = [
            {"kind": "pole", "name": "P 118", "lat": 30.1007, "lng": -95.7353},
            {"kind": "underground", "type": "Handhole", "name": "HH-12", "lat": 30.1006, "lng": -95.7352},
            {"kind": "underground", "type": "Pedestal", "name": "Pedestal A", "lat": 30.1008, "lng": -95.7354},
        ]
        r = requests.post(f"{BASE}/jobs/{temp_job}/import/kml/create", json={"items": items}, headers=reg_h, timeout=30)
        assert r.status_code == 200, r.text
        res = r.json()
        # Verify poles created with pole_number '118'
        pr = requests.get(f"{BASE}/jobs/{temp_job}/poles", headers=reg_h, timeout=15)
        assert pr.status_code == 200
        poles = pr.json()
        assert any((p.get("pole_number") == "118") for p in poles), [p.get("pole_number") for p in poles]
        # Verify underground
        ur = requests.get(f"{BASE}/jobs/{temp_job}/underground", headers=reg_h, timeout=15)
        assert ur.status_code == 200
        ug = ur.json()
        assert len(ug) >= 2
        # Note starts with 'Imported from KML'
        imported_pole = next(p for p in poles if p.get("pole_number") == "118")
        notes = (imported_pole.get("notes") or "")
        assert notes.startswith("Imported from KML"), notes


# ---------------- Team Reports ----------------
class TestTeamReports:
    def test_team_json_admin(self, admin_h):
        r = requests.get(f"{BASE}/field-reports/team?date_from=2020-01-01&date_to=2030-12-31", headers=admin_h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("rows", "totals", "fielders", "count"):
            assert k in d, k
        if d["rows"]:
            row = d["rows"][0]
            for k in ("date", "fielder", "user_email"):
                assert k in row, k
            # totals keys
            for k in ("travel_hrs", "work_hrs", "return_hrs", "miles", "footage", "poles", "computer_hrs"):
                assert k in d["totals"], k

    def test_team_json_non_admin_403(self, reg_h):
        r = requests.get(f"{BASE}/field-reports/team?date_from=2020-01-01&date_to=2030-12-31", headers=reg_h, timeout=15)
        assert r.status_code == 403, r.status_code

    def test_team_export_admin(self, admin_h):
        r = requests.get(f"{BASE}/field-reports/team/export?date_from=2020-01-01&date_to=2030-12-31", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text[:200]
        # xlsx magic
        assert r.content[:2] == b"PK", r.content[:8]
        # Try to open with openpyxl
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(r.content))
            ws = wb.active
            # last row should be TOTALS
            vals = list(ws.iter_rows(values_only=True))
            assert len(vals) >= 2
            last = vals[-1]
            assert any(isinstance(v, str) and "TOTAL" in v.upper() for v in last if v is not None), last
        except ImportError:
            pass

    def test_team_export_404_empty(self, admin_h):
        r = requests.get(f"{BASE}/field-reports/team/export?date_from=1990-01-01&date_to=1990-01-02", headers=admin_h, timeout=15)
        assert r.status_code == 404, r.status_code

    def test_team_export_non_admin_403(self, reg_h):
        r = requests.get(f"{BASE}/field-reports/team/export?date_from=2020-01-01&date_to=2030-12-31", headers=reg_h, timeout=15)
        assert r.status_code == 403
