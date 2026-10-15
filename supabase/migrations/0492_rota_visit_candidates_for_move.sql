-- Rota and Visits Stage 2 fix (found in the screen test, 2026-10-15): the Move picker listed every
-- carer as "This visit already has all the carers it needs", because the list still counted the
-- carer being moved. rota_visit_move itself already ignores that place. This adds a second form of
-- rota_visit_candidates that is told which place is being moved: the place must be active on this
-- visit, its carer is left off the list, and every other carer is judged as if that place were free.
-- The one argument form (Add carer) is unchanged. Additive only: no existing object is altered.

create or replace function public.rota_visit_candidates(p_visit uuid, p_moving uuid)
returns table (person_id uuid, full_name text, job_title text, branch_id uuid, dbs text, refusal text,
               home_postcode text, preferred boolean, continuity integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v record; v_branches uuid[]; v_founder boolean; v_moving_person uuid;
begin
  select * into v from public.rota_visits where id = p_visit;
  if v.id is null or not public.rota_can_office(v.branch_id) then
    raise exception 'That visit could not be found.' using errcode = 'P0002';
  end if;
  select a.person_id into v_moving_person from public.rota_visit_assignments a
   where a.id = p_moving and a.visit_id = p_visit and a.status = 'active';
  if v_moving_person is null then
    raise exception 'That carer is not on this visit.' using errcode = 'P0002';
  end if;
  v_branches := public.rota_office_branch_ids();
  v_founder := public.is_platform_admin();
  return query
    select pe.id, pe.full_name, pe.job_title, pe.branch_id,
           public.rota_dbs_state(pe.id, v.visit_date),
           public.rota_visit_refusal(p_visit, pe.id, p_moving),
           upper((regexp_match(coalesce(pe.home_address, ''), '([A-Za-z]{1,2}[0-9][A-Za-z0-9]? ?[0-9][A-Za-z]{2})'))[1]),
           exists (select 1 from public.rota_su_carer_prefs p where p.service_user_id = v.service_user_id and p.person_id = pe.id and p.kind = 'preferred'),
           (select count(*)::int from public.rota_visit_assignments a join public.rota_visits o on o.id = a.visit_id
             where a.person_id = pe.id and a.status = 'active' and o.service_user_id = v.service_user_id
               and o.status <> 'cancelled' and o.visit_date between v.visit_date - 56 and v.visit_date + 28)
      from public.people pe
     where pe.company_id = v.company_id and pe.archived_at is null and pe.employment_status <> 'leaver'
       and pe.id <> v_moving_person
       and (v_founder or pe.branch_id = any (v_branches))
     order by pe.full_name;
end;
$$;

revoke all on function public.rota_visit_candidates(uuid, uuid) from public, anon;
grant execute on function public.rota_visit_candidates(uuid, uuid) to authenticated;
