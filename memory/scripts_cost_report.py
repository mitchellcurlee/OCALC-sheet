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
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        await page.goto(f"{BASE}/field-report", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='dfr-cost-report-btn']", timeout=30000); await page.wait_for_timeout(800)
        await page.click("[data-testid='dfr-cost-report-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-report-dialog']", timeout=10000)
        await page.fill("[data-testid='cost-from']", "2026-10-01"); await page.fill("[data-testid='cost-to']", "2026-10-09")
        await page.click("[data-testid='cost-load-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-pick-table']", timeout=10000)
        n = await page.locator("[data-testid^='cost-row-']").count()
        fees = [await page.locator(f"[data-testid='cost-jobfee-{i}']").get_attribute("data-state") for i in range(n)]
        dups = await page.locator("[data-testid^='cost-dup-']").count()
        print("rows", n, "| job-fee defaults", fees, "| repeat badges", dups)
        # exclude row 1 (a duplicate), then generate
        await page.click("[data-testid='cost-include-1']", force=True); await page.wait_for_timeout(200)
        print("selected:", await page.locator("[data-testid='cost-selected-count']").inner_text())
        await page.screenshot(path="/tmp/cost_pick.jpg", quality=40, type="jpeg")
        await page.click("[data-testid='cost-generate-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-result-table']", timeout=10000)
        lines = await page.locator("[data-testid^='cost-line-total-']").all_inner_texts()
        print("line totals", lines, "| grand", await page.locator("[data-testid='cost-grand-total']").inner_text())
        await page.screenshot(path="/tmp/cost_result.jpg", quality=40, type="jpeg")
        async with page.expect_download() as dl:
            await page.click("[data-testid='cost-download-btn']", force=True)
        d = await dl.value; path = "/tmp/cost.xlsx"; await d.save_as(path); print("download:", d.suggested_filename)
        import openpyxl
        ws = openpyxl.load_workbook(path).active
        for row in ws.iter_rows(min_row=5, values_only=True):
            if any(c not in (None, "") for c in row): print("  xlsx:", [c for c in row])
        await b.close()
asyncio.run(main())
