"""Update the temp job items with latitude/longitude fields."""
import os, json, requests, sys

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://utility-pole-map.preview.emergentagent.com').rstrip('/')
tok = requests.post(f"{BASE}/api/auth/login", json={"email":"mitchell.curlee@byers.com","password":"Dawson@2016"}).json()["access_token"]
H = {"Authorization":f"Bearer {tok}","Content-Type":"application/json"}

with open("/app/test_reports/iter36_segmented_state.json") as f:
    st = json.load(f)

base_lat = 34.9800
base_lng = -82.4300
delta = 0.0006

for it in st["items"]:
    idx = it["sort_order"]
    lat = base_lat + delta*idx
    lng = base_lng
    if it["kind"] == "pole":
        payload = {"latitude": lat, "longitude": lng}
        if it["label"] == "P2":
            payload["end_path"] = True
        r = requests.put(f"{BASE}/api/poles/{it['id']}", json=payload, headers=H)
    else:
        payload = {"latitude": lat, "longitude": lng}
        r = requests.put(f"{BASE}/api/underground/{it['id']}", json=payload, headers=H)
    print(it["label"], r.status_code, r.json().get("latitude"), r.json().get("longitude"), "end_path=", r.json().get("end_path"))
