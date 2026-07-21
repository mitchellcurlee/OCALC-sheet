
"""
Focused Playwright test artifact for iteration 25.
Bug: text annotations shifted outside their white background box after a marker
was drawn first in PhotoMarkupEditor.

The MCP browser automation run used this same flow:
1. Login as Admin@mastec.com.
2. Open seed job /jobs/e5dc0bae-96bb-4cef-8001-7baf4e41d80a.
3. Expand PHOTO MARKUP and open the single photo.
4. Place PWR marker at canvas coordinate (120, 120).
5. Place text "Test Text 123" at canvas coordinate (210, 180).
6. Switch to Select and drag the text to trigger redraw.
7. Place label "Label OK" and HH icon to check regressions.
8. Assert canvas draw calls:
   - text/label fillText uses textAlign="left" and textBaseline="alphabetic"
   - each text/label has matching white roundRect background enclosing it
   - PWR marker label and HH icon label remain centered/middle
   - PWR marker fill/pixel/legend color are #dc2626 / rgb(220, 38, 38)

Evidence screenshot:
/app/test_reports/iteration_25_browser_success/markup_marker_text_label_icon_after_redraw.jpg
"""

TEST_FLOW = [
    "login",
    "open_seed_job",
    "expand_photo_markup",
    "open_markup_editor",
    "place_pwr_marker_first",
    "place_text_annotation_second",
    "drag_text_to_force_redraw",
    "verify_canvas_draw_calls_and_pixels",
]
