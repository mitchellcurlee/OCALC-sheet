#!/usr/bin/env python3
"""Cleanup temporary QA data for connection/end_path verification."""
import json
from pathlib import Path

import requests

STATE_PATH = Path("/app/test_reports/bug_verify_connections_end_path_state.json")


def main():
    if not STATE_PATH.exists():
        print("No state file; nothing to cleanup")
        return
    state = json.loads(STATE_PATH.read_text())
    base = state["base"]
    token = state["token"]
    job_id = state["job"]["id"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Remove connections first because deleting a job does not currently cascade connections.
    r = requests.post(f"{base}/jobs/{job_id}/connections/bulk", headers=headers, json=[], timeout=30)
    print(f"connections bulk clear: {r.status_code}")
    # Delete the job, which cascades poles and underground items.
    r = requests.delete(f"{base}/jobs/{job_id}", headers=headers, timeout=30)
    print(f"job delete: {r.status_code} {r.text[:200]}")
    if not r.ok and r.status_code != 404:
        raise SystemExit(1)


if __name__ == "__main__":
    main()