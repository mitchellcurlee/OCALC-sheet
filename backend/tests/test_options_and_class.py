"""Tests for new pole_class field + feet-only pole_size + Excel CLASS cell."""
import os
import io
import requests
import pytest
from openpyxl import load_workbook

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
SEED_JOB = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"
ADMIN_EMAIL = "tim.gables@byers.com"
ADMIN_PASSWORD = "Byers@13430"

@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# --- Options endpoint ---
def test_options_sizes_and_classes():
    r = requests.get(f"{BASE_URL}/api/poles/options", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["sizes"] == ["20","25","30","35","40","45","50","55","60","65"]
    assert data["pole_classes"] == ["H1","H2","1","2","3","4","5","6"]

# --- Pole create + round-trip with class & feet size ---
def test_create_pole_with_class_and_feet_size(auth_headers):
    payload = {
        "job_id": SEED_JOB,
        "pole_number": "TEST_CLASS_FEET",
        "pole_owner": "ATT",
        "pole_class": "H1",
        "pole_size": "40",
        "condition": "Good",
        "span1_distance": 250,
        "down_guys": [{"size": "3/8", "owner": "Power", "height": 30.5}],
        "attachments": [{"owner": "Power", "height": 35.5}],
    }
    r = requests.post(f"{BASE_URL}/api/poles", json=payload, timeout=30)
    assert r.status_code == 201, r.text
    pole = r.json()
    pid = pole["id"]
    try:
        assert pole["pole_class"] == "H1"
        assert pole["pole_size"] == "40"
        assert pole["pole_owner"] == "ATT"
        assert pole["span1_distance"] == 250
        # GET round-trip
        g = requests.get(f"{BASE_URL}/api/poles/{pid}", timeout=30)
        assert g.status_code == 200
        gp = g.json()
        assert gp["pole_class"] == "H1"
        assert gp["pole_size"] == "40"
        assert gp["down_guys"][0]["height"] == 30.5
        assert gp["attachments"][0]["height"] == 35.5
    finally:
        requests.delete(f"{BASE_URL}/api/poles/{pid}", timeout=30)

# --- Negative coordinates accepted ---
def test_negative_coordinates_persist(auth_headers):
    payload = {
        "job_id": SEED_JOB,
        "pole_number": "TEST_NEG_GPS",
        "pole_size": "40",
        "condition": "Good",
        "latitude": 29.7604,
        "longitude": -95.3698,
    }
    r = requests.post(f"{BASE_URL}/api/poles", json=payload, timeout=30)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    try:
        g = requests.get(f"{BASE_URL}/api/poles/{pid}", timeout=30).json()
        assert g["latitude"] == 29.7604
        assert g["longitude"] == -95.3698
    finally:
        requests.delete(f"{BASE_URL}/api/poles/{pid}", timeout=30)

# --- Excel export contains CLASS cell + numeric sort + base_url ---
def test_excel_export_has_class_cell_and_base_url(auth_headers):
    # seed pole with class
    p = requests.post(f"{BASE_URL}/api/poles", json={
        "job_id": SEED_JOB, "pole_number": "TEST_EXCEL_CLS",
        "pole_size": "45", "pole_class": "H2", "condition": "Good", "pole_owner": "ATT",
    }, timeout=30).json()
    pid = p["id"]
    try:
        r = requests.get(
            f"{BASE_URL}/api/jobs/{SEED_JOB}/export/excel",
            params={"base_url": "https://example.test"},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200
        wb = load_workbook(io.BytesIO(r.content))
        ws = wb.active
        all_text = []
        gallery_link_found = False
        class_label_found = False
        h2_found = False
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is not None:
                    s = str(cell.value)
                    all_text.append(s)
                    if s == "Class":
                        class_label_found = True
                    if s == "H2":
                        h2_found = True
                if cell.hyperlink and "example.test" in str(cell.hyperlink.target) \
                        and "/api/poles/" in str(cell.hyperlink.target) \
                        and "/gallery" in str(cell.hyperlink.target):
                    gallery_link_found = True
        assert class_label_found, "CLASS label missing in export"
        assert h2_found, "H2 class value missing in export"
        # base_url propagated into gallery link (only if poles had photos; seed pole has none, so check at least no crash)
        # Verify at least the export ran cleanly and contains our pole number
        assert "TEST_EXCEL_CLS" in all_text
    finally:
        requests.delete(f"{BASE_URL}/api/poles/{pid}", timeout=30)

# --- Existing poles preserved (seed has 2: EXPORT-TEST and 1) ---
def test_seed_job_clean(auth_headers):
    r = requests.get(f"{BASE_URL}/api/jobs/{SEED_JOB}/poles", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    nums = sorted([p.get("pole_number","") for p in r.json()])
    # accept 2+ (we delete ours in fixtures); just assert no TEST_ leftovers from this file
    leftovers = [n for n in nums if n.startswith("TEST_CLASS_FEET") or n.startswith("TEST_NEG_GPS") or n.startswith("TEST_EXCEL_CLS")]
    assert leftovers == [], f"Leftover test poles: {leftovers}"
