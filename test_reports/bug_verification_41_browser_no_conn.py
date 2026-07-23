# Playwright body used with mcp_browser_automation for the no-saved-connections regression fixture.
try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/jobs/{NO_CONN_JOB_ID}/map", wait_until="domcontentloaded")
    if await page.get_by_test_id("email-input").count() > 0:
        print("Login page shown; signing in")
        await page.get_by_test_id("email-input").fill("mitchell.curlee@byers.com")
        await page.get_by_test_id("password-input").fill("Dawson@2016")
        await page.get_by_test_id("login-btn").click()
    await page.wait_for_selector('[data-testid="span-measurements-list"]', timeout=30000)
    await page.wait_for_timeout(1000)
    entries = await page.locator('[data-testid^="span-measurement-"]').all_text_contents()
    total = await page.get_by_test_id("span-measurements-total").inner_text()
    print("No-connection span entries:", entries)
    print("No-connection total:", total)
    expected = ["P1 to UGP-S", "UGP-S to HH HH-1", "HH HH-1 to P2"]
    assert len(entries) == 3, f"expected 3 span entries, got {len(entries)}"
    for i, text in enumerate(expected):
        assert text in entries[i], f"entry {i+1} expected {text}, got {entries[i]}"
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    print("PASS no-saved-connections sort_order chain")
except Exception as e:
    print(f"FAIL no-saved-connections sort_order chain: {e}")
    raise