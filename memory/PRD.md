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
- Access options update #2 (Jun 10, 2026): Access dropdown changed to "Yes / Rear Easement", "Yes / Right of Way", "No / Rear Easement" (plus blank). Single edit in PoleForm.jsx — covers both Add & Edit thanks to the refactor. Verified dropdown + compile. Requires redeploy for production.
- Autosave draft (Jun 10, 2026): PoleForm now autosaves an in-progress NEW pole to localStorage (key poleDraft:{jobId}) as the user edits. On reopening/reloading the Add Pole page, the draft is restored (text + dropdowns + dynamic rows) with a dismissible "Restored your unsaved draft" banner and a "Start fresh" button. Draft is cleared on successful save. Edit mode is unaffected (no drafts). Implementation notes: draft captured synchronously on first render into a ref and restore is gated until /poles/options load (so Radix Selects match values); saves gated until restore completes — this fixes a React StrictMode double-invoked-effect bug that was clobbering the draft on mount. AddPole/EditPole onSubmit now return true/false so PoleForm clears the draft only on success. Verified: type -> reload -> all fields restored; save -> draft cleared. Requires redeploy for production.
- Satellite pole-map overview (Jun 10, 2026): new page /jobs/:jobId/map (src/pages/JobMap.jsx) + "Map" button on Job Detail. Plots all poles that have GPS on an Esri satellite map, connected in natural pole-number order with a red route line, per-segment footage labels (GPS haversine distance in feet) and direction arrows (bearing), auto-fit bounds, a header with pole count + total footage, and an amber banner listing poles missing GPS coordinates. "Download image" produces a PNG: uses leaflet-image on a temporary tiles-only Leaflet map (divIcons crash leaflet-image, so a clean temp map is captured) then draws the route/markers/footage labels/title onto the canvas. Added dependency leaflet-image. Verified: interactive map renders markers+route+labels+missing banner; downloaded a 2.5MB PNG containing satellite + route + numbered markers + distance label + title (confirmed via image analysis). Requires redeploy for production.
- Excel -> Map link (Jun 10, 2026): the job Excel export now has a "MAP" cell in the top header row ("Open satellite overview") hyperlinking to {public_base}/jobs/{job_id}/map (the interactive satellite pole-map). Uses the same base_url the frontend passes on export. Verified link target + pytest 19/19. Requires redeploy for production.
- Map pole popups (Jun 10, 2026): on the interactive job map, clicking a pole marker now opens a Leaflet popup showing pole #, owner, condition, and size, with "Open" (-> /jobs/{jobId}/view/{id}) and "Edit" (-> .../edit/{id}) buttons so a pole can be reviewed/corrected straight from the route overview. Verified: popup content + Open navigates to the View page. Requires redeploy for production.
- Map controls (Jun 10, 2026): added a "Fit all" (recenter/fitBounds) button and a "Stop #'s" toggle to the job map header. When the toggle is on, markers show the route stop sequence prefixed to the pole number (e.g. "2·P-M1") on both the interactive map and the downloaded PNG. Verified: labels change 1/P-M1/... -> 1·1/2·P-M1/3·P-M2/4·P-M3; recenter works. Requires redeploy for production.
- Reliable map download (Jun 10, 2026): user reported "map does not transfer when downloaded" and asked about Google Maps; Google Maps requires a billing account which the user declined, so kept the free maps and fixed the download instead. Replaced the flaky leaflet-image tile-stitching with a single satellite image: new backend proxy GET /api/maps/static?bbox=<3857>&size=W,H fetches one PNG from the free Esri World Imagery export endpoint (validated bbox/size, no key). JobMap.downloadImage now computes a Web-Mercator bbox to fit all poles (aspect-fit), fetches that image via the proxy (same-origin -> no canvas taint), and draws the route/markers/footage labels/segment table/north arrow/scale bar on a Mercator-projected canvas. Removed leaflet-image usage. Verified via image analysis: downloaded PNG reliably shows full satellite imagery + all annotations. Free, no API key, no billing. Requires redeploy for production.
- Job-detail map download + measurement visibility (Jun 10, 2026): (a) Extracted the map-image logic into a shared util /app/frontend/src/lib/poleMapImage.js (computeRoute + downloadPoleMapImage) used by both JobMap and JobDetail. Added a "Map Image" button on the Job Detail page (next to Export) that downloads the annotated PNG directly without opening the overview. (b) Footage labels now offset perpendicular to the route line (alternating sides) and drawn on top (high z-index) with a leader line / direction arrow, so measurements stay visible and aren't covered when poles are close together — applied to both the downloaded PNG and the interactive map. Fixed Leaflet divIcon default-box CSS (.leaflet-marker-icon.seg-label/.seg-arrow/.pole-route-marker -> transparent) and rebuilt the interactive label/arrow icons with proper iconSize/iconAnchor so the pill renders cleanly. Verified: Job Detail download works; close-pole labels readable in PNG (image analysis) and interactive ("51 ft" pill offset, not covering markers); pytest 19/19. Requires redeploy for production.
- Underground attributes feature (Jun 10, 2026): new map entity for underground items, separate from poles, each with its own GPS coordinates.
  - Backend: UNDERGROUND_TYPES (Handhole, Manhole, Brooks Enclosure, Flowerpot, Pedestal, Point of Intersection, FBT, NTE, FBT/NTE, PFP); Underground models; CRUD endpoints POST /api/underground, GET /api/jobs/{job_id}/underground, GET/PUT/DELETE /api/underground/{id}; options.underground_types. Excel: added "MAP IMAGE" direct-download link (.../map?download=1) alongside the existing MAP link, and an UNDERGROUND section listing Abbr/Type/Label/Lat/Long/Notes.
  - Frontend: Job Detail "Add Underground" dropdown (all 10 types, with abbreviations) -> /jobs/{jobId}/underground/add?type=...; new UndergroundForm.jsx (type, GPS map with pin/current-location/address-search, label, notes, photo); an Underground list section on Job Detail (edit/delete); abbreviation map in poleMapImage util (HH, MH, BE, FP, PED, PI, FBT, NTE, FBT/NTE, PFP). JobMap plots underground as amber square markers with the abbreviation (interactive + included in the downloadable PNG, factored into bounds/fit). JobMap auto-downloads when opened with ?download=1 (used by the Excel "Map Image" link).
  - Verified end-to-end: CRUD via curl; Add-Underground menu + form (type preselected, save) + list + edit/delete; amber HH/PI/MH markers on interactive map and in the PNG (image analysis confirms "2 UG" + amber markers); Excel has both map links + UNDERGROUND section; pytest 19/19. Requires redeploy for production.
