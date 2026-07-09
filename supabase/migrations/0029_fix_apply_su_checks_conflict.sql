-- 0029_fix_apply_su_checks_conflict
-- Bug: apply_service_user_checks used `on conflict (definition_id, service_user_id)
-- do nothing`, but check_instances_service_user_uq is a PARTIAL unique index
-- (WHERE service_user_id is not null). Postgres cannot use a partial index as an
-- ON CONFLICT arbiter unless the same predicate is given, so the INSERT raised and
-- createServiceUser (which swallows the apply error) created Service Users with ZERO
-- checks. Fix: add the matching WHERE predicate to the ON CONFLICT. Then backfill the
-- missing check instances for existing Service Users so their register/record is
-- correct without re-adding them.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.apply_service_user_checks(p_service_user_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_branch uuid;
  r jsonb;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_service_user(p_service_user_id) then
    raise exception 'Not allowed to manage this record';
  end if;

  select company_id, branch_id into v_company, v_branch
    from public.service_users where id = p_service_user_id;
  if v_company is null then raise exception 'Unknown record'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, service_user_id, due_date, expiry_date)
    select v_company, v_branch, (r->>'definition_id')::uuid, 'service_user', p_service_user_id,
           nullif(r->>'due_date','')::date, nullif(r->>'expiry_date','')::date
    where exists (
      select 1 from public.check_definitions cd
      where cd.id = (r->>'definition_id')::uuid and cd.company_id = v_company
    )
    on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

-- Backfill: create the missing active-definition instances for every Service User
-- that has none. Completion-anchored recurring checks are scheduled from the package
-- start date + one interval (matching the app's initialDueDate); expiry-anchored or
-- non-recurring checks start with a null due date.
insert into public.check_instances
  (company_id, branch_id, definition_id, record_type, service_user_id, due_date)
select su.company_id, su.branch_id, cd.id, 'service_user', su.id,
  case
    when cd.anchor = 'completion' and cd.recurring
      and su.package_start_date is not null and cd.frequency is not null and cd.interval is not null
    then (su.package_start_date + make_interval(
            days  => (case when cd.frequency = 'day'  then cd.interval else 0 end),
            weeks => (case when cd.frequency = 'week' then cd.interval else 0 end),
            months=> (case when cd.frequency = 'month' then cd.interval else 0 end),
            years => (case when cd.frequency = 'year' then cd.interval else 0 end)
         ))::date
    else null
  end
from public.service_users su
join public.check_definitions cd
  on cd.company_id = su.company_id and cd.population = 'service_users' and cd.active
where not exists (
  select 1 from public.check_instances ci
  where ci.service_user_id = su.id and ci.definition_id = cd.id
)
on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
