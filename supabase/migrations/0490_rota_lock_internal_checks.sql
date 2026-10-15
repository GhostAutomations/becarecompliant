-- 0490 Rota and Visits (beta): lock the internal rule checks (found by the security advisor review
-- of 0489, 2026-10-15).
--
-- 0489's rule checks (rota_dbs_state, rota_rtw_red, rota_unavailable_reason, rota_assign_refusal,
-- rota_removal_refusal, rota_shift_dbs_paired, rota_can_office) were executable by any signed in
-- user for any person id. rota_unavailable_reason answers in words ("is absent", "is on long term
-- sick") with the person's name, so a user of another company could have learned health related
-- facts about people they may not see. They are only ever called from inside the rota's own
-- SECURITY DEFINER functions, which run as the owner, so execute is taken away from everyone else.
--
-- The office screen gets one guarded way in instead: rota_candidates(shift), which answers only
-- for a shift the caller may run, and only about people in the caller's own rota branches.
-- Only 0489's own new functions are touched.

revoke execute on function public.rota_dbs_state(uuid, date) from public, anon, authenticated;
revoke execute on function public.rota_rtw_red(uuid, date) from public, anon, authenticated;
revoke execute on function public.rota_unavailable_reason(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rota_assign_refusal(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rota_removal_refusal(uuid) from public, anon, authenticated;
revoke execute on function public.rota_shift_dbs_paired(uuid) from public, anon, authenticated;
revoke execute on function public.rota_can_office(uuid) from public, anon, authenticated;

-- Who could go on this shift, and if not, why. For the office's person picker.
create or replace function public.rota_candidates(p_shift uuid)
returns table (person_id uuid, full_name text, job_title text, branch_id uuid, dbs text, refusal text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  s record;
  v_branches uuid[];
  v_founder boolean;
begin
  select * into s from public.rota_shifts where id = p_shift;
  if s.id is null or not public.rota_can_office(s.branch_id) then
    raise exception 'That shift could not be found.' using errcode = 'P0002';
  end if;
  v_branches := public.rota_office_branch_ids();
  v_founder := public.is_platform_admin();
  return query
    select pe.id, pe.full_name, pe.job_title, pe.branch_id,
           public.rota_dbs_state(pe.id, s.shift_date),
           public.rota_assign_refusal(p_shift, pe.id, null)
      from public.people pe
     where pe.company_id = s.company_id
       and pe.archived_at is null
       and pe.employment_status <> 'leaver'
       and (v_founder or pe.branch_id = any (v_branches))
     order by pe.full_name;
end;
$$;
revoke all on function public.rota_candidates(uuid) from public, anon;
grant execute on function public.rota_candidates(uuid) to authenticated;
