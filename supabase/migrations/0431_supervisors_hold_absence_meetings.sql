-- 0431_supervisors_hold_absence_meetings
-- Phil, 2026-10-08 (Thistle): Supervisors can hold absence meetings, for every company.
-- Holding the meeting includes discounting absences in the meeting form, so a Supervisor may now
-- discount (and count again) absences for people in their own branch(es), like a Branch Manager.
-- Everything else a Supervisor needs was already allowed: recording the meeting, the AI questions
-- and the outcome letter (can_prepare_absence_meeting), and being booked as the person holding it
-- (is_company_conductor). Who appears in "Who is holding it" is decided in the app
-- (lib/absence/conductor-roles.ts): Supervisors whose company has Absence ticked for them.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.can_discount_absence(p_person uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person
      and ( public.is_company_admin(pe.company_id)
         or public.is_company_wide(pe.company_id)
         or (pe.branch_id is not null and public.is_branch_manager(pe.branch_id))
         or public.is_person_supervisor(pe.id) )
  );
$$;
