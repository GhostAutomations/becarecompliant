-- 0032_setup_keep_due_and_rag
-- Setup check display fixes (Phil, 2026-07-10):
--  1. Completing a one-off Service User check (Setup) must KEEP its due date, so the
--     register can still show when it was due (previously complete_check nulled the
--     due for non-recurring checks, so Setup Due vanished on completion). People
--     one-offs are unchanged (they still null, to preserve Phase 3 behaviour).
--  2. A completed one-off counts as compliant (green) in the RAG rollup, even though
--     its (past) due date is kept for display. The register colours the Setup
--     Completed date itself green (on time) or red (late) in the UI.
--  3. Backfill: restore the due date for any Setup already completed (its due was
--     nulled before this fix) from the package start + the day offset.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- 1. complete_check: keep the due date for a completed Service User one-off.
create or replace function public.complete_check(
  p_instance_id uuid,
  p_completed_on date,
  p_evidence_id uuid,
  p_next_due date,
  p_expiry_date date default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_person uuid;
  v_service_user uuid;
  v_recurring boolean;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.person_id, ci.service_user_id, cd.recurring, ci.last_evidence_id
    into v_person, v_service_user, v_recurring, v_existing
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;

  if v_person is null and v_service_user is null then raise exception 'Unknown check'; end if;

  if v_person is not null then
    if not public.can_complete_person_check(v_person) then
      raise exception 'Not allowed to complete this check';
    end if;
  else
    if not public.can_complete_service_user_check(v_service_user) then
      raise exception 'Not allowed to complete this check';
    end if;
  end if;

  if v_existing is not null and v_existing = p_evidence_id then return; end if;

  update public.check_instances set
    last_completed_on = p_completed_on,
    last_evidence_id = p_evidence_id,
    expiry_date = coalesce(p_expiry_date, expiry_date),
    -- Recurring: advance to the next due. Service User one-off (Setup): keep the due
    -- for display. People one-off: clear it (Phase 3 behaviour).
    due_date = case
      when v_recurring then p_next_due
      when v_service_user is not null then due_date
      else null
    end,
    updated_at = now()
  where id = p_instance_id;
end;
$$;

-- 2. SU check-status views: a completed one-off is compliant (green) in the rollup,
-- regardless of its kept (past) due date. Outstanding checks keep the RAG countdown.
create or replace view public.service_user_check_status
  with (security_invoker = true) as
select
  ci.id            as instance_id,
  ci.company_id,
  ci.branch_id,
  ci.service_user_id,
  ci.definition_id,
  cd.key           as check_key,
  cd.name          as check_name,
  cd.population,
  cd.recurring,
  cd.anchor,
  cd.form_id,
  cd.expiry_field_key,
  ci.due_date,
  ci.last_completed_on,
  ci.expiry_date,
  ci.last_evidence_id,
  coalesce(cd.amber_days, co.amber_days_default, 30) as effective_amber,
  case
    when not cd.recurring and ci.last_completed_on is not null then 'green'
    else public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30))
  end as rag
from public.check_instances ci
join public.check_definitions cd on cd.id = ci.definition_id
join public.service_users su on su.id = ci.service_user_id
join public.companies co on co.id = ci.company_id
where ci.active
  and cd.active
  and su.service_status = 'active'
  and su.archived_at is null;

create or replace view public.service_user_check_status_all
  with (security_invoker = true) as
select
  ci.id            as instance_id,
  ci.company_id,
  ci.branch_id,
  ci.service_user_id,
  ci.definition_id,
  cd.key           as check_key,
  cd.name          as check_name,
  cd.population,
  cd.recurring,
  cd.anchor,
  cd.form_id,
  cd.expiry_field_key,
  ci.due_date,
  ci.last_completed_on,
  ci.expiry_date,
  ci.last_evidence_id,
  coalesce(cd.amber_days, co.amber_days_default, 30) as effective_amber,
  case
    when not cd.recurring and ci.last_completed_on is not null then 'green'
    else public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30))
  end as rag
from public.check_instances ci
join public.check_definitions cd on cd.id = ci.definition_id
join public.service_users su on su.id = ci.service_user_id
join public.companies co on co.id = ci.company_id
where ci.active and cd.active;

-- 3. Restore the kept due date for Service User one-offs already completed.
update public.check_instances ci
set due_date = (su.package_start_date + make_interval(days => cd.interval))::date
from public.service_users su, public.check_definitions cd
where ci.service_user_id = su.id
  and ci.definition_id = cd.id
  and cd.population = 'service_users'
  and cd.recurring = false
  and ci.last_completed_on is not null
  and ci.due_date is null
  and su.package_start_date is not null
  and cd.interval is not null;
