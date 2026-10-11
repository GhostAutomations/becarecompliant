-- Be Care Compliant 0444: role limits (security audit of 10 October 2026, step 7 of the audit fix
-- plan). The audit report is in BCC Documents, SECURITY-AUDIT-2026-10-10.md. Phil's decisions were
-- taken by popup on 11 October 2026 and are written in docs/decisions/permission-boundaries.md,
-- reg73.md, reg80.md, audit-2026-10-decisions.md and the-list.md. THE LIST 46 to 51 are parked and
-- are not built here.
--
-- 0443 kept every row inside its own company. Inside a company the database still trusted the
-- caller's role, and the record they named, far more than the screens do: a carer completed their
-- own Supervision with no form and moved it to 2099, a Supervisor approved holidays and closed a
-- carer's briefing by writing the table, any login read the Reg 80 safeguarding figures, and a
-- Person record could point at the Founder's login (all proved on Bevan). This closes it, finding
-- by finding, in the order the step 7 review set (shared functions are created before their users):
--
--   1. F11, F11b  The Founder login changes only in the SQL editor, with a switch for that one
--                 transaction. A Person record links only to a login of its own company, never the
--                 Founder's.
--   2. F60        Who added a record, and when, cannot be rewritten (section 6 reads both).
--   3. F8         The dates a completed form carries, worked out from its Evidence.
--   4. F8         Nobody completes a check on their own record. A Recruiter completes only the
--                 check they are booked on the Planner to carry out.
--   5. F8, F10    complete_check needs that check's own form, filled in by the caller and never
--                 dated in the future, and does the Appraisal and Supervision 3 follow on work
--                 itself. set_person_check_due only schedules Supervision 1 after a passed
--                 probation. reanchor_supervision_cycle can no longer be called.
--   6. F60        Check history with no Evidence: Admins and the Founder on any record, the rest of
--                 the office only on a person they added in the last hour, nobody on their own.
--   7. F59, F65   Moving open due dates follows who may manage the record. A check's settings are
--                 the Company Admin's.
--   8. F3         Who may fill in which form about which record (may_file_evidence), and a check's
--                 form cannot be dated in the future.
--   9. F55, F44   Only the person a briefing was sent to closes it. The office sends and withdraws.
--  10. F5, F7     Who approves a holiday, never their own. A new holiday carries no change in flight.
--                 Whoever booked someone else's holiday withdraws it while it waits.
--  11. F16, F52   Reg 73 visits and Reg 80 reviews: Admins, the Registered roles and Branch Managers
--                 (their own branches, view only).
--  12. F53        Readiness history: read by the readiness roles, stored once a day, changed by the
--                 Founder only.
--  13. F50        The Planner is read by the office in their branches, and by a booking's conductor
--                 and creator.
--  14. F9         anonymise_evidence is for the service role only.
--  15. F13        Every care plan file is kept and recorded as a version.
--      Then every revoke, and the company link triggers for the two new tables (0443).
-- The three People saves that failed silently (step 7, F59 and F65 side defects) are code only.
--
-- Deploy order: apply this before the code that needs it. The code live before it keeps working:
-- complete_check, set_person_check_due, seed_migrated_completion, reschedule_check_instances,
-- submit_evidence and the holiday functions keep their signatures. Until the code deploys, a
-- Supervisor's or Recruiter's booking lands Pending while the old screen says "Holiday booked."
-- with no email, and the retention cron needs expire_care_plan_file_retention from section 15.
-- Every section says what live data it was checked against first. Idempotent throughout (create or
-- replace, if not exists, drop if exists, on conflict do nothing).

set local lock_timeout = '5s';


-- =============================================================================================

-- 1. The Founder login, and which login a Person record may point at (audit F11 and F11b).
--    Phil's decisions by popup, 11 October 2026 (docs/decisions/permission-boundaries.md and
--    audit-2026-10-decisions.md):
--   - The Founder login (role platform_admin) is changed only directly in the Supabase SQL editor,
--     with a deliberate switch for that one transaction. Nothing in the app, the service role
--     included, can change its role, company or status, delete it, or make a second Founder.
--   - A Person record links only to a login of its own company that is not the Founder (F11b).
--     Before this, a Company Admin or a Supervisor could link one of their People to the Founder's
--     login, and the leaver step or Delete person would then switch it off or delete it.
--
--   THE SWITCH, for Phil only, in the Supabase SQL editor (never from code):
--     begin;
--     select set_config('bcc.founder_login_change', 'on', true);
--     update public.profiles set ... where id = '<the Founder login>';
--     commit;
--   It lasts for that transaction only. PostgREST does not expose set_config and GoTrue runs none
--   of our SQL, so no API request can turn it on. Same pattern as bcc.absence_discount.
--
-- Live data checked first (read only, 11 October 2026): one platform_admin login, active, with no
-- company; 54 People linked to a login, 0 of them to a login of another company or to the Founder.
-- Nothing in this section changes a row.

-- 1.1 (F11) The guard on profiles. aa_ so it runs before the other BEFORE triggers and its message
--     is the one shown. UPDATE OF keeps it off the frequent branch memory and planner view writes.
--     A delete from auth.users (GoTrue deleteUser, the Authentication screen) cascades to profiles,
--     so it reaches this trigger too and is refused for the Founder.
create or replace function public.guard_founder_login()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('bcc.founder_login_change', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'platform_admin' then
      raise exception 'The Be Care Compliant Founder login cannot be deleted.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'platform_admin' then
      raise exception 'Only Be Care Compliant can make a Founder login, directly in the database.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.role = 'platform_admin' then
    if new.role is distinct from old.role
       or new.company_id is distinct from old.company_id
       or new.status is distinct from old.status
       or new.company_role_id is distinct from old.company_role_id
       or new.id is distinct from old.id then
      raise exception 'The Be Care Compliant Founder login cannot be moved to a company, given another role or switched off.'
        using errcode = '42501';
    end if;
  elsif new.role = 'platform_admin' then
    raise exception 'Only Be Care Compliant can make a Founder login, directly in the database.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_aa_founder_login_guard on public.profiles;
create trigger profiles_aa_founder_login_guard
  before insert or update of role, company_id, status, company_role_id, id or delete on public.profiles
  for each row execute function public.guard_founder_login();

-- 1.2 (F11b) A Person's login must be a login OF THAT COMPANY and never the Founder. 0443 lets an
--     author column point at a login with no company (the Founder in support mode); this column is
--     different, because the service role acts on the login it names: the leaver step closes it and
--     Delete person deletes it. Clearing the link (a rejoin, or the login being deleted) always passes.
create or replace function public.enforce_person_login_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.profile_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id
     and new.company_id is not distinct from old.company_id then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = new.profile_id
       and p.company_id = new.company_id
       and p.role <> 'platform_admin'
  ) then
    raise exception 'A Person record can only be linked to a login of its own company.'
      using errcode = '42501', detail = 'people.profile_id';
  end if;
  return new;
end;
$$;

-- zz_ so it runs after zz_company_links, whose message names another company's login first.
drop trigger if exists zz_person_login_company on public.people;
create trigger zz_person_login_company
  before insert or update of profile_id, company_id on public.people
  for each row execute function public.enforce_person_login_company();


-- =============================================================================================

-- 2. Who added a record, and when, cannot be rewritten (audit F60, part 1).
--    The history guard in section 6 lets a Manager, Supervisor, Recruiter or Registered role record
--    history only on a person they added in the last hour, so it reads people.created_by and
--    people.created_at. Until now anyone who may edit a record could rewrite both (proved on Bevan,
--    1 row), which would have made any record look freshly added by them.
--    Only signed in users are held to it. When a login is deleted, Postgres empties created_by
--    (ON DELETE SET NULL) as the table owner, not as the signed in user, and server code and
--    database functions run as their own roles too, so those carry on (Settings delete user,
--    removing a demo login and deleting a Person with their login all delete logins that may
--    have added records). Nothing in the app writes either column after the insert.
create or replace function public.keep_record_creation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'When a record was added, and by whom, cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists people_keep_creation on public.people;
create trigger people_keep_creation
  before update of created_at, created_by on public.people
  for each row execute function public.keep_record_creation();

drop trigger if exists service_users_keep_creation on public.service_users;
create trigger service_users_keep_creation
  before update of created_at, created_by on public.service_users
  for each row execute function public.keep_record_creation();


-- =============================================================================================

-- Checks and Evidence: sections 3, 4, 5 and 8 of the step 7 order (audit F8, F10 and the second
-- half of F3). Phil's decisions by popup, 11 October 2026 (permission-boundaries.md, "Own record,
-- check dates and history"):
--   - Nobody, whatever their role, completes a check or moves a check's due date on their own
--     People record. On their own record people file only the forms their own page offers: a
--     holiday request, a financial transaction, signing what is sent to them, and a form sent to
--     them as a briefing.
--   - A check's form cannot be dated in the future (Europe/London today). Holiday and absence
--     forms are not checks and keep their future dates.
--   - Only the person a policy or briefing was sent to signs it (F44, F3 D4).
-- Order inside this part matters: section 3's SQL language helpers are checked when they are
-- created, so try_date comes first; section 8's may_file_evidence calls section 4's
-- can_complete_person_check.
-- Live code stays compatible: complete_check and set_person_check_due keep their signatures and
-- ignore the dates the code live before 0444 passes (it passes the same dates these work out),
-- and the follow on calls that code still makes after complete_check now fail quietly, as their
-- errors were never read, after complete_check has already done the same work.


-- 3. The dates a completed form carries, worked out in the database (audit F8).
--    complete_check took the completion date and the next due date from the caller, and never
--    looked at the Evidence: a carer marked their own Supervision done with no form, due in 2099,
--    and a Supervisor reused one Supervision to complete a Competency check (proved on Bevan).
--    The Evidence decides both now. Each helper mirrors a TypeScript rule the app already uses,
--    so a change to one side needs the same change on the other:
--      evidence_completion_date   lib/evidence/completion-date.ts (the paper date, then the date
--                                 question marked as the completion date, then the first date
--                                 question, then the day it was filed, in London)
--      evidence_retest_due        lib/forms/retest.ts (a failed Spot Check is due again in 7 days)
--      evidence_completes_check   lib/forms/stand-down.ts (a form that says it did not happen)
--      check_dates_from_evidence  lib/people/logic.ts nextDueAfterCompletion and lib/recurrence.ts,
--                                 with the Complex branch Care Plan Review cadence of
--                                 lib/service-users/advance-check.ts
--    Checked against every live completion that has Evidence before this was written.

