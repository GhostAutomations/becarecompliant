-- Be Care Compliant: the Individual Plan Review writes to the Outcomes page (Phil, 2026-10-05).
--
-- Each update a review logs, and the outcome it creates, remember the Evidence they came
-- from, under unique indexes, so a resubmitted review can never log the same update or
-- create the same outcome twice (lib/service-users/outcomes-review-apply.ts).

alter table public.service_user_outcome_updates
  add column if not exists evidence_id uuid references public.evidence(id) on delete set null;
create unique index if not exists service_user_outcome_updates_evidence_once
  on public.service_user_outcome_updates (outcome_id, evidence_id)
  where evidence_id is not null;

alter table public.service_user_outcomes
  add column if not exists source_evidence_id uuid references public.evidence(id) on delete set null;
create unique index if not exists service_user_outcomes_source_evidence_once
  on public.service_user_outcomes (source_evidence_id)
  where source_evidence_id is not null;
