# Thistle forms tasklist

> Phil's nine-step task list agreed just before the Operation Thistle forms work (Sept 2026): compare forms to monday, agree corrections, fix the master library, fix Thistle's copies, build the push, then imports, import testing, Phil doing an import himself, and custom forms at onboarding. Steps 1-4 are done; step 5 (the push) is next. Read when asking what comes next in Phase 13.

**Phil re-supplied this list on 2026-09-09** after it was lost in a context reset. It was agreed
just before the forms work began. It is the ordered plan for the forms half of Operation Thistle.
**Do not renumber it and do not reorder it** — the order carries the reasoning.

1. **Compare the forms.** Each form is opened in Chrome (the monday board is behind Phil's login,
   so he opens it), read question by question — questions, types and options — and checked against
   Thistle's stored version. **Report only, nothing changes.** Start with **Supervision** to prove
   the method. — **DONE (Phil, 2026-09-09).**
2. **Agree the corrections, form by form.** Some will be the monday wording winning, some the
   platform's. Claude's call each time, said out loud. — **DONE (Phil, 2026-09-09).**
3. **Fix the master library.** Apply the agreed wording to the FOUNDER templates, so every company
   from here on is seeded correctly. This is the "default for all companies, FUTURE" half.
   Phil, 2026-09-09: "all the forms we now have in thistle should become the master library."
   — **ALREADY TRUE, verified in the database 2026-09-09.** See the audit below.
4. **Fix Thistle's own copies**, publishing a NEW VERSION of each — never editing version 1, so
   anything already completed stays evidenced against the form it was completed on. **Bevan gets
   the same treatment.** — **DONE (Phil, 2026-09-09).** Bevan verified as matching the library.
5. **Build the push.** A founder action that offers a changed library form to companies that
   already hold it, skipping any whose copy they have edited themselves. This is the "CURRENT
   companies" half, and it is what makes steps 3 and 4 repeatable instead of hand-done every time.
   — **NEXT.**
6. **Then imports.** Download the People, Service Users and Training templates only AFTER the
   forms are settled — the templates are generated from the checks and courses, so a sheet filled
   in before this is scrap.
7. **Test the import sheet properly** — one clean file, one deliberately broken, so the warnings
   are seen to behave.
8. **Test PHIL doing it** — he reads a monday board and produces a filled template for Claude to
   validate and import.
9. **Custom forms at onboarding** — the option for a new company to get bespoke forms instead of
   the standard set. LAST, because it only matters when company four arrives, and steps 3-5 define
   what "standard" even means.

## The conflict to resolve at step 4

Step 4 says publish a new version and never edit v1. **Phil's later standing rule (2026-09-08)
says the opposite while the defaults are being built:** "while we are building the defaults all
forms will always be v1" — when a guard refuses because evidence exists, DELETE the test evidence
and edit v1 in place, never publish a v2.

They do not actually disagree; they apply at different moments. Editing v1 is safe **only while
the only evidence against a form is test evidence Claude created**. The moment Thistle's REAL
staff are loaded and start completing forms, step 4's rule takes over and every change becomes a
new version. Say which rule is in force before touching a form.

## The step 3 audit, measured in the database 2026-09-09

Thistle (`eae26e83-1e41-472b-abc0-e2b39b907e49`) holds **24 forms; the master library holds all
24, and 20 are byte-identical.** The week's migrations updated the founder template and Thistle's
copy together, which is what "default for all companies" has meant in practice.

**The 4 that differ do so ONLY in per-company baked option lists** — `care_plan_review`,
`complaint_response`, `complaints_concerns`, `return_to_work`. Thistle's carry its branches
(Cardiff / Newport / Thistle Care Ltd Office) and its staff ("Phil Davies"). **These must never be
promoted to the library.** Branch and staff options live in the STORED schema on purpose —
`lib/form-validate.ts` validates a single_select answer against the stored published schema, so an
option injected only in the browser is rejected on save — and `rebake_form_field_options`
(migration 0144, replaced by 0146) rewrites them per company. `createCompany` calls
`rebakeFormFieldOptions` right after seeding, so a new company gets its own branches, not
Thistle's.

**Bevan Care Ltd matches the library too.** 17 templates exist only in the library and all 17 are
archived (the superseded originals plus One To One's); archived means they do not seed, so they
cost a new company nothing. Leave them.

Two untidy things, neither breaking anything, both offered to Phil and neither yet actioned:
- The Annual Appraisal's library key is **`annual_appraisal_acme`** — the test company's name is in
  the library every future customer is seeded from. Renaming touches the check definitions that
  point at it and the seed functions.
- The library copies of `care_plan_review` and `complaint_response` still carry **Cardiff and
  Newport** as baked branch options, left over from Acme. Harmless (creation re-bakes them) but the
  library is not clean if read directly.

## Where these four forms actually live in the product

Only `care_plan_review` is a check; the other three are reached from their own departments and
never appear on the compliance matrix.
- `care_plan_review` ("Individual Plan Review") — Service Users, the **Care Plan Review** check
  (interval), and a column on the Service Users register.
- `complaints_concerns` ("Complaint Investigation Form") — Complaints, inside a complaint; pinned
  to the top because nothing else can be filed until it exists.
- `complaint_response` ("Complaint Response Form") — Complaints, the reply to the complainant; can
  exist per branch, which is why its branch dropdown matters.
- `return_to_work` — People > Absence, the RTW interview.

## Where it stood on 2026-09-09

The forms themselves were BUILT (Annual Appraisal scored, Manual Handling, Medication, Audit,
Mentoring, Financial Transaction, Return to Work, Lead the Leader) and the Compliance Summary view
finished. One to One's is parked — Phil, 2026-09-09: "leave the one 2 one for now". Phil then
paused to REVIEW THE FORMS himself before step 5, and will come back.

Related: [operations](operations.md) [launch-form-set](launch-form-set.md) [the-list](the-list.md) [look-at-the-artefact](../process/look-at-the-artefact.md)
