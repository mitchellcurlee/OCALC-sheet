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

## Backlog
- P1: User verification of new gallery flow on production (needs redeploy).
- P2: Refactor PhotoMarkupEditor.jsx into /components/markup/* stubs (or delete stubs).
- P2: Bulk import from Excel.
