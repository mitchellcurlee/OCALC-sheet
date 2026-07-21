"""Focused Playwright UI verification for underground SOC toggle persistence.

This documents the scenario executed through mcp_browser_automation. It is written
as a Playwright async helper that can be copied into that runner, where `page` is
provided by the harness.
"""

BASE_URL = "https://utility-pole-map.preview.emergentagent.com"
JOB_ID = "e5dc0bae-96bb-4cef-8001-7baf4e41d80a"
ADMIN_EMAIL = "Admin@mastec.com"
ADMIN_PASSWORD = "Mastecbyers12345"


async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    created_ids = []

    async def api_json(method, path, data=None):
        token = await page.evaluate("() => localStorage.getItem('token')")
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        result = await page.evaluate(
            """async ({method, path, data, headers}) => {
                const res = await fetch('/api' + path, {method, headers, body: data ? JSON.stringify(data) : undefined});
                const text = await res.text();
                let body;
                try { body = JSON.parse(text); } catch(e) { body = text; }
                return {status: res.status, body};
            }""",
            {"method": method, "path": path, "data": data, "headers": headers},
        )
        if result["status"] < 200 or result["status"] >= 300:
            raise AssertionError(f"API {method} {path} failed: {result}")
        return result["body"]

    async def toggle_checked(testid):
        loc = page.get_by_test_id(testid)
        await loc.wait_for(state="visible", timeout=15000)
        return (await loc.get_attribute("data-state")) == "checked" or (await loc.get_attribute("aria-checked")) == "true"

    try:
        await page.goto(f"{BASE_URL}/login")
        await page.get_by_test_id("email-input").fill(ADMIN_EMAIL)
        await page.get_by_test_id("password-input").fill(ADMIN_PASSWORD)
        await page.get_by_test_id("login-btn").click()
        await page.wait_for_timeout(2000)

        # Existing edit-flow item is created by API for deterministic setup, then edited via UI.
        existing = await api_json("POST", "/underground", {
            "job_id": JOB_ID,
            "type": "Handhole",
            "material_type": "Concrete",
            "label": "SOC-UI-EXISTING",
            "notes": "SOC UI existing initial notes",
            "fid": "FID-UI-EXISTING",
            "primary_fid": False,
            "path_measurements": [{"direction": "In", "feet": 10}],
            "latitude": 29.111111,
            "longitude": -95.222222,
            "soc_start": False,
            "soc_end": False,
        })
        existing_id = existing["id"]
        created_ids.append(existing_id)

        await page.goto(f"{BASE_URL}/jobs/{JOB_ID}/underground/edit/{existing_id}")
        await page.get_by_test_id("underground-form-page").wait_for(state="visible", timeout=30000)
        await page.get_by_test_id("ug-soc-start-toggle").click()
        assert await toggle_checked("ug-soc-start-toggle"), "SOC Start did not turn on before save"
        await page.get_by_test_id("ug-fid-input").fill("FID-UI-START")
        await page.get_by_test_id("add-path-measurement-btn").click()
        await page.get_by_test_id("path-feet-input-1").fill("44.4")
        await page.get_by_test_id("ug-notes-input").fill("SOC UI existing start saved notes")
        await page.get_by_test_id("save-underground-btn").click()
        await page.wait_for_url(f"**/jobs/{JOB_ID}", timeout=30000)

        await page.goto(f"{BASE_URL}/jobs/{JOB_ID}/underground/edit/{existing_id}")
        await page.get_by_test_id("underground-form-page").wait_for(state="visible", timeout=30000)
        assert await toggle_checked("ug-soc-start-toggle"), "SOC Start was off after save/reopen"
        got = await api_json("GET", f"/underground/{existing_id}")
        assert got["soc_start"] is True
        assert got["fid"] == "FID-UI-START"
        assert any(m.get("feet") == 44.4 for m in got["path_measurements"])

        await page.get_by_test_id("ug-soc-end-toggle").click()
        await page.get_by_test_id("save-underground-btn").click()
        await page.wait_for_url(f"**/jobs/{JOB_ID}", timeout=30000)
        await page.goto(f"{BASE_URL}/jobs/{JOB_ID}/underground/edit/{existing_id}")
        await page.get_by_test_id("underground-form-page").wait_for(state="visible", timeout=30000)
        assert await toggle_checked("ug-soc-end-toggle"), "SOC End was off after save/reopen"
        got = await api_json("GET", f"/underground/{existing_id}")
        assert got["soc_start"] is True and got["soc_end"] is True

        # Create-flow regression: add UI with SOC End ON, save, reopen.
        await page.goto(f"{BASE_URL}/jobs/{JOB_ID}/underground/add?type=Handhole")
        await page.get_by_test_id("underground-form-page").wait_for(state="visible", timeout=30000)
        await page.get_by_test_id("ug-soc-end-toggle").click()
        await page.get_by_test_id("ug-label-input").fill("SOC-UI-CREATE")
        await page.get_by_test_id("ug-latitude-input").fill("29.333333")
        await page.get_by_test_id("ug-longitude-input").fill("-95.444444")
        await page.get_by_test_id("save-underground-btn").click()
        await page.wait_for_url(f"**/jobs/{JOB_ID}", timeout=30000)
        all_ug = await api_json("GET", f"/jobs/{JOB_ID}/underground")
        created = next(i for i in all_ug if i.get("label") == "SOC-UI-CREATE")
        created_ids.append(created["id"])
        await page.goto(f"{BASE_URL}/jobs/{JOB_ID}/underground/edit/{created['id']}")
        await page.get_by_test_id("underground-form-page").wait_for(state="visible", timeout=30000)
        assert await toggle_checked("ug-soc-end-toggle"), "Create-flow SOC End was off after save/reopen"
    finally:
        for item_id in created_ids:
            await api_json("DELETE", f"/underground/{item_id}")