- Map legend + Hoffman Box (Jun 10, 2026): added "Hoffman Box" (abbr HB) to UNDERGROUND_TYPES / UNDERGROUND_ABBR / Excel UG_ABBR (appears in the Add Underground dropdown). Added a LEGEND to both the interactive map (overlay, bottom-right) and the downloadable PNG (bottom-right box) showing red dot = Pole, amber square = Underground, and an abbreviation key for the underground types present in the job (e.g. "HB Hoffman Box", "HH Handhole"). Verified: menu shows HB; legend present on interactive map and confirmed in PNG via image analysis; pytest 19/19. Requires redeploy for production.
- Map PNG exhibit + export job# cleanup (Jun 10, 2026): (a) Downloadable pole-map PNG now includes a north arrow (top-right), a dynamic scale bar (bottom-left, nice-rounded feet), and a right-side "ROUTE SEGMENTS" table panel listing each segment (PoleA -> PoleB : ft) with a red TOTAL row — verified via image analysis. (b) Removed per-pole "JOB #" from both Excel exports; the job number now appears once in the top header row (sourced from the poles' shared job_number), alongside JOB NAME / LOCATION / POLES / MAP. Verified JOB # appears exactly once at top; pytest 19/19. Requires redeploy for production.
- Map color scheme + underground connectors (Jun 10, 2026): implemented color-differentiated map paths per user request:
  - **Poles**: RED markers (unchanged)
  - **Aerial path (pole-to-pole)**: BLUE lines with blue distance labels (was red)
  - **Underground items**: GREEN square markers (was amber)
  - **Underground connectors**: GREEN dashed lines from each underground item to its nearest pole, with green distance labels showing the footage (new feature)
  - Updated Legend to reflect the new colors: "Pole (Red)", "Aerial Path (Blue)", "Underground (Green)" + abbreviation key
  - Applied to both interactive Leaflet map (JobMap.jsx) and downloadable PNG (poleMapImage.js)
  - Example path visualization: HH --95ft--> Pole 1 ==249ft==> EXPORT-TEST ==94ft--> HB (where -- is green dashed, == is blue solid)
  - Added computeUgConnectors() function to find nearest pole for each underground item and compute connector geometry
  - Verified: interactive map shows all color-coded elements; download generates correct PNG. Requires redeploy for production.
