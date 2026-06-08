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
