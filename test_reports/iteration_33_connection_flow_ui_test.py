"""
Playwright script body used with mcp_browser_automation for iteration 33.

This file is a record of the focused browser verification steps. The same code
body is passed to the browser automation tool, which runs it inside an async
function with an existing `page` object.
"""

SCRIPT = r'''
import json

async def log_step(name, fn):
    try:
        result = await fn()
        print(f"PASS: {name}: {result if result is not None else ''}")
        return result
    except Exception as exc:
        print(f"FAIL: {name}: {type(exc).__name__}: {exc}")
        raise

await page.set_viewport_size({"width": 1920, "height": 1080})
state = json.loads(open('/app/test_reports/iteration_33_seed_state.json').read())
job_id = state['job']['id']
token = state['token']
poles = {p['pole_number']: p for p in state['poles']}
ugs = {u['label']: u for u in state['underground']}

async def api(path, method='GET', body=None):
    return await page.evaluate("""async ({path, method, body, token}) => {
        const res = await fetch('/api' + path, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!res.ok) throw new Error(method + ' ' + path + ' -> ' + res.status + ': ' + text);
        return data;
    }""", {"path": path, "method": method, "body": body, "token": token})

async def enter_connection_editor():
    await page.locator('[data-testid="edit-map-dropdown-btn"]').click(force=True)
    await page.wait_for_timeout(300)
    await page.locator('[data-testid="edit-lines-btn"]').click(force=True)
    await page.locator('[data-testid="conn-edit-panel"]').wait_for(state='visible', timeout=10000)
    await page.wait_for_timeout(1200)
    return await page.locator('[data-testid="conn-panel-instruction"]').inner_text()

async def select_connection_by_label(label_text):
    await page.locator('[data-testid="conn-picker-select"]').click(force=True)
    await page.wait_for_timeout(300)
    await page.get_by_text(label_text, exact=True).click(force=True)
    await page.wait_for_timeout(600)
    selected = await page.locator('[data-testid="conn-selected-label"]').inner_text()
    if selected != label_text:
        raise AssertionError(f"selected label mismatch: expected {label_text}, got {selected}")
    return selected

async def target_info():
    return await page.evaluate("""() => Array.from(document.querySelectorAll('.conn-target')).map((el, idx) => {
        const r = el.getBoundingClientRect();
        const t = (el.closest('.leaflet-marker-icon') || el).style.transform || '';
        return {idx, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, transform: t};
    })""")

async def click_target_by_rank(rank_name):
    infos = await target_info()
    if len(infos) < 5:
        raise AssertionError(f"expected >=5 target circles, got {len(infos)}: {infos}")
    # Ranks for seeded geometry after fitBounds:
    # P1 = bottom-left; P2 = lower-right; P3 = middle-right/top-right near P2;
    # UG1 = middle-left; UG2 = top-center.
    if rank_name == 'P1':
        chosen = max([i for i in infos if i['x'] < sorted([j['x'] for j in infos])[2]], key=lambda i: i['y'])
    elif rank_name == 'P2':
        right = sorted(infos, key=lambda i: i['x'], reverse=True)[:2]
        chosen = max(right, key=lambda i: i['y'])
    elif rank_name == 'P3':
        right = sorted(infos, key=lambda i: i['x'], reverse=True)[:2]
        chosen = min(right, key=lambda i: i['y'])
    elif rank_name == 'UG1':
        left = sorted(infos, key=lambda i: i['x'])[:2]
        chosen = min(left, key=lambda i: i['y'])
    elif rank_name == 'UG2':
        chosen = min(infos, key=lambda i: i['y'])
    else:
        raise AssertionError(f"unknown target rank {rank_name}")
    await page.mouse.click(chosen['x'], chosen['y'])
    await page.wait_for_timeout(1000)
    return {"rank": rank_name, "clicked": chosen, "all": infos}

async def click_move_and_target(button_testid, target_rank):
    await page.locator(f'[data-testid="{button_testid}"]').click(force=True)
    await page.wait_for_timeout(500)
    pulsing = await page.locator('.conn-target').count()
    if pulsing < 5:
        raise AssertionError(f"target circles not present, count={pulsing}")
    info = await click_target_by_rank(target_rank)
    toast_text = await page.locator('[data-sonner-toast], [data-type], li').all_inner_texts()
    return {"target_click": info, "toasts": toast_text[-5:]}

async def done_and_reload():
    await page.locator('[data-testid="save-all-btn"]').click(force=True)
    await page.wait_for_timeout(1000)
    await page.reload(wait_until='domcontentloaded')
    await page.locator('[data-testid="job-map-page"]').wait_for(state='visible', timeout=15000)
    await page.wait_for_timeout(2000)
    return await page.locator('[data-testid="map-measurements-summary"]').inner_text()

base_url = state.get('base_url', 'https://utility-pole-map.preview.emergentagent.com')

await log_step('open preview and authenticate', lambda: page.goto(base_url, wait_until='domcontentloaded'))
await page.evaluate("token => localStorage.setItem('token', token)", token)

await log_step('open map page', lambda: page.goto(f'{base_url}/jobs/{job_id}/map', wait_until='domcontentloaded'))
await page.locator('[data-testid="job-map-page"]').wait_for(state='visible', timeout=20000)
await page.wait_for_timeout(2500)

initial_conns = await log_step('connections initialized after opening editor', enter_connection_editor)
conns = await api(f'/jobs/{job_id}/connections')
print('API after initialization:', json.dumps(conns, indent=2))

# Raw line click selection check: click the first hit line midpoint via real mouse.
raw_click_result = await page.evaluate("""() => {
    const el = document.querySelector('.conn-hit-line');
    if (!el) return {found: false};
    const r = el.getBoundingClientRect();
    return {found: true, x: r.left + r.width / 2, y: r.top + r.height / 2, box: {left:r.left, top:r.top, width:r.width, height:r.height}};
}""")
if raw_click_result.get('found'):
    await page.mouse.click(raw_click_result['x'], raw_click_result['y'])
    await page.wait_for_timeout(800)
    raw_selected = await page.locator('[data-testid="conn-selected-label"]').count()
    print('RAW_LINE_CLICK_RESULT:', json.dumps({"attempt": raw_click_result, "selected_count": raw_selected}))
    if raw_selected:
        await page.locator('[data-testid="conn-deselect-btn"]').click(force=True)
        await page.wait_for_timeout(300)
else:
    print('RAW_LINE_CLICK_RESULT:', json.dumps(raw_click_result))

# CORE: Move start on pole-to-pole QA33-P1 -> QA33-P2 to QA33-P3 -> QA33-P2.
await log_step('select P1 to P2 via dropdown', lambda: select_connection_by_label('QA33-P1 → QA33-P2'))
await log_step('move START to P3', lambda: click_move_and_target('conn-move-start-btn', 'P3'))
after_start = await api(f'/jobs/{job_id}/connections')
print('API after move start:', json.dumps(after_start, indent=2))
target_conn = next(c for c in after_start if c['to_item_id'] == poles['QA33-P2']['id'] and c['from_item_id'] == poles['QA33-P3']['id'])
await log_step('done/reload after move start', done_and_reload)
after_start_reload = await api(f'/jobs/{job_id}/connections')
print('API after move start reload:', json.dumps(after_start_reload, indent=2))
if not any(c['id'] == target_conn['id'] and c['from_item_id'] == poles['QA33-P3']['id'] for c in after_start_reload):
    raise AssertionError('Move start did not persist after reload')

# Move end on the same pole-to-pole connection: QA33-P3 -> QA33-P2 to QA33-P3 -> QA33-P1.
await log_step('re-enter editor for move end', enter_connection_editor)
await log_step('select P3 to P2 via dropdown', lambda: select_connection_by_label('QA33-P3 → QA33-P2'))
await log_step('move END to P1', lambda: click_move_and_target('conn-move-end-btn', 'P1'))
after_end = await api(f'/jobs/{job_id}/connections')
print('API after move end:', json.dumps(after_end, indent=2))
if not any(c['id'] == target_conn['id'] and c['from_item_id'] == poles['QA33-P3']['id'] and c['to_item_id'] == poles['QA33-P1']['id'] for c in after_end):
    raise AssertionError('Move end did not persist in API')
await log_step('done/reload after move end', done_and_reload)
after_end_reload = await api(f'/jobs/{job_id}/connections')
print('API after move end reload:', json.dumps(after_end_reload, indent=2))
if not any(c['id'] == target_conn['id'] and c['from_item_id'] == poles['QA33-P3']['id'] and c['to_item_id'] == poles['QA33-P1']['id'] for c in after_end_reload):
    raise AssertionError('Move end did not persist after reload')

# Underground endpoint move: move connection touching UG1 (QA33-P2 -> QA33-UG1) end to UG2.
await log_step('re-enter editor for underground move', enter_connection_editor)
await log_step('select P2 to UG1 via dropdown', lambda: select_connection_by_label('QA33-P2 → QA33-UG1'))
await log_step('move underground-touching END to UG2', lambda: click_move_and_target('conn-move-end-btn', 'UG2'))
after_ug = await api(f'/jobs/{job_id}/connections')
print('API after underground endpoint move:', json.dumps(after_ug, indent=2))
if not any(c['from_item_id'] == poles['QA33-P2']['id'] and c['to_item_id'] == ugs['QA33-UG2']['id'] for c in after_ug):
    raise AssertionError('Underground endpoint move did not persist in API')

# Guard checks on a P3 -> P1 connection: other end shows error/no API change, current item cancels.
await log_step('select P3 to P1 for guard tests', lambda: select_connection_by_label('QA33-P3 → QA33-P1'))
before_guard = await api(f'/jobs/{job_id}/connections')
await page.locator('[data-testid="conn-move-start-btn"]').click(force=True)
await page.wait_for_timeout(300)
await click_target_by_rank('P1')
await page.wait_for_timeout(800)
after_other_guard = await api(f'/jobs/{job_id}/connections')
if before_guard != after_other_guard:
    raise AssertionError('Other-end guard unexpectedly changed API state')
await page.locator('[data-testid="conn-cancel-action-btn"]').click(force=True)
await page.wait_for_timeout(300)
await page.locator('[data-testid="conn-move-start-btn"]').click(force=True)
await page.wait_for_timeout(300)
await click_target_by_rank('P3')
await page.wait_for_timeout(800)
after_current_guard = await api(f'/jobs/{job_id}/connections')
if before_guard != after_current_guard:
    raise AssertionError('Current-item guard unexpectedly changed API state')
guard_panel_selected = await page.locator('[data-testid="conn-selected-label"]').count()
print('GUARD_RESULT:', json.dumps({"other_end_no_change": True, "current_no_change": True, "selected_after_current": guard_panel_selected}))

# Add line and delete line both persist: add P1 -> UG1 custom, reload, delete it, reload.
await log_step('start add line', lambda: page.locator('[data-testid="conn-add-line-btn"]').click(force=True))
await page.wait_for_timeout(300)
await log_step('add line first P1', lambda: click_target_by_rank('P1'))
await log_step('add line second UG1', lambda: click_target_by_rank('UG1'))
after_add = await api(f'/jobs/{job_id}/connections')
new_custom = [c for c in after_add if c['from_item_id'] == poles['QA33-P1']['id'] and c['to_item_id'] == ugs['QA33-UG1']['id'] and c['connection_type'] == 'custom']
if not new_custom:
    raise AssertionError('Custom add line P1 -> UG1 not found in API')
await log_step('done/reload after add line', done_and_reload)
after_add_reload = await api(f'/jobs/{job_id}/connections')
if not any(c['id'] == new_custom[0]['id'] for c in after_add_reload):
    raise AssertionError('Custom added line did not persist after reload')

await log_step('re-enter editor for delete', enter_connection_editor)
await log_step('select added P1 to UG1 via dropdown', lambda: select_connection_by_label('QA33-P1 → QA33-UG1'))
await log_step('delete added line', lambda: page.locator('[data-testid="conn-delete-btn"]').click(force=True))
await page.wait_for_timeout(800)
after_delete = await api(f'/jobs/{job_id}/connections')
if any(c['id'] == new_custom[0]['id'] for c in after_delete):
    raise AssertionError('Deleted connection still present in API')
await log_step('done/reload after delete', done_and_reload)
after_delete_reload = await api(f'/jobs/{job_id}/connections')
if any(c['id'] == new_custom[0]['id'] for c in after_delete_reload):
    raise AssertionError('Deleted connection returned after reload')

# Sanity: Move Items mode still available and End Path badges absence does not interfere in this temp job.
await page.locator('[data-testid="edit-map-dropdown-btn"]').click(force=True)
await page.wait_for_timeout(200)
move_items_visible = await page.locator('[data-testid="edit-all-btn"]').is_visible()
span_text = await page.locator('[data-testid="span-measurements-total"]').inner_text()
summary_text = await page.locator('[data-testid="map-measurements-summary"]').inner_text()
error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
}""")
if error_text:
    print(f"Found error message: {error_text}")
else:
    print("No error messages found on the page")

final = {
    "job_id": job_id,
    "raw_line_click": raw_click_result,
    "move_items_visible": move_items_visible,
    "span_total": span_text,
    "summary": summary_text,
    "final_connections": after_delete_reload,
}
print('FINAL_UI_RESULT:', json.dumps(final, indent=2))
'''
