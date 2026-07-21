"""
Focused verification script outline for ReferenceHeightMeasurer export scaling.
Executed via browser automation in this verification run:
- Log in with Admin@mastec.com.
- Open /jobs/e5dc0bae-96bb-4cef-8001-7baf4e41d80a/add.
- Open HOA Measure Heights dialog.
- Upload generated 3000x2000 and 800x600 test images.
- Mark reference bottom/top and one attachment.
- Click Apply and inspect uploaded annotated image pixel dimensions and green label component bounds.
Expected:
- 3000x2000 export has label component about 330x120 px (scale=3), not old 100x40.
- 800x600 export has label component about 110x40 px (scale=1 baseline).
"""

# This file records the focused test case used by the testing agent. The actual
# Playwright commands were run through the provided mcp_browser_automation tool.
