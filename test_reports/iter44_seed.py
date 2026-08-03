"""Seed a job for iter44 frontend tests. Prints job_id + handhole_id."""
import os, sys, json, requests
BASE = "https://utility-pole-map.preview.emergentagent.com/api"
r = requests.post(f"{BASE}/auth/login", json={"email":"Admin@mastec.com","password":"Mastecbyers12345"})
tok = r.json()["access_token"]
h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
r = requests.post(f"{BASE}/jobs", headers=h, json={"job_number":"TEST_ITER44_FE","name":"iter44 fe","project_name":"iter44"})
job = r.json(); job_id = job["id"]; print("JOB_ID=", job_id)
requests.post(f"{BASE}/poles", headers=h, json={"job_id":job_id,"pole_number":"P1","latitude":30.0000,"longitude":-95.0000,"sort_order":0})
requests.post(f"{BASE}/underground", headers=h, json={"job_id":job_id,"type":"Point of Intersection","latitude":30.0005,"longitude":-95.0000,"sort_order":1})
requests.post(f"{BASE}/poles", headers=h, json={"job_id":job_id,"pole_number":"P2","latitude":30.0015,"longitude":-95.0000,"sort_order":2})
# Pullbox with no sort_order -> auto insert
r = requests.post(f"{BASE}/underground", headers=h, json={"job_id":job_id,"type":"Pullbox","latitude":30.0008,"longitude":-95.0000})
print("PB=", r.json().get("sort_order"))
# Add a Handhole with GPS at end to test class toggle (make it 4th)
r = requests.post(f"{BASE}/underground", headers=h, json={"job_id":job_id,"type":"Handhole","latitude":30.0018,"longitude":-95.0000})
hh = r.json(); print("HH_ID=", hh["id"], "HH_SO=", hh.get("sort_order"))
open("/app/test_reports/iter44_state.json","w").write(json.dumps({"job_id":job_id,"hh_id":hh["id"],"token":tok}))
