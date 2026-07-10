-- 0037_reschedule_branch_reviews
-- Switching a branch between Simple and Complex changes the Care Plan Review cadence
-- (Simple = annual, Complex = 80 day rolling). The register derives the Review 1-4
-- slots positionally from the completion history, so those recompute automatically,
-- but the check_instance.due_date (which drives the RAG rollup) must be re-anchored to
-- the new interval: due = the last completion (or the package start if none) + the new
-- interval. This RPC does that for every active-form Care Plan Review in a branch.
-- Company Admin / Platform only. Applied to the becarecompliant project ONLY.

create or replace function public.reschedule_branch_reviews(p_branch_id uuid, p_interval_days int)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  n int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select company_id into v_company from public.branches where id = p_branch_id;
  if v_company is null then raise exception 'Unknown branch'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    raise exception 'Not allowed to reschedule this branch';
  end if;
  if p_interval_days is null or p_interval_days < 1 then raise exception 'Invalid interval'; end if;

  update public.check_instances ci
  set due_date = (coalesce(ci.last_completed_on, su.package_start_date)
                    + make_interval(days => p_interval_days))::date,
      updated_at = now()
  from public.service_users su
  join public.check_definitions cd
    on cd.company_id = su.company_id and cd.population = 'service_users' and cd.key = 'care_plan_review'
  where ci.service_user_id = su.id
    and ci.definition_id = cd.id
    and ci.record_type = 'service_user'
    and su.branch_id = p_branch_id;

  get diagnostics n = row_count;
  return n;
end;
$$;
