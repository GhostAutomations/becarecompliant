# Test checklist — Holidays & Absence (People extension)

Run as popups (Pass / Fail / Not tested) once deployed AND the four forms exist in
the test company. Anything Not tested is logged into the Final Testing phase.

PRE-REQ: the founder forms holiday_requests, holiday_response, absence_back_office,
absence_management_meeting must exist in the test company's `forms` table. They seed
into NEW companies automatically; an existing company (e.g. Thistle) needs them
imported first (the "import master templates into an existing company" Additions item),
or these flows will show the "form not available" notice and stay disabled.

ENV: AI suggestion needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL set in Vercel.

## Rendering / QC (standing check for ANY modal or slide-over)
- [ ] Every dialog/slide-over (FormEvidenceDialog: record absence, record meeting, request holiday, review holiday) opens as a FULL-SCREEN overlay, not trapped inside a card. It is portalled to document.body so a glass card's backdrop-filter can never become its containing block. Open each one and confirm it covers the screen and scrolls.

## Nav
- [ ] Sidebar shows Holiday and Absence indented under People (desktop).
- [ ] Team Member sees Holiday but NOT Absence; Admin/Manager/Supervisor see both.
- [ ] Active child highlights; People parent yields to the active child.

## Absence
- [ ] /people/absence shows cards ONLY for active people with absences in the window.
- [ ] Card shows occasions, days, derived stage/label, meeting stage, and a "meeting due" flag when past the last meeting's stage.
- [ ] Branch filter narrows the cards (multi-branch companies).
- [ ] Record an absence (person picker -> Absence Back Office form) stores Evidence and creates one absence_events row per filled Absence N Date; the person then appears/updates on the view.
- [ ] Record a meeting (Absence Management Meeting form, Stage 1-4) stores Evidence and an absence_meetings row; meeting stage updates.
- [ ] Bradford company: the card shows the Bradford score and the correct band.
- [ ] Manager sees only their branch; Supervisor only caseload; Team Member cannot record (no buttons) and via RLS sees only their own.

## Holiday
- [ ] /people/holiday shows a pending-requests strip and a month calendar.
- [ ] Anyone can submit a request (Holiday Form -> Evidence); a pending row appears.
- [ ] Manager/Admin "Review" (Holiday Response form) approves or declines; decide_holiday_request stamps the outcome; approved holidays appear on the calendar.
- [ ] Calendar month navigation (Prev / Today / Next) works; approved ranges show the requester on each covered day.
- [ ] Team Member sees only their own requests in the strip (RLS).

## Settings > Absence
- [ ] /settings/absence: choose method (stages/Bradford), set rolling window and thresholds, Save persists (absence_config upsert).
- [ ] Upload a PDF policy -> stored in the private absence-policies bucket, shown as uploaded.
- [ ] "Suggest settings with AI" reads the PDF, pre-fills method/window/thresholds + shows a summary; nothing saves until Save.
- [ ] AI with missing env vars surfaces a clear "not configured" message (fail closed).
- [ ] Non-admin cannot reach /settings/absence (redirect) and cannot write absence_config (RLS).

## Person drill-down
- [ ] The record page shows Holiday history (dates + status pill) and Absence history (events + meetings).

## GDPR / security
- [ ] absence reasons (health data) only visible to authorised roles (RLS): cross-tenant isolation, Team Member own-only.
- [ ] Policy download uses a private bucket (no unsigned access).

## Realtime
- [ ] Recording an absence/holiday updates the view within ~10s (poll fallback; the new tables are not yet in the supabase_realtime publication — add REPLICA IDENTITY FULL + publication if sub-second live update is wanted).
