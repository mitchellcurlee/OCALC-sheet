import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright

BASE = sys.argv[1]; API = sys.argv[2]; TOKEN = sys.argv[3]; JOB = sys.argv[4]; NTE = sys.argv[5]

def api(method, path, body=None):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r: return r.status

async def read(page):
    await page.click("[data-testid='tab-ase-cklist']", force=True); await page.wait_for_timeout(300)
    d = await page.locator("[data-testid='distance-fbt-to-nte-input']").input_value()
    await page.click("[data-testid='tab-svcl-output']", force=True); await page.wait_for_timeout(300)
    e = await page.locator("[data-testid='est-fiber-drop-length-input']").input_value()
    return d, e

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        await page.goto(f"{BASE}/jobs/{JOB}/ase", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='tab-ase-cklist']", timeout=30000); await page.wait_for_timeout(3500)
        d1, e1 = await read(page); print("INITIAL", d1, "|", e1, "| match", d1 == e1 != "")
        # move NTE further away on the "map" (same as editing it in the Job Map)
        print("move NTE ->", api("PUT", f"/underground/{NTE}", {"latitude": 34.1011, "longitude": -84.1}))
        await page.wait_for_timeout(10000)
        d2, e2 = await read(page); print("AFTER MOVE", d2, "|", e2, "| changed", d2 != d1, "| match", d2 == e2 != "")
        # manual edit on the checklist box must survive the next live update
        await page.click("[data-testid='tab-ase-cklist']", force=True); await page.wait_for_timeout(300)
        await page.fill("[data-testid='distance-fbt-to-nte-input']", "999 ft")
        print("move NTE back ->", api("PUT", f"/underground/{NTE}", {"latitude": 34.1008, "longitude": -84.1}))
        await page.wait_for_timeout(10000)
        d3, e3 = await read(page); print("AFTER MANUAL+MOVE", d3, "|", e3, "| manual kept", d3 == "999 ft", "| est live", e3 == "109 ft")
        await page.locator("[data-testid='est-fiber-drop-length-input']").scroll_into_view_if_needed()
        await page.screenshot(path="/tmp/ase_live.jpg", quality=40, type="jpeg")
        await b.close()
asyncio.run(main())
