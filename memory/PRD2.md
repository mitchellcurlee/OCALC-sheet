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
