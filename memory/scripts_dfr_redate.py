import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE, API, TOKEN = sys.argv[1], sys.argv[2], sys.argv[3]

def api(method, path, body=None):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"null")

D0, D1, D2 = "2031-03-10", "2031-03-04", "2031-03-05"   # far-future dates so no real reports collide
row = lambda d, job="Site A": {"id": "r1", "date": d, "job": job, "job_id": "", "market": "", "sow": "", "job_type": "", "job_address": "1 Main", "fielder": "Tech", "travel_hrs": "", "work_hrs": "", "return_hrs": "", "miles": "12", "footage": "", "poles": "3", "computer_hrs": "", "status": "", "comments": "", "gps": {}}

async def main():
    # --- API: a report saved with rows dated D1 while header says D0 moves to D1 (the "old reports" rule) ---
    rep = api("POST", "/field-reports", {"date": D0, "fielder": "Tech", "rows": [], "track": []})
    saved = api("PUT", f"/field-reports/{rep['id']}", {"date": D0, "fielder": "Tech", "rows": [row(D1)], "track": []})
    print("API rows-date rule: report date ->", saved["date"], "| expected", D1, "| OK:", saved["date"] == D1)
    # conflict: another report owns D2 -> stays
    other = api("POST", "/field-reports", {"date": D2, "fielder": "Tech", "rows": [], "track": []})
    saved2 = api("PUT", f"/field-reports/{rep['id']}", {"date": D1, "fielder": "Tech", "rows": [row(D2)], "track": []})
    print("API conflict keeps date:", saved2["date"] == D1)
    api("DELETE", f"/field-reports/{other['id']}")
    api("PUT", f"/field-reports/{rep['id']}", {"date": D1, "fielder": "Tech", "rows": [row(D1)], "track": []})

    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        # open the D1 report and change the header date to D0 (free day) -> same report re-dated, URL follows
        await page.goto(f"{BASE}/field-report?date={D1}", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='dfr-report-date']", timeout=30000); await page.wait_for_timeout(1500)
        print("loaded rows:", await page.locator("[data-testid^='dfr-date-']").count(), "| header", await page.locator("[data-testid='dfr-report-date']").input_value())
        await page.fill("[data-testid='dfr-report-date']", D0); await page.wait_for_timeout(2500)
        hdr = await page.locator("[data-testid='dfr-report-date']").input_value()
        rowd = await page.locator("[data-testid='dfr-date-0']").input_value()
        print("after header change: header", hdr, "| row date", rowd, "| url", page.url.split("?")[1], "| rows still here:", await page.locator("[data-testid^='dfr-date-']").count())
        srv = api("GET", f"/field-reports/{rep['id']}")
        print("server: report date", srv["date"], "| row dates", [r["date"] for r in srv["rows"]], "| OK:", srv["date"] == D0 and all(r["date"] == D0 for r in srv["rows"]))
        print("no duplicate report left on", D1, ":", api("GET", f"/field-reports?date={D1}") == [])
        # filename uses the form date
        async with page.expect_download() as dl:
            await page.click("[data-testid='dfr-export-xlsx-btn']", force=True)
        print("download filename:", (await dl.value).suggested_filename, "| OK:", D0 in (await dl.value).suggested_filename)
        # conflict flow: create a report on D2, then set header to D2 -> confirm dialog (auto-accepted) -> opens D2 report
        other = api("POST", "/field-reports", {"date": D2, "fielder": "Tech", "rows": [row(D2, "Site B")], "track": []})
        await page.fill("[data-testid='dfr-report-date']", D2); await page.wait_for_timeout(2500)
        print("conflict -> opened other:", page.url.endswith(f"date={D2}"), "| row job:", await page.locator("[data-testid='dfr-address-0'], [data-testid^='dfr-date-']").first.input_value())
        print("original untouched:", api("GET", f"/field-reports/{rep['id']}")["date"] == D0)
        api("DELETE", f"/field-reports/{other['id']}"); api("DELETE", f"/field-reports/{rep['id']}")
        await b.close()
asyncio.run(main())
