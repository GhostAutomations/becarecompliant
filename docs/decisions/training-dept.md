# Training dept

> BCC Training sub-department under People: model, what is built, and the 2026-08-01 review findings (no renewal auto-calc, no reminders, no self service, Clear deletes with no confirm)

Training is a People SUB-DEPARTMENT (nav child under People, like Holidays/Absence), agreed + BUILT 2026-07-14. Phil chose "build it now" (not Additions). Migration 0060.

MODEL: company catalogue `training_courses` (name, renewal_months null=one-off, mandatory, is_safeguarding, amber_days default 30, sort_order, active) + `person_training` (person x course, unique(person_id,course_id): status completed|not_done, completed_on, expiry_on, certificate_path). RAG is EXPIRY-driven (not the check/completion model): recurring course green/amber(≤amber_days)/red(expired); one-off = done(green)/not-done(red); missing record = not done. Existing Manual Handling + Medication Competency stay as separate COMPETENCY CHECKS (not moved into Training). Realtime on both tables.

ACCESS (corrected by 0165, 2026-08-01): Admins, Registered Individual, Registered Manager and branch Managers. `training_courses_select` had named only is_company_admin/is_company_manager, so the Registered roles were offered the page by the nav, the page guard and saveTraining, and then shown NOTHING. Same oversight as 0150/0081. `person_training` and `check_definitions_update` fixed in the same migration. `training_courses_write` stays Admins only, matching saveCourse.

EVIDENCE: certificate upload (reuses the private `evidence` bucket under {companyId}/training/{recordId}/, 5min signed URL via /api/training/[id]/certificate, download audit-logged) AND/OR dates entered in-app. FUTURE: Carer.Academy (Phil's training platform) will feed completions; clean seam left, integration NOT built.

DATA: course catalogue + per-person history came from Phil's Training.xlsx matrix. 33 courses seeded, 518 records for the Cardiff people that matched the register, 16 SCW numbers set on people.scw_registration_number.

FILES: lib/training/{data.ts (getTrainingMatrix, listAllCourses; RAG + London civil dates server-side, paged AND chunked at 200 ids because people x courses blows the 1000-row cap), actions.ts (saveTraining, saveCourse), storage.ts}, components/training/{training-matrix.tsx, training-cell-dialog.tsx, course-config.tsx}, app/(app)/people/training/page.tsx, app/api/training/[id]/certificate/route.ts. Config in Settings > People > Training courses. Reporting: lib/export/training.ts (buildTrainingReport: PQS mandatory% + safeguarding% with bands, by-course table, action list) + app/api/reports/training/route.ts. See [cardiff-pqs](cardiff-pqs.md).

## CORRECTED 2026-08-01, verified in code

**New companies DO get a seeded catalogue.** The old note here said template seeding was "still to wire" — that is STALE. `provision_company` calls `seed_company_training_courses(cid)`, which copies every active row of `training_course_templates` (33 active, all mandatory, 1 safeguarding) skipping any name the company already has. Do not rebuild this.

## Review findings, 2026-08-01 (Phil: "i want to review training")

Ordered worst first. None of these are fixed.

1. **Nothing ever chases a training expiry.** `lib/notifications` and the daily digest do not mention training at all. An expiry-driven feature with no reminders: a certificate lapses and nobody is told until somebody opens the matrix. The single biggest gap.
2. **The renewal date is not calculated.** The dialog says "renews every 24 months", you type Completed, and you must then type Renewal due by hand. Every course, every person. `saveTraining` stores exactly what it is given.
3. **Clear deletes the record with no confirmation, and it is a submit button.** Breaks Phil's standing rule that a confirming button must not be a submit button, and it does not even confirm.
4. **The dialog does not use ActionForm**, so no "Saving…" then green flash; it just closes.
5. **The page computes a summary and throws it away.** `getTrainingMatrix` returns mandatoryCompliancePct, safeguardingPct and green/amber/red counts on every load. Only the dashboard reads them. The Training page has no headline figure at all.
6. **No search and no status filter.** 40 people x 33 courses is 1,320 cells and the only control is Branch. Cannot ask "who is expired" or "who expires in 30 days", or find a person by name.
7. **No bulk entry.** A team all does Moving and Handling on one day; recording it is one dialog per person.
8. **Team Members cannot see their own training.** They have logins now, and `/my` has no training at all.
9. **No "booked" state.** The column allows completed|not_done and saveTraining always writes 'completed', so a course booked for next Tuesday cannot be recorded.
10. **Sorted by full name**, so the register sorts on first name. No surname order.
11. **The certificate input is a raw unstyled browser file input** — same class as the Reg 80 uploader lesson.
12. **Every one of the 33 seeded templates is mandatory**, so "mandatory compliance" is just overall compliance and a new customer's PQS training figure starts brutal.
13. `getTrainingCompletion` builds the ENTIRE matrix to read one number (also list item 20).

Related: [cardiff-pqs](cardiff-pqs.md) [the-list](the-list.md) [roles-overhaul](roles-overhaul.md)
