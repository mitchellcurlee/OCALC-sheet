# Iteration 33 Focused Bug Verification Test Plan

No relevant testing skill found.

Exact bug: user cannot move connections from pole to pole in preview; approved flow is tap connection line, choose Move start or Move end, then tap target pole/attribute.

Affected flow: /jobs/{jobId}/map -> Edit Map -> Edit Lines & Connections -> select line by visible line/hit line/dropdown -> Move start/end -> tap green target circle -> Connection updated -> Done -> reload -> GET /api/jobs/{job_id}/connections persists moved endpoint.

Code inspected: frontend/src/pages/JobMap.jsx diff for target marker remount key and visible connection line click handler; backend/models/connection.py ConnectionUpdate includes endpoint fields.

Proof required: target circles have leaflet-interactive in pick mode; Move start and Move end for pole-to-pole persist after reload; underground endpoint move persists; add/delete line persists; guards do not mutate data; line click selection works; span measurements and Move Items mode remain usable.
