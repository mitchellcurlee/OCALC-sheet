#!/usr/bin/env python3
"""Focused API setup for bug verification: map connection movement + End Path behavior."""
import json
import time
from pathlib import Path

import requests

BASE = "https://utility-pole-map.preview.emergentagent.com/api"
STATE_PATH = Path("/app/test_reports/bug_verify_connections_end_path_state.json")


def req(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.request(method, BASE + path, headers=headers, timeout=30, **kwargs)
    if not r.ok:
        raise RuntimeError(f"{method} {path} failed {r.status_code}: {r.text[:500]}")
    return r.json() if r.text else None


def main():
    token = req("POST", "/auth/login", json={"email": "Admin@mastec.com", "password": "Mastecbyers12345"})["access_token"]
    suffix = int(time.time())
    job = req("POST", "/jobs", token=token, json={
        "name": f"QA EndPath Connections {suffix}",
        "description": "Temporary QA job for connection/end_path verification",
        "location": "Houston QA",
        "job_type": "OCALC",
    })
    job_id = job["id"]

    lat = 29.760400
    lng = -95.369800
    p1 = req("POST", "/poles", json={
        "job_id": job_id, "pole_number": "QA-P1", "pole_size": "40", "condition": "Good",
        "latitude": lat, "longitude": lng, "sort_order": 0, "end_path": False,
    })
    p2 = req("POST", "/poles", json={
        "job_id": job_id, "pole_number": "QA-P2", "pole_size": "40", "condition": "Good",
        "latitude": lat, "longitude": lng + 0.00035, "sort_order": 1, "end_path": False,
    })
    u3 = req("POST", "/underground", json={
        "job_id": job_id, "type": "Handhole", "label": "QA-HH3",
        "latitude": lat, "longitude": lng + 0.00070, "sort_order": 2, "end_path": False,
    })
    u4 = req("POST", "/underground", json={
        "job_id": job_id, "type": "Handhole", "label": "QA-HH4",
        "latitude": lat, "longitude": lng + 0.00105, "sort_order": 3, "end_path": False,
    })

    state = {"base": BASE, "token": token, "job": job, "items": {"p1": p1, "p2": p2, "u3": u3, "u4": u4}}
    STATE_PATH.write_text(json.dumps(state, indent=2))
    print(json.dumps({"created": True, "job_id": job_id, "state_path": str(STATE_PATH), "item_ids": {k: v["id"] for k, v in state["items"].items()}}, indent=2))


if __name__ == "__main__":
    main()