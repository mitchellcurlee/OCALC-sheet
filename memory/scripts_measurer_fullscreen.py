import asyncio, sys
from playwright.async_api import async_playwright
BASE, JOB = sys.argv[1], sys.argv[2]
PHOTO = "/app/memory/test_pole_photo.jpg"

async def metrics(page):
    return await page.evaluate("""() => {
      const dlg = document.querySelector('[data-testid="height-measurer-dialog"]');
      const box = document.querySelector('[data-testid="measurer-image-box"]');
      const img = box && box.querySelector('img');
      const cv = box && box.querySelector('canvas');
      const r = (e) => e ? (({width,height,left,top}) => ({w:Math.round(width),h:Math.round(height),l:Math.round(left),t:Math.round(top)}))(e.getBoundingClientRect()) : null;
      return { vw: innerWidth, vh: innerHeight, dlg: r(dlg), box: r(box), img: r(img), canvas: cv ? {w: cv.width, h: cv.height} : null, natural: img ? [img.naturalWidth, img.naturalHeight] : null };
    }""")

async def run(page, vp, label):
    await page.set_viewport_size(vp)
    await page.goto(f"{BASE}/jobs/{JOB}/add", wait_until="domcontentloaded")
    await page.wait_for_selector("[data-testid='height-measurer-btn']", state="attached", timeout=30000)
    await page.evaluate("document.querySelector('[data-testid=\"height-measurer-btn\"]').click()")
    await page.wait_for_selector("[data-testid='height-measurer-dialog']", timeout=10000)
    await page.wait_for_timeout(400)
    m1 = await metrics(page); print(label, "STEP1 dialog", m1["dlg"], "viewport", m1["vw"], m1["vh"])
    await page.locator("[data-testid='height-measurer-dialog'] input[type=file]").nth(1).set_input_files(PHOTO)
    await page.wait_for_selector("[data-testid='measurer-image-box']", timeout=10000)
    await page.wait_for_timeout(800)
    m = await metrics(page)
    print(label, "STEP2", m)
    ar_img = m["img"]["w"] / m["img"]["h"]; ar_nat = m["natural"][0] / m["natural"][1]
    print(label, "fills box height:", abs(m["img"]["h"] - m["box"]["h"]) <= 3, "| aspect kept:", abs(ar_img - ar_nat) < 0.01, "| canvas==img:", m["canvas"]["w"] == m["img"]["w"] and m["canvas"]["h"] == m["img"]["h"])
    # tap bottom then top of the yellow stick (layout coords from natural coords)
    k = m["img"]["w"] / m["natural"][0]
    cv = page.locator("[data-testid='measurer-image-box'] canvas")
    await cv.click(position={"x": 315 * k, "y": 2290 * k}, force=True); await page.wait_for_timeout(300)
    await cv.click(position={"x": 315 * k, "y": 1710 * k}, force=True); await page.wait_for_timeout(300)
    await cv.click(position={"x": 600 * k, "y": 730 * k}, force=True); await page.wait_for_timeout(500)
    txt = await page.locator("[data-testid='measurer-marking-stage']").inner_text()
    import re
    print(label, "measured:", re.findall(r"Attachment 1\s*([\d'\" .]+)", txt.replace("\n", " "))[:1])
    m2 = await metrics(page); print(label, "after summary: box", m2["box"], "img", m2["img"], "canvas", m2["canvas"])
    await page.wait_for_timeout(2500)
    print(label, "title/status:", await page.evaluate("() => { const t = document.querySelector('[data-testid=\"height-measurer-dialog\"] h2'); const s = document.querySelector('[data-testid=\"measurer-marking-stage\"] > div'); const d = document.querySelector('[data-testid=\"height-measurer-dialog\"]'); const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }; return { title: r(t), status: r(s), display: getComputedStyle(d).display }; }"))
    await page.screenshot(path=f"/tmp/measurer_{label}.jpg", quality=40, type="jpeg")
    await page.keyboard.press("Escape"); await page.wait_for_timeout(500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width": 1920, "height": 800})
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("input[type='email']", timeout=30000)
        await page.fill("input[type='email']", "Admin@mastec.com"); await page.fill("input[type='password']", "Mastecbyers12345")
        await page.click("button[type='submit']", force=True); await page.wait_for_timeout(2500)
        await run(page, {"width": 1920, "height": 800}, "desktop")
        await page.goto(f"{BASE}/", wait_until="domcontentloaded"); await page.wait_for_timeout(1500)
        await run(page, {"width": 390, "height": 844}, "mobile")
        await b.close()
asyncio.run(main())