-- 3.1 A text answer as a date, or null when it is not a real yyyy-mm-dd date.
create or replace function public.try_date(p text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end;
$$;

-- 3.2 When the Evidence says the work happened.
create or replace function public.evidence_completion_date(p_answers jsonb, p_schema jsonb, p_submitted_at timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    public.try_date(p_answers ->> '__completed_on'),
    public.try_date(case when jsonb_typeof(p_answers -> k.date_key) = 'string' then p_answers ->> k.date_key end),
    (p_submitted_at at time zone 'Europe/London')::date
  )
  from (
    select (
      select x.f ->> 'key'
        from jsonb_array_elements(case when jsonb_typeof(p_schema -> 'sections') = 'array'
                                       then p_schema -> 'sections' else '[]'::jsonb end) with ordinality s(sec, si),
             jsonb_array_elements(case when jsonb_typeof(s.sec -> 'fields') = 'array'
                                       then s.sec -> 'fields' else '[]'::jsonb end) with ordinality x(f, fi)
       where x.f ->> 'type' = 'date'
         and jsonb_typeof(x.f -> 'key') = 'string' and x.f ->> 'key' <> ''
       order by (x.f -> 'completionDate') = 'true'::jsonb desc nulls last, s.si, x.fi
       limit 1
    ) as date_key
  ) k;
$$;

-- 3.3 The retest an answer calls for (retestWithin on the question), the soonest when several do.
create or replace function public.evidence_retest_due(p_answers jsonb, p_schema jsonb, p_done date)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select min(p_done + r.days)
    from jsonb_array_elements(case when jsonb_typeof(p_schema -> 'sections') = 'array'
                                   then p_schema -> 'sections' else '[]'::jsonb end) s(sec),
         jsonb_array_elements(case when jsonb_typeof(s.sec -> 'fields') = 'array'
                                   then s.sec -> 'fields' else '[]'::jsonb end) x(f),
         lateral (
           select case when (x.f -> 'retestWithin' ->> 'days') ~ '^[0-9]{1,4}$'
                       then (x.f -> 'retestWithin' ->> 'days')::int end as days,
                  case jsonb_typeof(p_answers -> (x.f ->> 'key'))
                    when 'string' then p_answers ->> (x.f ->> 'key')
                    when 'boolean' then case when p_answers -> (x.f ->> 'key') = 'true'::jsonb then 'yes' else 'no' end
                  end as answer,
                  case when jsonb_typeof(x.f -> 'retestWithin' -> 'when') = 'array'
                       then x.f -> 'retestWithin' -> 'when' else '[]'::jsonb end as answers_when
         ) r
   where r.days > 0
     and r.answer in (select jsonb_array_elements_text(r.answers_when));
$$;

-- 3.4 Did the thing the form records happen? The first gate (standsDown) its answers trip decides,
--     and a tripped gate means it did not, unless the gate says completesCheck. No gate: it did.
create or replace function public.evidence_completes_check(p_answers jsonb, p_schema jsonb)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select coalesce(x.f -> 'standsDown' -> 'completesCheck' = 'true'::jsonb, false)
      from jsonb_array_elements(case when jsonb_typeof(p_schema -> 'sections') = 'array'
                                     then p_schema -> 'sections' else '[]'::jsonb end) with ordinality s(sec, si),
           jsonb_array_elements(case when jsonb_typeof(s.sec -> 'fields') = 'array'
                                     then s.sec -> 'fields' else '[]'::jsonb end) with ordinality x(f, fi)
     where jsonb_typeof(x.f -> 'standsDown') = 'object'
       and exists (
         select 1
           from jsonb_array_elements_text(case jsonb_typeof(p_answers -> (x.f ->> 'key'))
                  when 'array' then p_answers -> (x.f ->> 'key')
                  when 'string' then jsonb_build_array(p_answers ->> (x.f ->> 'key'))
                  when 'number' then jsonb_build_array(p_answers ->> (x.f ->> 'key'))
                  when 'boolean' then jsonb_build_array(p_answers ->> (x.f ->> 'key'))
                  else '[]'::jsonb end) v(val)
          where v.val in (select jsonb_array_elements_text(
                  case when jsonb_typeof(x.f -> 'standsDown' -> 'when') = 'array'
                       then x.f -> 'standsDown' -> 'when' else '[]'::jsonb end)))
     order by s.si, x.fi
     limit 1
  ), true);
$$;

