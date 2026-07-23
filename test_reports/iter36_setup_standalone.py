"""Create a fresh job with 3 poles A,B,C for standalone testing."""
import os, json, requests

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://utility-pole-map.preview.emergentagent.com').rstrip('/')
tok = requests.post(f"{BASE}/api/auth/login", json={"email":"mitchell.curlee@byers.com","password":"Dawson@2016"}).json()["access_token"]
H = {"Authorization":f"Bearer {tok}","Content-Type":"application/json"}

j = requests.post(f"{BASE}/api/jobs", json={"name":"TEST_iter36_standalone","location":"TEST"}, headers=H).json()
print("Job:", j["id"])

base_lat = 34.9700
base_lng = -82.4200
positions = [
    (base_lat + 0.0000, "A"),
    (base_lat + 0.0006, "B"),
    (base_lat + 0.0012, "C"),
]
items = []
for idx, (lat, label) in enumerate(positions):
    r = requests.post(f"{BASE}/api/poles", json={
        "job_id": j["id"],
        "pole_size":"40","condition":"Good",
        "pole_number":f"TEST_{label}",
        "latitude":lat, "longitude":base_lng,
        "sort_order":idx,
    }, headers=H)
    r.raise_for_status()
    items.append({"label":label,"id":r.json()["id"],"sort_order":idx})
    print(label, r.status_code, r.json()["id"])

with open("/app/test_reports/iter36_standalone_state.json","w") as f:
    json.dump({"job":j,"items":items}, f, indent=2)
