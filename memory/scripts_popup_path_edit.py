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
        await page.wait_for_selector(".leaflet-marker-icon", timeout=30000); await page.wait_for_timeout(2500)
        # click the HH marker (the only attribute) -> popup -> Edit path
        markers = page.locator(".leaflet-marker-icon")
        n = await markers.count(); print("markers", n)
        opened = False
        for i in range(n):
            try:
                await markers.nth(i).click(force=True, timeout=2000); await page.wait_for_timeout(400)
            except Exception: continue
            if await page.locator("[data-testid^='ug-path-edit-'], [data-testid^='popup-path-edit-']").count():
                opened = True; break
        btn = page.locator("[data-testid^='ug-path-edit-'], [data-testid^='popup-path-edit-']").first
        print("popup path button:", opened, "|", await btn.inner_text() if opened else "-")
        await page.screenshot(path="/tmp/popup_path.jpg", quality=40, type="jpeg")
        await btn.click(force=True)
        await page.wait_for_selector("[data-testid='path-measurement-dialog']", timeout=10000)
        print("dialog opened, rows:", await page.locator("[data-testid^='path-dialog-row-']").count(), "| title:", await page.locator("[data-testid='path-measurement-dialog'] h2").inner_text())
        await page.click("[data-testid='path-dialog-cancel']", force=True)
        await b.close()
asyncio.run(main())
