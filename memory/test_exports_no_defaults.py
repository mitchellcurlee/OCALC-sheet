import io, os, sys, requests, openpyxl
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
tok = requests.post(f"{API}/auth/login", json={"email": "Admin@mastec.com", "password": "Mastecbyers12345"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
job = requests.post(f"{API}/jobs", json={"name": "EXPORT-NO-TEST", "job_type": "DMG", "site_id": "SITE-X"}, headers=H).json()
jid = job["id"]
try:
    p = requests.post(f"{API}/poles", json={"job_id": jid, "pole_number": "P-1", "latitude": 30.0, "longitude": -95.0}, headers=H)
    print("pole:", p.status_code)
    requests.put(f"{API}/jobs/{jid}/ase-data", json={"existing_inc": "YES"}, headers=H)

    wb = openpyxl.load_workbook(io.BytesIO(requests.get(f"{API}/jobs/{jid}/export/excel", headers=H).content))
    ws = wb.active
    print("JobExcel r1:", [c.value for c in ws[1]][:6])
    print("JobExcel r2:", [c.value for c in ws[2]][:6])
    vals = {}
    for r in ws.iter_rows(values_only=True):
        for i, v in enumerate(r):
            if v in ("MGNV Present", "Pole Terminal") and i < len(r):
                vals[v] = None
    rows = list(ws.iter_rows(values_only=True))
    for ri, r in enumerate(rows):
        for ci, v in enumerate(r):
            if v in ("MGNV Present", "Pole Terminal"):
                vals[v] = rows[ri + 1][ci]
    print("Pole toggles:", vals)

    wb2 = openpyxl.load_workbook(io.BytesIO(requests.get(f"{API}/jobs/{jid}/export/ase", headers=H).content))
    ck = wb2["ASE CKLIST"]
    d = {r[0]: (r[1], r[2], r[3]) for r in ck.iter_rows(values_only=True) if r[0]}
    for k in ["Job Type:", "Job Number:", "Existing INC:", "Existing Fiber Terminal:", "Multi Tenant:", "Do we need a Pullbox?", "Are there any railroads in the Path?:"]:
        print(f"  {k} -> {d.get(k)}")
    sow = "\n".join(str(r[0]) for r in wb2["SOW Notes"].iter_rows(values_only=True) if r[0])
    print("SOW lines:", [l for l in sow.splitlines() if l.startswith(("FIBER AT SITE", "EXISTING NTE", "PIPELINES", "RAILROADS"))])
    svcl = {r[0]: r[1] for r in wb2["SVCL Output"].iter_rows(values_only=True) if r[0]}
    print("SVCL EF Qualified:", svcl.get("EF Qualified:"), "| End User:", svcl.get("End User Acceptance:"))
finally:
    print("cleanup:", requests.delete(f"{API}/jobs/{jid}", headers=H).status_code)
