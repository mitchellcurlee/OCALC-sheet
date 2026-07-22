# Bug Verification 28 Browser Test Summary

Manual/Playwright browser automation was run against `https://utility-pole-map.preview.emergentagent.com` for the focused dashboard Leaflet stacking bug.

Core checks executed:
- Logged in as `Admin@mastec.com` and opened the dashboard.
- Verified dashboard Leaflet map still rendered tiles, markers, and a clickable popup.
- Opened New Job, Edit Job, Delete confirmation, and Transfer Job dialogs over the dashboard map.
- For each dialog, sampled multiple points inside the dialog and asserted `document.elementFromPoint(...)` returned elements inside the Radix dialog/alertdialog, not Leaflet elements.
- Opened `data-testid="transfer-user-select"` and verified the Radix select content was topmost/clickable above the map.
- Transferred throwaway job `722a7d63-9fa7-4fc1-85da-62e831a844e5` to a generated `@byers.com` test user.
- Separately verified seed job map `/jobs/e5dc0bae-96bb-4cef-8001-7baf4e41d80a/map` rendered Esri tiles, markers/badges, and an interactive marker popup after the global `.leaflet-container` CSS change.

Result:
- Map/dialog z-index bug: PASSED.
- Bundled transfer notice feature: FAILED because API responses omitted `transferred_from`/`transferred_at`; see `/app/test_reports/bug_verification_28_api_results.json`.