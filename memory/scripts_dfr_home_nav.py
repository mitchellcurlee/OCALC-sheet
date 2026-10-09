import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        page.on("console", lambda m: print("CONSOLE", m.text[:200]) if m.type == "error" and "WebSocket" not in m.text else None)
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True)
        await page.wait_for_selector("[data-testid='daily-reports-btn']", timeout=30000)
        print("home url", page.url, "| btn visible", await page.locator("[data-testid='daily-reports-btn']").is_visible())
        await page.screenshot(path="/tmp/home_hdr.jpg", quality=40, type="jpeg")
        await page.click("[data-testid='daily-reports-btn']", force=True)
        await page.wait_for_selector("[data-testid='dfr-page']", timeout=30000)
        await page.wait_for_timeout(1500)
        print("dfr url", page.url, "| date", await page.locator("[data-testid='dfr-report-date']").input_value())
        await page.click("[data-testid='dfr-add-row-btn']", force=True); await page.wait_for_timeout(500)
        print("rows text:", (await page.locator("[data-testid='dfr-page'] header p").inner_text()))
        await page.screenshot(path="/tmp/dfr_home.jpg", quality=40, type="jpeg")
        await page.click("[data-testid='dfr-back']", force=True); await page.wait_for_timeout(1500)
        print("after back", page.url)
        await page.set_viewport_size({"width": 390, "height": 844}); await page.wait_for_timeout(500)
        print("mobile btn visible", await page.locator("[data-testid='daily-reports-btn']").is_visible())
        await page.screenshot(path="/tmp/home_mobile.jpg", quality=40, type="jpeg")
        await b.close()
asyncio.run(main())
