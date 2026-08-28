"""Cloud Exports feature tests (iteration 49)."""
import io
import os
import time
import zipfile

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"
POLE_ID = "65adce93-c923-4466-9a9e-615ee73f7fab"
TINY_JPEG = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL"
    "DBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDP/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oA"
    "DAMBAAIRAxEAPwCdABmX/9k="
)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "mitchell.curlee@byers.com", "password": "Dawson@2016"})
    if r.status_code != 200:
        pytest.fail(f"Login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        pytest.fail(f"No token in login response: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- auth guard ---
def test_list_requires_auth():
    r = requests.get(f"{API}/jobs/{JOB_ID}/cloud-exports")
    assert r.status_code in (401, 403), r.text[:300]


# --- list ---
def test_list_cloud_exports(client):
    r = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports")
    assert r.status_code == 200, r.text[:300]
    assert isinstance(r.json(), list)


def test_list_unknown_job_404(client):
    r = client.get(f"{API}/jobs/does-not-exist/cloud-exports")
    assert r.status_code == 404, r.status_code


# --- upload / overwrite / download / delete ---
def test_upload_overwrite_download_delete(client):
    et = "job_excel"
    payload1 = b"PK\x03\x04" + b"a" * 100
    r = client.post(
        f"{API}/jobs/{JOB_ID}/cloud-exports/upload",
        data={"export_type": et},
        files={"file": ("TEST_job.xlsx", io.BytesIO(payload1),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 200, r.text[:500]
    assert r.json()["size"] == len(payload1)

    recs = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports").json()
    mine = [x for x in recs if x["export_type"] == et]
    assert len(mine) == 1, mine
    assert mine[0]["filename"] == "TEST_job.xlsx"
    assert mine[0]["size"] == len(payload1)
    assert "_id" not in mine[0]
    ts1 = mine[0]["updated_at"]
    rid = mine[0]["id"]

    # download
    d = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports/{et}/download")
    assert d.status_code == 200, d.text[:300]
    assert d.content == payload1
    assert 'filename="TEST_job.xlsx"' in d.headers.get("Content-Disposition", "")

    # overwrite
    time.sleep(1.1)
    payload2 = b"PK\x03\x04" + b"b" * 250
    r2 = client.post(
        f"{API}/jobs/{JOB_ID}/cloud-exports/upload",
        data={"export_type": et},
        files={"file": ("TEST_job_v2.xlsx", io.BytesIO(payload2), "application/octet-stream")},
    )
    assert r2.status_code == 200, r2.text[:300]
    recs = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports").json()
    mine = [x for x in recs if x["export_type"] == et]
    assert len(mine) == 1, "overwrite created duplicate records"
    assert mine[0]["size"] == len(payload2)
    assert mine[0]["filename"] == "TEST_job_v2.xlsx"
    assert mine[0]["updated_at"] != ts1
    assert mine[0]["id"] == rid, "id should be stable across overwrite"

    d2 = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports/{et}/download")
    assert d2.status_code == 200
    assert d2.content == payload2, "download returned stale bytes after overwrite"

    # delete
    dele = client.delete(f"{API}/jobs/{JOB_ID}/cloud-exports/{et}")
    assert dele.status_code == 200, dele.text[:300]
    recs = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports").json()
    assert not [x for x in recs if x["export_type"] == et]
    assert client.get(f"{API}/jobs/{JOB_ID}/cloud-exports/{et}/download").status_code == 404
    assert client.delete(f"{API}/jobs/{JOB_ID}/cloud-exports/{et}").status_code == 404


def test_upload_empty_file_rejected(client):
    r = client.post(
        f"{API}/jobs/{JOB_ID}/cloud-exports/upload",
        data={"export_type": "TEST_empty"},
        files={"file": ("empty.bin", io.BytesIO(b""), "application/octet-stream")},
    )
    assert r.status_code == 400, r.status_code


def test_download_missing_type_404(client):
    r = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports/TEST_nonexistent/download")
    assert r.status_code == 404


# --- photos zip (cloud + device regression) ---
@pytest.fixture(scope="module")
def pole_with_photo(client):
    pr = client.get(f"{API}/poles/{POLE_ID}")
    assert pr.status_code == 200, pr.text[:300]
    original = pr.json().get("photos") or []
    added = False
    if not original:
        u = client.put(f"{API}/poles/{POLE_ID}", json={"photos": [TINY_JPEG]})
        assert u.status_code == 200, u.text[:300]
        added = True
    yield
    if added:
        client.put(f"{API}/poles/{POLE_ID}", json={"photos": []})


def test_cloud_photos_zip(client, pole_with_photo):
    r = client.post(f"{API}/jobs/{JOB_ID}/cloud-exports/photos-zip", timeout=180)
    assert r.status_code == 200, r.text[:500]
    body = r.json()
    assert body["size"] > 0
    assert body["filename"].endswith(".zip")

    recs = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports").json()
    mine = [x for x in recs if x["export_type"] == "photos_zip"]
    assert len(mine) == 1, mine
    assert mine[0]["content_type"] == "application/zip"

    d = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports/photos_zip/download", timeout=180)
    assert d.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(d.content))
    assert zf.namelist(), "cloud photos zip is empty"

    client.delete(f"{API}/jobs/{JOB_ID}/cloud-exports/photos_zip")


def test_device_photos_zip_regression(client, pole_with_photo):
    r = client.get(f"{API}/jobs/{JOB_ID}/export/photos-zip", timeout=180)
    assert r.status_code == 200, r.text[:300]
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert zf.namelist()


# --- regression: job excel export ---
def test_job_excel_export_regression(client):
    r = client.get(f"{API}/jobs/{JOB_ID}/export/excel", timeout=120)
    assert r.status_code == 200, r.text[:300]
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert "[Content_Types].xml" in zf.namelist()


def test_final_cleanup(client):
    recs = client.get(f"{API}/jobs/{JOB_ID}/cloud-exports").json()
    for rec in recs:
        client.delete(f"{API}/jobs/{JOB_ID}/cloud-exports/{rec['export_type']}")
    assert client.get(f"{API}/jobs/{JOB_ID}/cloud-exports").json() == []
