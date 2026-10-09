import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1]

async def order(page, month):
    return await page.evaluate(f"[...document.querySelectorAll('[data-testid=\"home-month-{month}\"] [data-testid^=\"job-card-\"]')].map(e => e.dataset.testid.replace('job-card-',''))")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        page.on("console", lambda m: print("CONSOLE", m.text[:200]) if m.type == "error" and "WebSocket" not in m.text else None)
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True)
        await page.wait_for_selector("[data-testid='home-months']", timeout=30000); await page.wait_for_timeout(1500)
        month = await page.evaluate("document.querySelector('[data-testid^=\"home-month-\"]').dataset.testid.replace('home-month-','')")
        before = await order(page, month); print("month", month, "before", before)
        h1 = page.locator(f"[data-testid='home-month-{month}'] [data-testid^='tile-drag-handle-']").first
        t3 = page.locator(f"[data-testid='home-month-{month}'] [data-testid^='sortable-tile-']").nth(2)
        hb = await h1.bounding_box(); tb = await t3.bounding_box()
        await page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2); await page.mouse.down()
        await page.mouse.move(hb["x"] + 10, hb["y"] + 10, steps=3)
        await page.mouse.move(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2, steps=15); await page.wait_for_timeout(200)
        await page.mouse.up(); await page.wait_for_timeout(1200)
        after = await order(page, month); print("after", after, "| moved:", after != before and after[2] == before[0])
        await page.screenshot(path="/tmp/tiles_reordered.jpg", quality=40, type="jpeg")
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='home-months']", timeout=30000); await page.wait_for_timeout(2000)
        again = await order(page, month); print("after reload", again, "| persisted:", again == after)
        # tile click still navigates
        await page.locator(f"[data-testid='job-card-{after[0]}']").click(position={"x": 150, "y": 90})
        await page.wait_for_timeout(1500); print("click nav ->", page.url)
        # NOTE: restore order afterwards via curl: PUT http://localhost:8001/api/home/tile-order {"order":[]}
        await b.close()
asyncio.run(main())
