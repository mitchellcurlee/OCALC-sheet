# PRD — Pole Data Collection App

## Original Problem Statement
Full-stack React/FastAPI app for power pole field data collection: dynamic pole/underground forms, photo uploads, interactive GPS mapping, Excel export, offline-first support, combined ordering for poles + underground items, and in-app Photo Markup Editor.

## Core Requirements
- Jobs contain Poles (aerial attributes) and Underground items, combined ordering.
- Photo capture per attribute (OCALC L/M/R, Birthmark, MGNV, Anchor, HOA, UG photos) with markup editor.
- Excel export per job with map links and photo access.
- Photo access model (updated June 2026, per user request):
  - Excel contains a single "{JobName} - All Photos" browser gallery link (header) plus per-item "View Photos (n)" links that deep-link (#pole-{id} / #ug-{id}) into the same gallery.
  - Gallery page (`GET /api/jobs/{job_id}/photos`, HTML) organizes photos by their respective item: one section per pole and per underground item.
  - Gallery header has "Download all photos (ZIP)" button hitting `/api/jobs/{id}/export/photos-zip?token=...` (ZIP_STORED, Windows-compatible).
  - In-app "Photos" button on Job Detail opens this same gallery in the browser (user-requested change; previously blob ZIP download).
- ZIP structure: {JobName}/Poles/Pole_{n}/{PhotoType}.jpeg and {JobName}/Underground/{Type}_{Label}/...

## Implemented (history)
- 2026-06 (this session): Reworked photo delivery per user example "A05E7MR - All Photos":
  - Gallery now includes UNDERGROUND sections (was poles only), with section anchors.
  - Excel per-item photo cells replaced individual token links (which caused "Invalid or expired" issues) with gallery deep links.
  - "All Photos" Excel header link renamed to "{JobName} - All Photos".
  - Gallery "Download all" now serves ZIP via tokened endpoint (previously per-file JS anchor downloads).
  - Frontend `handleDownloadPhotos` opens gallery (window.open) instead of blob ZIP.
  - Verified via curl (Excel hyperlinks, gallery HTML, ZIP 200 application/zip + valid namelist) and screenshot.
- Prior sessions: Underground form payload fix (material_type, tie_in_measurements), terminology updates (Add Attribute, OCALC/JOB Export), ZIP_STORED compat, photo labeling with job name, token relaxation on photo routes.

## Known Notes
- PRODUCTION = https://poletracker.emergent.host — user must REDEPLOY to see fixes. Always clarify environment on bug reports.
- Seed job A050ABC (e5dc0bae-...) has a 286-byte invalid UG seed photo that renders broken in browser (data issue, not code).
- Individual photo endpoints (`/api/poles/{id}/photo/{label}`, `/api/underground/{id}/photo/{label}`) still exist but are no longer linked from Excel.

## 2026-06 Session Updates (continued)
- Added "Concrete" to Handhole material/type dropdown (UndergroundForm.jsx).
- FIXED user-reported bug "item moving tool on interactive map not working":
  - Root cause 1: old "Move Items & Edit Lines" enabled connectionEditMode simultaneously; draggable connection endpoints (z 1200) covered item markers and hijacked drags.
  - Root cause 2: handleUndergroundDragEnd called non-existent PUT /jobs/{jobId}/underground/{ugId} (404) → fixed to PUT /underground/{ugId}.
  - Fix: Edit Map dropdown split into "Move Items" (positionEditMode only, items z 1500) and "Edit Lines & Connections" (editMode + connectionEditMode). Mode-specific banner copy.
  - Verified by testing_agent: iteration_18 (pole drag pass, UG 404 found) + iteration_19 (100% pass: UG drag persists, pole drag, banner, connections regression).
- OPEN QUESTION to user (ask_human pending): GPS improvement — offered "GPS Lock" averaging mode / accuracy display; hardware note re external Bluetooth GNSS. Awaiting user's choice.

- Photo Markup Editor enhancements (2026-06, tested iteration_20 100% pass):
  - Move any item with Select tool, now including freehand drawings and whole polylines (all points translate).
  - New Eraser tool (data-testid="eraser-tool-btn") — click/tap any annotation to delete it (undo-able); red ERASER hint panel.
  - Touch support on markup canvas (touchstart/move/end + touchAction none) for tablets.
  - NOTE: two edits (eraser-hint panel, earlier banner/zIndex edits) silently vanished after successful search_replace during this session — always re-grep to confirm persistence after hot-reload.

## 2026-06 Session Updates (part 3, tested iteration_21 100% backend+frontend)
- "Aerial Splice" (AS) and "Loop" (LOOP) added as aerial attributes: new "Aerial" section in JobDetail Add dropdown (reuse underground point-item form/model/map plumbing).
- Jobs dashboard (JobsList "/"): new "JOB LOCATIONS" satellite map card with red name-pins for every job with GPS (GET /jobs now returns representative latitude/longitude via aggregation over poles, fallback underground; $sort added for determinism). Pin popup -> Open Job.
- Jobs grid organized into month folders by created_at (e.g. "June 2026") -> click to view that month's jobs, back button returns.

- Job dashboard search bar (2026-06, self-tested via screenshot flow): data-testid="job-search-input" filters jobs by name/location/description/job_type across all months; shows results grid with count, clear button restores month folders; no-results state.

## 2026-06 Session Updates (part 4, tested iteration_22 + self-retest)
- ASE Checklist (all verified by testing agent):
  - "Fiber Pedestal as FBT?" Yes/No toggle -> auto-fills FIBER TERMINAL placement=PEDESTAL + Fiber Terminal LAT/LONG from job's Pedestal with material_type Fiber (warning toast if none).
  - "Populate from Job Attribute" dropdowns under FBT LAT/LONG and NTE LAT/LONG listing all job attributes (UG + poles with GPS, job order) -> sets coords. New form keys: pedestal_fiber_as_fbt, fbt_attribute_source, nte_attribute_source.
  - "Nearest fiber Lat/Long" auto-populates from FIRST item on the attributes list when empty.
- Job completed checkbox: Job.completed field (backend), "Mark Complete" checkbox on job cards -> green folder/border/label + green map pin (#16a34a) on dashboard; persists via PUT /jobs/{id}. Verified end-to-end after fixing missing handleToggleComplete.
- RECURRING TOOL ANOMALY: three times this session a successful search_replace edit silently disappeared from disk (eraser-hint panel, UG drag URL, handleToggleComplete). ALWAYS grep the file immediately after editing AND after a few seconds to confirm persistence.

## 2026-06 Session Updates (part 5, tested iteration_23 100% backend+frontend)
- Map top summary now includes underground footage AND attribute path measurements: "N pole(s) · N underground · X ft aerial + Y ft underground + Z ft risers + P ft path = T ft total" (JobMap.jsx pathFeet memo).
- Underground attributes: new fields `fid`, `primary_fid`, `path_measurements` [{direction: In/Over/Up/Down, feet}] (models/underground.py + UndergroundForm.jsx).
  - FID box + Primary FID toggle shown for: Handhole, FBT, NTE, FBT/NTE, Aerial Splice, Loop, PFP, Manhole, Brooks Enclosure, Flowerpot (FID_TYPES const). Toggle warns if another attribute already has Primary FID on. Default OFF.
  - Path Measurements: repeatable direction+ft rows with live "Up 25ft, In 15ft — 40 ft total" summary; feet added to map grand total and appended into ASE path_of_approach as "Label: Up 25ft, In 15ft" (ASEForm.jsx, includes-check prevents duplicates).
- ASE checklist: Nearest fiber FID auto-fills from the Primary FID attribute (first in job order); warning toast if multiple primaries; success toast one-shot via fidSetRef.
- EF Requirements ↔ "What Site Requirements are already provided?": toggling YES appends the item's shortName (semicolon-separated, no qty per user choice), NO removes it, manual text preserved (handleEfToggle in ASEChecklistTab.jsx).
- Map fixes: removed stray orange arrow polyline in EditableRoute that pointed to empty space (every measurement connector now ends at a text-box pill). "Move Items" mode now drags ALL smart text boxes: aerial measurement pills (labelsDraggable prop), underground measurement pills, station labels, note/measurement annotations.
- Layout tweaks (2026-06, self-tested via screenshot): FID box moved to TOP of underground attribute form (above Type); Notes box moved to BOTTOM of the form (after Photos); JobDetail Add dropdown first item renamed "Add Attribute" -> "Add Pole".
- Span distance second dropdown zero-pads single digits (00-09) — display only (SpanDistance.jsx).
- HOA Location dropdown: added "Pole" option (PoleForm.jsx + options.py ATTACHMENT_LOCATIONS).
- BUG FIX (verified iteration_24): height measurement tool exported photo had tiny numbers on high-res photos — createAnnotatedImage in ReferenceHeightMeasurer.jsx now scales all annotation sizes by s = max(1, max(w,h)/1000). Verified: 3000px photo -> 330x120 label; 800px photo -> baseline 110x40.
- HOA Type dropdown: added "Fiber Drop" + "Copper Drop" (PoleForm.jsx + options.py).
- "Power" aerial attribute added (options.py UNDERGROUND_TYPES, JobDetail Aerial section, abbr "PWR" in poleMapImage.js) + PWR marker in markup editor (RED #dc2626 per user).
- BUG FIX (verified by bug testing agent): markup text escaping its background box — root cause: marker branch left ctx.textAlign='center'/textBaseline='middle' set, corrupting later text/label renders. Fixed with resets in marker branch + explicit align/baseline in text and label branches (PhotoMarkupEditor.jsx). NOTE: also removed stray duplicated JSX after `export default` that broke the build (persistence anomaly struck twice this session — always grep after edits).

- Numbered span measurements (2026-06, self-tested via screenshots): map measurement pills now prefixed "1.", "2." ... in job order (EditableRoute labelPrefix prop + UG pill defaults); new "SPAN MEASUREMENTS" card below map (data-testid=span-measurements-list) listing "1. HH to P1 = 200 ft" per segment + PATH MEASUREMENTS section + totals row. Aerial list distances use haversine incl. waypoints to match pills (segListDistance). RISERS are INLINE in the numbered sequence (e.g. "1. P1 Riser = 18 ft, 2. P1 to X = 358 ft") via measurementEntries memo; map pill numbers use spanNums map to stay in sync.
- Change attribute type in-place (self-tested screenshot + curl): Repeat-icon dropdown on each underground row in JobDetail (data-testid=change-type-{id}) PUTs {type} and refreshes.
- Map measurement smart text boxes REMOVED per user (2026-06): replaced with small numbered circle badges (numberBadgeIcon, .measurement-number-badge) — orange on span midpoints (follows waypoint path middle), violet anchored above their pole for risers. Numbers match SPAN MEASUREMENTS list (spanNums/measurementEntries). Aerial EditableRoute showDistance=false; UG pill/connector block removed. Badges hidden when Sta #'s on. measurementOffsets/customLabelTexts/handleMeasurementDragEnd remain in code but unused by rendering.
- Station numbers same treatment (2026-06): when Sta #'s toggle on, station smart text boxes/connector lines removed; indigo numbered badges (red if after MPOE) at each item + "STATION NUMBERS" card below map (data-testid=station-numbers-list) listing "1. P1 — Sta 0+00" (stationEntries/stationNumById memos; order = sort_order, same as stationNumbers calc).
- Loop AND Aerial Splice are now AERIAL attributes on the interactive map (2026-06, self-tested): AERIAL_ATTR_TYPES set in JobMap.jsx — segments where both endpoints are pole-or-aerial-attr classify as aerial (solid line, aerial footage); markers/popups/legend render BLUE #2563eb with "(Aerial)" tag. Header + list totals compute aerial from orderedSegments via aerialFeetTotal (segListDistance) instead of computeRoute totalFeet.

- ZIP download SPEEDUP (2026-06, curl-verified): photos-zip endpoints (job + pole) now fetch all photos from object storage in PARALLEL (asyncio.to_thread + Semaphore(12), _fetch_photo_entries helper in routes/jobs.py) instead of sequential blocking requests — ~10x faster for photo-heavy jobs, no longer blocks the event loop. ZIP format unchanged (ZIP_STORED, direct download).

- Gallery multi-download (2026-06, curl+screenshot verified): photo gallery page now has per-photo checkboxes + per-section "Select all" + "Download selected (N)" button (POST /api/jobs/{id}/export/photos-zip-selected, token-gated, internal URLs only, parallel fetch); single photos can be dragged straight into an OS folder via dataTransfer DownloadURL (Chrome/Edge, /api/files/ urls only — data: urls excluded). NOTE: browsers cannot drag MULTIPLE files out at once — multi = select+zip. Seed HH-1 photo is HEIC (renders broken in browser, downloads fine) — pre-existing.

- SOC/Pole Line toggles (2026-06, curl+screenshot verified): underground form has SOC Start / SOC End switches (soc_start/soc_end fields) at top of first card; pole form has Pole Line Start / Pole Line End switches (pole_line_start/pole_line_end) at top of form. ASEChecklistTab useEffect auto-fills soc_start_lat_long, soc_end_lat_long, soc_pole_line_start, soc_pole_line_end (only when empty) with the toggled item's "lat, long".

- EF Requirements rework (2026-06, screenshot verified): YES/NO no longer auto-populates "What Site Requirements are already provided?". Each of the 11 EF rows now has a separate "Provided" Switch (data-testid=ef-provided-{key}, formData key {key}_provided) — on adds shortName to the box, off removes it, manual text preserved (handleEfProvidedToggle in ASEChecklistTab.jsx; defaults in ASEFormConstants.js).

- BUG FIX (verified by bug_testing_agent, iteration_26 100%): SOC Start/End toggles reset after saving an EDIT — root cause: UndergroundUpdate model was missing soc_start/soc_end (an earlier edit silently didn't persist — anomaly struck AGAIN), so PUT dropped them via exclude_unset. Re-added to UndergroundUpdate in models/underground.py. PoleUpdate pole_line_start/end confirmed present. LESSON: always grep-verify model edits after search_replace in this repo.

- Job Transfer (2026-06, testing agent iteration_27 100% backend+frontend): GET /api/users/transferable (company @mastec/@byers users, excludes caller) + POST /api/jobs/{id}/transfer {user_id} (owner or admins via can_access_job; company-domain recipients only; updates user_id/user_email). Dashboard job cards have hover transfer button (data-testid=job-transfer-btn-{id}) → dialog (transfer-job-dialog, transfer-user-select, transfer-confirm-btn). Transferred jobs leave owner's dashboard, appear on recipient's; admins see updated email.

- BUG FIX (verified iteration_28): dashboard map covering Edit/Transfer/Delete/New Job dialogs — root cause: Leaflet panes (z-index 400-1000) painted above Radix z-50 dialogs because .leaflet-container created no stacking context. Fixed globally in index.css: .leaflet-container { z-index: 0; isolation: isolate; }. Testing agent verified all dialogs above map via elementFromPoint + map regressions pass.
- Transfer notice (backend fields curl-verified after model fix): transfer endpoint sets transferred_from/transferred_at; Job model now declares them (was stripped by response_model — caught by testing agent). Amber "Transferred from {email}" note on job cards (data-testid=job-transferred-from-{id}) and job detail header (job-detail-transferred-from).

- Transfer history (2026-06, curl+screenshot verified): transfer endpoint appends {from_email,to_email,by_email,at} to job.transfer_history (computed $set — NOT $push, which failed with WriteError on docs where the field is null from model default). Job model declares transfer_history. Admin-only collapsible "Transfer history (N)" details element on JobDetail header (data-testid=transfer-history), newest first.

- Inline path measurements (2026-06, screenshot verified): path measurement entries now numbered INLINE in the SPAN MEASUREMENTS sequence at their route position (kind:"path" in measurementEntries; emerald numbers in list + emerald badges anchor [34,-8] on map; items off the GPS chain appended at end). Separate "Path Measurements" section + pathRows memo removed. List guard now measurementEntries.length.
- New underground attribute types "UG Path Start" (UGP-S) / "UG Path End" (UGP-E) — options.py + UNDERGROUND_ABBR; indicate where an underground path begins after a riser from a pole. Verified marker + legend on map.

## Backlog
- P1: User verification of new gallery flow on production (needs redeploy).
- P2: Replace native <input type='date'> for ASE "Date of site visit" with shadcn date picker (tester UX note).
- P2: Refactor PhotoMarkupEditor.jsx into /components/markup/* stubs (or delete stubs).
- P2: Bulk import from Excel.
