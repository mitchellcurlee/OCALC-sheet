"""
Setup: create temp job + pole for offline photo E2E test.
Prints jobId, poleId, token to stdout as JSON.
"""
import os, json, requests

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://utility-pole-map.preview.emergentagent.com').rstrip('/')

sess = requests.Session()
r = sess.post(f"{BASE}/api/auth/login", json={
    "email": "mitchell.curlee@byers.com",
    "password": "Dawson@2016"
}, timeout=30)
r.raise_for_status()
token = r.json().get("access_token") or r.json().get("token")
assert token, f"no token in {r.json()}"
h = {"Authorization": f"Bearer {token}"}

# Create temp job
job_payload = {"name": "TEST_iter38_offline_photo", "description": "iter38 test", "job_type": "OCALC"}
r = sess.post(f"{BASE}/api/jobs", json=job_payload, headers=h, timeout=30)
r.raise_for_status()
job = r.json()
job_id = job["id"]

# Create a pole in that job
pole_payload = {
    "job_id": job_id,
    "pole_number": "TP1",
    "pole_size": "40",
    "condition": "Good",
    "latitude": 30.0,
    "longitude": -95.0,
}
r = sess.post(f"{BASE}/api/poles", json=pole_payload, headers=h, timeout=30)
r.raise_for_status()
pole = r.json()
pole_id = pole["id"]

state = {"token": token, "job_id": job_id, "pole_id": pole_id}
with open("/app/test_reports/iter38_state.json", "w") as f:
    json.dump(state, f, indent=2)
print(json.dumps(state))
