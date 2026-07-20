# Playwright test - launched via mcp_browser_automation
# Reference script for JobMap Move Items drag testing.
# Iteration 19: UG drag now works after frontend PUT URL fix (/api/underground/{id}).
#
# Test flow:
# 1. Login Admin@mastec.com / Mastecbyers12345
# 2. Goto /jobs/e5dc0bae-96bb-4cef-8001-7baf4e41d80a/map
# 3. Click [data-testid=edit-map-dropdown-btn] then [data-testid=edit-all-btn]
# 4. Verify banner reads "Move Mode Active" with move-specific copy
# 5. Enumerate draggable markers via .leaflet-marker-icon.leaflet-marker-draggable
#    - UG markers have innerHTML containing 'border-radius:3px' (square)
#    - Pole markers have innerHTML containing 'border-radius:50%' (round)
# 6. Drag UG marker, expect PUT /api/underground/{id} -> 200 and persisted lat/lng
# 7. Reverse-drag to restore
# 8. Sanity drag on a pole marker: expect PUT /api/poles/{id} -> 200
#
# Restore original coords via API if any drift:
#   PUT /api/underground/b25d7718-6638-4e0a-b3ed-3f7658998b94  {lat:30.10045, lng:-95.73518}
