#!/usr/bin/env python3
"""Focused API verification for underground SOC toggle persistence."""

import json
import os
import sys
import time

import requests


BASE_URL = os.environ.get("TEST_BASE_URL", "https://utility-pole-map.preview.emergentagent.com")
API = f"{BASE_URL.rstrip('/')}/api"
JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"
EMAIL = "Admin@mastec.com"
PASSWORD = "Mastecbyers12345"


def req(method, path, **kwargs):
    url = f"{API}{path}"
    r = requests.request(method, url, timeout=30, **kwargs)
    try:
        body = r.json()
    except Exception:
        body = r.text[:500]
    print(f"{method} {path} -> {r.status_code} {json.dumps(body, default=str)[:700]}")
    r.raise_for_status()
    return body


def main():
    created_ids = []
    token = None
    try:
        login = req("POST", "/auth/login", json={"email": EMAIL, "password": PASSWORD})
        token = login["access_token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        label = f"SOC-API-{int(time.time())}"
        payload = {
            "job_id": JOB_ID,
            "type": "Handhole",
            "material_type": "Concrete",
            "label": label,
            "notes": "api soc toggle regression notes initial",
            "fid": "FID-API-001",
            "primary_fid": True,
            "path_measurements": [{"direction": "In", "feet": 12.5}],
            "latitude": 29.7604,
            "longitude": -95.3698,
            "soc_start": False,
            "soc_end": False,
        }
        item = req("POST", "/underground", headers=headers, json=payload)
        item_id = item["id"]
        created_ids.append(item_id)

        # Backend bug check: PUT true values must persist and GET must return them.
        update_true = {
            "soc_start": True,
            "soc_end": True,
            "fid": "FID-API-UPDATED",
            "primary_fid": False,
            "path_measurements": [{"direction": "Over", "feet": 33.3}],
            "label": label + "-updated",
            "notes": "api soc toggle regression notes updated",
        }
        updated = req("PUT", f"/underground/{item_id}", headers=headers, json=update_true)
        got = req("GET", f"/underground/{item_id}", headers=headers)
        assert updated["soc_start"] is True and updated["soc_end"] is True, "PUT response did not include true SOC values"
        assert got["soc_start"] is True and got["soc_end"] is True, "GET did not persist true SOC values"
        assert got["fid"] == "FID-API-UPDATED", "fid did not persist"
        assert got["primary_fid"] is False, "primary_fid did not persist"
        assert got["path_measurements"] == [{"direction": "Over", "feet": 33.3}], "path_measurements did not persist"
        assert got["label"] == label + "-updated", "label did not persist"
        assert got["notes"] == "api soc toggle regression notes updated", "notes did not persist"

        # Edge check: PUT false must turn both toggles off.
        updated_false = req("PUT", f"/underground/{item_id}", headers=headers, json={"soc_start": False, "soc_end": False})
        got_false = req("GET", f"/underground/{item_id}", headers=headers)
        assert updated_false["soc_start"] is False and updated_false["soc_end"] is False, "PUT response did not include false SOC values"
        assert got_false["soc_start"] is False and got_false["soc_end"] is False, "GET did not persist false SOC values"

        print("API_SOC_TOGGLE_RESULT=PASS")
        print(json.dumps({"created_ids": created_ids, "tested_item_id": item_id, "final_soc_start": got_false["soc_start"], "final_soc_end": got_false["soc_end"]}))
        return 0
    except Exception as e:
        print(f"API_SOC_TOGGLE_RESULT=FAIL: {e}", file=sys.stderr)
        return 1
    finally:
        if token and created_ids:
            headers = {"Authorization": f"Bearer {token}"}
            for item_id in created_ids:
                try:
                    r = requests.delete(f"{API}/underground/{item_id}", headers=headers, timeout=30)
                    print(f"CLEANUP DELETE /underground/{item_id} -> {r.status_code}")
                except Exception as ce:
                    print(f"CLEANUP_FAILED {item_id}: {ce}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())