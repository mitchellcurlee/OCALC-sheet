#!/usr/bin/env python3
"""Focused seed/cleanup helpers for bug verification iteration 41.

Creates deterministic jobs for the interactive map span measurement bug:
- saved stale connections with a newly inserted UG Path Start
- no saved connections regression

Also supports adding UG Path End to the saved-connection fixture and cleanup.
"""

import argparse
import json
import os
import time
from pathlib import Path

import requests


ROOT = Path("/app")
FIXTURE_PATH = ROOT / "test_reports" / "bug_verification_41_fixture.json"
FRONTEND_ENV = ROOT / "frontend" / ".env"
TEST_JOB_PREFIX = "TEST_UG_PATH_ITER41"
LEGACY_JOB_ID_TO_DELETE = "ceef00bd-fd8e-4389-ae49-594e0cdff0bc"


def read_frontend_base() -> str:
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    return "https://utility-pole-map.preview.emergentagent.com"


BASE = read_frontend_base()
API = f"{BASE}/api"
EMAIL = "mitchell.curlee@byers.com"
PASSWORD = "Dawson@2016"


def req(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")
    response = requests.request(method, f"{API}{path}", headers=headers, timeout=30, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed {response.status_code}: {response.text}")
    if not response.text:
        return None
    return response.json()


def login() -> str:
    data = req("POST", "/auth/login", json={"email": EMAIL, "password": PASSWORD})
    return data["access_token"]


def cleanup(token: str):
    deleted = []
    jobs = req("GET", "/jobs", token=token)
    for job in jobs:
        if job.get("name", "").startswith(TEST_JOB_PREFIX) or job.get("id") == LEGACY_JOB_ID_TO_DELETE:
            try:
                req("DELETE", f"/jobs/{job['id']}", token=token)
                deleted.append({"id": job["id"], "name": job.get("name")})
            except Exception as exc:  # report but continue cleanup attempts
                deleted.append({"id": job.get("id"), "name": job.get("name"), "error": str(exc)})
    return deleted


def create_job(token: str, name_suffix: str):
    return req(
        "POST",
        "/jobs",
        token=token,
        json={
            "name": f"{TEST_JOB_PREFIX}_{name_suffix}_{int(time.time())}",
            "description": "Focused QA seed for UG Path Start/End span measurement ordering",
            "location": "QA",
            "job_type": "OCALC",
        },
    )


def create_pole(job_id: str, number: str, lat: float, sort_order: int):
    return req(
        "POST",
        "/poles",
        json={
            "job_id": job_id,
            "pole_number": number,
            "pole_size": "40",
            "condition": "Good",
            "latitude": lat,
            "longitude": -95.31,
            "sort_order": sort_order,
        },
    )


def update_pole(pole_id: str, **updates):
    return req("PUT", f"/poles/{pole_id}", json=updates)


def create_ug(job_id: str, ug_type: str, lat: float, sort_order: int, label=None):
    payload = {
        "job_id": job_id,
        "type": ug_type,
        "latitude": lat,
        "longitude": -95.31,
        "sort_order": sort_order,
    }
    if label is not None:
        payload["label"] = label
    return req("POST", "/underground", json=payload)


def update_ug(ug_id: str, **updates):
    return req("PUT", f"/underground/{ug_id}", json=updates)


def save_connections(job_id: str, conns):
    return req("POST", f"/jobs/{job_id}/connections/bulk", json=conns)


def make_saved_connection_fixture(token: str):
    job = create_job(token, "SAVED_CONN")
    jid = job["id"]
    p1 = create_pole(jid, "1", 30.2100, 0)
    p2 = create_pole(jid, "2", 30.2110, 1)
    hh = create_ug(jid, "Handhole", 30.2120, 2, label="HH-1")
    p3 = create_pole(jid, "3", 30.2130, 3)
    save_connections(
        jid,
        [
            {"job_id": jid, "from_item_id": p1["id"], "from_item_type": "pole", "to_item_id": p2["id"], "to_item_type": "pole", "connection_type": "aerial"},
            {"job_id": jid, "from_item_id": p2["id"], "from_item_type": "pole", "to_item_id": hh["id"], "to_item_type": "underground", "connection_type": "underground"},
            {"job_id": jid, "from_item_id": hh["id"], "from_item_type": "underground", "to_item_id": p3["id"], "to_item_type": "pole", "connection_type": "underground"},
        ],
    )
    ugps = create_ug(jid, "UG Path Start", 30.2115, 2)
    update_ug(hh["id"], sort_order=3)
    update_pole(p3["id"], sort_order=4)
    return {"job": job, "poles": {"p1": p1, "p2": p2, "p3": p3}, "ug": {"hh": hh, "ugps": ugps}}


def make_no_connection_fixture(token: str):
    job = create_job(token, "NO_CONN")
    jid = job["id"]
    p1 = create_pole(jid, "1", 30.2200, 0)
    ugps = create_ug(jid, "UG Path Start", 30.2210, 1)
    hh = create_ug(jid, "Handhole", 30.2220, 2, label="HH-1")
    p2 = create_pole(jid, "2", 30.2230, 3)
    connections_before = req("GET", f"/jobs/{jid}/connections")
    return {"job": job, "poles": {"p1": p1, "p2": p2}, "ug": {"ugps": ugps, "hh": hh}, "connections_before": connections_before}


def seed():
    token = login()
    deleted = cleanup(token)
    saved_conn = make_saved_connection_fixture(token)
    no_conn = make_no_connection_fixture(token)
    fixture = {
        "base_url": BASE,
        "api_url": API,
        "email": EMAIL,
        "seeded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cleanup_before_seed": deleted,
        "saved_conn": saved_conn,
        "no_conn": no_conn,
    }
    FIXTURE_PATH.write_text(json.dumps(fixture, indent=2))
    print(json.dumps({"fixture": str(FIXTURE_PATH), "saved_conn_job_id": saved_conn["job"]["id"], "no_conn_job_id": no_conn["job"]["id"], "no_conn_connections_before": len(no_conn["connections_before"])}))


def add_ugpe():
    fixture = json.loads(FIXTURE_PATH.read_text())
    jid = fixture["saved_conn"]["job"]["id"]
    p3_id = fixture["saved_conn"]["poles"]["p3"]["id"]
    ugpe = create_ug(jid, "UG Path End", 30.2125, 4)
    update_pole(p3_id, sort_order=5)
    fixture["saved_conn"]["ug"]["ugpe"] = ugpe
    fixture["ugpe_added_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    FIXTURE_PATH.write_text(json.dumps(fixture, indent=2))
    print(json.dumps({"added_ugpe": ugpe["id"], "job_id": jid}))


def cleanup_only():
    token = login()
    deleted = cleanup(token)
    print(json.dumps({"deleted": deleted}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["seed", "add-ugpe", "cleanup"])
    args = parser.parse_args()
    if args.action == "seed":
        seed()
    elif args.action == "add-ugpe":
        add_ugpe()
    else:
        cleanup_only()