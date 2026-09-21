-- 0313_a_recruiter_offered_on_the_planner_can_be_given_the_visit
--
-- Found by scripts/access-probe.sql (0312) rather than by Thistle, which is the whole point of
-- the probe: the Planner's "who is doing it" list has named Recruiters since 0310
-- (lib/planner/data.ts CONDUCTOR_ROLES), and the trigger underneath refused them with
-- "A task can only be given to somebody who carries checks out: an Admin, a Registered role, a
-- Manager or a Supervisor." A name in the dropdown that cannot be chosen is the same defect as a
-- ticked box that does nothing.
--
-- Phil, on the Recruiter, twice: "same as a supervisor". A Supervisor conducts, so a Recruiter
-- conducts.
--
-- NOT CHANGED HERE, and not an oversight: who may hold a formal ABSENCE meeting stays with
-- Managers and Admins (lib/absence/data.ts listMeetingConductors and the same list in
-- lib/absence/actions.ts). The screen there offers exactly who the code accepts, so there is
-- nothing promised that is then refused. A stage meeting can end in a warning, and that is a
-- Manager's to hold.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.is_company_conductor(cid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = pid
      and p.company_id = cid
      and p.status = 'active'
      and p.role in (
        'company_admin', 'registered_individual', 'registered_manager',
        'manager', 'supervisor', 'recruiter'
      )
  );
$$;
