# Seed checks values null gotcha

> BCC seed_company_people_checks amber_days text-vs-int bug and the Postgres VALUES all-null gotcha

Found + fixed during Phase 9 testing (2026-07-14, migration 0062). `seed_company_people_checks` failed on EVERY new company with "column amber_days is of type integer but expression is of type text", so newly created companies got their Service User checks, starter forms and training seeded but ZERO People checks (supervision, spot check, appraisal, medication competency, manual handling).

**Root cause / STANDING GOTCHA:** an all-NULL column in a Postgres `VALUES (...)` list is inferred as type `text`. Every row in the seed function's VALUES had a bare `null` for amber_days, so that column typed as text and clashed with the integer `check_definitions.amber_days`. Fix: cast it (`v.amber_days::int`; `null::int` stays null). Whenever you insert into a typed column from a VALUES source where a column is all-NULL, cast the NULLs.

`check_definitions.amber_days` is a nullable integer with no default; NULL means the RAG engine uses the default amber window. Service User seeding was never affected (its VALUES don't have an all-null integer column).

Only Thistle Care Wales exists as a real company and it already had its checks. If any company was created between the amber_days addition and 0062, re-run `seed_company_people_checks(cid)` for it (idempotent, on-conflict-do-nothing).

Related: [project-state](project-state.md), [phase3-decisions](phase3-decisions.md)
