-- 0311_adding_a_person_writes_their_tracker_too
--
-- Phil, 2026-09-21, a Supervisor pressing Add person: "new row violates row-level security policy
-- for table person_trackers".
--
-- 0309 gave the Supervisor the two registers and everything that READS off a record, and missed
-- the two little WRITE helpers underneath: `can_manage_person` and `can_manage_service_user`,
-- which still asked is_branch_manager. Adding a carer writes `people` AND a `person_trackers` row
-- for the DBS, right to work and probation dates, so the insert got half way and was refused --
-- the exact shape of failure 0309 set out to stop, one layer further down.
--
-- Both helpers now ask is_branch_lead, which is the one question everything else asks. That also
-- covers person_assignments and service_user_assignments, which are written the same way.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.can_manage_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person_id
      and ( public.is_platform_admin()
         or public.is_company_admin(pe.company_id)
         or public.is_branch_lead(pe.branch_id) )
  );
$$;

create or replace function public.can_manage_service_user(p_service_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.service_users su
    where su.id = p_service_user_id
      and ( public.is_platform_admin()
         or public.is_company_admin(su.company_id)
         or public.is_branch_lead(su.branch_id) )
  );
$$;
