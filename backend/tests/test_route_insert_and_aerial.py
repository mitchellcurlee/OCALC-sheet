"""Tests for iteration 44: nearest-position route insertion, aerial types, aerial_override, Excel Class column."""
import os
import io
import pytest
import requests
from openpyxl import load_workbook

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def job(auth_headers):
    r = requests.post(f"{API}/jobs", headers=auth_headers, json={
        "job_number": "TEST_ITER44",
        "name": "TEST iter44",
        "project_name": "TEST iter44",
    })
    assert r.status_code in (200, 201), r.text
    j = r.json()
    yield j
    # Cleanup - move to trash
    requests.delete(f"{API}/jobs/{j['id']}", headers=auth_headers)


# ---------- Options: new aerial types ----------
def test_options_has_new_aerial_types():
    r = requests.get(f"{API}/poles/options")
    assert r.status_code == 200
    ug_types = r.json().get("underground_types", [])
    for t in ("Aerial NTE", "Aerial PI", "Aerial FBT"):
        assert t in ug_types, f"Missing {t} in underground_types"


# ---------- Route-order insert ----------
def test_nearest_route_insert_and_append(auth_headers, job):
    job_id = job["id"]
    # Pole P1 sort 0
    r = requests.post(f"{API}/poles", headers=auth_headers, json={
        "job_id": job_id, "pole_number": "P1", "latitude": 30.0000, "longitude": -95.0000, "sort_order": 0,
    })
    assert r.status_code in (200, 201), r.text
    p1 = r.json()
    # UG PI sort 1
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Point of Intersection",
        "latitude": 30.0005, "longitude": -95.0000, "sort_order": 1,
    })
    assert r.status_code in (200, 201), r.text
    pi = r.json()
    # Pole P2 sort 2
    r = requests.post(f"{API}/poles", headers=auth_headers, json={
        "job_id": job_id, "pole_number": "P2", "latitude": 30.0015, "longitude": -95.0000, "sort_order": 2,
    })
    assert r.status_code in (200, 201), r.text
    p2 = r.json()

    # POST Pullbox at 30.0008 with NO sort_order -> should get sort_order 2
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Pullbox",
        "latitude": 30.0008, "longitude": -95.0000,
    })
    assert r.status_code in (200, 201), r.text
    pb = r.json()
    assert pb.get("sort_order") == 2, f"Expected inserted sort_order 2, got {pb.get('sort_order')}"

    # GET all items in order to verify P2 renumbered to 3
    r = requests.get(f"{API}/jobs/{job_id}/poles", headers=auth_headers)
    assert r.status_code == 200
    poles = r.json()
    p2_new = next(p for p in poles if p["id"] == p2["id"])
    assert p2_new.get("sort_order") == 3, f"P2 sort_order expected 3, got {p2_new.get('sort_order')}"

    # Append-beyond-end: 30.0020 -> highest sort_order
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Handhole",
        "latitude": 30.0020, "longitude": -95.0000,
    })
    assert r.status_code in (200, 201)
    beyond = r.json()
    assert beyond.get("sort_order") == 4, f"Beyond-end expected 4, got {beyond.get('sort_order')}"

    # No-GPS item: sort_order should remain null
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Handhole",
    })
    assert r.status_code in (200, 201)
    nogps = r.json()
    assert nogps.get("sort_order") is None, f"No-GPS expected null, got {nogps.get('sort_order')}"


# ---------- aerial_override persist ----------
def test_aerial_override_persist(auth_headers, job):
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job["id"], "type": "Handhole",
    })
    assert r.status_code in (200, 201)
    ug = r.json()
    r = requests.put(f"{API}/underground/{ug['id']}", headers=auth_headers, json={"aerial_override": "aerial"})
    assert r.status_code == 200, r.text
    assert r.json().get("aerial_override") == "aerial"
    r = requests.get(f"{API}/underground/{ug['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json().get("aerial_override") == "aerial"

    r = requests.put(f"{API}/underground/{ug['id']}", headers=auth_headers, json={"aerial_override": "underground"})
    assert r.status_code == 200
    r = requests.get(f"{API}/underground/{ug['id']}", headers=auth_headers)
    assert r.json().get("aerial_override") == "underground"


# ---------- Excel export Class column ----------
def test_excel_export_class_column(auth_headers, job):
    job_id = job["id"]
    # Create items to test Class matrix
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Aerial NTE",
    })
    assert r.status_code in (200, 201)
    ante = r.json()
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Handhole",
    })
    hh_aer = r.json()
    requests.put(f"{API}/underground/{hh_aer['id']}", headers=auth_headers,
                 json={"aerial_override": "aerial"})
    r = requests.post(f"{API}/underground", headers=auth_headers, json={
        "job_id": job_id, "type": "Pullbox",  # aerial type
    })
    pb2 = r.json()
    requests.put(f"{API}/underground/{pb2['id']}", headers=auth_headers,
                 json={"aerial_override": "underground"})

    # Fetch excel
    r = requests.get(f"{API}/jobs/{job_id}/export/excel", headers=auth_headers)
    assert r.status_code == 200, r.text
    wb = load_workbook(io.BytesIO(r.content))
    assert "Attribute Data" in wb.sheetnames
    ws = wb["Attribute Data"]
    # Find UNDERGROUND header row
    ug_row = None
    for row in ws.iter_rows(values_only=False):
        if row[0].value == "UNDERGROUND":
            ug_row = row[0].row
            break
    assert ug_row is not None
    # Header row
    headers_row = ug_row + 1
    headers = [ws.cell(row=headers_row, column=c).value for c in range(1, 10)]
    assert headers == ["Abbr", "Type", "Class", "Label", "Latitude", "Longitude", "Notes", "Map", "Photos"], headers

    # Data rows: build map type -> class values
    findings = {}
    r = ws.max_row
    for row_i in range(headers_row + 1, r + 1):
        t = ws.cell(row=row_i, column=2).value
        c = ws.cell(row=row_i, column=3).value
        if not t:
            continue
        findings.setdefault(t, []).append(c)
    # Aerial NTE (aerial type, no override) -> Aerial
    assert "Aerial" in findings.get("Aerial NTE", []), findings
    # Handhole with override aerial -> Aerial (override wins)
    assert "Aerial" in findings.get("Handhole", []), findings
    # Pullbox with override underground -> Underground (override wins)
    assert "Underground" in findings.get("Pullbox", []), findings
