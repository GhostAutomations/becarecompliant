-- 0099_care_plan_versioning
-- A service user's care plan is versioned by effective date. Each version is the
-- set of care_plan_entries sharing an effective_from; the CURRENT version has
-- effective_to null. Updating the plan closes the current version (effective_to =
-- new start - 1 day) and opens a new one, so past plans are kept, not deleted, and
-- the invoice can bill the correct version for each day of a period.
alter table public.care_plan_entries
  add column if not exists effective_from date,
  add column if not exists effective_to date;

-- Existing entries become the current, open-ended version (billed for any period).
update public.care_plan_entries
  set effective_from = '2020-01-01'
  where effective_from is null;

alter table public.care_plan_entries
  alter column effective_from set not null,
  alter column effective_from set default current_date;

create index if not exists care_plan_entries_su_effective_idx
  on public.care_plan_entries (service_user_id, effective_from, effective_to);
