import io, requests, openpyxl
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
tok = requests.post(f"{API}/auth/login", json={"email": "Admin@mastec.com", "password": "Mastecbyers12345"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
jid = requests.post(f"{API}/jobs", json={"name": "EF-TEST", "job_type": "ASE", "site_id": "EF-X"}, headers=H).json()["id"]
try:
    ase = {"buried_pvc": "YES", "buried_pvc_length": "17", "need_emt": "YES", "emt_length": "20",
           "need_backboard": "YES", "backboard_qty": "2x2", "need_backboard_customer": True,
           "need_outlet": "YES", "need_outlet_provided": True}
    requests.put(f"{API}/jobs/{jid}/ase-data", json=ase, headers=H)
    wb = openpyxl.load_workbook(io.BytesIO(requests.get(f"{API}/jobs/{jid}/export/ase", headers=H).content))
    d = {r[0]: r[1] for r in wb["ASE CKLIST"].iter_rows(values_only=True) if r[0]}
    print("Excel row:", d.get("What Site Requirements are already needed, customer to place or provided?:"))
    sow = [str(r[0]) for r in wb["SOW Notes"].iter_rows(values_only=True) if r[0] and str(r[0]).startswith("EF REQ")]
    print("SOW:", sow)
    docx = requests.get(f"{API}/jobs/{jid}/export/sow-docx", headers=H)
    print("sow-docx via link status (needs token, expect 403):", docx.status_code)
    # user text wins
    requests.put(f"{API}/jobs/{jid}/ase-data", json={**ase, "site_requirements_provided": "(Provided) Power"}, headers=H)
    wb = openpyxl.load_workbook(io.BytesIO(requests.get(f"{API}/jobs/{jid}/export/ase", headers=H).content))
    d = {r[0]: r[1] for r in wb["ASE CKLIST"].iter_rows(values_only=True) if r[0]}
    print("Excel row (manual):", d.get("What Site Requirements are already needed, customer to place or provided?:"))
finally:
    print("cleanup:", requests.delete(f"{API}/jobs/{jid}", headers=H).status_code)
