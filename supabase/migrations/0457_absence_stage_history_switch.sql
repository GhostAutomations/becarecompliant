-- 0457: the absence stage history switch (Phil, 2026-10-13; docs/decisions/absence-stage-history.md).
--
-- WHAT IT DOES. A per company switch, companies.absence_stage_history. With it on, a person's
-- absence stages are worked out at the date of each absence instead of back from today, and every
-- stage reached stays on the record (Due, Pending or Dealt with) until its meeting is held
-- (lib/absence/stage-history.ts, read through lib/absence/stage-switch.ts). With it off, every
-- screen, count, check and letter works exactly as before.
--
-- ON FOR BEVAN ONLY (Phil: "Bevan only first"). Off for Thistle and every other company, and for
-- every new company (the default). Turning it on later is this one column, no code change.
--
-- Only Be Care Compliant may change it: added to companies_guard_founder_columns, the same guard
-- as framework_enabled and the other founder settings. The function below is 0449's, with the
-- one new column added; nothing else in it changes.
--
-- No data moves and no stored stage changes: the history is worked out when it is read.
-- Safe to run twice.

alter table public.companies
  add column if not exists absence_stage_history boolean not null default false;

comment on column public.companies.absence_stage_history is
  'Absence stages worked out at the date of each absence, each stage kept until dealt with (0457). Founder only.';

update public.companies
   set absence_stage_history = true
 where id = '84172279-54e4-4d5b-94b4-c92dc05c6baa'  -- Bevan Care Ltd, the test company
   and absence_stage_history is distinct from true;

create or replace function public.companies_guard_founder_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if new.tier is distinct from old.tier
     or new.status is distinct from old.status
     or new.trial_started_at is distinct from old.trial_started_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.trial_owner_email is distinct from old.trial_owner_email
     or new.trial_owner_domain is distinct from old.trial_owner_domain
     or new.provisioned_by is distinct from old.provisioned_by
     or new.deleted_at is distinct from old.deleted_at
     or new.purge_after is distinct from old.purge_after
     or new.slug is distinct from old.slug
     or new.framework_enabled is distinct from old.framework_enabled
     or new.agreement_required is distinct from old.agreement_required
     or new.is_test is distinct from old.is_test
     or new.branch_word is distinct from old.branch_word
     or new.branch_word_plural is distinct from old.branch_word_plural
     or new.historic_outcomes_until is distinct from old.historic_outcomes_until
     or new.absence_stage_history is distinct from old.absence_stage_history then
    raise exception 'Only Be Care Compliant can change your plan, trial or account status.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
