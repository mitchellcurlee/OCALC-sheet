import asyncio, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
JOB = "21a1f422-6cd0-4b8a-8147-96ee535c2985"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1920, "height": 800})
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com")
        await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True)
        await page.wait_for_timeout(2500)
        print("login ->", page.url)

        await page.goto(f"{BASE}/jobs/{JOB}/map", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='toggle-station-btn']", timeout=30000)
        await page.wait_for_timeout(3000)
        btn = page.locator("[data-testid='toggle-station-btn']")
        if (await btn.get_attribute("aria-pressed")) != "true":
            await btn.click(force=True)
            await page.wait_for_timeout(1500)
        print("STATION TAGS", await page.locator(".station-tag").all_inner_texts())
        lst = page.locator("[data-testid='station-numbers-list']")
        if await lst.count():
            print("LIST", (await lst.inner_text())[:700].replace("\n", " | "))
        await page.locator(".leaflet-container").first.scroll_into_view_if_needed()
        await page.screenshot(path="/tmp/fbt_map.jpg", quality=40, type="jpeg")

        await page.goto(f"{BASE}/jobs/{JOB}/ase", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='tab-ase-cklist']", timeout=30000)
        await page.wait_for_timeout(3500)
        await page.click("[data-testid='tab-ase-cklist']", force=True)
        await page.wait_for_timeout(500)
        d = await page.locator("[data-testid='distance-fbt-to-nte-input']").input_value()
        await page.click("[data-testid='tab-svcl-output']", force=True)
        await page.wait_for_timeout(500)
        e = await page.locator("[data-testid='est-fiber-drop-length-input']").input_value()
        print("DISTANCE FBT->NTE:", repr(d), "| EST FIBER DROP:", repr(e), "| MATCH:", d == e and d != "")
        await page.locator("[data-testid='est-fiber-drop-length-input']").scroll_into_view_if_needed()
        await page.screenshot(path="/tmp/ase_svcl.jpg", quality=40, type="jpeg")
        await b.close()

asyncio.run(main())
