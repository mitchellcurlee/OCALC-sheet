"""Seed a test job for iter42 UI test."""
import requests, time, json, os
BASE = "https://utility-pole-map.preview.emergentagent.com"
API = f"{BASE}/api"
r = requests.post(f"{API}/auth/login", json={"email":"mitchell.curlee@byers.com","password":"Dawson@2016"}, timeout=30)
tok = r.json()["access_token"]
h = {"Authorization": f"Bearer {tok}", "Content-Type":"application/json"}

job = requests.post(f"{API}/jobs", json={"name":f"TEST_ITER42_UI_{int(time.time())}","description":"iter42 UI","location":"Test","job_type":"OCALC"}, headers=h, timeout=30).json()
print("job:", job["id"])
ids = {}
for num,sort in [("1",0),("2",1)]:
    r = requests.post(f"{API}/poles", json={"job_id":job["id"],"pole_number":num,"pole_size":"30","condition":"Excellent","latitude":30.2100 if num=="1" else 30.2110,"longitude":-95.31,"sort_order":sort}, headers=h, timeout=30)
    ids[f"P{num}"] = r.json()["id"]
r = requests.post(f"{API}/underground", json={"job_id":job["id"],"type":"Handhole","label":"HH-1","latitude":30.2120,"longitude":-95.31,"sort_order":2}, headers=h, timeout=30)
ids["HH-1"] = r.json()["id"]
print("ids:", ids)

out = {"job_id": job["id"], "ids": ids, "token": tok}
with open("/app/test_reports/iter42_state.json","w") as f:
    json.dump(out, f, indent=2)
print("state saved")
