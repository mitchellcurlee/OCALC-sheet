"""
Executed focused Playwright scenario for iteration 33 via mcp_browser_automation.

Covered:
- Open isolated temp job in preview using real auth token.
- Enter Edit Lines & Connections.
- Verify .conn-target markers remount as leaflet-interactive in pick mode.
- Select P1 -> P2 from dropdown, Move start to P3 by tapping green target; verify API and reload persistence.
- Select P3 -> P2, Move end to P1 by tapping green target; verify API and reload persistence.
- Move a line touching underground from UG1 to UG2; verify API persistence.
- Guard checks for other-end/current-item targets and cancel action.
- Add P1 -> UG1 custom line, reload, delete it, reload.
- Verify span measurement list updates and Move Items menu remains visible.

The full command output is in the browser automation transcript for /app/test_reports/iteration_33_browser.
"""
