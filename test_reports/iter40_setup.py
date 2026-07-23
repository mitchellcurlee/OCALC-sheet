"""Setup script for iter40 UI test: create job + P1,P2,HH-1,MPOE,P3 with path measurements."""
import os, json, time, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

r = requests.post(f"{API}/auth/login", json={"email": "mitchell.curlee@byers.com", "password": "Dawson@2016"})
r.raise_for_status()
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

# Job
jr = requests.post(f"{API}/jobs", headers=H, json={
    "name": f"TEST_ITER40_UI_{int(time.time())}",
    "description": "iter40 UI seed",
    "location": "Test",
    "job_type": "OCALC",
})
jr.raise_for_status()
job = jr.json()
job_id = job["id"]
print("JOB_ID", job_id)

# Poles P1 (0), P2 (1), P3 (4)
pole_ids = {}
for num, sort, lat in [("1", 0, 30.2100), ("2", 1, 30.2110), ("3", 4, 30.2140)]:
    pr = requests.post(f"{API}/poles", headers=H, json={
        "job_id": job_id, "pole_number": num, "pole_size": "40",
        "condition": "Good", "latitude": lat, "longitude": -95.31, "sort_order": sort,
    })
    pr.raise_for_status()
    pole_ids[f"P{num}"] = pr.json()["id"]

# HH-1 (sort 2)
hr = requests.post(f"{API}/underground", headers=H, json={
    "job_id": job_id, "type": "Handhole", "label": "HH-1",
    "latitude": 30.2120, "longitude": -95.31, "sort_order": 2,
})
hr.raise_for_status()
hh_id = hr.json()["id"]

# MPOE (sort 3)
mr = requests.post(f"{API}/underground", headers=H, json={
    "job_id": job_id, "type": "MPOE",
    "latitude": 30.2130, "longitude": -95.31, "sort_order": 3,
})
mr.raise_for_status()
mp_id = mr.json()["id"]

state = {"job_id": job_id, "hh_id": hh_id, "mp_id": mp_id, "poles": pole_ids}
with open("/app/test_reports/iter40_state.json", "w") as f:
    json.dump(state, f, indent=2)
print(json.dumps(state, indent=2))