-- 3.5 The completion date, next due date and expiry one piece of Evidence gives one check. Kept
--     apart from complete_check so the rule can be read and tested on its own (the parity check in
--     TEST-CHECKLIST-AUDIT-FIXES.md runs it over every completion with Evidence).
create or replace function public.check_dates_from_evidence(
  p_instance_id uuid,
  p_evidence_id uuid,
  out completed_on date,
  out next_due date,
  out expiry date
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  ci public.check_instances%rowtype;
  cd public.check_definitions%rowtype;
  ev public.evidence%rowtype;
  v_regular date;
  v_retest date;
begin
  select * into ci from public.check_instances where id = p_instance_id;
  select * into cd from public.check_definitions where id = ci.definition_id;
  select * into ev from public.evidence where id = p_evidence_id;
  if ci.id is null or cd.id is null or ev.id is null then return; end if;

  completed_on := public.evidence_completion_date(ev.answers, ev.schema_snapshot, ev.submitted_at);

  if cd.anchor = 'expiry' then
    -- Due a set number of days before the expiry the form records.
    expiry := public.try_date(case when jsonb_typeof(ev.answers -> cd.expiry_field_key) = 'string'
                                   then ev.answers ->> cd.expiry_field_key end);
    if expiry is not null and cd.frequency is not null and coalesce(cd."interval", 0) <> 0 then
      v_regular := expiry - coalesce(cd.lead_days, 0);
    end if;
  elsif cd.recurring and cd.schedule_mode is distinct from 'after_sup3' and coalesce(cd."interval", 0) >= 1 then
    -- One interval after it was done. An "after Supervision 3" Appraisal has no date of its own:
    -- the next Supervision 3 sets it (complete_check, below).
    v_regular := case cd.frequency
      when 'day' then completed_on + cd."interval"
      when 'week' then completed_on + 7 * cd."interval"
      when 'month' then (completed_on + make_interval(months => cd."interval"))::date
      when 'year' then (completed_on + make_interval(years => cd."interval"))::date
    end;
  end if;

  -- A Care Plan Review on a Complex branch runs at its own interval in days (90 when unset).
  if ci.service_user_id is not null and cd.key = 'care_plan_review'
     and exists (select 1 from public.branches b
                  where b.id = ci.branch_id and b.service_user_type = 'complex') then
    v_regular := completed_on + case when coalesce(cd."interval", 0) >= 1 then cd."interval" else 90 end;
  end if;

  v_retest := public.evidence_retest_due(ev.answers, ev.schema_snapshot, completed_on);
  next_due := case when v_retest is null then v_regular
                   when v_regular is null then v_retest
                   else least(v_regular, v_retest) end;
end;
$$;


-- 4. Who may complete a check on a person (audit F8): never on their own record.
--    The live rule also let the person whose record it is complete it ("or pe.profile_id =
--    auth.uid()"), which is how a carer completed their own Supervision and a Senior had their own
--    record open to them despite 0340 ("nobody supervises themselves"). Everything else is the
--    live body unchanged. Seniors keep their own rule (senior_may_do_instance, which already
--    leaves out their own record). No office login has a People record today, so nobody live
--    loses anything.
create or replace function public.can_complete_person_check(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person_id
      and pe.profile_id is distinct from auth.uid()
      and ( public.is_platform_admin()
         or public.is_company_admin(pe.company_id)
         or public.is_branch_manager(pe.branch_id)
         or public.is_person_supervisor(pe.id)
         or public.is_booked_conductor_for_person(pe.id) )
  );
$$;

-- 4.1 Booked on the Planner to carry out THIS check: a planned task for the check on a planned
--     booking where the caller is the conductor and somebody else made the booking (the same
--     booking 0183's is_booked_conductor_for_person counts, narrowed to the task's own check).
--     A Recruiter completes a check only then (Phil by popup, 11 October 2026, after the step 7
--     review): being booked for another check on the same record is not enough. complete_check and
--     may_file_evidence ask it; nobody signed in calls it directly (revoked in section 16). The app
--     reads the same tasks through the caller's RLS (lib/planner/booked-checks.ts) to decide what
--     it offers. Live today: no booking anywhere has a Recruiter conductor, so nobody loses a task.
create or replace function public.is_booked_conductor_for_check(p_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.planner_booking_tasks t
    join public.planner_bookings b on b.id = t.booking_id
    where t.check_instance_id = p_instance_id
      and t.status = 'planned'
      and b.status = 'planned'
      and b.conductor_profile_id = auth.uid()
      and b.created_by is distinct from auth.uid()
  );
$$;


-- 5. Completing a check, and what moves its due date (audit F8 and F10).

-- 5.1 (F8, F10) complete_check: a check is completed by its own form, filled in by the caller.
--     Before: no Evidence was needed, any Evidence of the company would do (another form, another
--     record, someone else's), and the dates were whatever the caller sent. Now the Evidence must
--     be this check's form, about this record, filled in by the caller, not already used by
--     another check, and not one that says it did not happen; its own answers decide when it was
--     done (never in the future) and when it is next due. An older completion still never moves
--     the check back (0319). p_completed_on, p_next_due and p_expiry_date are no longer read; they
--     stay so the code live before 0444 keeps working.
--     The two things a completion sets in motion, previously separate calls from
--     lib/people/advance-check.ts that took a date from the caller and whose failures nobody read,
--     happen here in the same transaction (F10): an Appraisal restarts the supervision cycle, and
--     Supervision 3 schedules an "after Supervision 3" Appraisal (Thistle's mode).
create or replace function public.complete_check(
  p_instance_id uuid,
  p_completed_on date,
  p_evidence_id uuid,
  p_next_due date,
  p_expiry_date date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ci public.check_instances%rowtype;
  cd public.check_definitions%rowtype;
  ev public.evidence%rowtype;
  v_dates record;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_sup int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into ci from public.check_instances where id = p_instance_id for update;
  if ci.id is null then raise exception 'Unknown check'; end if;
  select * into cd from public.check_definitions where id = ci.definition_id;

  if ci.person_id is not null then
    if exists (select 1 from public.people pe where pe.id = ci.person_id and pe.profile_id = auth.uid()) then
      raise exception 'This is your own record, so someone else must complete this check.';
    end if;
    if not (public.can_complete_person_check(ci.person_id) or public.senior_may_do_instance(ci.id)) then
      raise exception 'Not allowed to complete this check';
    end if;
  elsif not (public.can_complete_service_user_check(ci.service_user_id) or public.senior_may_do_instance(ci.id)) then
    raise exception 'Not allowed to complete this check';
  end if;
  -- A Recruiter completes only the check they are booked on the Planner to carry out (4.1).
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'recruiter')
     and not public.is_booked_conductor_for_check(ci.id) then
    raise exception 'A Recruiter completes a check only when they are booked on the Planner to do it.';
  end if;

  if p_evidence_id is null then
    raise exception 'A check is completed by filling in its form.';
  end if;
  -- The same completion sent again (a retry): nothing to do.
  if ci.last_evidence_id is not distinct from p_evidence_id then return; end if;

  select * into ev from public.evidence where id = p_evidence_id;
  if ev.id is null
     or ev.company_id is distinct from ci.company_id
     or ev.record_type is distinct from (case when ci.person_id is not null then 'person' else 'service_user' end)
     or ev.record_id is distinct from coalesce(ci.person_id, ci.service_user_id)
     or ev.form_id is distinct from cd.form_id
     or ev.author_id is distinct from auth.uid()
     or ev.anonymised_at is not null then
    raise exception 'That is not a completed form for this check.';
  end if;
  if exists (select 1 from public.check_instances x where x.last_evidence_id = p_evidence_id and x.id <> ci.id) then
    raise exception 'That form has already completed a check.';
  end if;
  if not public.evidence_completes_check(ev.answers, ev.schema_snapshot) then
    raise exception 'The form says this did not take place, so the check stays due.';
  end if;

  select * into v_dates from public.check_dates_from_evidence(ci.id, ev.id);
  if v_dates.completed_on > v_today then
    raise exception 'The date on this form is in the future. Enter the date it was done.';
  end if;
  -- Older than the completion on file: it is history, and the check stays where it is (0319).
  if ci.last_completed_on is not null and v_dates.completed_on < ci.last_completed_on then return; end if;

  update public.check_instances set
    last_completed_on = v_dates.completed_on,
    last_evidence_id = p_evidence_id,
    expiry_date = coalesce(v_dates.expiry, expiry_date),
    due_date = case
      when cd.recurring then v_dates.next_due
      when ci.service_user_id is not null then due_date
      else null
    end,
    updated_at = now()
  where id = ci.id;

  if ci.person_id is not null and cd.key in ('appraisal', 'supervision') then
    select s."interval" into v_sup
      from public.check_definitions s
     where s.company_id = ci.company_id and s.population = 'people' and s.key = 'supervision';
    v_sup := case when coalesce(v_sup, 0) >= 1 then v_sup else 90 end;

    if cd.key = 'appraisal' then
      -- An Appraisal restarts the supervision cycle: Supervision 1 is due one supervision interval
      -- after it, with none of the new cycle done yet.
      update public.check_instances x
         set due_date = v_dates.completed_on + v_sup,
             last_completed_on = null,
             last_evidence_id = null,
             updated_at = now()
        from public.check_definitions s
       where x.definition_id = s.id
         and x.person_id = ci.person_id
         and s.key = 'supervision' and s.population = 'people';
    elsif ev.answers ->> 'supervision_type' = '3'
          and exists (select 1 from public.check_definitions a
                       where a.company_id = ci.company_id and a.population = 'people'
                         and a.key = 'appraisal' and a.active and a.schedule_mode = 'after_sup3') then
      -- Supervision 3 done: an "after Supervision 3" Appraisal falls due one supervision interval
      -- later, keeping the cycle on cadence.
      update public.check_instances x
         set due_date = v_dates.completed_on + v_sup,
             updated_at = now()
        from public.check_definitions a
       where x.definition_id = a.id
         and x.person_id = ci.person_id
         and a.key = 'appraisal' and a.population = 'people';
    end if;
  end if;
end;
$$;

-- 5.2 (F10) set_person_check_due: Supervision 1 after a passed Probation Review, and nothing else.
--     Before: any date on any of a person's checks, by anyone who could complete checks on them,
--     their own record included (a carer moved their own Spot Check to 2099 and a Supervisor
--     moved a carer's, proved on Bevan). Its one remaining caller is completeTrackerForm
--     (lib/people/actions.ts, snag S18), open to whoever may manage the record, so that is the
--     rule here too. The date is worked out from the stored probation end plus the supervision
--     interval, and only a supervision never done and with no due date is touched, so an existing
--     schedule never moves. p_due_date is no longer read. The Appraisal after Supervision 3 is set
--     by complete_check, so the call for it that the code live before 0444 still makes is refused
--     (that code never reads the answer).
create or replace function public.set_person_check_due(p_person_id uuid, p_check_key text, p_due_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_profile uuid;
  v_status text;
  v_end date;
  v_int int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_check_key is distinct from 'supervision' then
    raise exception 'A check''s due date is set by completing its form.';
  end if;

  select pe.company_id, pe.profile_id, pt.probation_status, pt.probation_end_actual
    into v_company, v_profile, v_status, v_end
    from public.people pe
    left join public.person_trackers pt on pt.person_id = pe.id
   where pe.id = p_person_id;
  if v_company is null then raise exception 'Unknown person'; end if;
  if v_profile is not null and v_profile = auth.uid() then
    raise exception 'This is your own record, so someone else must schedule this check.';
  end if;
  if not public.can_manage_person(p_person_id) then
    raise exception 'Not allowed to schedule this check';
  end if;
  if v_status is distinct from 'passed' or v_end is null then
    raise exception 'Supervision 1 is scheduled once the Probation Review is passed.';
  end if;

  select cd."interval" into v_int
    from public.check_definitions cd
   where cd.company_id = v_company and cd.population = 'people' and cd.key = 'supervision';
  v_int := case when coalesce(v_int, 0) >= 1 then v_int else 90 end;

  update public.check_instances ci
     set due_date = v_end + v_int, updated_at = now()
    from public.check_definitions cd
   where ci.definition_id = cd.id
     and ci.person_id = p_person_id
     and cd.key = 'supervision' and cd.population = 'people'
     and ci.active and ci.due_date is null and ci.last_completed_on is null;
end;
$$;

-- 5.3 (F10) reanchor_supervision_cycle: nothing calls it any more (complete_check restarts the
--     supervision cycle itself), so nobody signed in may run it. The revoke is in the block at the
--     end of this part. The code live before 0444 still calls it after an Appraisal and ignores the
--     error; complete_check has already done the work by then.


-- =============================================================================================

-- 6. Check history with no Evidence (audit F60, part 2): seed_migrated_completion.
--    Phil's decision by popup, 11 October 2026 (permission-boundaries.md, "Own record, check dates
--    and history"): Company Admins and the Founder record history on any record; Managers,
--    Supervisors, Recruiters, the Registered Individual and the Registered Manager only on a person
--    they added within the last hour ("They already work here" on Add a person). Service user
--    history is Admins and the Founder only (only the import writes it). Nobody records history on
--    their own People record. 0315 widened this call to branch leads for Add a person only.
--    Before: any branch lead could write any date on any record in their branch, including a
--    completion in 2030 over a check that had Evidence, or an older date that moved a check
--    backwards and dropped its Evidence link (both proved on Bevan).
--    For everybody, Admins included: a completion cannot be in the future (Europe/London today);
--    the check must be this company's and for this kind of record; the latest date never replaces
--    a check that has Evidence or a later completion; a next due date or a historical due date
--    cannot be far beyond the check's own cycle. A check that runs from an expiry date (a DBS or
--    right to work with a three year expiry) has no such limit, since its cycle is the document's.
--    Running it twice with the same values still changes nothing.
--    Same signature, so the grants and the generated types stay as they are.
create or replace function public.seed_migrated_completion(
  p_record_type text,
  p_record_id uuid,
  p_definition_id uuid,
  p_completed_on date,
  p_next_due date,
  p_is_latest boolean,
  p_due_on date default null,
  p_slot smallint default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_branch uuid;
  v_by uuid;
  v_at timestamptz;
  v_profile uuid;
  v_start date;
  v_def_company uuid;
  v_population text;
  v_anchor text;
  v_cycle int;
  v_limit int;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_inst record;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  if p_record_type = 'person' then
    select company_id, branch_id, created_by, created_at, profile_id, start_date
      into v_company, v_branch, v_by, v_at, v_profile, v_start
      from public.people where id = p_record_id;
  elsif p_record_type = 'service_user' then
    select company_id, branch_id, created_by, created_at, null::uuid, package_start_date
      into v_company, v_branch, v_by, v_at, v_profile, v_start
      from public.service_users where id = p_record_id;
  else
    raise exception 'invalid record_type %', p_record_type;
  end if;
  if v_company is null then raise exception 'record not found'; end if;

  -- WHO. Admins and the Founder on any record. Anyone else who leads the record's branch only on
  -- a person they added themselves within the last hour (created_at and created_by are frozen by
  -- section 2, and a creation time in the future is not taken as recent).
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    if p_record_type <> 'person' then
      raise exception 'Only an Admin can record history for a service user.' using errcode = '42501';
    end if;
    if not (v_branch is not null and public.is_branch_lead(v_branch)
            and v_by = auth.uid()
            and v_at > now() - interval '1 hour' and v_at <= now()) then
      raise exception 'Only an Admin can record history on this record. Other roles can record it only on a person they have just added themselves.'
        using errcode = '42501';
    end if;
  end if;

  -- Nobody, whatever their role, on their own People record.
  if v_profile is not null and v_profile = auth.uid() then
    raise exception 'You cannot record check history on your own record.' using errcode = '42501';
  end if;

  -- WHICH CHECK: this company's, for this kind of record.
  select d.company_id, d.population, d.anchor,
         case d.frequency when 'day' then d."interval"
                          when 'week' then d."interval" * 7
                          when 'month' then d."interval" * 31
                          when 'year' then d."interval" * 366 end
    into v_def_company, v_population, v_anchor, v_cycle
    from public.check_definitions d where d.id = p_definition_id;
  if v_def_company is distinct from v_company then
    raise exception 'That check belongs to another company.' using errcode = '42501';
  end if;
  if v_population is distinct from (case p_record_type when 'person' then 'people' else 'service_users' end) then
    raise exception 'That check is not one for this kind of record.' using errcode = '22023';
  end if;

  -- WHEN: not in the future, and no due date far beyond the check's own cycle. The next due date
  -- is measured from the later of today and the record's start, so a starter who begins next
  -- year is not refused.
  if p_completed_on > v_today then
    raise exception 'A check cannot be recorded as done on %, which is in the future.',
      to_char(p_completed_on, 'FMDD FMMonth YYYY') using errcode = 'check_violation';
  end if;
  if v_anchor is distinct from 'expiry' then
    v_limit := greatest(2 * coalesce(v_cycle, 0), 366);
    if p_next_due > greatest(v_today, coalesce(v_start, v_today)) + v_limit then
      raise exception 'The next due date, %, is too far ahead for this check.',
        to_char(p_next_due, 'FMDD FMMonth YYYY') using errcode = 'check_violation';
    end if;
    if p_due_on > p_completed_on + v_limit then
      raise exception 'The due date, %, is too far after the date it was done.',
        to_char(p_due_on, 'FMDD FMMonth YYYY') using errcode = 'check_violation';
    end if;
  end if;

  insert into public.migrated_completions(
    company_id, branch_id, record_type, record_id, definition_id,
    completed_on, due_on, slot, created_by
  ) values (
    v_company, v_branch, p_record_type, p_record_id, p_definition_id,
    p_completed_on, p_due_on, p_slot, auth.uid()
  )
  on conflict (record_id, definition_id, completed_on)
    do update set due_on = coalesce(public.migrated_completions.due_on, excluded.due_on),
                  slot   = coalesce(public.migrated_completions.slot,   excluded.slot);

  -- The latest date moves the check on, but never over Evidence or a later completion. The
  -- refusal undoes the history row above as well, so nothing half saves.
  if p_is_latest then
    for v_inst in
      select ci.id, ci.last_completed_on, ci.last_evidence_id
        from public.check_instances ci
       where ci.definition_id = p_definition_id
         and ((p_record_type = 'person' and ci.person_id = p_record_id)
           or (p_record_type = 'service_user' and ci.service_user_id = p_record_id))
       for update
    loop
      if v_inst.last_evidence_id is not null then
        raise exception 'This check already has Evidence on file, so a history date cannot replace it.'
          using errcode = 'check_violation';
      end if;
      if v_inst.last_completed_on > p_completed_on then
        raise exception 'This check was last done on %, later than %, so it was left as it is.',
          to_char(v_inst.last_completed_on, 'FMDD FMMonth YYYY'), to_char(p_completed_on, 'FMDD FMMonth YYYY')
          using errcode = 'check_violation';
      end if;
      update public.check_instances
         set last_completed_on = p_completed_on, due_date = p_next_due,
             last_evidence_id = null, updated_at = now()
       where id = v_inst.id;
    end loop;
  end if;
end;
$$;


-- =============================================================================================

-- 7. Moving due dates, and who changes a check's settings (audit F59 and F65).
-- 7.1 (F59) reschedule_check_instances, used when a start date is corrected (updatePerson), when
--     an Admin changes a check's cadence (updateCheckDefinition) and by the appraisal backfill.
--     Before: any Manager could re-date open checks in every branch (is_company_manager never asks
--     the branch), while the Registered Individual, Registered Manager, Supervisors and Recruiters
--     were refused, so their start date corrections saved and the checks quietly kept old dates.
--     Phil's decision by popup, 11 October 2026: a Supervisor or Recruiter correcting a start date
--     on a record they may edit re-dates that person's open checks, as a Manager does.
--     Now: Admins and the Founder anywhere in their company; anyone else only on a record they may
--     manage (can_manage_person or can_manage_service_user: Managers and Supervisors their own
--     branches, Recruiters, the Registered Individual and Registered Manager every branch). The
--     RECORD's branch is asked, not check_instances.branch_id, which a branch move can leave stale.
--     A row on the caller's own People record is left as it is (nobody moves a check's due date on
--     their own record). It is skipped rather than refused so a cadence change by an Admin who has
--     a People record of their own still moves everybody else; the callers say so on screen.
--     No due date ceiling: a correct start date a year ahead must still re-date its checks.
--     Completed checks are still left alone (re-dating them is THE LIST 48). Same signature and
--     the same count returned, so no caller or generated type changes.
create or replace function public.reschedule_check_instances(p_definition_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_company_level boolean;
  r jsonb;
  v_id uuid;
  v_person uuid;
  v_su uuid;
  v_owner uuid;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select company_id into v_company from public.check_definitions where id = p_definition_id;
  if v_company is null then raise exception 'Unknown check'; end if;
  v_company_level := public.is_platform_admin() or public.is_company_admin(v_company);
  if not (v_company_level or public.is_company_member(v_company)) then
    raise exception 'Not allowed to reschedule this check' using errcode = '42501';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_id := null; v_person := null; v_su := null; v_owner := null;
    select ci.id, ci.person_id, ci.service_user_id, pe.profile_id
      into v_id, v_person, v_su, v_owner
      from public.check_instances ci
      left join public.people pe on pe.id = ci.person_id
     where ci.id = (r->>'instance_id')::uuid
       and ci.definition_id = p_definition_id
       and ci.last_completed_on is null;
    continue when v_id is null;
    continue when v_owner is not null and v_owner = auth.uid();
    if not (v_company_level
            or (v_person is not null and public.can_manage_person(v_person))
            or (v_su is not null and public.can_manage_service_user(v_su))) then
      raise exception 'You can only change due dates for records you manage.' using errcode = '42501';
    end if;
    update public.check_instances
       set due_date = nullif(r->>'due_date', '')::date, updated_at = now()
     where id = v_id;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- 7.2 (F65) A check's settings (how often it recurs, its amber window, its reporting deadline, on
--     or off, its name, form and register column) are company wide, so they are changed by the
--     Company Admin, and the Founder in support mode, only. Before: any Branch Manager, and the
--     Registered roles, could change or switch off a check for every branch. 0165 opened it to the
--     Registered Manager believing the app let them open the check settings; it never did (the
--     Settings pages have been Admin only since 8 July 2026, phase3-decisions.md). Phil's decision
--     by popup, 11 October 2026. Everyone keeps reading definitions (select policies unchanged).
--     is_company_manager stays: other policies still use it.
drop policy if exists check_definitions_update on public.check_definitions;
create policy check_definitions_update on public.check_definitions
  for update to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_admin(company_id) or public.is_platform_admin());


-- =============================================================================================

-- 8. Who may fill in which form about which record (audit F3, second half; F44's database half).
--    0443 kept Evidence inside its company. Inside the company, submit_evidence asked only that the
--    caller was a member, not a Viewer, and in the branch: a carer filed a Supervision on a
--    colleague, a DBS form on themselves and a Supervision on a service user they cannot see, and
--    an Incident Investigation on a case they reported (proved on Bevan).

-- 8.1 The rule, one place. Only submit_evidence calls it.
create or replace function public.may_file_evidence(p_company uuid, p_record_type text, p_record_id uuid, p_form_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_person public.people%rowtype;
  v_branch uuid;
  v_created_by uuid;
begin
  if auth.uid() is null then return false; end if;
  select f.key into v_key from public.forms f where f.id = p_form_id and f.company_id = p_company;
  if v_key is null then return false; end if;

  -- No record: only a holiday request from a login that has no record on the register
  -- (requestHoliday, lib/holidays/actions.ts).
  if p_record_type is null then
    return v_key = 'holiday_requests'
       and not exists (select 1 from public.people pe
                        where pe.company_id = p_company and pe.profile_id = auth.uid());
  end if;

  if p_record_type = 'person' then
    select * into v_person from public.people where id = p_record_id and company_id = p_company;
    if v_person.id is null then return false; end if;

    -- Their own record: only what their own page offers. A holiday request, a financial
    -- transaction, signing a policy or briefing sent to them, and a form sent to them as a briefing.
    if v_person.profile_id = auth.uid() then
      return v_key in ('holiday_requests', 'financial_transaction')
          or (v_key = 'policy_acknowledgement' and exists (
                select 1 from public.assignments a
                 where a.person_id = v_person.id and a.company_id = p_company
                   and a.status = 'assigned' and a.kind in ('policy', 'notice')))
          or exists (
                select 1 from public.assignments a
                 where a.person_id = v_person.id and a.company_id = p_company
                   and a.status = 'assigned' and a.kind = 'form' and a.form_id = p_form_id);
    end if;

    -- Only the person a policy or briefing was sent to signs it (audit F44).
    if v_key = 'policy_acknowledgement' then return false; end if;

    -- A check's form: whoever may complete that check on this person (Admins, the Registered
    -- roles, the Branch Manager, the branch's Supervisors, a booked conductor), or a Senior for a
    -- check ticked on their tile. A Recruiter only for the check they are booked on the Planner to
    -- carry out (4.1), and never On Call, so their form is refused before it is stored rather
    -- than after.
    if exists (select 1 from public.check_definitions cd
                where cd.company_id = p_company and cd.population = 'people' and cd.form_id = p_form_id) then
      if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'recruiter') then
        return exists (select 1 from public.check_instances ci
                         join public.check_definitions cd on cd.id = ci.definition_id
                        where ci.person_id = v_person.id and cd.form_id = p_form_id
                          and public.is_booked_conductor_for_check(ci.id));
      end if;
      return public.can_complete_person_check(v_person.id)
          or exists (select 1 from public.check_instances ci
                       join public.check_definitions cd on cd.id = ci.definition_id
                      where ci.person_id = v_person.id and cd.form_id = p_form_id
                        and public.senior_may_do_instance(ci.id));
    end if;

    -- Any other form about a person (DBS, Right to Work, probation, absence, return to work, a
    -- holiday booked for them): whoever may manage the record, and On Call for absences and
    -- absence meetings in every branch (on-call.md). On Call holds no return to work interviews.
    return public.can_manage_person(v_person.id)
        or (public.is_company_on_call(p_company)
            and v_key in ('absence_back_office', 'absence_management_meeting'));
  end if;

  if p_record_type = 'service_user' then
    -- Only check forms are filed about a service user: whoever may complete its checks, or a
    -- Senior for a check ticked on their tile. A Recruiter only for the check they are booked on
    -- the Planner to carry out (4.1).
    if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'recruiter') then
      return exists (select 1 from public.check_instances ci
                       join public.check_definitions cd on cd.id = ci.definition_id
                      where ci.service_user_id = p_record_id and ci.company_id = p_company
                        and cd.form_id = p_form_id
                        and public.is_booked_conductor_for_check(ci.id));
    end if;
    return public.can_complete_service_user_check(p_record_id)
        or exists (select 1 from public.check_instances ci
                     join public.check_definitions cd on cd.id = ci.definition_id
                    where ci.service_user_id = p_record_id and cd.form_id = p_form_id
                      and public.senior_may_do_instance(ci.id));
  end if;

  if p_record_type = 'complaint' then
    select c.branch_id into v_branch from public.complaints c
     where c.id = p_record_id and c.company_id = p_company;
    if not found then return false; end if;
    return public.is_company_admin(p_company) or public.is_company_wide(p_company)
        or public.is_branch_manager(v_branch) or public.is_branch_supervisor(v_branch)
        or public.is_company_on_call(p_company);
  end if;

  if p_record_type = 'incident' then
    select i.branch_id, i.created_by into v_branch, v_created_by
      from public.incidents i where i.id = p_record_id and i.company_id = p_company;
    if not found then return false; end if;
    -- The branch's office writes the case up. is_company_wide keeps an incident with no branch
    -- open to the Registered roles.
    if public.is_company_admin(p_company) or public.is_company_wide(p_company)
       or public.is_branch_manager(v_branch) or public.is_branch_supervisor(v_branch) then
      return true;
    end if;
    -- Anyone may report an incident (0301): the Incident Report, once, on the case they opened.
    return v_key = 'incident_report' and v_created_by = auth.uid()
       and not exists (select 1 from public.evidence e
                        where e.record_type = 'incident' and e.record_id = p_record_id);
  end if;

  return false;
end;
$$;

-- 8.2 submit_evidence: the live 0443 body, with the rule above and the future date refusal added
--     straight after the record check, so a refused form stores nothing and the answers stay on
--     the screen (lib/evidence/submit.ts takes any uploaded files back out). The future date is
--     refused here rather than only in complete_check so the Evidence is never stored first: the
--     code live before 0444 files the Evidence and then completes the check.
create or replace function public.submit_evidence(
  p_evidence_id uuid,
  p_form_version_id uuid,
  p_branch_id uuid,
  p_answers jsonb,
  p_pdf_path text,
  p_pdf_sha256 text,
  p_pdf_bytes integer,
  p_record_type text default null,
  p_record_id uuid default null,
  p_files jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid; v_form_id uuid; v_schema jsonb; v_email text; v_name text; f jsonb;
  v_record_company uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select f.company_id, fv.form_id, fv.schema into v_company_id, v_form_id, v_schema
  from public.form_versions fv join public.forms f on f.id = fv.form_id where fv.id = p_form_version_id;
  if v_company_id is null then raise exception 'Unknown form version'; end if;
  if not public.is_company_member(v_company_id) then raise exception 'Not a member of this company'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'team_member') then
    raise exception 'A Viewer can see the registers but cannot fill in a form.';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.company_id = v_company_id) then
      raise exception 'Branch does not belong to this company';
    end if;
    if not (public.is_branch_member(p_branch_id) or public.is_company_on_call(v_company_id)) then
      raise exception 'Not a member of this branch';
    end if;
  end if;
  -- 0443: the record must be this company's (audit F3), and every file in this company's folder
  -- (audit F1).
  if p_record_type is not null and p_record_id is null then
    raise exception 'Choose the record this form is about.';
  end if;
  if p_record_id is not null then
    v_record_company := case p_record_type
      when 'person' then (select company_id from public.people where id = p_record_id)
      when 'service_user' then (select company_id from public.service_users where id = p_record_id)
      when 'complaint' then (select company_id from public.complaints where id = p_record_id)
      when 'incident' then (select company_id from public.incidents where id = p_record_id)
    end;
    if v_record_company is distinct from v_company_id then
      raise exception 'That record could not be found in this company.';
    end if;
  end if;
  -- 0444 (audit F3): who may fill in this form about this record (may_file_evidence).
  if not public.may_file_evidence(v_company_id, p_record_type, p_record_id, v_form_id) then
    if p_record_type = 'person' and exists (
         select 1 from public.people pe where pe.id = p_record_id and pe.profile_id = auth.uid()) then
      raise exception 'This is your own record, so someone else must fill in this form.';
    end if;
    raise exception 'You cannot fill in this form for that record.';
  end if;
  -- 0444 (audit F8): a check's form cannot be dated in the future (Europe/London). Holiday and
  -- absence forms are not checks and keep their future dates.
  if p_record_type in ('person', 'service_user')
     and exists (select 1 from public.check_definitions cd
                  where cd.company_id = v_company_id and cd.form_id = v_form_id
                    and cd.population = case p_record_type when 'person' then 'people' else 'service_users' end)
     and public.evidence_completion_date(coalesce(p_answers, '{}'::jsonb), v_schema, now())
         > (now() at time zone 'Europe/London')::date then
    raise exception 'The date on this form is in the future. Enter the date it was done.';
  end if;
  if not public.path_in_company(p_pdf_path, v_company_id) then
    raise exception 'That file is not in this company''s storage.';
  end if;
  if p_files is not null and jsonb_typeof(p_files) = 'array' and exists (
    select 1 from jsonb_array_elements(p_files) e
     where not public.path_in_company(e ->> 'storage_path', v_company_id)
  ) then
    raise exception 'That file is not in this company''s storage.';
  end if;
  select email, full_name into v_email, v_name from public.profiles where id = auth.uid();
  insert into public.evidence (
    id, company_id, branch_id, form_id, form_version_id, schema_snapshot,
    answers, author_id, author_email, author_name,
    pdf_path, pdf_sha256, pdf_bytes, record_type, record_id
  ) values (
    p_evidence_id, v_company_id, p_branch_id, v_form_id, p_form_version_id, v_schema,
    coalesce(p_answers, '{}'::jsonb), auth.uid(), v_email, v_name,
    p_pdf_path, p_pdf_sha256, p_pdf_bytes, p_record_type, p_record_id
  );
  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    for f in select * from jsonb_array_elements(p_files) loop
      insert into public.evidence_files
        (evidence_id, company_id, field_key, kind, storage_path, file_name, mime_type, bytes, sha256)
      values (
        p_evidence_id, v_company_id, coalesce(f->>'field_key', ''), coalesce(f->>'kind', 'upload'),
        f->>'storage_path', f->>'file_name', f->>'mime_type', nullif(f->>'bytes','')::int, f->>'sha256'
      );
    end loop;
  end if;
  return p_evidence_id;
end;
$$;

-- 8.3 submit_paper_evidence: the live body, with one line added. An Admin's own paper check is
--     refused before its Evidence is stored, not by complete_check afterwards.
create or replace function public.submit_paper_evidence(
  p_evidence_id uuid,
  p_instance_id uuid,
  p_completed_on date,
  p_answers jsonb,
  p_files jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid; v_branch uuid; v_person uuid; v_su uuid; v_def_key text; v_anchor text;
  v_form uuid; v_version uuid; v_population text;
  v_email text; v_name text;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_prefix text; f jsonb; n int := 0; v_fields jsonb := '[]'::jsonb; v_answers jsonb;
  v_key text; v_sup text; v_week text; v_archived boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.company_id, ci.branch_id, ci.person_id, ci.service_user_id, cd.key, cd.anchor, cd.form_id, cd.population
    into v_company, v_branch, v_person, v_su, v_def_key, v_anchor, v_form, v_population
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;
  if v_company is null then raise exception 'Unknown check'; end if;

  if not public.is_company_admin(v_company) then
    raise exception 'Only an Admin can upload a check completed on paper';
  end if;

  if v_form is null then raise exception 'This check has no form'; end if;
  if v_su is not null and v_def_key = 'setup' then
    raise exception 'The Setup Visit cannot be uploaded on paper: complete it in the app';
  end if;
  if v_anchor = 'expiry' then
    raise exception 'This check is dated from an expiry on its form and cannot be uploaded on paper';
  end if;

  if v_person is not null then
    select (pe.archived_at is not null or pe.employment_status = 'leaver') into v_archived
      from public.people pe where pe.id = v_person;
  else
    select (su.archived_at is not null or su.service_status = 'cancelled') into v_archived
      from public.service_users su where su.id = v_su;
  end if;
  if coalesce(v_archived, true) then raise exception 'This record is not active'; end if;
  -- 0444 (audit F8): nobody completes a check on their own record, on paper either.
  if v_person is not null and exists (
       select 1 from public.people pe where pe.id = v_person and pe.profile_id = auth.uid()) then
    raise exception 'This is your own record, so someone else must complete this check.';
  end if;

  if p_completed_on is null then raise exception 'Enter the date it was completed on paper'; end if;
  if p_completed_on > v_today then raise exception 'The date it was completed cannot be in the future'; end if;
  if p_completed_on < date '2000-01-01' then raise exception 'Enter a date from 2000 onwards'; end if;

  if exists (select 1 from public.evidence e where e.id = p_evidence_id) then
    return p_evidence_id;
  end if;

  select fv.id into v_version
  from public.form_versions fv
  where fv.form_id = v_form and fv.status = 'published'
  order by fv.version desc limit 1;
  if v_version is null then raise exception 'This check''s form has no published version'; end if;

  v_sup := nullif(p_answers->>'supervision_type', '');
  v_week := nullif(p_answers->>'week', '');
  if v_sup is not null and v_sup not in ('1','2','3','4') then raise exception 'Unknown supervision number'; end if;
  if v_week is not null and v_week not in ('4','8') then raise exception 'Unknown Health Check week'; end if;
  v_answers := jsonb_build_object('__completed_on', to_char(p_completed_on, 'YYYY-MM-DD'));
  v_fields := v_fields || jsonb_build_array(jsonb_build_object(
    'key', '__completed_on', 'type', 'date', 'label', 'Date completed on paper', 'required', true));
  if v_sup is not null then
    v_answers := v_answers || jsonb_build_object('supervision_type', v_sup);
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', 'supervision_type', 'type', 'short_text', 'label', 'Supervision number'));
  end if;
  if v_week is not null then
    v_answers := v_answers || jsonb_build_object('week', v_week);
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', 'week', 'type', 'short_text', 'label', 'Health Check week'));
  end if;

  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'Attach the scanned copy or a photo of each page';
  end if;
  if jsonb_array_length(p_files) > 10 then raise exception 'Upload up to 10 files at a time'; end if;

  v_prefix := v_company::text || '/' || p_evidence_id::text || '/files/paper_copy_';
  for f in select * from jsonb_array_elements(p_files) loop
    n := n + 1;
    v_key := 'paper_copy_' || n;
    if coalesce(f->>'field_key', '') <> v_key then raise exception 'Pages out of order'; end if;
    if left(coalesce(f->>'storage_path', ''), length(v_prefix)) <> v_prefix then
      raise exception 'A page is not part of this upload';
    end if;
    v_answers := v_answers || jsonb_build_object(v_key, coalesce(f->>'file_name', 'Page ' || n));
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', v_key, 'type', 'file_upload',
      'label', case when jsonb_array_length(p_files) = 1 then 'Paper copy' else 'Page ' || n end));
  end loop;

  select email, full_name into v_email, v_name from public.profiles where id = auth.uid();

  insert into public.evidence (
    id, company_id, branch_id, form_id, form_version_id, schema_snapshot,
    answers, author_id, author_email, author_name, record_type, record_id
  ) values (
    p_evidence_id, v_company, v_branch, v_form, v_version,
    jsonb_build_object('schemaVersion', 1, 'sections', jsonb_build_array(jsonb_build_object(
      'id', 'paper', 'title', 'Completed on paper', 'fields', v_fields))),
    v_answers, auth.uid(), v_email, v_name,
    case when v_person is not null then 'person' else 'service_user' end,
    coalesce(v_person, v_su)
  );

  for f in select * from jsonb_array_elements(p_files) loop
    insert into public.evidence_files
      (evidence_id, company_id, field_key, kind, storage_path, file_name, mime_type, bytes, sha256)
    values (
      p_evidence_id, v_company, f->>'field_key', 'upload',
      f->>'storage_path', f->>'file_name', f->>'mime_type', nullif(f->>'bytes','')::int, f->>'sha256'
    );
  end loop;

  delete from public.paper_upload_pending where evidence_id = p_evidence_id;
  return p_evidence_id;
end;
$$;


-- =============================================================================================

-- 9. Briefings are closed only by the person they were sent to (audit F55 and F44, plus the gap
--    found beside them: branch leads closing a briefing by writing the assignments table directly).
--    Phil's decision by popup, 11 October 2026 (F44, F3 D4): only the person a policy or briefing
--    was sent to signs it; nobody signs on their behalf, the Founder and support mode included.
--    The office sends and withdraws; it never closes.
-- Unchanged on purpose: confirm_briefing_notice and open_briefing_notice (already owner only), the
-- assignments_select, assignments_insert and assignments_update policies (send and withdraw stay
-- open to the same roles), and seed_demo_company (runs as the function owner, never calls
-- complete_assignment).

-- 9.1 (F55, F44) complete_assignment: only the record's own login, with their own matching Evidence.
--     Before: any company wide role, Branch Manager or the Founder could close anyone's briefing,
--     with no Evidence or with any Evidence of the company.
create or replace function public.complete_assignment(p_assignment_id uuid, p_evidence_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.assignments%rowtype;
  v_owner uuid;
  v_response text;
  v_version int;
  e record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'That briefing could not be found'; end if;

  -- A manager, an Admin, the Founder or support mode never completes it for them (F44).
  select pe.profile_id into v_owner from public.people pe where pe.id = a.person_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Only the person it was sent to can complete it' using errcode = '42501';
  end if;
  if a.status <> 'assigned' then raise exception 'That briefing is already closed'; end if;

  -- A memo or message to read or confirm closes through open_briefing_notice or
  -- confirm_briefing_notice only. Only one that needs a signature closes here.
  if a.kind = 'notice' then
    select n.response into v_response from public.briefing_notices n where n.id = a.notice_id;
    if v_response is distinct from 'sign' then
      raise exception 'This briefing is completed by reading or confirming it';
    end if;
  end if;

  if p_evidence_id is null then
    raise exception 'Nothing was saved for this briefing, so it cannot close yet';
  end if;

  -- The Evidence must be this person's own, filed by them, on their own record, after the
  -- briefing was sent, on the right form: the briefed form, or the Policy Acknowledgement form
  -- for a policy or a briefing that needs a signature.
  select ev.id, ev.company_id, ev.record_type, ev.record_id, ev.author_id, ev.form_id,
         ev.submitted_at, ev.anonymised_at, ev.answers, f.key as form_key
    into e
    from public.evidence ev
    join public.forms f on f.id = ev.form_id
   where ev.id = p_evidence_id;

  if e.id is null
     or e.company_id is distinct from a.company_id
     or e.record_type is distinct from 'person'
     or e.record_id is distinct from a.person_id
     or e.author_id is distinct from auth.uid()
     or e.anonymised_at is not null
     or e.submitted_at < a.assigned_at
     or (a.kind = 'form' and e.form_id is distinct from a.form_id)
     or (a.kind in ('policy', 'notice') and e.form_key is distinct from 'policy_acknowledgement')
  then
    raise exception 'That Evidence does not belong to this briefing' using errcode = '42501';
  end if;

  -- A policy signature names the version it was signed against (stamped by the server).
  if a.kind = 'policy' then
    select coalesce(a.policy_version, cp.version, 1) into v_version
      from public.company_policies cp where cp.id = a.policy_id;
    if coalesce(e.answers ->> 'policy_version', '') <> coalesce(v_version, 1)::text then
      raise exception 'That signature is for a different version of this policy';
    end if;
  end if;

  -- One piece of Evidence closes one briefing.
  if exists (select 1 from public.assignments x
              where x.evidence_id = p_evidence_id and x.id <> a.id) then
    raise exception 'That Evidence has already closed another briefing';
  end if;

  update public.assignments
     set status = 'completed', evidence_id = p_evidence_id, completed_at = now()
   where id = a.id and status = 'assigned';
end;
$$;

-- 9.2 (F55, the direct write gap) Signed in users writing the assignments table: the office sends a
--     briefing open and may withdraw an open one, nothing else. Before: any branch lead or company
--     wide role could mark a carer's briefing completed with any Evidence of the company, or
--     insert one already completed (proved live as a Bevan Supervisor, 1 row each).
--     Additive trigger, so the role rules in assignments_insert and assignments_update stay as
--     they are. It reacts only to signed in callers: the definer functions (complete_assignment,
--     confirm_briefing_notice, open_briefing_notice, seed_demo_company) run as their owner, the
--     new starter path as service_role, and ON DELETE SET NULL as the table owner, so all of them
--     pass. A future server path that closes a briefing must go through complete_assignment or a
--     new definer function, never the user client.
create or replace function public.assignments_office_writes_stay_open()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'assigned' or new.evidence_id is not null
       or new.completed_at is not null or new.read_at is not null then
      raise exception 'A briefing is sent open. Only the person it was sent to can complete it.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- The only status change is withdrawing an open one. What it is, who it is for, who sent it,
  -- when, and how it was done never change.
  if not (new.status = old.status or (old.status = 'assigned' and new.status = 'cancelled'))
     or new.evidence_id is distinct from old.evidence_id
     or new.completed_at is distinct from old.completed_at
     or new.read_at is distinct from old.read_at
     or new.company_id is distinct from old.company_id
     or new.person_id is distinct from old.person_id
     or new.kind is distinct from old.kind
     or new.form_id is distinct from old.form_id
     or new.policy_id is distinct from old.policy_id
     or new.notice_id is distinct from old.notice_id
     or new.policy_version is distinct from old.policy_version
     or new.assigned_by is distinct from old.assigned_by
     or new.assigned_at is distinct from old.assigned_at then
    raise exception 'Only the person it was sent to can complete a briefing. The office can withdraw it.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_office_writes_stay_open on public.assignments;
create trigger assignments_office_writes_stay_open
  before insert or update on public.assignments
  for each row execute function public.assignments_office_writes_stay_open();


-- =============================================================================================

-- 10. Holidays: who approves, and a new holiday never carries a change in flight (audit F5 and F7,
--     with the holiday part of F8's p_evidence_id). Phil's decisions by popup, 11 October 2026,
--     written in docs/decisions/permission-boundaries.md ("Holiday approval"):
--   - Holidays are approved by a Branch Manager for their own branches, and by the Responsible
--     Individual, Registered Manager and Company Admin for any branch (the Founder in support mode
--     as an Admin). Supervisors and Recruiters may book; what they book lands Pending.
--   - Nobody approves, amends into approved or books as approved a holiday on their own record.
--     An approver MAY cancel their own holiday straight from the Holiday page.
--   - Supervisors and Recruiters do not edit dates of, or cancel, holidays in the office. They keep
--     Withdraw on a pending booking they made (request_holiday_cancel, 10.9).
-- "Own record" is holiday_request_owner: the login linked to the holiday's person, or whoever asked
-- for it when no person is set. Not holiday_request_is_mine, which also counts the booker, and
-- would stop a manager deciding a carer's change on a holiday that manager booked.
-- Unchanged on purpose: can_manage_holiday and the holiday_requests_insert policy (booking stays
-- open to Supervisors and Recruiters), the select policies, request_holiday_change and
-- mark_holiday_notice_seen. request_holiday_cancel changes only its start date rule (10.9).

-- 10.1 (F7) The approval rule: the Founder, the company wide roles, or an active Branch Manager
--      linked to that branch of that company. A holiday with no branch is the company wide roles'.
create or replace function public.can_approve_holiday(p_company uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and p_company is not null and (
    public.is_platform_admin()
    or public.is_company_wide(p_company)
    or (p_branch is not null and exists (
      select 1
      from public.profiles p
      join public.user_branches ub on ub.user_id = p.id and ub.branch_id = p_branch
      join public.branches b on b.id = p_branch and b.company_id = p_company
      where p.id = auth.uid()
        and p.company_id = p_company
        and p.role = 'manager'
        and p.status = 'active')));
$$;

-- 10.2 (F7) May I book THIS person's holiday as approved? bookHolidayForPerson asks before it
--      writes the Evidence, so the answer always matches what the insert trigger will do.
create or replace function public.can_approve_holiday_for(p_company uuid, p_branch uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_person is not null
     and public.can_approve_holiday(p_company, p_branch)
     and exists (
       select 1 from public.people pe
       where pe.id = p_person
         and pe.company_id = p_company
         and pe.profile_id is distinct from auth.uid());
$$;

-- 10.3 (F7) Office changes to a holiday (amend_holiday_request, cancel_holiday_request): approvers
--      only. Not Supervisors or Recruiters any more (0312 had let them in through is_branch_lead).
--      Own record is checked by each caller: an approver may cancel their own, never amend it.
create or replace function public.can_manage_holiday_request(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select public.can_approve_holiday(h.company_id, h.branch_id)
    from public.holiday_requests h
    where h.id = p_id), false);
$$;

-- 10.4 (F5 and F7) The insert trigger. Every signed in insert:
--   F5: carries no change in flight. Only request_holiday_change and request_holiday_cancel set
--       change_kind and the previous_* columns, so a carer can no longer insert a made up "change"
--       naming an Admin as the previous approver and take it back to an approved holiday.
--   F7: is saved in the name of whoever saves it (empty only for a public form, linked by a manager,
--       or the demo fill), and lands approved only when an approver books someone else's holiday.
--       Anyone else's "approved" is turned into pending rather than refused, so a booking from a
--       page still running the old code is not refused after its Evidence was saved.
create or replace function public.holiday_request_status_is_earned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_own boolean;
  v_may_approve boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.person_id is not null
     and not exists (
       select 1 from public.people pe
       where pe.id = new.person_id and pe.company_id = new.company_id
     ) then
    raise exception 'That person is not in this company.'
      using errcode = 'check_violation';
  end if;

  if new.branch_id is not null
     and not exists (
       select 1 from public.branches b
       where b.id = new.branch_id and b.company_id = new.company_id
     ) then
    raise exception 'That branch is not in this company.'
      using errcode = 'check_violation';
  end if;

  -- F5: a change in flight is only ever set by the change functions, never on a new holiday.
  new.change_kind := null;
  new.change_reason := null;
  new.change_requested_at := null;
  new.change_requested_by := null;
  new.previous_start_date := null;
  new.previous_end_date := null;
  new.previous_decided_by := null;
  new.previous_decided_at := null;
  new.previous_return_to_work_date := null;

  -- F7: nobody saves a holiday in another login's name.
  if new.requested_by is not null and new.requested_by is distinct from auth.uid() then
    raise exception 'A holiday can only be saved in your own name.'
      using errcode = 'check_violation';
  end if;
  if new.person_id is null then
    new.requested_by := auth.uid();
  end if;

  v_owner := case
    when new.person_id is not null then (select pe.profile_id from public.people pe where pe.id = new.person_id)
    else new.requested_by
  end;
  v_own := v_owner is not null and v_owner = auth.uid();
  v_may_approve := public.can_approve_holiday(new.company_id, new.branch_id);

  -- F7: only an approver books as approved, and never their own; anyone else's booking waits.
  if new.status = 'approved' and (not v_may_approve or v_own) then
    new.status := 'pending';
  end if;

  if new.status = 'pending' then
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.decision_evidence_id := null;
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
    return new;
  end if;

  if not v_may_approve then
    raise exception 'You do not have permission to save this holiday as already decided.'
      using errcode = 'check_violation';
  end if;
  if new.status = 'declined' and v_own then
    raise exception 'This is your own holiday, so another approver must decide it.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'cancelled' then
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
    new.decided_by := null;
    new.decided_at := null;
  else
    new.decided_by := auth.uid();
    new.decided_at := now();
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
  end if;

  return new;
end;
$$;

-- 10.5 (F7, and F8's holiday part) Deciding: approvers only, never on their own holiday, and a
--      decision takes no Evidence (holidays-absence.md: a holiday decision is never a form). The
--      p_evidence_id parameter stays, because decideHoliday sends it as null.
create or replace function public.decide_holiday_request(
  p_id uuid,
  p_status text,
  p_evidence_id uuid default null::uuid,
  p_note text default null::text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.holiday_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_owner uuid;
  v_notify boolean;
  v_name text;
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'decide_holiday_request: invalid status %', p_status;
  end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That request could not be found.'; end if;

  if not public.can_approve_holiday(r.company_id, r.branch_id) then
    raise exception 'Only a Branch Manager for this branch, the Responsible Individual, the Registered Manager or an Admin can decide a holiday.';
  end if;

  if public.holiday_request_owner(p_id) = auth.uid() then
    raise exception 'This is your own holiday, so another approver must decide it.';
  end if;

  if p_evidence_id is not null then
    raise exception 'A holiday decision is not a form, so it takes no Evidence.';
  end if;

  if r.status is distinct from 'pending' then
    raise exception 'That request has already been %.', r.status
      using errcode = 'check_violation';
  end if;

  if r.change_kind is null then
    update public.holiday_requests
      set status = p_status,
          decided_by = auth.uid(), decided_at = now(), decision_note = p_note
      where id = p_id;
    return;
  end if;

  if p_status = 'declined' and v_note is null then
    raise exception 'Please give a reason for declining.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();
  v_owner := public.holiday_request_owner(p_id);
  v_notify := v_owner is not null and v_owner is distinct from auth.uid();

  if r.change_kind = 'amend' and p_status = 'approved' then
    update public.holiday_requests set
      status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = v_note,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'change_approved', auth.uid(), v_name,
       r.previous_start_date, r.previous_end_date, r.start_date, r.end_date, v_note, v_notify);

  elsif r.change_kind = 'amend' then
    update public.holiday_requests set
      start_date = r.previous_start_date, end_date = r.previous_end_date,
      return_to_work_date = r.previous_return_to_work_date,
      status = 'approved', decided_by = r.previous_decided_by, decided_at = r.previous_decided_at,
      decision_note = null,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'change_declined', auth.uid(), v_name,
       r.start_date, r.end_date, r.previous_start_date, r.previous_end_date, v_note, v_notify);

  elsif p_status = 'approved' then
    update public.holiday_requests set
      status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
      cancel_reason = r.change_reason,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'cancel_approved', auth.uid(), v_name,
       r.start_date, r.end_date, v_note, v_notify);

  else
    update public.holiday_requests set
      status = 'approved', decided_by = r.previous_decided_by, decided_at = r.previous_decided_at,
      decision_note = null,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'cancel_declined', auth.uid(), v_name,
       r.start_date, r.end_date, r.start_date, r.end_date, v_note, v_notify);
  end if;
end;
$$;

-- 10.6 (F7) Editing dates in the office: approvers only (can_manage_holiday_request), and never on
--      your own holiday, pending or approved. Another approver changes it.
create or replace function public.amend_holiday_request(
  p_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null::text,
  p_return_to_work date default null::date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.holiday_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner uuid;
  v_name text;
  v_rtw date := coalesce(p_return_to_work, p_end_date + 1);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Both dates are needed';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date';
  end if;
  if v_reason is null then raise exception 'Please give a reason for the change.'; end if;
  if v_rtw <= p_end_date then raise exception 'The back at work date must be after the last day of the holiday.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found'; end if;
  if r.status in ('declined', 'cancelled') then
    raise exception 'That holiday is no longer active';
  end if;
  if not public.can_manage_holiday_request(p_id) then
    raise exception 'You do not have permission to change these dates';
  end if;
  if public.holiday_request_owner(p_id) = auth.uid() then
    raise exception 'This is your own holiday, so another approver must change its dates.';
  end if;
  if p_start_date = r.start_date and p_end_date = r.end_date and v_rtw is not distinct from r.return_to_work_date then
    return;
  end if;

  update public.holiday_requests
  set start_date = p_start_date, end_date = p_end_date, return_to_work_date = v_rtw
  where id = p_id;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();
  v_owner := public.holiday_request_owner(p_id);

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name,
     old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
  values
    (r.company_id, p_id, 'amended', auth.uid(), v_name,
     r.start_date, r.end_date, p_start_date, p_end_date, v_reason,
     v_owner is not null and v_owner is distinct from auth.uid());
end;
$$;

-- 10.7 (F7) Cancelling in the office: approvers only (can_manage_holiday_request). An approver MAY
--      cancel their own holiday (Phil, 11 Oct 2026: cancelling is not approving), so there is no own
--      record check here. The body is the live one; only the meaning of the permission changed.
create or replace function public.cancel_holiday_request(p_id uuid, p_reason text default null::text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.holiday_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason for cancelling.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found'; end if;
  if r.status = 'cancelled' then raise exception 'That holiday is already cancelled'; end if;
  if r.status = 'declined' then raise exception 'A declined request cannot be cancelled'; end if;
  if not public.can_manage_holiday_request(p_id) then
    raise exception 'You do not have permission to cancel this holiday';
  end if;

  update public.holiday_requests set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancel_reason = v_reason,
    start_date = coalesce(r.previous_start_date, r.start_date),
    end_date = coalesce(r.previous_end_date, r.end_date),
    return_to_work_date = case when r.change_kind is not null then r.previous_return_to_work_date else r.return_to_work_date end,
    change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
    previous_start_date = null, previous_end_date = null,
    previous_decided_by = null, previous_decided_at = null,
    previous_return_to_work_date = null
  where id = p_id;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();
  v_owner := public.holiday_request_owner(p_id);

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason, notify_person)
  values
    (r.company_id, p_id, 'cancelled', auth.uid(), v_name,
     coalesce(r.previous_start_date, r.start_date), coalesce(r.previous_end_date, r.end_date), v_reason,
     v_owner is not null and v_owner is distinct from auth.uid());
end;
$$;

-- 10.8 (F5) Taking back a change: only a change that request_holiday_change or
--      request_holiday_cancel recorded (they always set change_requested_by). previous_decided_by is
--      NOT required: Thistle's imported approved holidays have no decider, and a carer must still be
--      able to take back a change on one.
create or replace function public.withdraw_holiday_change(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.holiday_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found.'; end if;
  if not public.holiday_request_is_mine(p_id) then
    raise exception 'You can only change your own holiday.';
  end if;
  if r.status <> 'pending' or r.change_kind is null or r.change_requested_by is null then
    raise exception 'There is no change waiting on this holiday.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();

  update public.holiday_requests set
    start_date = r.previous_start_date,
    end_date = r.previous_end_date,
    return_to_work_date = r.previous_return_to_work_date,
    status = 'approved',
    decided_by = r.previous_decided_by,
    decided_at = r.previous_decided_at,
    change_kind = null,
    change_reason = null,
    change_requested_at = null,
    change_requested_by = null,
    previous_start_date = null,
    previous_end_date = null,
    previous_decided_by = null,
    previous_decided_at = null,
    previous_return_to_work_date = null
  where id = p_id;

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name,
     old_start_date, old_end_date, new_start_date, new_end_date, reason)
  values
    (r.company_id, p_id, 'change_withdrawn', auth.uid(), v_name,
     r.start_date, r.end_date, r.previous_start_date, r.previous_end_date, v_reason);
end;
$$;

-- 10.9 (F7) Withdrawing a booking you made for someone else. Now that every Supervisor and Recruiter
--      booking waits for an approver, recording leave already taken lands Pending too, and the live
--      rule (0440) refused any withdrawal once the start date had come: "only the office can cancel
--      it now", said to the office, about a booking the approvers had not yet looked at (proved on
--      Bevan in the step 7 review). The booker of somebody else's holiday may now withdraw it while
--      it still waits with no change in flight, whatever its dates. Your own holiday keeps the start
--      date rule. Everything else is the live 0440 body unchanged.
create or replace function public.request_holiday_cancel(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.holiday_requests%rowtype;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  v_kind text;
  v_booker boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason for cancelling.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found.'; end if;
  if not public.holiday_request_is_mine(p_id) then
    raise exception 'You can only cancel your own holiday.';
  end if;
  if r.status not in ('pending', 'approved') then
    raise exception 'That holiday is no longer active.';
  end if;
  if r.change_kind = 'cancel' then
    raise exception 'You have already asked to cancel this holiday.';
  end if;
  v_booker := coalesce(r.requested_by = auth.uid(), false)
              and public.holiday_request_owner(p_id) is distinct from auth.uid()
              and r.status = 'pending' and r.change_kind is null;
  if not v_booker
     and (r.start_date <= v_today or coalesce(r.previous_start_date, r.start_date) <= v_today) then
    raise exception 'This holiday has started, so only the office can cancel it now.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();

  if r.status = 'pending' and r.change_kind is null then
    update public.holiday_requests set
      status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancel_reason = v_reason
    where id = p_id;
    v_kind := 'request_withdrawn';
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason)
    values (r.company_id, p_id, v_kind, auth.uid(), v_name, r.start_date, r.end_date, v_reason);
  elsif r.change_kind = 'amend' then
    update public.holiday_requests set
      start_date = r.previous_start_date,
      end_date = r.previous_end_date,
      return_to_work_date = r.previous_return_to_work_date,
      change_kind = 'cancel',
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid()
    where id = p_id;
    v_kind := 'cancel_requested';
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason)
    values (r.company_id, p_id, v_kind, auth.uid(), v_name, r.previous_start_date, r.previous_end_date, v_reason);
  else
    update public.holiday_requests set
      previous_start_date = r.start_date,
      previous_end_date = r.end_date,
      previous_decided_by = r.decided_by,
      previous_decided_at = r.decided_at,
      previous_return_to_work_date = r.return_to_work_date,
      status = 'pending',
      change_kind = 'cancel',
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid(),
      decided_by = null,
      decided_at = null,
      decision_note = null
    where id = p_id;
    v_kind := 'cancel_requested';
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason)
    values (r.company_id, p_id, v_kind, auth.uid(), v_name, r.start_date, r.end_date, v_reason);
  end if;

  return v_kind;
end;
$$;


-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Who reads what (audit F16, F52, F53 and F50; Phil's decisions by popup, 11 October 2026).
-- Every block below only narrows who reads or writes; no row is changed. None of these tables has
-- a seed_company_* writer, so current and future companies are covered by the policies alone.
-- ---------------------------------------------------------------------------------------------

-- 11. F16 and F52: Regulation 73 visits and Regulation 80 reviews ------------------------------
--
-- Read by the Founder, the company wide roles (Company Admin, Registered Individual, Registered
-- Manager: every branch) and Branch Managers (their own branches only, view only). Nobody else:
-- carers, Seniors, Supervisors, Recruiters, Viewers and On Call read none of them, whether by the
-- screens, the two PDF routes or the database API. Until now the read rule was "any login in the
-- company". The RI signature and the Reg 80 chart images are data URLs inside the row (data
-- jsonb), and the prefill holds names of records with late checks and the safeguarding figures,
-- so this row rule is their only gate.
-- is_company_manager(company_id) stops a manager login attached to another company's branch
-- (audit F150) reading it through is_branch_manager alone.

drop policy if exists reg73_visits_select on public.reg73_visits;
create policy reg73_visits_select on public.reg73_visits
  for select to authenticated
  using (
    (select public.is_platform_admin())
    or public.is_company_wide(company_id)
    or (public.is_company_manager(company_id) and public.is_branch_manager(branch_id))
  );

drop policy if exists reg80_reviews_select on public.reg80_reviews;
create policy reg80_reviews_select on public.reg80_reviews
  for select to authenticated
  using (
    (select public.is_platform_admin())
    or public.is_company_wide(company_id)
    or (public.is_company_manager(company_id) and public.is_branch_manager(branch_id))
  );

-- The write policies are FOR ALL, so they are read rules too. They named the Registered
-- Individual and Registered Manager without status = 'active', so a disabled RI or RM kept
-- reading and editing every report through the API. is_company_wide is the same three roles
-- (Company Admin, RI, RM), active logins only. Editing is otherwise unchanged; Branch Managers
-- still only view.
drop policy if exists reg73_visits_write on public.reg73_visits;
create policy reg73_visits_write on public.reg73_visits
  for all to authenticated
  using ((select public.is_platform_admin()) or public.is_company_wide(company_id))
  with check ((select public.is_platform_admin()) or public.is_company_wide(company_id));

drop policy if exists reg80_reviews_write on public.reg80_reviews;
create policy reg80_reviews_write on public.reg80_reviews
  for all to authenticated
  using ((select public.is_platform_admin()) or public.is_company_wide(company_id))
  with check ((select public.is_platform_admin()) or public.is_company_wide(company_id));

-- 12. F53: readiness history (framework_readiness_snapshots) -----------------------------------
--
-- Read by the people who see readiness: the Founder, Company Admin, Registered Individual and
-- Registered Manager (every branch), and Branch Managers (the company score plus their own
-- branches). Written only by those roles, only for today (London) and only for what they can
-- see: a Branch Manager stores their own branches' scores, never the company wide row, because
-- the scores are worked out from their own view. A stored score is changed or deleted by the
-- Founder only. Until now any login in the company could read, rewrite or delete every day.
-- The old FOR ALL policy has to go, not just be joined by narrower ones: a FOR ALL policy is a
-- read rule as well, and policies of the same kind are ORed together.

drop policy if exists framework_readiness_snapshots_write on public.framework_readiness_snapshots;

drop policy if exists framework_readiness_snapshots_insert on public.framework_readiness_snapshots;
create policy framework_readiness_snapshots_insert on public.framework_readiness_snapshots
  for insert to authenticated
  with check (
    (select public.is_platform_admin())
    or (
      captured_on = (now() at time zone 'Europe/London')::date
      and (
        public.is_company_wide(company_id)
        or (
          branch_id is not null
          and public.is_company_manager(company_id)
          and public.is_branch_manager(branch_id)
        )
      )
    )
  );

drop policy if exists framework_readiness_snapshots_update on public.framework_readiness_snapshots;
create policy framework_readiness_snapshots_update on public.framework_readiness_snapshots
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

drop policy if exists framework_readiness_snapshots_delete on public.framework_readiness_snapshots;
create policy framework_readiness_snapshots_delete on public.framework_readiness_snapshots
  for delete to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists framework_readiness_snapshots_select on public.framework_readiness_snapshots;
create policy framework_readiness_snapshots_select on public.framework_readiness_snapshots
  for select to authenticated
  using (
    (select public.is_platform_admin())
    or public.is_company_wide(company_id)
    or (
      public.is_company_manager(company_id)
      and (branch_id is null or public.is_branch_manager(branch_id))
    )
  );

-- 13. F50: the Planner (planner_bookings and their tasks) --------------------------------------
--
-- Read as before by the office roles (Company Admin, the Registered roles, Branch Managers,
-- Supervisors and Recruiters) in the branches they belong to, and by the conductor and the
-- creator of a booking. Carers, Seniors, Viewers and On Call stop being Planner readers: they
-- have no Planner screen, and the 0106 read rule was written before carer logins existed. A
-- disabled login stops reading too. is_branch_member itself is left alone, because
-- submit_evidence, migrated_completions_select and the readiness branch picker rely on it for
-- carers. is_company_conductor checks the caller's own company and active status, which also
-- stops an outsider attached to a branch (audit F150) reading its Planner.
-- planner_bookings_select_own_creation (created_by = the caller) stays as it is, and the tasks
-- follow their booking through can_read_planner_booking.

create or replace function public.can_see_branch_planner(p_company uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
      or (public.is_company_conductor(p_company, auth.uid()) and public.is_branch_member(p_branch));
$$;

create or replace function public.can_read_planner_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.planner_bookings b
    where b.id = p_booking_id
      and (public.can_see_branch_planner(b.company_id, b.branch_id)
           or b.conductor_profile_id = auth.uid()
           or b.created_by = auth.uid())
  );
$$;

drop policy if exists planner_bookings_select on public.planner_bookings;
create policy planner_bookings_select on public.planner_bookings
  for select to authenticated
  using (
    public.can_see_branch_planner(company_id, branch_id)
    or conductor_profile_id = (select auth.uid())
  );


-- =============================================================================================

-- 14. (F9) anonymise_evidence: service role only. It ignored retention holds, wrote no audit line
--     and left the stored files behind, and nothing in the app calls it. The nightly retention
--     rule (expire_evidence_retention, service role only, respects holds, audits every row) is
--     the only way Evidence is emptied. Phil, 11 October 2026: no Admin erasure tool now (THE
--     LIST 49). Its own guard also refuses a service role call (no auth.uid), so nothing can use
--     it; it can be dropped in a later tidy up.
revoke execute on function public.anonymise_evidence(uuid) from public, anon, authenticated;


-- =============================================================================================

-- 15. Care plan documents: every version kept and recorded (audit F13). Phil's decision by popup,
--     11 October 2026 ("Keep every version", audit-2026-10-decisions.md; the on screen list of
--     earlier versions is THE LIST 51, not built here):
--   - A replaced care plan file is KEPT, and every file a service user's care plan has ever had is
--     a row in service_user_care_plan_files, so service user deletion, company deletion, retention
--     and the subject access export all find it. Before this the old file was overwritten in place
--     (same name) or left with nothing pointing at it (a new name).
--   - The rows are written by the database itself, from service_users.care_plan_path: whatever
--     sets the current file (Add service user, the Care plan page, code older than this migration),
--     the version is recorded in the same transaction. Signed in users cannot read or write the
--     table; the server reads it with the service role after checking the caller.
--   - Who may upload and open is enforced in the server actions (the Care plan page's roles), and
--     service_users_update still decides who may change the record. Unchanged here.
--   - Deleting a service user (by any route) cascades its rows, and each file is queued for the
--     nightly run to remove. Retention erases them eight years after the end of care, never on a
--     retention hold: the rule Updates (0325) and Documents (0439) already follow.
--
-- Live data checked first (read only, 11 October 2026): 17 service users have a care plan file,
-- all on test companies (Thistle has none), every path in the flat {company}/care-plans/{su}/{file}
-- layout; 18 objects in storage, one of them an earlier file nothing points at. The backfill at the
-- end records the 17 as current and the one as an earlier version.

-- 15.1 The versions. One row per file; replaced_at is null on the current one.
create table if not exists public.service_user_care_plan_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  bytes bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  -- Kept as written, so the name survives the uploader's login being removed.
  uploaded_by_name text,
  replaced_at timestamptz,
  replaced_by uuid references auth.users(id) on delete set null,
  constraint service_user_care_plan_files_path_in_folder check (
    public.path_in_company(storage_path, company_id)
    and starts_with(storage_path, company_id::text || '/care-plans/' || service_user_id::text || '/')
  )
);

create unique index if not exists service_user_care_plan_files_one_current
  on public.service_user_care_plan_files (service_user_id) where replaced_at is null;
create index if not exists service_user_care_plan_files_su_idx
  on public.service_user_care_plan_files (service_user_id, uploaded_at);
create index if not exists service_user_care_plan_files_company_idx
  on public.service_user_care_plan_files (company_id);
create index if not exists service_user_care_plan_files_uploaded_by_idx
  on public.service_user_care_plan_files (uploaded_by);
create index if not exists service_user_care_plan_files_replaced_by_idx
  on public.service_user_care_plan_files (replaced_by);

alter table public.service_user_care_plan_files enable row level security;

-- 15.2 Files to take out of the bucket once their row has gone (the service user was deleted, or
--      retention erased them). No foreign keys, so the queue survives the cascade that fills it;
--      the nightly run empties it.
create table if not exists public.care_plan_file_trash (
  storage_path text primary key,
  company_id uuid not null,
  queued_at timestamptz not null default now()
);
alter table public.care_plan_file_trash enable row level security;

create or replace function public.care_plan_file_to_trash()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.care_plan_file_trash (storage_path, company_id)
  values (old.storage_path, old.company_id)
  on conflict (storage_path) do nothing;
  return old;
end;
$$;

drop trigger if exists service_user_care_plan_files_trash on public.service_user_care_plan_files;
create trigger service_user_care_plan_files_trash
  after delete on public.service_user_care_plan_files
  for each row execute function public.care_plan_file_to_trash();

-- 15.3 Recording a version whenever the current file changes. The previous current row is stamped
--      replaced (and recorded, if a file from before this migration has no row yet); the new path
--      becomes the current row. Pointing back at an earlier file makes that row current again.
--      The path must sit in this service user's own care plan folder.
create or replace function public.record_care_plan_file()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_now timestamptz := now();
begin
  if tg_op = 'UPDATE' and new.care_plan_path is not distinct from old.care_plan_path then
    return null;
  end if;

  if new.care_plan_path is not null
     and not starts_with(new.care_plan_path, new.company_id::text || '/care-plans/' || new.id::text || '/') then
    raise exception 'A care plan file must be stored in that service user''s own care plan folder.'
      using errcode = '42501', detail = 'service_users.care_plan_path';
  end if;

  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
  end if;

  update public.service_user_care_plan_files f
     set replaced_at = v_now, replaced_by = v_uid
   where f.service_user_id = new.id
     and f.replaced_at is null
     and f.storage_path is distinct from new.care_plan_path;

  if tg_op = 'UPDATE' and old.care_plan_path is not null
     and old.care_plan_path is distinct from new.care_plan_path
     and starts_with(old.care_plan_path, old.company_id::text || '/care-plans/' || old.id::text || '/') then
    insert into public.service_user_care_plan_files
      (company_id, service_user_id, storage_path, file_name, mime_type, bytes, uploaded_at,
       replaced_at, replaced_by)
    select old.company_id, old.id, old.care_plan_path,
           regexp_replace(old.care_plan_path, '^.*/', ''),
           o.metadata->>'mimetype', nullif(o.metadata->>'size', '')::bigint,
           coalesce(old.care_plan_uploaded_at, o.created_at, v_now), v_now, v_uid
      from (select 1) one
      left join storage.objects o on o.bucket_id = 'evidence' and o.name = old.care_plan_path
    on conflict (storage_path) do nothing;
  end if;

  if new.care_plan_path is not null then
    -- A path changed without a new upload time is stamped now, not with the previous file's time.
    insert into public.service_user_care_plan_files
      (company_id, service_user_id, storage_path, file_name, mime_type, bytes, uploaded_at,
       uploaded_by, uploaded_by_name)
    select new.company_id, new.id, new.care_plan_path,
           regexp_replace(new.care_plan_path, '^.*/', ''),
           o.metadata->>'mimetype', nullif(o.metadata->>'size', '')::bigint,
           case when tg_op = 'INSERT' or new.care_plan_uploaded_at is distinct from old.care_plan_uploaded_at
                then coalesce(new.care_plan_uploaded_at, v_now) else v_now end,
           v_uid, v_name
      from (select 1) one
      left join storage.objects o on o.bucket_id = 'evidence' and o.name = new.care_plan_path
    on conflict (storage_path) do update
      set replaced_at = null, replaced_by = null;
  end if;

  return null;
end;
$$;

drop trigger if exists service_users_care_plan_files on public.service_users;
create trigger service_users_care_plan_files
  after insert or update of care_plan_path on public.service_users
  for each row execute function public.record_care_plan_file();

-- 15.4 Retention: the Updates and Documents rule (0325, 0439). A discharged service user's care
--      plan files are erased eight years after the discharge date (Europe/London), never while the
--      record is on a retention hold. The record stops pointing at a file first; the rows then go
--      and each file is queued for the nightly run. Service role only, from /api/cron/retention.
create or replace function public.expire_care_plan_file_retention(p_limit integer default 200)
returns table (company_id uuid, service_user_id uuid, removed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_ids uuid[];
begin
  select array_agg(d.id) into v_ids
    from (
      select su.id
        from public.service_users su
       where su.service_status = 'cancelled'
         and su.discharge_date is not null
         and (su.discharge_date + interval '8 years')::date <= v_today
         and coalesce(su.retention_hold, false) = false
         and exists (select 1 from public.service_user_care_plan_files f where f.service_user_id = su.id)
       order by su.discharge_date, su.id
       limit greatest(coalesce(p_limit, 200), 1)
    ) d;
  if v_ids is null then return; end if;

  -- Its own statement: the version trigger on service_users touches the same rows the delete
  -- below removes, and one statement may not do both.
  update public.service_users su
     set care_plan_path = null, care_plan_uploaded_at = null
   where su.id = any (v_ids) and su.care_plan_path is not null;

  return query
  with gone as (
    delete from public.service_user_care_plan_files f
     where f.service_user_id = any (v_ids)
    returning f.company_id as cid, f.service_user_id as sid
  )
  select g.cid, g.sid, count(*)::int from gone g group by g.cid, g.sid;
end;
$$;

-- 15.5 Backfill, safe to run twice. Every current file becomes the current row; any other object
--      already in a service user's care plan folder (an earlier file a Replace left behind) is
--      recorded as an earlier version, so nothing held is invisible to retention or a SAR.
insert into public.service_user_care_plan_files
  (company_id, service_user_id, storage_path, file_name, mime_type, bytes, uploaded_at)
select su.company_id, su.id, su.care_plan_path,
       regexp_replace(su.care_plan_path, '^.*/', ''),
       o.metadata->>'mimetype', nullif(o.metadata->>'size', '')::bigint,
       coalesce(su.care_plan_uploaded_at, o.created_at, now())
  from public.service_users su
  left join storage.objects o on o.bucket_id = 'evidence' and o.name = su.care_plan_path
 where su.care_plan_path is not null
   and starts_with(su.care_plan_path, su.company_id::text || '/care-plans/' || su.id::text || '/')
on conflict (storage_path) do nothing;

insert into public.service_user_care_plan_files
  (company_id, service_user_id, storage_path, file_name, mime_type, bytes, uploaded_at, replaced_at)
select su.company_id, su.id, o.name,
       regexp_replace(o.name, '^.*/', ''),
       o.metadata->>'mimetype', nullif(o.metadata->>'size', '')::bigint,
       coalesce(o.created_at, now()),
       greatest(coalesce(su.care_plan_uploaded_at, o.created_at, now()), coalesce(o.created_at, now()))
  from storage.objects o
  join public.service_users su
    on starts_with(o.name, su.company_id::text || '/care-plans/' || su.id::text || '/')
 where o.bucket_id = 'evidence'
   and o.name like '%/care-plans/%'
   and o.name is distinct from su.care_plan_path
   and public.path_in_company(o.name, su.company_id)
on conflict (storage_path) do nothing;


-- =============================================================================================
-- 16. Revokes, every section's, in one place. A signed in user keeps an explicit grant only on the
--     calls the app makes; PUBLIC and anon lose every function touched here (review point k).
-- =============================================================================================

-- Sections 1 and 15 (F11, F11b, F13). Trigger functions are run by the database only; the
-- retention function by the service role only; neither table is read or written by signed in users.
revoke all on function public.guard_founder_login() from public, anon, authenticated;
revoke all on function public.enforce_person_login_company() from public, anon, authenticated;
revoke all on function public.care_plan_file_to_trash() from public, anon, authenticated;
revoke all on function public.record_care_plan_file() from public, anon, authenticated;
revoke all on function public.expire_care_plan_file_retention(integer) from public, anon, authenticated;
revoke all on public.service_user_care_plan_files from anon, authenticated;
revoke all on public.care_plan_file_trash from anon, authenticated;


-- Revokes for sections 2, 6 and 7 (signed in users keep their own explicit grant on the two calls).
revoke all on function public.keep_record_creation() from public, anon, authenticated;
revoke all on function public.seed_migrated_completion(text, uuid, uuid, date, date, boolean, date, smallint) from public, anon;
revoke all on function public.reschedule_check_instances(uuid, jsonb) from public, anon;
grant execute on function public.seed_migrated_completion(text, uuid, uuid, date, date, boolean, date, smallint) to authenticated, service_role;
grant execute on function public.reschedule_check_instances(uuid, jsonb) to authenticated, service_role;


-- Revokes for sections 3, 4, 5 and 8. Signed in users keep their own explicit grant on the calls
-- the app makes (complete_check, set_person_check_due, submit_evidence, submit_paper_evidence and
-- the two can_complete helpers); PUBLIC and anon could run all of them until now. No RLS policy
-- uses any function here, so nothing that reads a table changes.
revoke all on function public.try_date(text) from public, anon, authenticated;
revoke all on function public.evidence_completion_date(jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.evidence_retest_due(jsonb, jsonb, date) from public, anon, authenticated;
revoke all on function public.evidence_completes_check(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.check_dates_from_evidence(uuid, uuid) from public, anon, authenticated;
revoke all on function public.may_file_evidence(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reanchor_supervision_cycle(uuid, date) from public, anon, authenticated;
revoke all on function public.complete_check(uuid, date, uuid, date, date) from public, anon;
revoke all on function public.set_person_check_due(uuid, text, date) from public, anon;
revoke all on function public.can_complete_person_check(uuid) from public, anon;
revoke all on function public.can_complete_service_user_check(uuid) from public, anon;
revoke all on function public.is_booked_conductor_for_check(uuid) from public, anon, authenticated;
revoke all on function public.submit_evidence(uuid, uuid, uuid, jsonb, text, text, integer, text, uuid, jsonb) from public, anon;
revoke all on function public.submit_paper_evidence(uuid, uuid, date, jsonb, jsonb) from public, anon;
grant execute on function public.complete_check(uuid, date, uuid, date, date) to authenticated, service_role;
grant execute on function public.set_person_check_due(uuid, text, date) to authenticated, service_role;
grant execute on function public.can_complete_person_check(uuid) to authenticated, service_role;
grant execute on function public.can_complete_service_user_check(uuid) to authenticated, service_role;
grant execute on function public.submit_evidence(uuid, uuid, uuid, jsonb, text, text, integer, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.submit_paper_evidence(uuid, uuid, date, jsonb, jsonb) to authenticated, service_role;


-- Section 9 (F55, F44).
revoke all on function public.complete_assignment(uuid, uuid) from public, anon;
grant execute on function public.complete_assignment(uuid, uuid) to authenticated;
revoke all on function public.assignments_office_writes_stay_open() from public, anon, authenticated;


-- 10.10 Revokes. Signed in users call the five holiday actions and can_approve_holiday_for (from
--      bookHolidayForPerson). can_approve_holiday and can_manage_holiday_request are only used inside
--      SECURITY DEFINER functions and the trigger, which run as their owner, and the trigger function
--      is never called directly, so nobody else needs them. can_manage_holiday_request and the
--      trigger function could be run by PUBLIC and anon until now.
revoke all on function public.can_approve_holiday(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_approve_holiday_for(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_approve_holiday_for(uuid, uuid, uuid) to authenticated;
revoke all on function public.can_manage_holiday_request(uuid) from public, anon, authenticated;
revoke all on function public.holiday_request_status_is_earned() from public, anon, authenticated;
revoke all on function public.decide_holiday_request(uuid, text, uuid, text) from public, anon;
revoke all on function public.amend_holiday_request(uuid, date, date, text, date) from public, anon;
revoke all on function public.cancel_holiday_request(uuid, text) from public, anon;
revoke all on function public.withdraw_holiday_change(uuid, text) from public, anon;
grant execute on function public.decide_holiday_request(uuid, text, uuid, text) to authenticated;
grant execute on function public.amend_holiday_request(uuid, date, date, text, date) to authenticated;
grant execute on function public.cancel_holiday_request(uuid, text) to authenticated;
grant execute on function public.withdraw_holiday_change(uuid, text) to authenticated;
revoke all on function public.request_holiday_cancel(uuid, text) from public, anon;
grant execute on function public.request_holiday_cancel(uuid, text) to authenticated;


-- Sections 11 to 13: signed in users only (the policies call these as the caller, so
-- authenticated keeps its grant); never PUBLIC or anon.
revoke all on function public.can_see_branch_planner(uuid, uuid) from public, anon;
grant execute on function public.can_see_branch_planner(uuid, uuid) to authenticated;
revoke all on function public.can_read_planner_booking(uuid) from public, anon;
grant execute on function public.can_read_planner_booking(uuid) to authenticated;


-- =============================================================================================
-- 17. The two new company owned tables of section 15 get the company link triggers (0443)
-- =============================================================================================

select public.install_company_link_triggers();

-- After applying: run the security advisor (security). Stop on any ERROR. New lints expected and
-- judged acceptable: WARN "SECURITY DEFINER function executable by signed in users" for
-- can_approve_holiday_for (answers yes or no about the caller, bookHolidayForPerson asks it),
-- can_see_branch_planner and can_read_planner_booking (the planner policies call them as the
-- caller, like the other is_* helpers); INFO "RLS enabled, no policy" for
-- service_user_care_plan_files and care_plan_file_trash (service role only, as
-- record_document_file_trash). Then run the parity check in TEST-CHECKLIST-AUDIT-FIXES.md.
