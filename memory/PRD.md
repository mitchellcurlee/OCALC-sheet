# Power Pole Data Collection App - PRD

## Original Problem Statement
Build an app that collects power pole data including: size of the pole, type of pole, telecom attachments count, condition, down guy height, lead/anchor characteristics, ground type, riser number, height of attachment. Additional requirements: GPS coordinates, photo upload, date/time of inspection. Simple app (no login), Excel export, Power poles in RED, Telecom poles in ORANGE, Dark theme.

## User Personas
- **Field Inspectors**: Utility workers who collect pole data in the field
- **Data Analysts**: Users who export and analyze collected pole data

## Core Requirements (Static)
1. ✅ Pole data collection with all specified fields
2. ✅ GPS coordinate capture (manual + auto)
3. ✅ Photo upload capability
4. ✅ Date/time tracking for inspections
5. ✅ No authentication required
6. ✅ Excel export functionality
7. ✅ Power poles = RED, Telecom poles = ORANGE
8. ✅ Dark industrial theme

## What's Been Implemented (Jan 1, 2026)
- Full CRUD operations for poles
- Dashboard with stats (total, power, telecom counts)
- Add/Edit/View/Delete pole functionality
- All data fields: type, size, condition, attachments, technical details
- GPS coordinates with auto-capture button
- Photo upload with preview
- Excel export functionality
- Filter by type and condition
- Search functionality
- Dark theme with Chivo/JetBrains Mono fonts
- Color-coded badges (Power=RED, Telecom=ORANGE)

## Session Update (Jun 8, 2026)
- **FIXED: "Unable to save pole with pictures" (critical).** Root cause: photos were stored
  as inline base64 in the pole document, exceeding MongoDB's 16MB BSON limit (DocumentTooLarge).
  Now photos upload to Emergent Object Storage; only the URL is stored. New backend endpoints:
  `POST /api/upload-photo` (multipart -> storage, returns `/api/files/{path}`),
  `GET /api/files/{path}` (public image serve), `GET /api/poles/{id}/gallery` (public HTML gallery).
  `PhotoUpload.jsx` now uploads files instead of base64. Requires `EMERGENT_LLM_KEY` in backend/.env.
- **Height measurements as Feet/Inches dropdowns** (`HeightInput.jsx`): Feet 0-50, Inches 0-11.
  Stored as decimal feet (no model/migration change); displayed everywhere as `X' Y"`.
  Wired into Down Guys + HOA height on Add/Edit; ViewPole + Excel format via formatHeight.
- **Excel export**: each pole now has a "PHOTOS" row hyperlinking to its gallery (all photos),
  and Down Guy / HOA heights are formatted as ft/in.
- **Maps**: draggable marker (drag to fine-tune position), taller satellite map, maxNativeZoom=19/maxZoom=22.
- **Fixed latent ViewPole bug**: Down Guys & Knuckles were read from non-existent flat fields; now render from arrays.
- Testing: backend pytest 6/6 passed; frontend e2e verified photo save + ft/in display + draggable marker.
- Follow-up tweaks (Jun 8, 2026): removed "Job #" from Add/Edit top bar; added H1 & H2 to pole size dropdown; Spans "Distance" is now two dropdowns (hundreds 1-10 + remainder 0-99) combining into a total (e.g. 2 + 50 = 250 ft) via SpanDistance.jsx — verified saving 250.0.
- Code-quality pass (Jun 8, 2026):
  - Removed hardcoded admin password from backend test; credentials now loaded from backend/.env (MASTER_ADMIN_*).
  - AuthContext: memoized login/register/logout/fetchUser with useCallback, context value with useMemo, and derived initial `loading` from token presence (removed synchronous setState-in-effect).
  - Wrapped mount/id data fetches in useCallback with correct effect deps across Dashboard, JobsList, JobDetail, ViewPole, AddPole, EditPole.
  - Added stable `_key` row identifiers for editable dynamic rows (Down Guys/Knuckles/HOA) in Add/Edit (stripped before submit) to avoid index-key state bugs.
  - Verified: production build compiles, backend pytest 6/6, auth flows (fresh/login/reload) all pass.
  - Deferred (high risk / out of scope): localStorage->httpOnly cookie migration (auth-architecture change); large component splits (Add/Edit/Dashboard) and Excel export function extraction (refactor of working tested code — slated for the P1 PoleForm refactor). `is None` checks and serve_file `data` warning are false positives (left unchanged). Residual mcp-linter findings are experimental React-Compiler rules (set-state-in-effect/immutability) that flag the app's standard fetch-in-effect pattern and are not enforced by the production build.
