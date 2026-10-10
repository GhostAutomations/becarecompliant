# Cardiff pqs

> Cardiff Council PQS (Provider Quality System) monitoring return that BCC reporting must help providers prepare

Cardiff Council sends domiciliary care providers the **PQS (Provider Quality System) self-assessment** (Phil uploaded "PQS V10.5.pdf", 6 pages, 2026-07-14). Providers score each question 0/2/5/7/10; the council then does a validation visit expecting the "supporting evidence and calculation breakdown readily accessible". This drives BCC's local-authority reporting (Wales, Cardiff is Phil's real LA).

SECTIONS + QUESTIONS:
- Supplier Performance: Q1 outcomes tool (descriptor 0-10); Q2 % personal outcomes achieved/progressing; Q3 staff satisfaction mechanisms (RISCA Reg 76, gathered at Reg 73 visits, in Reg 80 reports) Yes/No.
- User Experience: Q1 % of three-monthly service user **Personal Plan Reviews** completed by due date, last 6 full months (due = last review + 3 months); Q2 % customer satisfaction from SU feedback (last 6 months).
- Quality Compliance: Q1 % care workers full compliance with **mandatory training** (training matrix/Statement of Purpose); Q2 % of three-monthly **1:2:1 supervision** completed by due date, last 6 months (due = last supervision + 3 months); Q3 % staff (6+ months in post) registered with **Social Care Wales**.
- Safeguarding & Risk Management: Q1 % completed **mandatory safeguarding training** (All Wales Safeguarding Procedures); Q2 Safe Recruitment policy (descriptor); Q3 Business Continuity Plan (descriptor).

SCORE BANDS (percentage questions): 100% = 10, 85.00 to 99.99% = 7, 70.00 to 84.99% = 5, 50.00 to 69.99% = 2, 0.00 to 49.99% = 0.

MAPPING TO BCC:
- Auto-calculable from our compliance data: Personal Plan Review on-time % (SU Care Plan Review checks), Supervision on-time % (People Supervision checks), mandatory training compliance %, safeguarding training % (needs a safeguarding check).
- New data agreed to add (Phil, 2026-07-14): **Social Care Wales registration** (per person) and a **mandatory safeguarding training** check. (Satisfaction/outcomes surveys deferred.)
- Descriptor/policy questions (outcomes tool, safe recruitment, BCP) are document evidence, not auto-scored.

BUILD (Phil, 2026-07-14, into Phase 8): an ON-TIME COMPLETION RATE report. Metric per PQS: of all cycles that fell DUE in the period (default last 6 full months), % completed on or before the due date (due = last completion + the deadline). Show per check (Supervision, Care Plan Review, ...), total due in period, completed on time, %, and the PQS score band. Include the record-by-record breakdown so it is auditable. Reconstruct cycles from the evidence completion history (evidence.form_id + record_id + submitted_at). Reuses the Phase 8 date-range window. Report code + view page live; PQS score bands in lib/export/on-time.ts (pqsBand).

REPORTING DEADLINE vs OPERATIONAL INTERVAL (standing decision, Phil 2026-07-14, migration 0059): a check's `interval` is the OPERATIONAL cadence (drives register, amber/red, next due). Phil deliberately sets it TIGHTER than the regulatory deadline as an early-warning buffer (e.g. Supervision interval 80 days = 10-day buffer against the three-monthly / 90-day PQS deadline). The on-time (PQS) report must grade against the REGULATORY deadline, not the buffer, else buffer-window completions are wrongly counted late and the score is understated. New nullable column `check_definitions.reporting_interval_days` (days; null = grade against the operational interval, changes nothing). On-time engine uses it; register/scheduling ignore it. Config UI: optional "Reporting deadline (days)" field on recurring checks (People + SU settings). Cardiff/Thistle: supervision + care_plan_review set to 90. Effect verified: Cardiff supervision 33.3% @80 -> 48.1% @90 (rest genuinely late in the real Monday data). Report shows a "Graded at" column for inspector transparency.
