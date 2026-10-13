import asyncio, sys
from playwright.async_api import async_playwright
BASE, JOB = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        page.on("console", lambda m: print("CONSOLE", m.text[:200]) if m.type == "error" and "WebSocket" not in m.text else None)
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        # --- 1. Select dropdown above the full-screen measurer ---
        await page.goto(f"{BASE}/jobs/{JOB}/add", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='height-measurer-btn']", state="attached", timeout=30000)
        await page.evaluate("document.querySelector('[data-testid=\"height-measurer-btn\"]').click()")
        await page.wait_for_selector("[data-testid='height-measurer-dialog']", timeout=10000); await page.wait_for_timeout(400)
        trig = page.locator("[data-testid='height-measurer-dialog'] [role='combobox']").first
        await trig.click(force=True); await page.wait_for_timeout(500)
        info = await page.evaluate("""() => { const c = document.querySelector('[role="listbox"]'); if (!c) return null; const wrap = c.closest('[data-radix-popper-content-wrapper]') || c; const z = getComputedStyle(c).zIndex; const r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 20, r.top + 20); return { z, wrapperZ: getComputedStyle(wrap).zIndex, hitInsideListbox: !!(top && c.contains(top)), options: [...c.querySelectorAll('[role="option"]')].length }; }""")
        print("SELECT:", info)
        await page.locator("[role='option']").nth(1).click(force=True); await page.wait_for_timeout(300)
        print("picked:", await trig.inner_text())
        await page.screenshot(path="/tmp/measurer_select.jpg", quality=40, type="jpeg")
        await page.keyboard.press("Escape"); await page.wait_for_timeout(300)
        # --- 2. Cost report hourly rate ---
        await page.goto(f"{BASE}/field-report", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='dfr-cost-report-btn']", timeout=30000); await page.wait_for_timeout(800)
        await page.click("[data-testid='dfr-cost-report-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-report-dialog']", timeout=10000)
        await page.fill("[data-testid='cost-from']", "2026-10-01"); await page.fill("[data-testid='cost-to']", "2026-10-09")
        await page.click("[data-testid='cost-load-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-pick-table']", timeout=10000)
        await page.fill("[data-testid='cost-hourly-rate']", "25")
        print("selection line:", await page.locator("[data-testid='cost-selected-count']").inner_text())
        await page.click("[data-testid='cost-generate-btn']", force=True)
        await page.wait_for_selector("[data-testid='cost-summary']", timeout=10000)
        for tid in ["cost-sum-jobs", "cost-sum-poles", "cost-sum-footage", "cost-sum-mileage", "cost-sum-hours", "cost-sum-total"]:
            print(" ", tid, await page.locator(f"[data-testid='{tid}']").inner_text())
        await page.screenshot(path="/tmp/cost_hours.jpg", quality=40, type="jpeg")
        await page.click("[data-testid='cost-back-btn']", force=True); await page.wait_for_timeout(300)
        print("rate kept on back:", await page.locator("[data-testid='cost-hourly-rate']").input_value())
        await b.close()
asyncio.run(main())
