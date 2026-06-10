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
3. Add visual conflict indicator when sync fails

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
