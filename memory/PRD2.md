# PRD — Pole Data Collection App (continued)

See PRD.md for full history. This file continues session updates.

## 2026-07 Session Updates (fork continuation)

### Deleted Items (Trash) system — testing agent iteration_43, 100% backend+frontend, DEPLOY REQUESTED
User choices: trash covers Jobs/Poles/Underground (photos ride along inside items); items kept FOREVER until manually purged; strictly per-user (each user sees only what THEY deleted, admin included); job deletes/restores as ONE package (job + poles + underground + connections + routes + annotations).

Backend (`routes/trash.py`, registered in server.py):
- Mongo `trash` collection. `archive_entity(db, entity_type, doc, user, children)` helper; JOB_CHILD_COLLECTIONS = poles/underground/connections/routes/annotations.
- GET /api/trash — aggregation projection (no heavy data/children payload), pole_count/underground_count for job entries, newest first, filtered by deleted_by.
- POST /api/trash/{id}/restore — 409 if entity id exists; pole/UG restore returns 400 if parent job missing ("restore the job first"); job restore reinserts job + all children (skips existing ids), returns restored counts.
- DELETE /api/trash/{id} (purge one), DELETE /api/trash (empty user's trash).
- delete_job (jobs.py) now archives the FULL package incl. connections/routes/annotations (previously orphaned) then deletes all. delete_pole (poles.py) + delete_underground (underground.py) now require auth (Depends(get_current_user)) and archive before delete. sync.py offline-sync deletes ALSO archive (pole/underground/job cascade).

Frontend:
- New /trash page (`pages/Trash.jsx`, route in App.js): item cards (trash-item-{id}) with type badge, job name, deleted date, child counts; Restore (trash-restore-btn-{id}); Delete Forever with confirm (trash-purge-btn-{id} → purge-confirm-btn); Empty Trash with confirm (trash-empty-btn → empty-confirm-btn).
- JobsList header: red trash icon button data-testid=deleted-items-btn → /trash (next to LifeBuoy recovery btn).
- All delete dialogs reworded to "moved to your Deleted Items folder"; toasts updated in JobsList/Dashboard/JobDetail/ViewPole.
- NEW confirmations added where none existed: JobMap "Delete line" (conn-delete-confirm-btn / conn-delete-cancel-btn) and "Reset lines" (reset-lines-confirm-btn); PhotoUpload + MultiPhotoUpload photo X buttons now open "Remove this photo?" AlertDialog ({testId}-remove-confirm / {testId}-remove-cancel) — note: removing a single photo is NOT trash-recoverable (by user scope choice a).
- Testing agent added data-testids: job-delete-btn-{id}, job-delete-confirm-btn, job-delete-cancel-btn (JobsList).
- Added DialogDescription to Create/Edit Job dialogs (Radix a11y warning fix).
- Backend pytest suite kept at /app/backend/tests/test_trash_iter43.py.

### Culvert / Drainage Start / Drainage End + PFP job type — verified iteration_43, DEPLOY REQUESTED
- options.py UNDERGROUND_TYPES + Excel UG_ABBR (CULV/DR-S/DR-E) in jobs.py export; frontend poleMapImage.js UNDERGROUND_ABBR; PhotoMarkupEditor markers (cyan #0891b2); JobDetail Add Attribute dropdown gets them via UNDERGROUND_TYPES; JobsList JOB_TYPES includes "PFP".

### FEATURE: pole marker color + popup quick edit (2026-07, browser-verified, DEPLOY REQUESTED with UG version)
UG VERSION (2026-07, browser-verified): Underground model + UndergroundUpdate get `marker_color`; UgPopupEditor in UG popups — Quick Edit Label/FID (ug-label-input / ug-fid-input / ug-quickedit-save) + same 6-color swatch row (ug-color-{hex}); itemColor honors u.marker_color (falls back aerial-blue/UG-green); UG Popup also closeOnClick/autoClose false. Verified: HH label+FID save, purple recolor live; seed HH-1 fid/color reset after test.
- Pole model + PoleUpdate: new `marker_color` field. poleIcon/poleIconWithArrow parameterized with color (default #dc2626).
- Pole popup (JobMap): new PolePopupEditor component — "Quick Edit #/Class/Size" inline form (pole-num-input / pole-class-input / pole-size-input / pole-quickedit-save) PUTs /poles/{id} and updates poles state; "Marker Color" swatch row (6 colors, pole-color-{hex}) sets marker_color instantly (marker dot + label recolor live).
- CRITICAL FIX found during testing: Popup needed `closeOnClick={false} autoClose={false}` — otherwise clicking buttons inside the popup closed it (Leaflet map click-through). LESSON: any interactive pole/UG popup content needs these props.
- Verified: quick edit saved class 3/size 40 (API-confirmed), blue marker recolor visually confirmed; seed pole color reset to red after test.

- LIME GREEN (2026-07, deployed): added #84cc16 to MARKER_COLOR_CHOICES (7 colors) for pole + UG popup pickers; verified both popups.
### FEATURE: Add attribute from interactive map (2026-07, browser-verified, preview-only until redeploy)
User choices: tap-to-place; menu has EVERYTHING (Pole + Aerial Loop/AS/Power/X-Mes + all UG types); opens the full form after placing.
- JobMap header: green "Add" dropdown (map-add-dropdown-btn) before Edit Map — Add Pole (map-add-pole), Aerial section, Underground section (map-add-{type}); hidden while any edit/placing mode active.
- Flow: pick type → emerald placing banner (placing-banner + placing-cancel-btn) → PlaceAttributeHandler (useMapEvents click) captures tap → navigates to /jobs/{id}/add?lat&lng (pole) or /jobs/{id}/underground/add?type&lat&lng.
- UndergroundForm initial state reads lat/lng params; PoleForm new mount effect prefills lat/lng in create mode.
- Verified: menu (30 items), banner, tap → UG form Type=Handhole + coords prefilled; pole form coords prefilled via direct URL.
- RETURN TO MAP (2026-07, browser-verified): map placements append `&from=map`; AddPole + UndergroundForm backUrl → /jobs/{id}/map when from=map (back arrow AND post-save). E2E: placed+saved Handhole → landed back on map with marker chained. Deploy requested.
- ADD POLE TERMINAL (2026-07, browser-verified, preview-only until redeploy): map Add menu now has "Add Pole Terminal" (map-add-pole-terminal, placingType "__pole_terminal__") → /jobs/{id}/add?terminal=true&lat&lng&from=map; form opens with Pole Terminal preset to "Yes" + coords prefilled.
- COLORS (2026-07, screenshot-verified, preview-only until redeploy): PATH_COLORS palette now Blue/Green/Orange/Purple/Yellow(#facc15 brighter)/Red(#dc2626 NEW) — single palette drives aerial/UG defaults, per-segment picker and exports.
- HOTFIX menu clipping (2026-07, redeploy queued): JobMap header z-[1000] covered dropdown tops (z-50) — "Add Pole" looked missing in prod. Add menu restructured: Add Pole / Add Pole Terminal + Aerial/Underground SUBMENUS (map-add-aerial-sub / map-add-underground-sub), z-[1100] on Add + Edit Map DropdownMenuContent/SubContent. Verified via elementFromPoint check. LESSON: any dropdown opened from the JobMap header needs z > 1000; playwright is_visible() does NOT detect overlap-cover — use elementFromPoint.

### FEATURE: full editing of auto-generated map lines + Aerial/UG type switch (2026-07, browser-verified, preview-only until redeploy)
User: auto-generated lines only offered color change; needed delete/move/type. Root cause: fallback chain pairs (items added after connections saved) had NO backing doc → not in picker, taps fell through to color handler.
Fixes:
1. initializeConnections now SYNCS on entering Edit Lines & Connections: creates docs for every drawn pair lacking one, tombstones ("removed") old non-custom docs straddling a newly added item (mirrors computeConnectionPairs skip-over rule), then refetches. Every visible line is now editable (move/delete/type/color).
2. NEW `type_override` field ("aerial"|"underground") on Connection (+Create/Update models). conn-edit-panel has "Aerial (blue)" / "UG (green)" buttons (conn-type-aerial-btn / conn-type-underground-btn) with effective-type highlight. pairIsAerial + JobMap orderedSegments honor typeOverride → main map color, dash style, footage split (aerial vs UG), span list "(UG)" tags, exhibits and ASE all follow. Edit-overlay line color uses type_override first.
Verified in browser: added mid-route item via API → edit mode picker listed both new chain lines, old straddling line gone; forced pole→HH line to Aerial → totals moved 178 ft UG→aerial. Seed job restored to original 3 connections after test.

### BUG FIX: can't delete auto-generated map lines (2026-07, browser-verified, preview-only until redeploy)
Two root causes in JobMap/poleMapImage:
1. Deleting a connection doc made its endpoints "unreferenced" → computeConnectionPairs' chain fallback instantly re-drew the line. FIX: delete now writes a `connection_type: "removed"` TOMBSTONE (PUT, not DELETE); computeConnectionPairs filters removed pairs from drawing but still counts their endpoints as referenced (no resurrection). JobMap render + picker skip removed. Exhibits/segmented ZIP/ASE inherit via shared computeConnectionPairs. "Reset lines" wipes tombstones → defaults return.
2. "Reset lines" stale closure: it bulk-cleared docs then called an old initializeConnections whose `connections.length > 0` guard aborted → zero docs left, lines became untappable auto-chain visuals. FIX: extracted buildDefaultConnections(); resetConnections now bulk-POSTs the computed defaults in ONE call.
Verified: 3 lines → delete → 2 (persists across reload, span list correct) → Reset → 3 back and editable.

### Pole save requirements removed (2026-07, curl+compile verified, preview-only until redeploy)
- Pole Size and Condition are no longer required to save a pole: PoleBase fields now Optional (models/pole.py), PoleForm.jsx validation block + "*" labels removed. Excel export already guards missing values.

### Known notes
- HOTFIX (2026-07-27, redeployed): JobMap.jsx AlertDialog import silently didn't persist on first edit → map page crashed blank ("AlertDialog is not defined"). Import restored, map + delete-line confirm verified via screenshot, redeployed successfully. LESSON reconfirmed: grep-verify IMPORTS too after search_replace, not just usage sites.
- Deployment of this batch completed successfully (trash + Culvert/Drainage/PFP + map hotfix live). PRODUCTION = https://poletracker.emergent.host — user devices auto-update within ~5 min / on tab focus.
- Minor (accepted): POST /api/poles & /api/underground return 201 while POST /api/jobs returns 200 (inconsistent but harmless).
- Pre-existing non-blocking build warning: ViewPole.jsx useEffect deps.

## Backlog
- P1: User verification of trash + Culvert/Drainage/PFP on production after deploy completes.
- P2: Offline-queued deletes archive on sync push (covered), but a delete performed fully offline shows generic toast (no trash mention) until synced.
- P2: Refactor PhotoMarkupEditor.jsx into /components/markup/* stubs (or delete stubs).
- P1 (carried): User confirmation that job A05A4JY device recovery was run on the original tablet.
