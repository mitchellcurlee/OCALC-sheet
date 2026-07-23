# Playwright body used with mcp_browser_automation after adding UG Path End.
try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/jobs/{SAVED_CONN_JOB_ID}/map", wait_until="domcontentloaded")
    if await page.get_by_test_id("email-input").count() > 0:
        print("Login page shown; signing in")
        await page.get_by_test_id("email-input").fill("mitchell.curlee@byers.com")
        await page.get_by_test_id("password-input").fill("Dawson@2016")
        await page.get_by_test_id("login-btn").click()
    await page.wait_for_selector('[data-testid="span-measurements-list"]', timeout=30000)
    await page.wait_for_timeout(1000)
    entries = await page.locator('[data-testid^="span-measurement-"]').all_text_contents()
    total = await page.get_by_test_id("span-measurements-total").inner_text()
    print("UG Path End span entries:", entries)
    print("UG Path End total:", total)
    expected = ["P1 to P2", "P2 to UGP-S", "UGP-S to HH HH-1", "HH HH-1 to UGP-E", "UGP-E to P3"]
    assert len(entries) == 5, f"expected 5 span entries, got {len(entries)}"
    for i, text in enumerate(expected):
        assert text in entries[i], f"entry {i+1} expected {text}, got {entries[i]}"
    assert not any("P2 to HH HH-1" in e for e in entries), "stale direct P2 to HH HH-1 entry still visible"
    assert not any("HH HH-1 to P3" in e for e in entries), "stale direct HH HH-1 to P3 entry still visible"
    assert "365 ft aerial" in total and "728 ft underground" in total, f"unexpected total: {total}"
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    print("PASS UG Path End ordering")
except Exception as e:
    print(f"FAIL UG Path End ordering: {e}")
    raise