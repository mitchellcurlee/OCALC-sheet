import asyncio, sys
from playwright.async_api import async_playwright
BASE, JOB = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        await page.goto(f"{BASE}/jobs/{JOB}/map", wait_until="domcontentloaded")
        await page.wait_for_selector(".leaflet-container", timeout=30000); await page.wait_for_timeout(3000)
        cur = lambda: page.evaluate("() => { const c = document.querySelector('.leaflet-container'); return [getComputedStyle(c).cursor, c.classList.contains('placing-attribute'), (() => { const m = document.querySelector('.leaflet-marker-icon'); return m ? getComputedStyle(m).cursor : 'no-marker'; })()]; }")
        print("BEFORE", await cur())
        await page.click("[data-testid='map-add-dropdown-btn']", force=True); await page.wait_for_timeout(600)
        await page.click("[data-testid='map-add-pole']", force=True); await page.wait_for_timeout(800)
        print("PLACING", await cur())
        await page.screenshot(path="/tmp/placing.jpg", quality=40, type="jpeg")
        cancel = page.locator("[data-testid='placing-cancel-btn']").first
        await cancel.click(force=True); await page.wait_for_timeout(800)
        print("AFTER CANCEL", await cur())
        await b.close()
asyncio.run(main())
