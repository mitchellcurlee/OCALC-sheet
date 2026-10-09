import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE, API, TOKEN = sys.argv[1], sys.argv[2], sys.argv[3]

def api(method, path, body=None):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"null")

def expected(jobs, month):
    def mk(j):
        d = j.get("folder_month") or j["created_at"][:7]
        return d
    group = [j for j in jobs if mk(j) == month]
    group.sort(key=lambda j: (1 if j.get("completed") else 0, -int(__import__("datetime").datetime.fromisoformat(j["created_at"].replace("Z", "+00:00")).timestamp())))
    return [j["id"] for j in group]

async def dom_order(page, month):
    return await page.evaluate(f"[...document.querySelectorAll('[data-testid=\"home-month-{month}\"] [data-testid^=\"job-card-\"]')].map(e => e.dataset.testid.replace('job-card-',''))")

async def main():
    api("PUT", "/home/tile-order", {"order": []})
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True)
        await page.wait_for_selector("[data-testid='home-months']", timeout=30000); await page.wait_for_timeout(1500)
        jobs = api("GET", "/jobs")
        months = await page.evaluate("[...document.querySelectorAll('[data-testid^=\"home-month-\"]')].map(e => e.dataset.testid.replace('home-month-',''))")
        for m in months[:3]:
            d = await dom_order(page, m); e = expected(jobs, m)
            print(m, "DOM==expected(newest first, completed last):", d == e, "" if d == e else (d, e))
        month = months[0]; first = (await dom_order(page, month))[0]
        print("mark newest job completed ->", api("PUT", f"/jobs/{first}", {"completed": True}).get("completed"))
        await page.reload(wait_until="domcontentloaded"); await page.wait_for_selector("[data-testid='home-months']", timeout=30000); await page.wait_for_timeout(1500)
        d2 = await dom_order(page, month); print("after completing newest: it is last:", d2[-1] == first, "| others newest-first:", d2[:-1] == [x for x in expected(api("GET", "/jobs"), month) if x != first])
        await page.screenshot(path="/tmp/tiles_sorted.jpg", quality=40, type="jpeg")
        print("restore ->", api("PUT", f"/jobs/{first}", {"completed": False}).get("completed"))
        await b.close()
asyncio.run(main())