- Backend refactoring (Jun 10, 2026): 
  - Refactored ~1,350-line server.py into modular structure:
    - `routes/` - auth.py, jobs.py, poles.py, underground.py, files.py, sync.py
    - `models/` - user.py, job.py, pole.py, underground.py, options.py
    - `services/` - auth.py, storage.py, helpers.py
  - Main server.py now ~130 lines (imports + startup + CORS)
  - All 19 pytest tests passing
  - API v2.0.0 with new /api/sync/* endpoints for offline support
- Offline PWA infrastructure (Jun 10, 2026):
  - Added Service Worker for static asset caching + API response caching
  - IndexedDB wrapper (offlineDb.js) for local storage of jobs, poles, underground
  - Sync service (syncService.js) with action queue for offline CRUD operations
  - React context (OfflineContext.jsx) for app-wide offline state
  - OfflineIndicator component shows Online/Offline status + pending sync count
  - OfflineBanner shows when offline with pending changes
  - Sync API endpoints: POST /api/sync/push (batch actions), GET /api/sync/pull (full/incremental data)
  - Manifest.json updated for PWA with white background
  - Ready for production testing

## Tech Stack
- Backend: FastAPI + MongoDB (modular: routes/, models/, services/)
- Frontend: React + Tailwind CSS + shadcn/ui
- Export: openpyxl for Excel generation
- Offline: Service Worker + IndexedDB + Background Sync

## Backend Architecture (Jun 10, 2026 refactor)
```
/app/backend/
├── server.py          # Main FastAPI app entry point (~130 lines)
├── routes/            # API endpoint handlers
│   ├── auth.py        # /api/auth/* (login, register, me)
│   ├── jobs.py        # /api/jobs/* (CRUD + Excel export)
│   ├── poles.py       # /api/poles/* (CRUD + gallery + options)
│   ├── underground.py # /api/underground/* + /api/jobs/{id}/underground
│   ├── files.py       # /api/upload-photo, /api/files/*, /api/maps/static
│   └── sync.py        # /api/sync/* (offline push/pull)
├── models/            # Pydantic schemas
│   ├── user.py, job.py, pole.py, underground.py
│   └── options.py     # Dropdown options constants
└── services/          # Business logic
    ├── auth.py        # Password hashing, JWT, get_current_user
    ├── storage.py     # Object storage (Emergent)
    └── helpers.py     # format_height, pole_sort_key, pole_photo_items
```

## Offline PWA Architecture (Jun 10, 2026)
```
/app/frontend/
├── public/
│   ├── service-worker.js   # Caching + background sync
│   └── manifest.json       # PWA manifest
└── src/
    ├── lib/
    │   ├── offlineDb.js    # IndexedDB wrapper for local storage
    │   ├── syncService.js  # Queue actions, push/pull sync
    │   └── OfflineContext.jsx # React context for offline state
    └── components/
        └── OfflineIndicator.jsx # Online/offline badge + sync button
```

**Offline Capabilities:**
- Jobs, poles, underground items cached locally in IndexedDB
- CRUD operations work offline with queued sync
- Background sync when back online
- Conflict resolution: server wins, client retries
- Service worker caches static assets + API responses

## Prioritized Backlog
### P0 (Critical) - COMPLETED
- All core functionality implemented
- Backend refactoring (routes/models/services) ✅
- Offline PWA infrastructure ✅

### P1 (High Priority) - Future
- Bulk import from Excel
- Full offline CRUD testing in production

### P2 (Medium Priority) - Future
- Multiple photos per pole
- Data validation rules
- Audit trail for changes

## Next Tasks
1. Test offline mode in production (requires deploy + testing on mobile device)
2. Add bulk import capability from Excel
3. Verify offline sync with new sort_order field
4. Add visual conflict indicator when sync fails

## Session Update (Jun 10, 2026 continued)
- Next/Previous pole navigation (Jun 10, 2026): Added navigation controls to both ViewPole and EditPole pages allowing users to quickly cycle through poles within a job without returning to the Job Detail page.
  - Navigation bar appears at top when a job has 2+ poles
  - Shows "Previous" button (with pole number), "Pole X of Y" counter, "Next" button (with pole number)
  - Buttons disabled at ends (first/last pole)
  - ViewPole navigates to /view/{id}, EditPole navigates to /edit/{id}
  - Poles fetched via /jobs/{jobId}/poles?_t={timestamp} to ensure fresh data
  - Verified: Navigation bar renders correctly on both pages, clicking Next/Previous works correctly, button states update appropriately. Requires redeploy for production.
- Fixed: Dropdown values not loading when navigating between poles (Jun 10, 2026): When using Next/Previous navigation to move between poles in edit mode, dropdown fields were showing placeholders instead of the pole's saved values. Root cause: The form data was being populated before the dropdown options were loaded from the API, causing Radix Select components to not match values to SelectItems. Fix: (1) Added `key={id}` to PoleForm in EditPole to force remount on navigation. (2) Modified PoleForm's initialPole useEffect to wait for options to load before populating form data. (3) Added state reset (setFetching(true), setPole(null)) in EditPole/ViewPole when id changes. Verified: Navigating between poles now correctly loads all dropdown values. Requires redeploy for production.
- Excel export now includes GPS-calculated distances (Jun 10, 2026): Added GPS-calculated route distances to the Excel export to match what the map displays.
  - New "GPS-CALCULATED ROUTE (Aerial Path)" section at the top of the export showing:
    - From Pole → To Pole → Distance (ft) for each consecutive pole pair
    - TOTAL footage of the entire route (highlighted in red)
    - Note listing any poles missing GPS coordinates
  - Each pole's "GPS LOCATION" section now includes "Distance to Next Pole (GPS)" showing the haversine-calculated footage to the next pole in the route
  - Uses same haversine formula as the map for consistency
  - Added helper functions to services/helpers.py: haversine_feet(), has_gps(), compute_route_segments()
  - Verified: Excel export shows 248.9 ft matching map's 249 ft display. Requires redeploy for production.
- Added 600ft segmented map download (Jun 10, 2026): Map download now offers two options via dropdown menu:
  - **Single Image**: Full map in one file (original behavior)
  - **600ft Segments (ZIP)**: Generates multiple pages split at ~600ft intervals, each numbered "Page X of Y" with segment info (start pole → end pole, footage). Downloads as ZIP file.
  - Each page includes: Blue header with page number/segment info, satellite imagery, route lines, distance labels, pole markers, underground items, footer with segment summary
  - For routes under 600ft, falls back to single image download
  - Added JSZip dependency for ZIP generation
  - Added downloadSegmentedMapPages() function in poleMapImage.js
  - Added dropdown menu UI in JobMap.jsx
  - Requires redeploy for production.
- Fixed Excel export and synced map distances to pole spans (Jun 10, 2026):
  - Removed GPS-CALCULATED ROUTE section from Excel export (user requested)
  - Removed "Distance to Next Pole (GPS)" from GPS LOCATION section
  - Created new endpoint POST /api/jobs/{job_id}/sync-map-distances that:
    - Calculates GPS distances between consecutive poles (same as map)
    - Updates span1_distance/span1_direction with distance/bearing to NEXT pole
    - Updates span2_distance/span2_direction with distance/bearing to PREVIOUS pole
  - Synced A050ABC job: Pole 1 now has span1=249ft S, Pole EXPORT-TEST has span2=249ft N
  - Excel export now shows these synced values in the SPANS section
  - **Automatic sync**: Pole create/update now auto-syncs distances for all poles in the job
  - **Manual sync button**: Added "Sync Distances" button (blue) in Job Detail page
  - Requires redeploy for production.
- Simplified pole display and map markers (Jun 10, 2026):
  - **Job Detail page**: Pole list now only shows Size, Class, and GPS indicator (removed Owner, Type, Access)
  - **Map poles**: Changed from large pill-shaped markers to small red dots (12px) with labels on the side
  - **Clustered poles**: When poles are within 100ft of each other, labels are moved away with red arrows pointing to their dots
  - **Non-clustered poles**: Labels alternate left/right to avoid overlap
  - Applied same styling to downloadable map images (single and segmented)
  - Requires redeploy for production.
- Reference Height Measurement Tool (Jun 10, 2026):
  - **Replaced AI analyzer** with simpler, more accurate reference object method
  - **How it works**: User places a known-height object (measuring stick, 6ft pole, etc.) at pole base
  - User takes photo, then taps: 1) bottom of reference, 2) top of reference, 3) each attachment
  - App calculates pixel-to-foot ratio from reference object and measures all marked attachments
  - **Features**: Reference height selection (4-12ft), interactive canvas for marking, real-time height calculations
  - **Output**: Creates annotated image with all measurements drawn and uploads to first HOA entry's photo field
  - Works on any phone with camera - no AI/internet required for calculations
  - Requires redeploy for production.

## Session Update (Jun 11, 2026)
- Pole Reordering Feature (Jun 11, 2026):
  - Added `sort_order` field to Pole model for custom ordering
  - New PUT /api/poles/reorder endpoint to batch update sort_order values
  - JobDetail page now has "Reorder" button that enters reorder mode
  - Reorder mode shows up/down arrows for each pole, Cancel and Save Order buttons
  - Save Order calls backend API to persist the custom order
  - Frontend `sortPoles()` function respects sort_order when set, falls back to natural pole_number sort
  - Both map routes and Excel exports use the custom order when set
  - Requires redeploy for production.

- Photos ZIP Download (Jun 11, 2026):
  - New GET /api/jobs/{job_id}/export/photos-zip endpoint
  - Downloads all photos from a job as a ZIP file organized by pole
  - Each photo is labeled with pole number and photo type (e.g., Pole_P-1_OCALC_Left.jpg)
  - Photos ZIP button added to JobDetail page toolbar (purple styling)
  - Requires authentication
  - Requires redeploy for production.

- Map ZIP Download with Measurement List (Jun 11, 2026):
  - Updated downloadSegmentedMapPages() to always generate a ZIP file (no single-image fallback)
  - ZIP contains: map segment pages (800ft chunks) + separate measurement list image
  - New generateMeasurementListImage() function creates a standalone PNG with:
    - All route segments listed (From Pole → To Pole: distance)
    - Riser measurements interspersed
    - Total risers row (if applicable)
    - Grand total row
  - Measurement list image named "00_measurement_list.png" for sorting first in ZIP
  - Map ZIP button added to JobDetail page toolbar (green styling)
  - Works consistently regardless of route length (no more single-image shortcut)
  - Requires redeploy for production.

- Bug Fixes (Jun 11, 2026):
  - Fixed backend crash: Added missing Depends and get_current_user imports to poles.py
  - Fixed route shadowing: Moved /poles/reorder endpoint before parameterized /poles/{pole_id} routes
  - Added sort_order to PoleUpdate model to allow persistence
  - Requires redeploy for production.

## Session Update (Jun 12, 2026)
- Drag-and-Drop Pole Reordering (Jun 12, 2026):
  - Replaced up/down arrow buttons with drag-and-drop interface using @dnd-kit
  - SortablePoleItem component with grip handles for intuitive dragging
  - Maintained Save Order and Cancel buttons
  - Added "Save & Sync All" button (blue) that saves order AND recalculates all span distances from GPS
  - Requires redeploy for production.

- Simplified JobDetail Title Bar (Jun 12, 2026):
  - Removed: Map Image, Photos ZIP, Map ZIP, Sync Distances buttons
  - Kept: Map, Export, Add Pole, Add Underground
  - Per-pole Photo ZIP and Map links moved to Excel export
  - Sync Distances button moved to per-pole cards
  - Requires redeploy for production.

- Per-Pole Sync Distances (Jun 12, 2026):
  - Added Sync Distances button (blue refresh icon) to each pole card in JobDetail
  - Added Sync Dist button to ViewPole page header
  - Added Sync Dist button to EditPole page header (PoleForm)
  - New endpoint POST /api/poles/{pole_id}/sync-distances syncs only that pole
  - Requires redeploy for production.

- Interactive Map Screenshot (Jun 12, 2026):
  - Added Screenshot button (purple camera icon) to JobMap page header
  - Uses html2canvas to capture only the visible map frame
  - Downloads as PNG file named {job_name}_screenshot.png
  - Requires redeploy for production.

- Excel Export Enhancements (Jun 12, 2026):
  - Added per-pole "Photos ZIP" hyperlink (purple text) that downloads pole's photos as ZIP
  - Added per-pole "View Map" hyperlink for each pole row
  - Added "View Map" hyperlink for each underground item row
  - New endpoint GET /api/poles/{pole_id}/photos-zip for single-pole photo ZIP
  - Requires redeploy for production.

- Additional Photos Feature (Jun 12, 2026):
  - Added `additional_photos` field to Pole model - array of objects with `label` (optional) and `photo` (URL)
  - Users can now add unlimited extra photos per pole (beyond the fixed OCALC Left/Middle/Right slots)
  - PoleForm.jsx: New "Additional Photos" section with cyan accent, "Add Photo" button to add rows
  - Each row has optional label input and photo upload, plus trash icon to remove
  - ViewPole.jsx displays additional photos in a grid after OCALC Photos
  - HTML galleries (pole_photo_items helper) now include additional photos with fallback label "Additional N"
  - Offline sync (localStorage draft) supports the new array
  - Verified: Backend CRUD, gallery HTML, frontend add/remove flow all working
  - Requires redeploy for production.

- Multi-Photo & Combined Ordering Overhaul (Jun 12, 2026):
  - **REMOVED Additional Photos section** - per user request
  - **Multi-Photo Fields**: Converted to arrays: birthmark_photos, mgnv_photos, Knuckle.photos, Attachment.photos, Underground.photos
  - OCALC Left/Middle/Right remain as single-photo fields (unchanged)
  - **New MultiPhotoUpload Component**: Shows camera/upload buttons, mini gallery of added photos, allows unlimited photos per field
  - **Multiple File Selection**: Users can now select multiple files at once in the file picker
  - **Combined Items Ordering**: Job Detail now shows poles and underground in a single unified list
  - Header shows "Poles & Underground (X poles, Y UG)"
  - Single Reorder button enables drag-and-drop for BOTH poles and underground together
  - New endpoint PUT /api/jobs/{job_id}/reorder-items handles both types with sort_order
  - Underground model now has sort_order field
  - services/helpers.py pole_photo_items supports legacy single-photo fallback
  - Requires redeploy for production.

- ASE Site Walk Survey & Job Types (Jun 12, 2026):
  - **ASE Form**: New page at /jobs/{jobId}/ase with 70+ fields organized by sections:
    - Employee Info, Address Information, Access/Customer Information
    - Building Characteristics, Fiber Attributes, NTE Equipment Attributes
    - Path of Approach/Measurements, EF Offer/Requirements, EF Requirements Detail
    - Site Requirements, Additional Information
  - **ASE Export**: Exports ASE form data to Excel with same layout as provided template
  - **ASE Form Button**: Blue button on Job Detail page between OCALC Export and Add Pole
  - **SVCL/FS Job Type**: New job type option in Create/Edit Job dialogs
  - Job model updated with job_type field (default: OCALC) and ase_data (dict)
  - Backend endpoints: PUT/GET /api/jobs/{id}/ase-data, GET /api/jobs/{id}/export/ase
  - Requires redeploy for production.

- ASE Form Complete Integration (Jun 12, 2026):
  - **All Dropdown Options**: Integrated complete dropdown options from the uploaded ASE Excel template:
    - Occupancy Types (14 options), Equipment Environment (AC/DC/AC DUAL/DC DUAL)
    - Equipment Mounting (OUTSIDE WALL MOUNT, INSIDE WALL MOUNT, DESK MOUNT, RACK, PEDESTAL)
    - Fiber Terminal Placement (Terminal, Elsewhere, POLE), Mounting Wall (Wall, EXISTING, NEW)
    - Site Readiness, EF Conduit Length (UNDER/OVER 1000'), EF Requirements (IN PLACE, NEEDED)
    - Proposed Equipment (CIENA 3903X OR EQUIVALENT, RAD, N/A), and more
  - **Visual Feedback**: Green background/border for filled fields, Amber/Yellow for unfilled
  - **Section Counters**: Each section header shows "X/Y filled" count
  - **Auto-Population from Job Data**:
    - Address field auto-filled from job.location
    - POLE LINE START/END from first/last pole GPS coordinates
    - Fiber Terminal LAT/LONG from FBT/FBT-NTE underground markers
    - NTE LAT/LONG from NTE/FBT-NTE underground markers
    - SOC START/END from SOC Start/SOC End underground markers
  - **14 Complete Sections**: Employee Info, Address, Access/Customer, BIDI Retrofit, Building Characteristics, Fiber Attributes, NTE Equipment Attributes, Path of Approach, EF Offer/Requirements, EF Requirements Detail, Site Requirements, Multi Tenant Eligibility, Additional Information, Multiple MPOE/Terminal
  - **Excel Export**: Updated to include all new fields with green/yellow cell coloring for filled/unfilled values
  - Backend pytest 6/6, Frontend testing 100%
  - Requires redeploy for production.

## Session Update (Jun 12, 2026 continued - ASE Form Reorganization)
- **ASE Form 3-Tab Structure (Jun 12, 2026)**: Reorganized the ASE Site Walk Survey form into 3 tabs to match the user's Excel template:
  - Tab 1: ASE Cklist - Employee Info, Address, Access/Customer, Building Characteristics, BIDI Retrofit, Mark Ups
  - Tab 2: Coordinator Input - Fiber Attributes, NTE Equipment Attributes, Path of Approach, EF Offer/Requirements, EF Requirements Detail
  - Tab 3: SVCL Output - Site Requirements, Multi Tenant Eligibility, Additional Information, Multiple MPOE/Terminal
  - Used shadcn Tabs component with icons (ClipboardList, Users, FileOutput)
  - Added accessibility improvements: aria-hidden on visual-only labels, sr-only text for screen readers
  - Added data-testids for tabs: tab-ase-checklist, tab-coordinator-input, tab-svcl-output
  - Requires redeploy for production.

- **Dropdown Options Updated (Jun 12, 2026)**:
  - Added "HOFFMAN BOX" and "H-FRAME" to Equipment Mounting dropdown
  - Added "HOFFMAN BOX" and "H-FRAME" to Fiber Terminal Placement dropdown
  - Requires redeploy for production.

- **Photo Markup Editor Legend (Jun 12, 2026)**: Added a legend feature to the in-app photo markup editor:
  - "Show Legend" / "Hide Legend" toggle button in the toolbar
  - Legend overlay displays in bottom-right corner when enabled
  - Shows all annotation types with counts: markers (with colors), shapes, freehand drawings, text annotations
  - Added data-testids: toggle-legend-btn, photo-markup-legend
  - Requires redeploy for production.

- **Map Measurement Arrow (Jun 12, 2026)**: The orange dotted arrow for map measurements was already implemented in EditableRoute.jsx:
  - Distance labels are offset perpendicular to the span line (25px)
  - Orange dotted polyline (#f97316) connects the label to the actual line midpoint
  - Orange circle marker at the line midpoint for visual clarity
  - Verified working on the interactive map

- **ASE Form Auto-Populate (Jun 12, 2026)**: Implemented comprehensive auto-populate from job items:
  - Address from job.location
  - POLE LINE START/END Lat/Long from first/last pole GPS coordinates
  - Starting FH/MH/POLE Tie-in Measurements from first pole span data
  - Path of Approach Description auto-generated from underground items list (e.g., "Handhole (HH-1) → Hoffman Box (HB-1)")
  - Proposed Location from job address
  - Proposed Pole and Building shows pole numbers from the job
  - FBT/NTE/SOC/MPOE/PFP/Riser coordinates auto-filled when markers exist
  - Equipment detection: Hoffman Box sets need_hoffman_box=Yes, Pedestal sets equipment_mounting
  - Distance calculation between FBT and NTE when both exist
  - Co-located FBT/NTE detection sets nte_at_terminal="Terminal"
  - Requires redeploy for production.

- **ASE Form EXACT Excel Match (Jun 12, 2026)**: Completely rewrote ASE Form to match the uploaded ASE CHECKLIST EXCEL file exactly:
  - **Tab 1 - ASE CKLIST**: 11 sections matching Excel rows exactly:
    - Employee Info (with dropdown of 11 employees from SOURCE sheet)
    - Address (Address, MPOE Address, Suite &/or Bldg #)
    - BIDI RETROFIT (5 fields)
    - ACCESS/CUSTOMER INFORMATION (4 fields)
    - BUILDING CHARACTERISTICS (6 fields)
    - FIBER ATTRIBUTES (13 fields)
    - NTE – EQUIPMENT ATTRIBUTES (16 fields)
    - EF OFFER (7 fields)
    - EF REQUIREMENTS (11-row table with YES/NO + QTTY columns)
    - ADDITIONAL INFO (16 fields)
    - MARK UPS (Photo editor)
  - **Tab 2 - Coordinator Input**: Exactly 5 fields matching Excel:
    - AT&T Engineer, Nearest Fiber FID if Missing, FBT FID if Missing, Possible Permits, Additional SOW notes
  - **Tab 3 - SVCL Output**: 6 sections with calculated/output fields:
    - Site & Order (Building Contact, Email, SOW Notes)
    - Site Visit (Date, Type, Qualified Equipment, Occupancy, Multi-Tenant, Tenants, Floors, Demarcation)
    - Fiber Attributes (INC, Terminal, Location, Floor, Aisle, Bay, Shelf)
    - NTE Equipment Attributes (Environment, Location, Mounting, Power, Floor, Aisle, Bay, Shelf)
    - Multi Tenant Eligibility (MTEI) (6 fields)
    - Site Requirements (Site Readiness, EF Qualified, Customer Aware, End User Acceptance, etc.)
  - All dropdown options extracted from Excel SOURCE and data sheets
  - SVCL Output fields guard against empty source values
  - Requires redeploy for production.

- **ASE Form Photo Enhancements (Jun 12, 2026)**:
  - Added "HOFFMAN BOX" to NTE Placement and Fiber Terminal Placement dropdowns
  - Added photo upload sections to Address, ACCESS/CUSTOMER INFORMATION, and BUILDING CHARACTERISTICS sections
  - Auto-attach photos from job items to corresponding ASE fields:
    - SOC Start/End photos from underground markers with those types
    - Pole Line Start/End photos from first/last poles
    - FBT/NTE/MPOE photos from underground markers
  - **Mark Ups Gallery now auto-populates with ALL job photos**:
    - Collects photos from all poles (main, birthmark, MGNV, anchor, HOA photos)
    - Collects photos from all underground items
    - Removes duplicates and displays in Mark Ups section for annotation
  - Requires redeploy for production.

- **Pole Form HOA Mark Ups (Jun 12, 2026)**:
  - Added PhotoMarkupEditor to pole edit form for HOA (Height of Attachment) photos
  - New `hoa_markup_photos` field in pole data model
  - Users can upload pole photos and add annotations: lines, shapes, text, measurement markers
  - Same editing capabilities as ASE Site Walk Survey form
  - Requires redeploy for production.

- **Offline Sync Verification (Jun 12, 2026)**:
  - Verified offline sync infrastructure is working:
    - IndexedDB stores jobs, poles, underground items locally
    - Sync queue handles pending changes when offline
    - Push/Pull sync endpoints working correctly
    - All photo arrays (birthmark_photos, mgnv_photos, hoa_photos, hoa_markup_photos, photos) are synced
  - Tested sync pull endpoint: returns all jobs, poles, underground items
  - Multi-photo payloads are handled by existing sync infrastructure

- **ASEForm.jsx Refactoring (Jun 12, 2026)**:
  - Refactored ASEForm.jsx from 1339 lines into modular sub-components for maintainability
  - Created `/app/frontend/src/components/ase/` directory with:
    - `ASEFormConstants.js` (262 lines): All dropdown options (ASE_OPTIONS) and initial form state (INITIAL_FORM_DATA)
    - `ASEFormHelpers.jsx` (82 lines): Shared UI components (Section, StyledInput, StyledTextarea, DropdownSelect, YesNoSelect, FieldRow, isFilled)
    - `ASEChecklistTab.jsx` (415 lines): Tab 1 - ASE CKLIST with 11 sections (Employee Info, Address, BIDI Retrofit, Access/Customer Info, Building Characteristics, Fiber Attributes, NTE Equipment Attributes, EF Offer, EF Requirements, Additional Info, Mark Ups)
    - `ASECoordinatorTab.jsx` (29 lines): Tab 2 - Coordinator Input with single section
    - `ASESVCLOutputTab.jsx` (175 lines): Tab 3 - SVCL Output with 6 sections (Site & Order, Site Visit, Fiber Attributes, NTE Equipment Attributes, Multi Tenant Eligibility, Site Requirements)
    - `index.js` (6 lines): Clean centralized exports
  - Main `ASEForm.jsx` reduced to 417 lines (orchestrator with state, fetch logic, header, and tab wrapper)
  - Total lines: 1386 (same functionality, well-organized and maintainable)
  - All existing functionality preserved: 3-tab structure, auto-population from job items, photo uploads, save/export, map button
  - Verified: Frontend build passes, all tabs render correctly, form fields work as expected

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- Bulk import from Excel
- Photo ZIP download for all job photos (labeled, with markups) - Requested by user

### P2 (Medium Priority)
- Refactor PoleForm.jsx (1100+ lines) and JobMap.jsx (700+ lines) into smaller components
- Refactor PhotoMarkupEditor.jsx (1133+ lines) into sub-components
- Replace native date input in ASE Form with shadcn Calendar for UX consistency
- Add "Re-pull from job data" button in ASE form for manual refresh after editing poles/underground in another tab

### P3 (Low Priority/Future)
- localStorage -> httpOnly cookie migration for auth
- ASEData Pydantic model for better validation

---

## Session Update (Jun 13, 2026)

### ASE Export Data Fix
- **Fixed ASE data not transferring to export**: The backend was incorrectly parsing the request body structure
- Backend `/api/jobs/{job_id}/ase-data` endpoint now handles both `{ ase_data: {...} }` wrapper and direct object formats
- Frontend handleExport now explicitly saves before export and includes error handling
- Verified: Data saved via API is correctly retrieved and exported to Excel

### Photo Loading in Markups Fix
- **Fixed photos not loading in PhotoMarkupEditor**: Added `getPhotoUrl()` helper function to handle:
  - Full URLs (http/https)
  - Data URLs (base64)
  - Relative API paths (prepends origin)
- Added error handling for image load failures with fallback placeholder
- Added lightbox functionality using the proper URL helper

### Photo Markup Tab Added to Job Detail Page
- **New Feature**: Added collapsible "PHOTO MARKUP" section at the top of Job Detail page
- Features:
  - Expand/collapse toggle with photo count
  - Photo upload and markup editor
  - Saves markup photos to job's ASE data
  - Visual consistency with existing UI

### Underground Attributes in Markup Page
- **New Feature**: Added collapsible "UNDERGROUND ATTRIBUTES" section to markup pages
- Features:
  - Expand/collapse toggle showing count of items
  - Each underground item shows: type, label, GPS status, coordinates, notes
  - Type displayed with abbreviated badge (HH, MH, BE, FP, HB, PED, etc.)
  - Photo thumbnails if available

### Poles Section in Markup Page
- **New Feature**: Added collapsible "POLES" section to markup pages
- Features:
  - Expand/collapse toggle showing count of poles
  - Each pole shows: number, GPS status, owner, size, class, condition
  - Photo thumbnails if available

### Load All Job Photos Button
- **New Feature**: Added "Load All Job Photos (X)" button to markup sections
- Collects all photos from poles and underground items and adds them to the markup gallery
- Deduplicates photos automatically

### New Files Created
- `/app/frontend/src/components/MarkupTab.jsx` - Reusable markup component with poles/underground attributes

### Files Modified
- `/app/backend/routes/jobs.py` - Fixed ASE data save endpoint to handle both request body formats
- `/app/frontend/src/pages/ASEForm.jsx` - Improved export with save confirmation and error handling
- `/app/frontend/src/pages/JobDetail.jsx` - Added Photo Markup section with expand/collapse
- `/app/frontend/src/components/PhotoMarkupEditor.jsx` - Fixed photo URL handling
- `/app/frontend/src/components/ase/ASEChecklistTab.jsx` - Integrated MarkupTab with underground/poles

### Verified
- ASE data saves correctly via API
- ASE data exports to Excel with 3 tabs (ASE CKLIST, Coordinator Input, SVCL Output)
- Photo Markup section on Job Detail page works
- Underground Attributes section expands/collapses with item details
- Poles section expands/collapses with pole details

### Requires Redeploy
Changes require redeploy to production (https://poledatasheet.info) to be visible.

## Session Update (Jun 15, 2026)

### PhotoMarkupEditor in PoleForm - General Pole Photos
- **New Feature**: Added "Pole Mark Ups" section to PoleForm.jsx for general pole photo annotations
- Located between "OCALC Photos" and "Down Guys" sections
- Uses PhotoMarkupEditor component for full annotation capabilities:
  - Drawing tools: freehand, straight line, multi-point polyline
  - Shape tools: rectangle, circle, arrow, line, triangle
  - Marker tools: underground type markers with station numbers
  - Label tools: insertable text labels with size adjustment
  - Icon tools: underground attribute icons with size/color pickers
  - Text tools: text boxes with white background and color adjustment
- Added `pole_markup_photos` field to Pole model (PoleBase and PoleUpdate)
- Integrated into services/helpers.py pole_photo_items() for ZIP export

### Photo ZIP Download Button
- **New Feature**: Added "Photos" download button to JobDetail page header
- Green themed button positioned between "OCALC Export" and "ASE Form"
- Downloads all job photos (poles + underground) as a labeled ZIP file
- Backend endpoint: GET /api/jobs/{job_id}/export/photos-zip
- ZIP structure:
  - `Poles/{pole_number}/{label}.jpeg` - All pole photos organized by pole
  - `Underground/{type_label}/{photo}.jpeg` - All underground photos
- Access control: admin users, mastec/byers/mastecbyers domain users, or job owners

### PhotoMarkupEditor for ALL Photo Sections (Jun 15, 2026)
- **Feature Enhancement**: Replaced ALL photo upload components with PhotoMarkupEditor
- Now every tab/section that allows taking a picture can use the full markup editor
- **PoleForm.jsx changes**:
  - Birthmark Photos: MultiPhotoUpload → PhotoMarkupEditor
  - MGNV Photos: MultiPhotoUpload → PhotoMarkupEditor
  - HOA Attachment Photos (per row): MultiPhotoUpload → PhotoMarkupEditor
  - Anchor Photos (per row): MultiPhotoUpload → PhotoMarkupEditor
  - OCALC Photos (Left, Middle, Right): PhotoUpload → PhotoMarkupEditor (single photo mode)
  - HOA Mark Ups: Already using PhotoMarkupEditor
  - Pole Mark Ups: Already using PhotoMarkupEditor
- **UndergroundForm.jsx**: Already using PhotoMarkupEditor
- **ASEPhotoField.jsx**: Updated to include markup editing capability
  - Camera button for quick photo upload
  - New "Edit with Markup" button opens full PhotoMarkupEditor in dialog
  - Works in both compact and expanded modes
- Removed unused imports (PhotoUpload, MultiPhotoUpload from PoleForm.jsx)

### Files Modified
- `/app/frontend/src/components/PoleForm.jsx` - Replaced all photo components with PhotoMarkupEditor
- `/app/frontend/src/components/ASEPhotoField.jsx` - Added markup editor integration
- `/app/frontend/src/pages/JobDetail.jsx` - Added Photos download button
- `/app/backend/routes/jobs.py` - Updated photo ZIP export with underground support
- `/app/backend/services/helpers.py` - Added underground_photo_items, updated pole_photo_items
- `/app/backend/models/pole.py` - Added pole_markup_photos field

### PhotoMarkupEditor Refactoring (Partial)
- Created `/app/frontend/src/components/markup/` directory structure:
  - `MarkupConstants.js` - UG_MARKERS, LINE_COLORS, SHAPES, helper functions
  - `MarkupToolbar.jsx` - Tool selection panels (extracted from main component)
  - `MarkupCanvas.jsx` - Canvas rendering area with legend overlay
  - `MarkupPhotoGallery.jsx` - Photo grid with upload controls
  - `index.js` - Centralized exports
- Main PhotoMarkupEditor.jsx still functional (sub-components ready for future integration)

### Verified
- Pole Mark Ups section renders correctly in PoleForm
- All photo sections now have PhotoMarkupEditor with Camera/Upload buttons
- OCALC Photos show Left, Middle, Right with individual markup editors
- Birthmark, MGNV, HOA, and Anchor photos all have markup capability
- ASEPhotoField shows edit button when photos exist

### Requires Redeploy
Changes require redeploy to production (https://poledatasheet.info) to be visible.

## Session Update (Jun 15, 2026) - Pole Form Reorganization

### Station Numbers Display
- Added station number calculation to JobDetail.jsx
- Station numbers now show on each pole and underground item in the job list
- Format: `0+00`, `1+50`, etc. (stations + feet)
- Blue badge for poles, green badge for underground items

### PoleForm Reorganization
- **Moved Birthmark & MGNV** section directly under Basic Information
- **Removed Pole Mark Ups** section (as requested)
- **Added R.O.W. Information** notes box between Anchor and Notes sections
- **Simplified Birthmark Photos** to use MultiPhotoUpload (camera/gallery buttons) instead of full PhotoMarkupEditor

### EF Disqualification Dropdown Update
- Added "OVER 1000FT" option to EF Disqualification Reason dropdown in ASE Form
- Full list now: CONSTRUCTION, REMODEL, CWOTS, CONSTRUCTION TRAILER, CELL SITE, OVER 1000FT, N/A

### Backend Model Updates
- Added `row_information: Optional[str]` field to Pole model (PoleBase and PoleUpdate)
- Field persists R.O.W. Information notes for each pole

### Files Modified
- `/app/frontend/src/components/PoleForm.jsx` - Form reorganization, simplified birthmark photos
- `/app/frontend/src/pages/JobDetail.jsx` - Added station number calculation and display
- `/app/frontend/src/components/ase/ASEFormConstants.js` - Added OVER 1000FT option
- `/app/backend/models/pole.py` - Added row_information field

### Verified
- Birthmark & MGNV section now appears right after Basic Information
- R.O.W. Information textarea visible at bottom of form (before Notes)
- Station numbers display on pole/UG cards in job list
- EF Disqualification dropdown includes all 7 options

### Requires Redeploy
Changes require redeploy to production (https://poledatasheet.info) to be visible.


## Session Update (Jun 15, 2026) - Photo Editor & Dropdown Updates

### Photo Upload/Editor Reorganization
- **Down Guys**: Added PhotoMarkupEditor with camera/upload for each down guy row
- **Anchor**: REMOVED photos from anchor rows (per user request)
- **HOA**: REMOVED photos from HOA rows (photos still available in HOA Mark Ups section)
- **Birthmark**: Camera/Gallery upload buttons confirmed working

### Dropdown Updates
**Pole Owner** - Added new options:
- (CNP) Centerpoint
- Bluebonnet Electric Coop.
- San Bernard Electric Coop.
- City Owned
- (TNMP) Texas-New Mexico Power
- AEP Texas
- Oncor Energy
- Lubbock Power + Light
- Entergy Texas

**Access** - Added new option:
- No / Side Easement (now has 5 total options)

### Label Updates
- **Spans**: Changed "Owner" label to "Attachment Owner"

### Map Station Numbers (Smart Tags)
- Station numbers moved from Job Page list to Interactive Map only
- Implemented offset smart tags with connecting lines:
  - Poles: Purple connecting line to offset label showing pole number + station
  - Underground: Color-coded (red/green) connecting line to offset label showing type + station
- Labels show: Item identifier + station number (e.g., "P-1 / 0+00")

### Backend Model Updates
- Added photos array to down_guy data structure (emptyDownGuy)
- Removed photos from anchor and HOA attachment rows
- Updated POLE_OWNERS in `/app/backend/models/options.py` with 11 total options

### Files Modified
- `/app/frontend/src/components/PoleForm.jsx` - Photo placement changes, dropdown label updates
- `/app/frontend/src/pages/JobDetail.jsx` - Removed station numbers from item display
- `/app/frontend/src/pages/JobMap.jsx` - Added smart tag station labels with offset lines
- `/app/backend/models/options.py` - Added new pole owners

### Requires Redeploy
Changes require redeploy to production (https://poledatasheet.info) to be visible.


## Session Update (Jun 15, 2026) - Path of Approach Directions

### Path of Approach Enhancement
- Added compass direction calculation between consecutive items
- Direction is computed using GPS bearing between two points
- Converts bearing to 8-point compass (North, Northeast, East, Southeast, South, Southwest, West, Northwest)

**Example format:**
- `HH1 0+00 North` - Underground item at station 0+00, heading North
- `aerial P1 0+69 Northeast` - First pole, heading Northeast  
- `P1 to P2 North 3+50` - From P1 to P2, heading North, at station 3+50

### Technical Implementation
- `calculateBearing(lat1, lng1, lat2, lng2)` - Calculates compass bearing in degrees
- `bearingToDirection(bearing)` - Converts bearing to 8-point compass direction
- Directions calculated between consecutive items in sort order

### Files Modified
- `/app/frontend/src/pages/ASEForm.jsx` - Added direction calculation to path of approach

### Requires Redeploy
Changes require redeploy to production (https://poledatasheet.info) to be visible.
