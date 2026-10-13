import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE, API, TOKEN, JOB = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

def api(method, path, body=None):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"null")

async def rows(page):
    return await page.evaluate("[...document.querySelectorAll('[data-testid^=\"span-measurement-\"],[data-testid^=\"riser-measurement-\"],[data-testid^=\"path-measurement-\"],[data-testid^=\"note-measurement-\"]')].map(e => e.innerText.replace(/\\s+/g,' ').trim().slice(0,46))")

async def main():
    job0 = api("GET", f"/jobs/{JOB}"); saved = {"span_order": job0.get("span_order") or [], "route_sequence": job0.get("route_sequence") or []}
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        await page.goto(f"{BASE}/jobs/{JOB}/map", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid^='span-num-']", timeout=30000); await page.wait_for_timeout(2500)
        before = await rows(page)
        spans_before = [r for r in before if not r.startswith(("RSR", "Note", "HH HH")) and " to " in r]
        print("list before:"); [print("  ", r) for r in before]
        # take the LAST span and make it the 1st span
        nums = await page.evaluate("[...document.querySelectorAll('[data-testid^=\"span-num-\"]')].filter(e => e.tagName==='BUTTON').map(e => e.dataset.testid.replace('span-num-',''))")
        last_row = nums[-1]; print("span rows (interleaved numbers):", nums)
        await page.click(f"[data-testid='span-num-{last_row}']", force=True)
        await page.wait_for_selector(f"[data-testid='span-num-input-{last_row}']", timeout=5000)
        await page.fill(f"[data-testid='span-num-input-{last_row}']", "1"); await page.keyboard.press("Enter"); await page.wait_for_timeout(2000)
        after = await rows(page)
        print("list after:"); [print("  ", r) for r in after]
        spans_after = [r for r in after if " to " in r and not r.startswith(("RSR", "Note"))]
        print("last span became first:", spans_after[0].split(". ",1)[-1] == spans_before[-1].split(". ",1)[-1], "| span count same:", len(spans_after) == len(spans_before))
        await b.close()
    api("PUT", f"/jobs/{JOB}", saved); print("restored original order")
asyncio.run(main())
