"""
Focused seed/cleanup helper for iteration 32 connection move verification.

Creates an isolated preview job with 3 GPS poles and 2 underground items so the
Job Map Edit Lines & Connections UI can be tested without touching seed data.
"""
import json
import os
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get("BASE_URL", "https://utility-pole-map.preview.emergentagent.com")
EMAIL = os.environ.get("TEST_EMAIL", "mitchell.curlee@byers.com")
PASSWORD = os.environ.get("TEST_PASSWORD", "Dawson@2016")
STATE_PATH = Path("/app/test_reports/iteration_32_seed_state.json")


def req(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")
    resp = requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=30, **kwargs)
    if resp.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed {resp.status_code}: {resp.text[:800]}")
    return resp.json() if resp.text else None


def login():
    data = req("POST", "/auth/login", json={"email": EMAIL, "password": PASSWORD})
    return data["access_token"], data.get("user")


def create_seed():
    token, user = login()
    ts = int(time.time())
    job = req(
        "POST",
        "/jobs",
        token=token,
        json={
            "name": f"ITER32 Conn Move Flow {ts}",
            "description": "Temporary QA job for connection pole-to-pole move verification",
            "location": "QA Preview",
            "job_type": "OCALC",
        },
    )
    job_id = job["id"]
    base_lat, base_lng = 34.05220, -118.24370
    pole_payloads = [
        {"pole_number": "QA32-P1", "sort_order": 0, "latitude": base_lat, "longitude": base_lng},
        {"pole_number": "QA32-P2", "sort_order": 1, "latitude": base_lat, "longitude": base_lng + 0.0010},
        {"pole_number": "QA32-P3", "sort_order": 3, "latitude": base_lat + 0.0009, "longitude": base_lng + 0.0010},
    ]
    poles = []
    for payload in pole_payloads:
        poles.append(req(
            "POST",
            "/poles",
            json={
                "job_id": job_id,
                "pole_number": payload["pole_number"],
                "pole_size": "40",
                "pole_class": "4",
                "condition": "Good",
                "pole_owner": "QA",
                "latitude": payload["latitude"],
                "longitude": payload["longitude"],
                "sort_order": payload["sort_order"],
            },
        ))

    ug_payloads = [
        {
            "type": "Handhole",
            "label": "QA32-UG1",
            "latitude": base_lat + 0.0009,
            "longitude": base_lng,
            "sort_order": 2,
            "path_measurements": [{"direction": "In", "feet": "7"}],
        },
        {
            "type": "Loop",
            "label": "QA32-UG2",
            "latitude": base_lat + 0.0014,
            "longitude": base_lng + 0.0005,
            "sort_order": 4,
            "path_measurements": [{"direction": "Over", "feet": "5"}],
        },
    ]
    underground = []
    for payload in ug_payloads:
        underground.append(req(
            "POST",
            "/underground",
            json={"job_id": job_id, **payload},
        ))

    state = {
        "base_url": BASE_URL,
        "token": token,
        "user": user,
        "job": job,
        "poles": poles,
        "underground": underground,
    }
    STATE_PATH.write_text(json.dumps(state, indent=2))
    print(json.dumps({
        "job_id": job_id,
        "poles": {p["pole_number"]: p["id"] for p in poles},
        "underground": {u.get("label"): u["id"] for u in underground},
        "state_path": str(STATE_PATH),
    }, indent=2))


def cleanup():
    if not STATE_PATH.exists():
        print(json.dumps({"cleanup": "skipped", "reason": "no state file"}))
        return
    state = json.loads(STATE_PATH.read_text())
    token = state.get("token") or login()[0]
    job_id = state["job"]["id"]
    try:
        try:
            for c in req("GET", f"/jobs/{job_id}/connections"):
                try:
                    req("DELETE", f"/jobs/{job_id}/connections/{c['id']}")
                except Exception as exc:
                    print(f"WARN failed deleting connection {c.get('id')}: {exc}")
        except Exception as exc:
            print(f"WARN failed listing/deleting connections: {exc}")
        req("DELETE", f"/jobs/{job_id}", token=token)
        print(json.dumps({"cleanup": "deleted", "job_id": job_id}))
    finally:
        STATE_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "create"
    if cmd == "create":
        create_seed()
    elif cmd == "cleanup":
        cleanup()
    else:
        raise SystemExit(f"Unknown command {cmd}")