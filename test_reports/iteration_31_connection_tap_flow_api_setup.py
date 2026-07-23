"""
Focused setup/API verification helper for iteration 31 connection tap-flow testing.
Creates an isolated temp job with 3 poles and 1 underground item, initializes default
connections, verifies endpoint update persistence via API, and optionally cleans up.
"""
import json
import os
import sys
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get("BASE_URL", "https://utility-pole-map.preview.emergentagent.com")
EMAIL = os.environ.get("TEST_EMAIL", "mitchell.curlee@byers.com")
PASSWORD = os.environ.get("TEST_PASSWORD", "Dawson@2016")
STATE_PATH = Path("/app/test_reports/iteration_31_seed_state.json")


def req(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")
    resp = requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=30, **kwargs)
    if resp.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed {resp.status_code}: {resp.text[:500]}")
    return resp.json() if resp.text else None


def login():
    data = req("POST", "/auth/login", json={"email": EMAIL, "password": PASSWORD})
    return data["access_token"]


def create_seed():
    token = login()
    ts = int(time.time())
    job = req(
        "POST",
        "/jobs",
        token=token,
        json={
            "name": f"ITER31 Conn Tap Flow {ts}",
            "description": "Temporary QA job for connection tap-to-reconnect bug verification",
            "location": "QA Preview",
            "job_type": "OCALC",
        },
    )
    job_id = job["id"]
    base_lat, base_lng = 34.05220, -118.24370
    pole_payloads = [
        {"pole_number": "QA-P1", "sort_order": 0, "latitude": base_lat, "longitude": base_lng},
        {"pole_number": "QA-P2", "sort_order": 1, "latitude": base_lat, "longitude": base_lng + 0.0010},
        {"pole_number": "QA-P3", "sort_order": 3, "latitude": base_lat + 0.0009, "longitude": base_lng + 0.0010},
    ]
    poles = []
    for payload in pole_payloads:
        p = req(
            "POST",
            "/poles",
            json={
                "job_id": job_id,
                "pole_number": payload["pole_number"],
                "pole_size": "40",
                "pole_class": "4",
                "condition": "Good",
                "pole_owner": "Test",
                "latitude": payload["latitude"],
                "longitude": payload["longitude"],
                "sort_order": payload["sort_order"],
            },
        )
        poles.append(p)
    underground = req(
        "POST",
        "/underground",
        json={
            "job_id": job_id,
            "type": "Handhole",
            "label": "QA-UG1",
            "latitude": base_lat + 0.0009,
            "longitude": base_lng,
            "sort_order": 2,
        },
    )
    state = {"base_url": BASE_URL, "job": job, "poles": poles, "underground": [underground], "token": token}
    STATE_PATH.write_text(json.dumps(state, indent=2))
    print(json.dumps({"job_id": job_id, "poles": [p["id"] for p in poles], "underground": underground["id"], "state_path": str(STATE_PATH)}, indent=2))
    return state


def cleanup():
    if not STATE_PATH.exists():
        print("No state file to clean up")
        return
    state = json.loads(STATE_PATH.read_text())
    token = state.get("token") or login()
    job_id = state["job"]["id"]
    try:
        conns = req("GET", f"/jobs/{job_id}/connections")
        for c in conns:
            try:
                req("DELETE", f"/jobs/{job_id}/connections/{c['id']}")
            except Exception as exc:
                print(f"WARN failed deleting connection {c.get('id')}: {exc}")
    except Exception as exc:
        print(f"WARN failed listing/deleting connections: {exc}")
    try:
        req("DELETE", f"/jobs/{job_id}", token=token)
        print(json.dumps({"cleanup": "deleted", "job_id": job_id}))
    finally:
        STATE_PATH.unlink(missing_ok=True)


def api_probe_update_start_and_end():
    """Verifies backend persistence support for both endpoint sides."""
    state = json.loads(STATE_PATH.read_text())
    job_id = state["job"]["id"]
    poles = state["poles"]
    ug = state["underground"][0]
    # Initialize a simple connection explicitly to isolate API behavior.
    conn = req(
        "POST",
        f"/jobs/{job_id}/connections",
        json={
            "job_id": job_id,
            "from_item_id": poles[0]["id"],
            "from_item_type": "pole",
            "to_item_id": poles[1]["id"],
            "to_item_type": "pole",
            "connection_type": "aerial",
        },
    )
    # Move END to pole 3 should persist.
    moved_end = req(
        "PUT",
        f"/jobs/{job_id}/connections/{conn['id']}",
        json={"to_item_id": poles[2]["id"], "to_item_type": "pole"},
    )
    # Move START to underground should persist if backend supports it.
    moved_start = req(
        "PUT",
        f"/jobs/{job_id}/connections/{conn['id']}",
        json={"from_item_id": ug["id"], "from_item_type": "underground"},
    )
    after = req("GET", f"/jobs/{job_id}/connections")
    target = next(c for c in after if c["id"] == conn["id"])
    result = {
        "connection_id": conn["id"],
        "initial": conn,
        "moved_end_response": moved_end,
        "moved_start_response": moved_start,
        "final_connection": target,
        "end_update_persisted": target["to_item_id"] == poles[2]["id"],
        "start_update_persisted": target["from_item_id"] == ug["id"] and target["from_item_type"] == "underground",
    }
    out = Path("/app/test_reports/iteration_31_api_probe_result.json")
    out.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "create"
    if cmd == "create":
        create_seed()
    elif cmd == "cleanup":
        cleanup()
    elif cmd == "api-probe":
        api_probe_update_start_and_end()
    else:
        raise SystemExit(f"Unknown command {cmd}")