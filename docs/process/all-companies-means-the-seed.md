# "All companies" means the seed, not just the rows

STANDING RULE, Phil, 2026-09-04 (Operation Thistle):

> "when i say all companies i also mean future companies"

When Phil says a default is wrong "for all companies", the change is not done until
BOTH of these are true:

1. **The seed function changes.** The wrong value must never be created again. For
   Be Care Compliant that means the `seed_company_*` functions in Supabase —
   `seed_company_people_checks`, `seed_company_job_titles`,
   `seed_company_service_user_checks`, `seed_company_training_courses`,
   `seed_requirement_map`. Every provisioning route (founder-created and trial
   provisioned, migrations 0152/0153/0154/0161) calls those same functions, so
   changing the function covers every future company in one place.
2. **Existing companies are moved**, scoped so it cannot overwrite a deliberate
   choice or disturb live work. The pattern used: only touch rows that are still
   EXACTLY as seeded (same value, and for ordered lists the same position), and
   never where the company has already worked with it (e.g. a completed check
   instance). Never delete: a company that removed something does not get it back.

Worked examples (both applied 2026-09-04, migrations 0216 and 0217):

- **Spot Check 90 -> 30 days.** 0216 reseeds at 30 and updates existing rows still
  at exactly 90 with no completed Spot Check.
- **Supervisor + Senior Supervisor job titles.** 0217 seeds eleven titles and adds
  the two to existing companies, renumbering only rows still carrying both the
  seeded title and its original position. Phil was editing Thistle's list at the
  same time; his removals survived, which is the test of the scoping.

The related trap is in [seed-checks-values-null-gotcha](../decisions/seed-checks-values-null-gotcha.md): an all-NULL Postgres
VALUES column types as text, so cast it.
