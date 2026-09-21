-- 0312_a_ticked_department_is_one_they_can_actually_use
--
-- Phil, 2026-09-21: "They need access to this, if the boxes are checked in the access tiles they
-- should be able to do it. I don't want to have to keep coming back to fix things. This looks bad
-- when Thistle is reporting issues."
--
-- He is right, and it is the same fault three times now (DEF-023, DEF-028, DEF-031): a screen
-- offering what the database refuses. The ceiling in lib/auth/module-catalogue.ts has said for
-- weeks that a Supervisor opens Holiday and Absence. The policies underneath let her write only
-- for a carer on her own CASELOAD (is_person_supervisor), so recording a sickness for anybody
-- else in her branch was refused after she had filled the form in.
--
-- Absence and Holiday now ask is_branch_lead -- Manager, Supervisor, and (0310) Recruiter across
-- the company -- which is the same question the two registers ask. The caseload clauses stay: a
-- Supervisor keeps her own people wherever they sit.
--
-- WHAT STAYS WITH MANAGERS AND ABOVE, and is ticked that way in the catalogue too, so the screen
-- and the policy agree: Invoicing, Readiness, Reports, Whistleblowing, Settings, and inviting a
-- user. Money, the regulator's return and who may log in.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- Absence: the event, and the return to work meeting.
-- ===========================================================================
drop policy if exists absence_events_select on public.absence_events;
create policy absence_events_select on public.absence_events for select using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or is_person_supervisor(person_id)
  or is_company_on_call(company_id)
  or exists (select 1 from public.people pe where pe.id = absence_events.person_id and pe.profile_id = auth.uid())
);
drop policy if exists absence_events_insert on public.absence_events;
create policy absence_events_insert on public.absence_events for insert with check (
  is_company_member(company_id) and (
    is_company_admin(company_id)
    or (branch_id is not null and is_branch_lead(branch_id))
    or is_company_on_call(company_id)
  )
);
drop policy if exists absence_events_update on public.absence_events;
create policy absence_events_update on public.absence_events for update using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
) with check (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
);

drop policy if exists absence_meetings_select on public.absence_meetings;
create policy absence_meetings_select on public.absence_meetings for select using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or is_person_supervisor(person_id)
  or is_company_on_call(company_id)
  or exists (select 1 from public.people pe where pe.id = absence_meetings.person_id and pe.profile_id = auth.uid())
);
drop policy if exists absence_meetings_insert on public.absence_meetings;
create policy absence_meetings_insert on public.absence_meetings for insert with check (
  is_company_member(company_id) and (
    is_company_admin(company_id)
    or (branch_id is not null and is_branch_lead(branch_id))
    or is_company_on_call(company_id)
  )
);
drop policy if exists absence_meetings_update on public.absence_meetings;
create policy absence_meetings_update on public.absence_meetings for update using (
  is_platform_admin() or is_company_admin(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
) with check (is_company_member(company_id));
-- A meeting with Evidence against it is never deleted, whoever asks: that clause stays.
drop policy if exists absence_meetings_delete on public.absence_meetings;
create policy absence_meetings_delete on public.absence_meetings for delete using (
  evidence_id is null and (
    is_platform_admin() or is_company_admin(company_id)
    or (branch_id is not null and is_branch_lead(branch_id))
  )
);

-- ===========================================================================
-- Holiday: booking for somebody else, and seeing the branch's requests.
-- ===========================================================================
create or replace function public.can_manage_holiday(p_company uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    public.is_platform_admin()
    or public.is_company_wide(p_company)
    or (p_branch is not null and public.is_branch_lead(p_branch));
$$;

drop policy if exists holiday_requests_select on public.holiday_requests;
create policy holiday_requests_select on public.holiday_requests for select using (
  is_platform_admin() or is_company_wide(company_id)
  or (branch_id is not null and is_branch_lead(branch_id))
  or (person_id is not null and is_person_supervisor(person_id))
  or requested_by = auth.uid()
  or exists (select 1 from public.people pe where pe.id = holiday_requests.person_id and pe.profile_id = auth.uid())
);
