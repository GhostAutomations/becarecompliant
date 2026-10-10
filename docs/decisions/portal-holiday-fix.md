# Portal holiday fix

> The /my portal Holiday form no longer asks a logged-in carer their own name, area or email (2026-08-10 fix)

**2026-08-10.** In the staff portal (/my), the Request holiday dialog rendered the RAW holiday_requests form, so a logged-in carer was asked their own Name, Area (`what_area_do_you_work_for`) and Email. Phil flagged this twice ("no form in their portal should require their name or branch"). The previous session had only fixed the BRIEFINGS render path, never the /my holiday mount, which is why it looked unfixed.

Fix mirrors Briefings' two-part pattern in lib/assignments/render.ts:
- RENDER: components/staff/my-holidays.tsx now passes `schema={briefingRenderSchema(requestSchema)}` to FormEvidenceDialog. briefingRenderSchema drops the three OPTIONAL identity fields (name, what_area_do_you_work_for, please_enter_your_email_address) and keeps the required dates (start, end, first-available). A REQUIRED identity field would not be dropped, by design.
- SUBMIT: requestHoliday (lib/holidays/actions.ts) widens the people select to full_name, work_email and calls `seedIdentityAnswers(form.schema as FormSchema, answers, {fullName, email})` before submitEvidence, so the Evidence still names the person. BRANCH is never seeded (the area options need not match the record branch); the holiday_requests row already carries the real branch_id.

lib/assignments/render.test.ts already covers this exact form (its HOLIDAY fixture is the Acme holiday form). tsc clean (only the 3 pre-existing stale .next/types stripe-usage errors), 153 unit tests pass. Subagent diff review was skipped at Phil's request for speed. NOT yet ticked in PHASES.md.

Related: [holidays-absence](holidays-absence.md) [staff-logins](staff-logins.md) [briefings](briefings.md)
