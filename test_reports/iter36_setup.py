"""Setup a temp job with 5 GPS items (4 poles + 1 UG) for iter36 testing."""
import os
import json
import requests
import sys

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://utility-pole-map.preview.emergentagent.com').rstrip('/')
EMAIL = "mitchell.curlee@byers.com"
PASSWORD = "Dawson@2016"


def login():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


def main(mode="segmented"):
    tok = login()
    H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    name = f"TEST_iter36_{mode}"
    j = requests.post(f"{BASE}/api/jobs", json={"name": name, "location": "TEST"}, headers=H)
    j.raise_for_status()
    job = j.json()
    print("Job ID:", job["id"])

    # Sequential GPS along a line near existing seed
    base_lat = 34.9800
    base_lng = -82.4300
    items = []

    # 5 items positioned in sequence (about 200ft each apart)
    positions = [
        (base_lat + 0.0000, base_lng + 0.0000, "pole", "P1"),
        (base_lat + 0.0006, base_lng + 0.0000, "pole", "P2"),
        (base_lat + 0.0012, base_lng + 0.0000, "ug",   "UG1"),
        (base_lat + 0.0018, base_lng + 0.0000, "pole", "P3"),
        (base_lat + 0.0024, base_lng + 0.0000, "pole", "P4"),
    ]

    for idx, (lat, lng, kind, label) in enumerate(positions):
        if kind == "pole":
            payload = {
                "job_id": job["id"],
                "pole_size": "40",
                "condition": "Good",
                "pole_number": f"TEST_{label}",
                "gps_lat": lat,
                "gps_lng": lng,
                "sort_order": idx,
            }
            if mode == "segmented" and label == "P2":
                payload["end_path"] = True  # path break at P2
            r = requests.post(f"{BASE}/api/poles", json=payload, headers=H)
        else:
            payload = {
                "job_id": job["id"],
                "type": "Handhole",
                "label": f"TEST_{label}",
                "gps_lat": lat,
                "gps_lng": lng,
                "sort_order": idx,
            }
            r = requests.post(f"{BASE}/api/underground", json=payload, headers=H)
        r.raise_for_status()
        items.append({"kind": kind, "label": label, "id": r.json()["id"], "sort_order": idx})

    print("Items:", json.dumps(items, indent=2))

    with open(f"/app/test_reports/iter36_{mode}_state.json", "w") as f:
        json.dump({"job": job, "items": items}, f, indent=2)

    print("Saved state to /app/test_reports/iter36_%s_state.json" % mode)
    return job, items


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "segmented"
    main(mode)
