# Thistle Care Ltd reset, 16 September 2026

Company `eae26e83-1e41-472b-abc0-e2b39b907e49`. Phase 13 clear down before the real people
and service users are loaded. Phil authorised the whole list, including the three judgement
calls at the bottom. THERE IS NO UNDO: these rows were deleted outright, not archived.

## Deleted

| Table | Rows | What they were |
| --- | --- | --- |
| people | 1 | ZZ Test Person, Care Assistant, Cardiff, created 15/09 for the calendar test |
| check_instances | 7 | The seven checks that person got on creation |
| person_trackers | 1 | That person's probation tracker, status due |
| assignments | 1 | The Attendance policy assigned to that person |
| migrated_completions | 10 | "Seeded test history" rows for six people who no longer exist |
| reg73_visits | 2 | Reg 73 Cardiff 2026-09-14 and Reg 73 Newport 2026-09-16, both drafts |
| planner_bookings | 1 | Supervision, 16/09, the booking used to test the Outlook feed |
| planner_calendar_feeds | 1 | Phil's subscription link. Mac, iPhone and Outlook web must re-subscribe |
| on_call_log_drafts | 1 | An unsent handover draft |
| company_policies | 1 | Attendance Management Policy and Procedure, v1, uploaded 05/09 |
| audit_log | 5 | Including the two reg73.created entries and the calendar feed creation |
| notification_log | 16 | Daily People and Service User compliance report emails, 08/09 to 16/09 |
| usage_events | 2 | AI spend: one complaint response, one Reg 73 draft |
| ai_credit_ledger | 4 | Two monthly grants, two spends |
| sms_credit_ledger | 1 | September grant |

Storage, `evidence` bucket:

- `<company>/480de2e4.../render/evidence.pdf` (orphan, 11,986 bytes)
- `<company>/7628e74e.../render/evidence.pdf` (orphan, 12,786 bytes)
- `<company>/policies/d56fc94b.../Attendance_Management_Policy_-_Updated_12-02-2026.pdf` (554,178 bytes)

## Kept

- 7 profiles and their 7 invites: Phil Davies, Rebecca Long, Charlotte Davies, Hayley
  Jeffries, Lauren Morgan, Chloe Driscoll, Lucy Disney.
- 3 branches: Thistle Care Ltd Office, Cardiff, Newport.
- Everything configured rather than recorded: 33 training courses, 22 forms, 11 check
  definitions, 8 job titles, 3 funding options, and the absence, complaints, policy and
  notification settings.
- `<company>/branding/logo.png` in the evidence bucket.
- Billing, AI and SMS credit balances.

## The defect this exposes

There is no way to clear a company's data from inside the product. This reset was
hand-written SQL, which by our own rule makes it a defect: a founder needs a "Reset company
data" action that empties the records and leaves the configuration standing. Worth building
before the next company onboards.
