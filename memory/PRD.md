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

## Backlog
- P1: User verification of new gallery flow on production (needs redeploy).
- P2: Refactor PhotoMarkupEditor.jsx into /components/markup/* stubs (or delete stubs).
- P2: Bulk import from Excel.
