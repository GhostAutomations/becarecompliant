-- 0114_on_call_people_roster_read
-- The On Call role (0113) needs to read the STAFF ROSTER so the Absence
-- department works (pick who was absent) and on-call calls can be attributed to a
-- staff member. It still gets NO People compliance department: the app redirects
-- the On Call role away from /people, /people/training and /people/holiday, so
-- this read is only ever exercised by the Absence register and the On Call forms.
-- Additive: every role that could read People keeps its access.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists people_select on public.people;
create policy people_select on public.people
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_team_member(branch_id)
    or public.is_person_supervisor(id)
    or public.is_company_on_call(company_id)
    or profile_id = auth.uid()
  );
