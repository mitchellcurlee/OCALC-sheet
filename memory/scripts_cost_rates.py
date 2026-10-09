import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE, API, TOKEN = sys.argv[1], sys.argv[2], sys.argv[3]

def api(method, path, body=None, token=TOKEN):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e: return e.code, None

async def main():
    print("GET rates:", api("GET", "/settings/cost-rates")[1]["rates"])
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        # menu link
        await page.click("[data-testid='header-settings-btn']", force=True); await page.wait_for_timeout(500)
        await page.click("[data-testid='admin-cost-rates-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-rates-page']", timeout=15000)
        await page.wait_for_selector("[data-testid='rate-job_fee']", timeout=15000)
        print("page url", page.url, "| example:", await page.locator("[data-testid='rates-example-total']").inner_text())
        await page.fill("[data-testid='rate-job_fee']", "80"); await page.fill("[data-testid='rate-per_pole']", "7"); await page.fill("[data-testid='rate-per_mile']", "0.80"); await page.fill("[data-testid='rate-per_foot']", "0.05"); await page.fill("[data-testid='rate-free_feet']", "1200")
        await page.click("[data-testid='rates-save-btn']", force=True); await page.wait_for_timeout(1200)
        print("saved rates:", api("GET", "/settings/cost-rates")[1]["rates"])
        await page.screenshot(path="/tmp/rates.jpg", quality=40, type="jpeg")
        # cost report uses the new rates: 4 poles, 20.5 mi, 1500 ft -> 80 + 28 + 16.40 + (300*0.05=15) = 139.40
        st, res = api("POST", "/field-reports/cost-report", {"date_from": "2026-10-01", "date_to": "2026-10-02", "lines": [{"job": "A", "poles": 4, "miles": 20.5, "footage": 1500, "job_fee": True}]})
        print("cost with new rates:", res["lines"][0]["total"], "| expected 139.4 ->", abs(res["lines"][0]["total"] - 139.4) < 0.001)
        # reload persists
        await page.reload(wait_until="domcontentloaded"); await page.wait_for_selector("[data-testid='rate-job_fee']", timeout=15000)
        print("after reload job_fee field:", await page.locator("[data-testid='rate-job_fee']").input_value())
        # reset to defaults + save
        await page.click("[data-testid='rates-reset-btn']", force=True); await page.wait_for_timeout(300)
        await page.click("[data-testid='rates-save-btn']", force=True); await page.wait_for_timeout(1200)
        print("restored:", api("GET", "/settings/cost-rates")[1]["rates"])
        await b.close()
    # non-admin cannot write
    print("non-admin PUT status:", api("PUT", "/settings/cost-rates", {"job_fee": 1, "per_pole": 1, "per_mile": 1, "per_foot": 1, "free_feet": 1}, token="bad")[0])
asyncio.run(main())
