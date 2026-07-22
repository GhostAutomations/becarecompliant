# Regulator mapping layer + AI: a sketch

How Be Care Compliant could map everything it already holds to the CQC and CIW frameworks, and let AI produce readiness, narrative and gap analysis from it. This is a design sketch, not a build.

## The idea in one line

Add a thin mapping layer that says "this check / form / outcome is evidence for that CQC quality statement or CIW theme," compute readiness against the regulator's own structure from data you already have, then let AI write the narrative and flag the gaps.

## Three layers

```
  DATA YOU ALREADY HAVE                MAPPING LAYER (new)              OUTPUT
  ---------------------                ------------------              ------
  check_definitions ----\
  check_instances (RAG) --\                                       /-- Readiness view
  evidence (forms) --------+--->  check/form/outcome  --->  per   +-- AI narrative draft
  service_user_outcomes --/       mapped to a           requirement   (we-statements / themes)
  satisfaction -----------/       framework requirement  readiness  \-- Gap + risk list
```

Nothing about the compliance loop changes. The mapping layer is metadata on top.

## Reference data (founder curated, seeds every company)

The regulators' asks live as master data you curate once, like the form library.

```sql
-- The regulator requirements themselves.
create table framework_requirements (
  id           uuid primary key,
  regulator    text check (regulator in ('cqc','ciw')),
  -- CQC: key question (safe/effective/caring/responsive/well_led)
  -- CIW: theme (wellbeing/care_support/leadership/environment)
  key_area     text not null,
  code         text not null,          -- e.g. CQC quality-statement code
  title        text not null,          -- the "we statement" text / CIW sub-area
  -- CQC only: which of the six evidence categories this leans on
  evidence_category text,              -- people_experience | staff_feedback |
                                       -- partner_feedback | observation |
                                       -- processes | outcomes
  active       boolean default true,
  sort_order   int default 0
);
```

That is 34 CQC quality statements (under the 5 key questions) plus the CIW themes. You maintain it in the Founder console.

## The mapping (the new bit)

Which of a company's checks / forms / outcomes evidence which requirement. Many to many. Seeded from a master mapping keyed by check kind, then adjustable per company.

```sql
create table requirement_evidence_map (
  id             uuid primary key,
  company_id     uuid not null references companies(id),
  requirement_id uuid not null references framework_requirements(id),
  -- exactly one of these is set: what provides the evidence
  check_definition_id uuid references check_definitions(id),
  source_kind    text,                 -- 'check' | 'outcomes' | 'satisfaction' | 'complaints'
  unique (company_id, requirement_id, check_definition_id)
);
```

Example rows (People, Thistle):

- Supervision + Annual Appraisal checks  ->  CQC "Effective: staff supervision and development" + CIW "Leadership and Management".
- Care Plan Review check  ->  CQC "Responsive: person centred care" + CIW "Care and Support".
- Personal Outcomes  ->  CQC "Effective: outcomes" + CIW "Wellbeing".
- Satisfaction  ->  CQC "Caring / people's experience".
- Spot Check  ->  CQC "observation".

## Readiness (computed, not stored)

For each requirement, roll up the RAG of its mapped checks across active records, exactly like the register rollup you already do, plus "is there recent evidence":

```
readiness(requirement) =
   for each mapped check:
      on_time_% and RAG across active records   (reuse existing rollup)
      count + latest of linked evidence          (reuse evidence table)
   => requirement status: green / amber / red + evidence present y/n
```

So a "Framework readiness" screen falls out with no AI at all: every CQC quality statement and CIW theme shown green / amber / red, drillable to the exact overdue item. That alone is a strong feature and the honest base the AI builds on.

## Where AI plugs in

A read only, tool using assistant that never sees another tenant's data and works entirely from the readiness payload above.

```
buildFrameworkPayload(company, regulator, role/branch scope)
   -> per requirement: title, mapped checks, on-time %, RAG,
      evidence count + pointers, outcomes/satisfaction summary
   -> Anthropic Messages API (tools map to existing helpers)
   -> three outputs:
        1. Readiness summary  ("Well-led: amber, 2 branches late on supervision")
        2. Narrative draft     (the CQC we-statement / CIW theme write-up)
        3. Gap + risk list      ("QS X has no evidence in 90 days; book these")
   -> manager edits + signs off -> export into the inspection pack / PQS return
```

Key point: the AI writes *around* structured facts it is handed, citing evidence IDs, rather than roaming free over records. Retrieval over structured data first; raw form/evidence text only where needed and permitted.

## Guardrails (all fit your existing patterns)

- Read only by default; every call scoped by the caller's role and branch (RLS), single tenant, audit logged.
- Special category (Service User) data stays in tenant; the payload prefers counts, statuses and pointers over raw health content.
- Human in the loop on anything evidential or customer facing; nothing auto submits.
- Metered through the AI credit meter you already have; gated by tier.
- No training on customer data; processor terms already in the subscription agreement.

## Suggested phases

1. **Mapping + readiness, no AI.** Reference tables, the founder curated map, and a "Framework readiness" view per CQC quality statement and CIW theme from existing RAG and evidence. Useful and safe on its own.
2. **AI narrative + gap analysis** on top of that payload: draft the we statements / theme write ups and the gap list, editable and signed off.
3. **Assistant Q&A** over the framework: "are we ready for Well led," "what's missing for Care and Support," scoped to role and branch.

## Two honest gaps to plan for

- CQC "feedback from partners" and CIW "Environment" are the areas you hold least. Partner feedback could be a light new capture; Environment (premises) is mostly out of scope unless you add environment checks.
- The master mapping needs care to get right once (which check evidences which statement). That curation is the real work; the plumbing is small.
