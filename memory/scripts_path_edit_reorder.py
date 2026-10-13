import asyncio, sys
from playwright.async_api import async_playwright
BASE, PATHJOB, ROUTEJOB = sys.argv[1], sys.argv[2], sys.argv[3]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        page.on("console", lambda m: print("CONSOLE", m.text[:160]) if m.type == "error" and "WebSocket" not in m.text else None)
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)

        # ---- 1. edit a path measurement from the map ----
        await page.goto(f"{BASE}/jobs/{PATHJOB}/map", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid^='path-edit-']", timeout=30000)
        before = await page.locator("[data-testid^='path-measurement-']").first.inner_text()
        print("path row before:", before)
        await page.click("[data-testid^='path-edit-']", force=True)
        await page.wait_for_selector("[data-testid='path-measurement-dialog']", timeout=10000)
        n = await page.locator("[data-testid^='path-dialog-row-']").count(); print("dialog rows:", n)
        await page.fill("[data-testid='path-dialog-feet-0']", "7")
        await page.click("[data-testid='path-dialog-add']", force=True)
        await page.click(f"[data-testid='path-dialog-direction-{n}']", force=True); await page.wait_for_timeout(300)
        await page.locator("[role='option']", has_text="Over").first.click(force=True)
        await page.fill(f"[data-testid='path-dialog-feet-{n}']", "4")
        await page.click(f"[data-testid='path-dialog-to-{n}']", force=True); await page.wait_for_timeout(300)
        opts = await page.locator("[role='option']").all_inner_texts(); print("target options sample:", opts[:4])
        await page.locator("[role='option']").nth(1 if len(opts) > 1 else 0).click(force=True)
        print("dialog total:", await page.locator("[data-testid='path-dialog-total']").inner_text())
        await page.click("[data-testid='path-dialog-save']", force=True)
        await page.wait_for_selector("[data-testid='path-measurement-dialog']", state="hidden", timeout=10000); await page.wait_for_timeout(1500)
        after = await page.locator("[data-testid^='path-measurement-']").first.inner_text()
        print("path row after:", after, "| changed:", after != before and "7" in after and "Over 4" in after)
        # revert: remove the added row, set feet back
        await page.click("[data-testid^='path-edit-']", force=True); await page.wait_for_selector("[data-testid='path-measurement-dialog']", timeout=10000)
        await page.click(f"[data-testid='path-dialog-remove-{n}']", force=True)
        await page.fill("[data-testid='path-dialog-feet-0']", before.split("Up ")[1].split("ft")[0].strip() if "Up " in before else "2")
        await page.click("[data-testid='path-dialog-save']", force=True); await page.wait_for_timeout(1500)
        print("path row reverted:", await page.locator("[data-testid^='path-measurement-']").first.inner_text())

        # ---- 2. reorder list with a route-repeated item ----
        await page.goto(f"{BASE}/jobs/{ROUTEJOB}", wait_until="domcontentloaded")
        await page.wait_for_selector("[data-testid='start-reorder-btn']", timeout=30000); await page.wait_for_timeout(1000)
        rep = await page.locator("[data-testid^='remove-route-pass-']").count()
        menus = await page.locator("[data-testid^='pole-menu-'], [data-testid^='ug-menu-']").count()
        print("cards:", menus)
        await page.click("[data-testid='start-reorder-btn']", force=True)
        await page.wait_for_selector("[data-testid='sort-row-0']", timeout=10000)
        rows = page.locator("div[data-testid^='sort-row-']:not([data-testid^='sort-row-address'])"); cnt = await rows.count()
        texts = lambda: page.evaluate("[...document.querySelectorAll('div[data-testid^=\"sort-row-\"]')].filter(e => !e.dataset.testid.startsWith('sort-row-address')).map(e => e.innerText.replace(/\\s+/g,' ').trim().slice(0,40))")
        t0 = await texts(); print("reorder rows:", cnt, t0)
        # drag row 0 down to row 2
        await rows.nth(4).scroll_into_view_if_needed(); await page.wait_for_timeout(300)
        h0 = await rows.nth(0).locator("svg").first.bounding_box(); r2 = await rows.nth(2).bounding_box()
        await page.mouse.move(h0["x"] + h0["width"] / 2, h0["y"] + h0["height"] / 2); await page.mouse.down()
        await page.mouse.move(h0["x"] + h0["width"] / 2, h0["y"] + 15, steps=3)
        await page.mouse.move(h0["x"] + h0["width"] / 2, r2["y"] + r2["height"] / 2 + 5, steps=15); await page.wait_for_timeout(300); await page.mouse.up()
        await page.wait_for_timeout(500)
        t1 = await texts(); expected = t0[1:3] + [t0[0]] + t0[3:]
        print("after drag:", t1, "| only moved item changed:", t1 == expected)
        await page.click("[data-testid='cancel-reorder-btn']", force=True); await page.wait_for_timeout(300)
        # repeat-pass menu item exists for the duplicated route item
        await page.evaluate("document.querySelectorAll('[data-testid^=\"pole-menu-\"], [data-testid^=\"ug-menu-\"]').forEach(b => {})")
        found = 0
        for i in range(menus):
            btn = page.locator("[data-testid^='pole-menu-'], [data-testid^='ug-menu-']").nth(i)
            await btn.click(force=True); await page.wait_for_timeout(250)
            if await page.locator("[data-testid^='remove-route-pass-']").count():
                found += 1; print("remove-pass option on card", i, ":", await page.locator("[data-testid^='remove-route-pass-']").first.inner_text())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(150)
        print("cards offering 'Remove this route pass':", found, "(expected 1 — only the 2nd pass)")
        await b.close()
asyncio.run(main())