- Geolocation hardening (Jun 8, 2026): "Get Current Location" on Add/Edit now reports specific errors (permission denied / GPS off / timeout / insecure context) and auto-retries once with lower accuracy + longer timeout on timeout. Note: GPS is blocked in the preview iframe; works on the deployed site (https://poledatasheet.info) after allowing location permission. Requires redeploy to reach production.
- Code-review pass 2 (Jun 8, 2026): serve_file restructured so `data` is only used where assigned; extracted nested ternaries into helpers (ownerTriggerClass in Add/Edit, modeBadgeClass in PhotoUpload); memoized map marker position + eventHandlers (useMemo) with handleMapClick via useCallback in Add/Edit. Verified: backend lint clean, pytest 6/6, frontend compiles, marker renders/draggable. Confirmed false positives (no change): all flagged `is None`/`is not None` (correct idiom); hook-deps "21 occurrences" listing imports/params/locals. Still deferred: localStorage->cookies, oversized-component splits (PoleForm), Excel export function extraction.
- Light theme + export upgrades (Jun 8, 2026):
  - Converted the whole app from the dark "industrial" theme to a BRIGHT WHITE theme ("Grid-Ops Field Light"). Changed shadcn :root vars (index.css), tailwind.config.js custom color `industrial-bg` #09090b -> #ffffff (+ industrial-surface, power-red #dc2626, telecom-orange #ea580c), .industrial-card/.industrial-input/.industrial-button, scrollbar, pole badges, mobile-bottom-nav, App.css; and a scripted Tailwind class conversion across all pages + PhotoUpload/SpanDistance/HeightInput/InstallPrompt/ProtectedRoute (dark bg/text/border -> light, keeping white text on colored buttons + dark overlays). Red/orange brand accents preserved. design_guidelines.json saved at /app/design_guidelines.json.
  - Excel export now lists poles in NUMERICAL order by pole_number (_pole_sort_key: numeric first 1,2,10..., non-numeric last) in both export endpoints.
  - Per-pole gallery (GET /api/poles/{id}/gallery, opened from the Excel "PHOTOS" link) now supports DOWNLOAD: a "Download all" button + per-photo "Download" links (download filename) + click-to-open each photo in a new tab; gallery page also restyled to the light theme.
  - Verified: backend pytest 14/14 (added /app/backend/tests/test_export_sort_and_gallery.py), frontend testing agent 100% across login/jobs/job-detail/add-pole (theme readable, all data-testids intact, both export features working). Requires redeploy to push to production (https://poledatasheet.info).
- Excel photo-link 403 fix (Jun 8, 2026): the per-pole "PHOTOS" gallery hyperlink was built from request.base_url, which behind the ingress is the INTERNAL cluster host (http://...cluster...emergentcf.cloud) and is not publicly reachable -> opening it returned 403. Fix: export endpoints (/api/jobs/{id}/export/excel and /api/poles/export/excel) now accept an optional `base_url` query param; frontend (JobDetail + Dashboard handleExport) passes `window.location.origin`. Hyperlink now uses the public domain and opens fine (verified 200). Fallback to request.base_url retained. Requires redeploy for production.
- Forms overhaul (Jun 9, 2026):
  - FIXED blank-screen crash when typing "-" in latitude/longitude: NaN guards (Number.isFinite) added to MapCenterUpdater (flyTo), markerPosition, and mapCenter in Add/Edit (Leaflet was throwing "Invalid LatLng (NaN, ...)").
  - Span Distance first dropdown now includes 0 (range 0-10 hundreds).
  - Basic Information restructured to: Pole Owner | Class | Pole Size | Size Type | Type of Pole | Condition. Pole Owner moved here (removed from HOA section).
  - New Class field/dropdown (pole_class): H1, H2, 1-6. Backend POLE_CLASSES + pole_class on models + options endpoint + Excel CLASS cell.
  - Pole Size changed to feet 20-65 in 5-ft steps (20,25,...,65), displayed like 40' (backend POLE_SIZES updated).
  - Blank/clear option ("—", sentinel "__none__" -> "") added to ALL dropdowns (Basic Info, Spans, Down Guys, Knuckles, HOA, MGNV, Terminal, Risers, HeightInput ft/in, SpanDistance) so a mistaken selection can be reset.
  - Fixed white-on-white EditPole section headings (light-theme conversion had restored them to text-white because they're single-line with the accent bar); now text-zinc-900.
  - Removed dead code in is_admin_user. Verified: backend pytest 19/19 (added test_options_and_class.py), frontend self-verified (crash fix, new Basic Info layout, Class/Size dropdowns, EditPole dark headings, pole_class round-trip). Requires redeploy for production.
- Small tweaks (Jun 9, 2026): pole number box now defaults to "P-" on Add Pole (formData.pole_number); added "No Telco on Pole" to the HOA Owner dropdown (backend ATTACHMENT_OWNERS). Verified via API + UI. Requires redeploy for production.
- Duplicate pole (Jun 9, 2026): new POST /api/poles/{id}/duplicate copies a pole (new id + timestamps, all other data incl. spans/down_guys/knuckles/attachments/photos copied). Added a Duplicate (Copy icon) action per pole row in JobDetail and a "Duplicate" button on ViewPole; both navigate to Edit the new copy. The copy clears GPS (latitude/longitude=None) and sets pole number to "P-". Verified via curl + UI. Requires redeploy for production.
- Longitude default (Jun 9, 2026): AddPole longitude box defaults to "-" (US longitudes are negative); EditPole shows "-" when a pole has no longitude (e.g. a freshly duplicated pole). Submit conversion hardened with Number.isFinite so a lone "-" saves as null, not NaN. Verified via UI. Requires redeploy for production.
- Natural pole ordering (Jun 9, 2026): _pole_sort_key upgraded to a natural alphanumeric sort so 'P-2' < 'P-12' and '1' < '2' < '10'. Applied to GET /jobs/{id}/poles (Job Detail / add-pole page now lists poles in numerical order) and both Excel exports. Verified order P-1,P-2,P-10,P-12; pytest 19/19. Requires redeploy for production.
- Anchor + Down Guys + Access overhaul (Jun 10, 2026):
  - Renamed Knuckles -> Anchor everywhere (UI labels, ViewPole, Excel header, gallery photo label). Internal DB key kept as `knuckles` for data compatibility.
  - Anchor box fields: Size (1/2,3/4,1,1 1/4"), Total Eyes (1-4), Lead (ft/in via HeightInput), Condition (Excellent/Good/Bad), Photo. Dropped the old "Knuckles Used" count from UI. New Knuckle model fields: size, total_eyes, lead.
  - Down Guys: added Type (Standard/Sidewalk/Pole Brace/Overhead) and Condition (Good/Slacked/Broken); Lead switched to ft/in dropdowns; reordered to Owner | Direction | Size | Type | Condition | Height | Lead. New DownGuy model fields: type, condition.
  - Basic Information: added Access (Yes/No) dropdown between Pole Owner and Class (new `access` field). Row now: Owner | Access | Class | Size | Size Type | Type of Pole | Condition.
  - Add Pole: added a top "Save Pole" button (mirrors EditPole's top Update button).
  - Blank "—" clear option on all new dropdowns. New options endpoint lists: down_guy_types, down_guy_conditions, anchor_sizes, anchor_eyes.
  - Excel exports updated (ANCHOR header + Size/Total Eyes/Lead/Condition; Down Guys columns Owner/Direction/Size/Type/Condition/Height/Lead with ft/in; ACCESS + CLASS in basic info).
  - Verified: backend curl round-trip of all new fields, export contains ANCHOR/ACCESS/Total Eyes/Sidewalk (no KNUCKLES), pytest 19/19, UI render + a full top-button save. Requires redeploy for production.
- Anchor/HOA/Birthmark tweaks (Jun 10, 2026):
  - Anchor "Lead" (ft/in) replaced with a "Direction" dropdown (N..NW, same options as other direction boxes). New Knuckle.direction field; Excel anchor column header changed Lead->Direction.
  - Moved the HOA box to sit between "Birthmark & MGNV" and "OCALC Photos" on both Add and Edit (verified via header Y-order).
  - "Has Birthmark" changed from a toggle/Switch to a Yes/No dropdown (removed unused Switch import). 
  - Verified: anchor direction round-trips, export shows Direction/NE, both forms render with correct order, pytest 19/19. Requires redeploy for production.
- Access options update (Jun 10, 2026): Access dropdown changed from Yes/No to: "Yes / Rear Access", "Yes / Front Access", "No / Rear Access" (plus blank), on both Add and Edit. Verified dropdown + save. Requires redeploy for production.
- PoleForm refactor + export revision (Jun 10, 2026):
  - Merged AddPole and EditPole into a single shared component `/app/frontend/src/components/PoleForm.jsx` (~950 lines). AddPole.jsx and EditPole.jsx are now thin wrappers (~37 / ~67 lines): Add does POST /poles, Edit fetches the pole + does PUT /poles/{id}; PoleForm owns all form state/handlers/JSX and calls an `onSubmit(payload)` prop. Mode prop drives the button label ("Save Pole" vs "Update Pole") and color. data-testids preserved (add-pole-page / edit-pole-page). Verified end-to-end: create saves, edit loads existing data and updates (condition change persisted, access preserved). Future field changes are now ONE edit instead of two.
  - Revised the job Excel export (GET /api/jobs/{id}/export/excel) to match the app's section order and field labels: BASIC INFORMATION (Pole Owner, Access, Class, Pole Size, Size Type, Type of Pole, Condition) -> SPANS -> GPS LOCATION -> BIRTHMARK & MGNV (Has Birthmark, MGNV Present, MGNV Condition) -> HOA (Height/Owner/Notes + Pole Terminal/Risers) -> DOWN GUYS -> ANCHOR -> NOTES -> PHOTOS (gallery link). Added section helper functions. Updated test assertion (CLASS->Class). Verified section order + pytest 19/19. Requires redeploy for production.

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + shadcn/ui
- Export: openpyxl for Excel generation

## Prioritized Backlog
### P0 (Critical) - COMPLETED
- All core functionality implemented

### P1 (High Priority) - Future
- Bulk import from Excel
- Map view for poles with GPS coordinates
- Offline mode for field use

### P2 (Medium Priority) - Future
- Multiple photos per pole
- Data validation rules
- Audit trail for changes

## Next Tasks
1. Consider adding map visualization for poles
2. Add bulk import capability
3. Implement offline-first PWA features
