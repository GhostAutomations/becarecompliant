-- scripts/access-probe.sql
--
-- "They need access to this, if the boxes are checked in the access tiles they should be able to
--  do it. I don't want to have to keep coming back to fix things." -- Phil, 2026-09-21
--
-- The same fault has now been found four times (DEF-023, DEF-028, DEF-031, DEF-032): a tile
-- promising a department, and the database refusing the write once the form had been filled in.
-- Reading policies is how it was missed four times. This script does not read them. It signs in
-- as a real user and TRIES each thing the tile promises, then throws the attempt away.
--
-- HOW IT WORKS. Every attempt runs inside its own exception block, and a sentinel exception is
-- raised the instant the statement succeeds, so the row never survives. Nothing is kept: the
-- worst this can do is bump a sequence. It is safe to run against live.
--
-- HOW TO RUN IT. Put the profile id of the person to probe in v_profile below (and a role in
-- v_as_role to probe them as a role nobody holds yet), paste the whole file into the Supabase SQL
-- editor, and read the last two columns. Probe one role at a time: a
-- Supervisor and a Recruiter after any change to policies, to roles, or to the access tiles.
--
-- IT PROBES A PERSON, not a role name, so somebody on a role their own company made (0314) is
-- probed exactly the same way. Their custom role narrows which departments they are SHOWN; what
-- the database allows comes from the built-in role underneath, which is what these attempts
-- test, so a pass here means the tile can only be hiding something, never promising it.
--
-- HOW TO READ IT. "as the tile promises" is a pass. "DOES NOT MATCH THE TILE" is a defect:
-- either the policy is wrong or the tick is a lie, and which of the two it is is a decision
-- rather than a guess -- Phil decides which way round it gets put right. "nothing to judge by"
-- means the company has no such records yet, so the probe proved nothing either way.
--
-- WHAT IS EXPECTED, AND WHY. Each attempt carries the roles its tile is for, a transcription of
-- the ceiling in lib/auth/module-catalogue.ts, and `expected` is worked out from the probed role.
-- OFFICE (Managers, Supervisors and Recruiters) opens People, Training, Holiday, Absence, Service
-- Users, Complaints, Incidents, Briefings, On Call and Planner. Invoicing, Readiness, Reports and
-- Whistleblowing stay with Managers and above; inviting a user is the Admin's alone. On Call opens
-- Absence, Complaints and On Call, and reads the People roster to pick who is off. A Viewer
-- (team_member) reads the People and Service User registers and nothing else, and never a
-- completed form. When the tiles change, this file changes in the same commit.
--
-- TWO THINGS THAT ARE MEANT TO BE REFUSED HERE, and are not defects:
--   * Evidence is never inserted from a browser. It goes through submit_evidence(), which stamps
--     the author and the schema snapshot so neither can be forged, so the probe calls that.
--   * Inviting a user is a Manager's job, so a Supervisor being refused is the tile being kept.
--
-- THE ROLE LIMITS OF STEP 7 (audit fix plan, Phil's decisions by popup, 11 Oct 2026, migration
-- 0444; permission-boundaries.md). The rows marked "step 7" try what those decisions narrowed:
--   * A check's form, and completing a check, belong to whoever may complete that check (Admins,
--     the Registered roles, the Branch Manager, the branch's Supervisors), never a Recruiter or
--     On Call, and never on your own record. A form is completed by its own Evidence, which
--     decides its dates; nothing moves a due date to a date of the caller's choosing.
--   * On your own record only the forms your own page offers (a holiday request, a financial
--     transaction, signing what is sent to you). Nobody signs a policy for somebody else.
--   * Check history with no Evidence: Admins on any record, the rest of the office only on a
--     person they have just added.
--   * Holidays: only an approver books one as approved, never their own. A briefing is closed only
--     by the person it was sent to. A check's settings are the Admin's. Reg 73, Reg 80 and the
--     readiness history are read by Managers and above. The Planner is read by the office.
--   They need somebody the probed user can see, a record of the probed user's own, and a person
--   the probed user has just added. Where the probed user has no record of their own, one is made
--   for them, inside the same savepoint that is always rolled back, with the two Evidence rows the
--   completion attempts use; nothing of it survives. A Senior's completions depend on the checks
--   ticked on their tile, so read those two rows for a Senior with the tile beside you.

drop table if exists probe_result;
create temp table probe_result (
  seq int,
  department text,
  attempt text,
  expected text,
  outcome text,
  verdict text,
  detail text
);

do $probe$
declare
  -- THE PERSON BEING PROBED. Thistle's Supervisor by default.
  v_profile uuid := 'f1039cdd-97c3-49a2-89ea-985bba6db94c';
  -- PROBE A ROLE NOBODY HOLDS YET (2026-09-24, list 12). Leave null to probe the person as they
  -- are. Set it (manager, on_call, team_member, recruiter...) to probe them AS that role: their
  -- role is changed inside a savepoint and the savepoint is rolled back with everything else, so
  -- nobody's role is ever really changed. Thistle has no Branch Manager, On Call or Viewer login,
  -- which is how those three went unprobed.
  v_as_role text := null;

  v_company uuid;
  v_branch uuid;
  v_person uuid;
  v_su uuid;
  v_course uuid;
  v_form uuid;
  v_version uuid;
  v_definition uuid;
  v_role text;
  v_email text;

  -- Step 7 (see the header). Today is London's, as the database's own rules read it.
  v_today date := (now() at time zone 'Europe/London')::date;
  v_any_branch uuid;
  v_hist_on date;
  v_su_definition uuid;
  v_su_hist_on date;
  v_check_def uuid;
  v_check_form uuid;
  v_check_version uuid;
  v_check_instance uuid;
  v_dbs_version uuid;
  v_absence_version uuid;
  v_holiday_version uuid;
  v_policy_version uuid;
  v_founder uuid;
  v_own_person uuid;
  v_own_branch uuid;
  v_own_fixture boolean := false;
  v_own_instance uuid;
  v_own_instance_fixture boolean := false;
  v_new_person uuid := gen_random_uuid();
  v_other_def uuid;
  v_other_instance uuid;
  v_other_due date;
  v_ev_other uuid := gen_random_uuid();
  v_ev_own uuid := gen_random_uuid();

  plan jsonb := '[]'::jsonb;
  -- WHO EACH TILE IS FOR: a transcription of lib/auth/module-catalogue.ts. When that changes,
  -- this changes in the same commit.
  c_office text[] := array['company_admin','registered_individual','registered_manager','manager','supervisor','recruiter'];
  c_mgmt text[] := array['company_admin','registered_individual','registered_manager','manager'];
  -- Who completes a check (step 7): the office without Recruiters.
  c_check text[] := array['company_admin','registered_individual','registered_manager','manager','supervisor'];
  -- Who may file a form about themselves: everybody but a Viewer.
  c_self text[] := array['company_admin','registered_individual','registered_manager','manager','supervisor','recruiter','on_call','staff','senior'];
  c_nobody text[] := array[]::text[];
  res jsonb := '[]'::jsonb;
  r record;
  e jsonb;
  n int;
  total int;
  i int := 0;
  v_outcome text;
  v_detail text;
  v_expected text;
begin
  select p.role, p.email, p.company_id into v_role, v_email, v_company
    from public.profiles p where p.id = v_profile;
  if v_as_role is not null then
    v_role := v_as_role;
  end if;
  if v_company is null then
    raise exception 'No such profile: %', v_profile;
  end if;

  select ub.branch_id into v_branch
    from public.user_branches ub where ub.user_id = v_profile
    order by ub.is_primary desc nulls last limit 1;
  v_any_branch := coalesce(v_branch,
    (select b.id from public.branches b where b.company_id = v_company order by b.created_at limit 1));

  -- Somebody the probed user does NOT have on their own caseload, so a caseload clause cannot
  -- make a branch wide permission look like it works. Never their own record (step 7 asks about
  -- that separately), and somebody still working there where there is one.
  select pe.id into v_person from public.people pe
   where pe.company_id = v_company and pe.branch_id is not distinct from v_branch
     and pe.profile_id is distinct from v_profile
     and not exists (select 1 from public.person_assignments pa
                      where pa.person_id = pe.id and pa.user_id = v_profile)
   order by (pe.archived_at is null and coalesce(pe.employment_status, 'active') <> 'leaver') desc, pe.created_at
   limit 1;

  select su.id into v_su from public.service_users su
   where su.company_id = v_company and su.branch_id is not distinct from v_branch
     and not exists (select 1 from public.service_user_assignments sa
                      where sa.service_user_id = su.id and sa.user_id = v_profile)
   order by su.created_at limit 1;

  select tc.id into v_course from public.training_courses tc where tc.company_id = v_company limit 1;

  select cd.id into v_definition from public.check_definitions cd
   where cd.company_id = v_company and cd.population = 'people' and cd.active and cd.recurring
   order by cd.sort_order limit 1;

  select f.id, fv.id into v_form, v_version
    from public.forms f join public.form_versions fv on fv.form_id = f.id
   where f.company_id = v_company and fv.status = 'published'
   order by fv.version desc limit 1;

  -- Step 7 lookups. A history date the record's start date allows (a Supervision before the start
  -- is refused for everybody, which would prove nothing).
  select least(v_today, greatest(v_today - 30, coalesce(pe.start_date, v_today - 30))) into v_hist_on
    from public.people pe where pe.id = v_person;
  select cd.id into v_su_definition from public.check_definitions cd
   where cd.company_id = v_company and cd.population = 'service_users' and cd.active and cd.recurring
   order by cd.sort_order limit 1;
  select least(v_today, greatest(v_today - 30, coalesce(su.package_start_date, v_today - 30))) into v_su_hist_on
    from public.service_users su where su.id = v_su;

  -- A check with a form, run from its completion. Not Supervision or Appraisal where another will
  -- do: those two refuse a date before the start date and move other checks when completed.
  select cd.id, cd.form_id into v_check_def, v_check_form from public.check_definitions cd
   where cd.company_id = v_company and cd.population = 'people' and cd.active and cd.recurring
     and cd.anchor = 'completion' and cd.form_id is not null
     and exists (select 1 from public.form_versions fv where fv.form_id = cd.form_id and fv.status = 'published')
   order by (cd.key in ('supervision', 'appraisal')), cd.sort_order limit 1;
  select fv.id into v_check_version from public.form_versions fv
   where fv.form_id = v_check_form and fv.status = 'published' order by fv.version desc limit 1;
  select ci.id into v_check_instance from public.check_instances ci
   where ci.person_id = v_person and ci.definition_id = v_check_def limit 1;

  select fv.id into v_dbs_version from public.forms f join public.form_versions fv on fv.form_id = f.id
   where f.company_id = v_company and f.key = 'dbs_renewal' and fv.status = 'published' order by fv.version desc limit 1;
  select fv.id into v_absence_version from public.forms f join public.form_versions fv on fv.form_id = f.id
   where f.company_id = v_company and f.key = 'absence_back_office' and fv.status = 'published' order by fv.version desc limit 1;
  select fv.id into v_holiday_version from public.forms f join public.form_versions fv on fv.form_id = f.id
   where f.company_id = v_company and f.key = 'holiday_requests' and fv.status = 'published' order by fv.version desc limit 1;
  select fv.id into v_policy_version from public.forms f join public.form_versions fv on fv.form_id = f.id
   where f.company_id = v_company and f.key = 'policy_acknowledgement' and fv.status = 'published' order by fv.version desc limit 1;

  select p.id into v_founder from public.profiles p where p.role = 'platform_admin' order by p.created_at limit 1;

  -- An open check on somebody in a branch the probed user is not linked to (audit F59): moving
  -- its due date is for the company wide roles and Recruiters, not a branch lead of another branch.
  select ci.definition_id, ci.id, ci.due_date into v_other_def, v_other_instance, v_other_due
    from public.check_instances ci join public.people pe on pe.id = ci.person_id
   where ci.company_id = v_company and ci.last_completed_on is null
     and pe.profile_id is distinct from v_profile
     and pe.branch_id is not null
     and pe.branch_id not in (select ub.branch_id from public.user_branches ub where ub.user_id = v_profile)
   order by ci.created_at limit 1;

  -- Their own record: the real one, or one made for this run (see the header).
  select pe.id, pe.branch_id into v_own_person, v_own_branch
    from public.people pe where pe.profile_id = v_profile;
  if v_own_person is null then
    v_own_person := gen_random_uuid();
    v_own_branch := v_any_branch;
    v_own_fixture := true;
  else
    select ci.id into v_own_instance from public.check_instances ci
     where ci.person_id = v_own_person and ci.definition_id = v_check_def limit 1;
  end if;
  if v_own_instance is null and v_check_def is not null then
    v_own_instance := gen_random_uuid();
    v_own_instance_fixture := true;
  end if;

  -- PASS ONE, still ourselves: how many rows exist at all, so "they see nothing" is never
  -- confused with "there is nothing to see". A row with no statement had nothing to try it on.
  for r in
    select * from (values
      -- department, what the screen offers, write|read|call, the attempt, what exists at all, expected
      ('People', 'add a person to their branch', 'write',
        format('insert into public.people (company_id, branch_id, full_name) values (%L, %L, %L)',
               v_company, v_branch, 'ZZ access probe'), null, c_office),
      ('People', 'open a tracker on somebody not on their caseload', 'write',
        format('update public.person_trackers set updated_at = now() where person_id = %L', v_person), null, c_office),
      ('People', 'see the register', 'read',
        format('select count(*) from public.people where company_id = %L', v_company),
        format('select count(*) from public.people where company_id = %L', v_company), c_office || array['team_member','on_call']),
      -- "They already work here" on Add a person (0315) and the bulk import go through this. Step 7
      -- (audit F60): an Admin may record it on anybody; the rest of the office only on a person
      -- they have just added; service user history is the Admin's. History only, so a check that
      -- already has Evidence does not refuse it for an unrelated reason.
      ('People', 'record a check done before they joined, on somebody already on the register (step 7)', 'write',
        case when v_person is not null and v_definition is not null then
          format('select public.seed_migrated_completion(%L, %L, %L, %L::date, %L::date, false, null, null)',
                 'person', v_person, v_definition, v_hist_on, v_hist_on + 30) end, null, array['company_admin']),
      ('People', 'record a check done before they joined, on somebody they added just now (step 7)', 'write',
        case when v_definition is not null then
          format('select public.seed_migrated_completion(%L, %L, %L, %L::date, %L::date, false, null, null)',
                 'person', v_new_person, v_definition, v_today - 30, v_today) end, null, c_office),
      ('Service Users', 'record a check done before they joined (step 7)', 'write',
        case when v_su is not null and v_su_definition is not null then
          format('select public.seed_migrated_completion(%L, %L, %L, %L::date, %L::date, false, null, null)',
                 'service_user', v_su, v_su_definition, v_su_hist_on, v_su_hist_on + 30) end, null, array['company_admin']),
      -- Audit F11b: a Person record never points at the Founder's login.
      ('People', 'link a Person record to the Founder login (step 7)', 'write',
        case when v_person is not null and v_founder is not null then
          format('update public.people set profile_id = %L where id = %L', v_founder, v_person) end, null, c_nobody),
      ('Training', 'record training for somebody in their branch', 'write',
        format('insert into public.person_training (company_id, branch_id, person_id, course_id, status, completed_on) values (%L, %L, %L, %L, %L, current_date)',
               v_company, v_branch, v_person, v_course, 'completed'), null, c_office),
      -- Supervisors and Recruiters still book; what they book waits for an approver (audit F7).
      ('Holiday', 'book holiday for somebody else', 'write',
        format('insert into public.holiday_requests (company_id, branch_id, person_id, requested_by, start_date, end_date) values (%L, %L, %L, %L, current_date, current_date)',
               v_company, v_branch, v_person, v_profile), null, c_office),
      ('Holiday', 'book holiday for somebody else straight in as approved (step 7)', 'call',
        case when v_person is not null then
          format($s$do $x$ declare v text; begin insert into public.holiday_requests (company_id, branch_id, person_id, requested_by, start_date, end_date, status) values (%L, %L, %L, %L, %L::date, %L::date, 'approved') returning status into v; if v is distinct from 'approved' then raise exception 'it was saved as %%', v; end if; end $x$$s$,
                 v_company, v_branch, v_person, v_profile, v_today + 200, v_today + 201) end, null, c_mgmt),
      ('Holiday', 'book their own holiday straight in as approved (step 7)', 'call',
        format($s$do $x$ declare v text; begin insert into public.holiday_requests (company_id, branch_id, person_id, requested_by, start_date, end_date, status) values (%L, %L, %L, %L, %L::date, %L::date, 'approved') returning status into v; if v is distinct from 'approved' then raise exception 'it was saved as %%', v; end if; end $x$$s$,
               v_company, v_own_branch, v_own_person, v_profile, v_today + 200, v_today + 201), null, c_nobody),
      ('Holiday', 'send in their own holiday request form (step 7)', 'write',
        case when v_holiday_version is not null then
          format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
                 v_holiday_version, v_own_branch, '{}', 'person', v_own_person, '[]') end, null, c_self),
      ('Holiday', 'see the branch''s requests', 'read',
        format('select count(*) from public.holiday_requests where company_id = %L', v_company),
        format('select count(*) from public.holiday_requests where company_id = %L', v_company), c_office),
      ('Absence', 'record a sickness for somebody else', 'write',
        format('insert into public.absence_events (company_id, branch_id, person_id, start_date) values (%L, %L, %L, current_date)',
               v_company, v_branch, v_person), null, c_office || array['on_call']),
      ('Absence', 'book the return to work meeting', 'write',
        format('insert into public.absence_meetings (company_id, branch_id, person_id, meeting_date) values (%L, %L, %L, current_date)',
               v_company, v_branch, v_person), null, c_office || array['on_call']),
      -- Step 7 (audit F3): the Absence form by name, because On Call files absences and absence
      -- meetings but holds no return to work interviews and completes no checks.
      ('Absence', 'fill in the Absence form for somebody else (step 7)', 'write',
        case when v_absence_version is not null and v_person is not null then
          format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
                 v_absence_version, v_branch, '{}', 'person', v_person, '[]') end, null, c_office || array['on_call']),
      ('Absence', 'see the branch''s absences', 'read',
        format('select count(*) from public.absence_events where company_id = %L', v_company),
        format('select count(*) from public.absence_events where company_id = %L', v_company), c_office || array['on_call']),
      ('Service Users', 'add a service user', 'write',
        format('insert into public.service_users (company_id, branch_id, full_name) values (%L, %L, %L)',
               v_company, v_branch, 'ZZ access probe'), null, c_office),
      ('Service Users', 'open a tracker on somebody not on their caseload', 'write',
        format('update public.service_user_trackers set updated_at = now() where service_user_id = %L', v_su), null, c_office),
      ('Service Users', 'see the register', 'read',
        format('select count(*) from public.service_users where company_id = %L', v_company),
        format('select count(*) from public.service_users where company_id = %L', v_company), c_office || array['team_member']),
      -- Reports: a Supervisor opens only the four due reports (2026-10-05), which read the same
      -- status views as the dashboard tiles. Recruiters are not ticked for Reports.
      ('Reports', 'read what is due for the due reports', 'read',
        format('select count(*) from public.person_check_status where company_id = %L', v_company),
        format('select count(*) from public.person_check_status where company_id = %L', v_company), c_mgmt || array['supervisor']),
      -- Step 7 (audit F16, F52, F53): Reg 73 visits, Reg 80 reviews and the readiness history are
      -- read by Admins and the Registered roles (every branch) and Branch Managers (their own).
      ('Reports', 'read the Regulation 73 visits (step 7)', 'read',
        format('select count(*) from public.reg73_visits where company_id = %L and (%L::uuid is null or branch_id = %L::uuid)', v_company, v_branch, v_branch),
        format('select count(*) from public.reg73_visits where company_id = %L and (%L::uuid is null or branch_id = %L::uuid)', v_company, v_branch, v_branch), c_mgmt),
      ('Reports', 'read the Regulation 80 reviews (step 7)', 'read',
        format('select count(*) from public.reg80_reviews where company_id = %L and (%L::uuid is null or branch_id = %L::uuid)', v_company, v_branch, v_branch),
        format('select count(*) from public.reg80_reviews where company_id = %L and (%L::uuid is null or branch_id = %L::uuid)', v_company, v_branch, v_branch), c_mgmt),
      ('Readiness', 'read the readiness history (step 7)', 'read',
        format('select count(*) from public.framework_readiness_snapshots where company_id = %L and (branch_id is null or %L::uuid is null or branch_id = %L::uuid)', v_company, v_branch, v_branch),
        format('select count(*) from public.framework_readiness_snapshots where company_id = %L and (branch_id is null or %L::uuid is null or branch_id = %L::uuid)', v_company, v_branch, v_branch), c_mgmt),
      -- A Viewer sees the registers and due dates, never what a completed form says.
      -- Forms somebody ELSE filed: everybody may see what they filed themselves, so counting those
      -- would make a Viewer who once filed something look as though they read everybody's.
      ('Evidence', 'read a completed form', 'read',
        format('select count(*) from public.evidence where company_id = %L and record_type = %L and author_id is distinct from %L', v_company, 'person', v_profile),
        format('select count(*) from public.evidence where company_id = %L and record_type = %L and author_id is distinct from %L', v_company, 'person', v_profile), c_office),
      ('Complaints', 'raise a complaint', 'write',
        format('insert into public.complaints (company_id, branch_id, ref_number, subject) values (%L, %L, 999999, %L)',
               v_company, v_branch, 'ZZ access probe'), null, c_office || array['on_call']),
      ('Complaints', 'see the branch''s complaints', 'read',
        format('select count(*) from public.complaints where company_id = %L', v_company),
        format('select count(*) from public.complaints where company_id = %L', v_company), c_office || array['on_call']),
      -- Any member may REPORT an incident (0301: the carer's report). Everything after that stays
      -- with the branch, which the read below checks.
      ('Incidents', 'write up an incident', 'write',
        format('insert into public.incidents (company_id, branch_id, occurred_on, category, description) values (%L, %L, current_date, %L, %L)',
               v_company, v_branch, 'other', 'ZZ access probe'), null, c_office || array['team_member','on_call','staff']),
      ('Incidents', 'see the branch''s incidents', 'read',
        format('select count(*) from public.incidents where company_id = %L', v_company),
        format('select count(*) from public.incidents where company_id = %L', v_company), c_office),
      ('Briefings', 'send out a briefing', 'write',
        format('insert into public.assignments (company_id, person_id, kind, form_id, due_date) values (%L, %L, %L, %L, current_date)',
               v_company, v_person, 'form', v_form), null, c_office),
      -- Step 7 (audit F55): the office sends and withdraws a briefing; only its person closes it.
      ('Briefings', 'mark a briefing done for somebody by writing it directly (step 7)', 'write',
        format('insert into public.assignments (company_id, person_id, kind, form_id, due_date, status, completed_at) values (%L, %L, %L, %L, current_date, %L, now())',
               v_company, v_person, 'form', v_form, 'completed'), null, c_nobody),
      -- Step 7 (audit F44): nobody signs a policy or briefing on somebody else's behalf.
      ('Briefings', 'sign a policy for somebody else (step 7)', 'write',
        case when v_policy_version is not null and v_person is not null then
          format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
                 v_policy_version, v_branch, '{}', 'person', v_person, '[]') end, null, c_nobody),
      ('On Call', 'record an out of hours call', 'write',
        format('insert into public.on_call_logs (company_id, branch_id, ref_number, details) values (%L, %L, 999999, %L)',
               v_company, v_branch, 'ZZ access probe'), null, c_office || array['on_call']),
      -- The conductor is the probed user themselves, so this asks both questions at once:
      -- may they book on the Planner, and may they be given the visit (0313).
      ('Planner', 'book a visit, with themselves doing it', 'write',
        format('insert into public.planner_bookings (company_id, branch_id, conductor_profile_id, subject_person_id, title, scheduled_date) values (%L, %L, %L, %L, %L, current_date)',
               v_company, v_branch, v_profile, v_person, 'ZZ access probe'), null, c_office),
      -- Step 7 (audit F50): the branch's Planner is read by the office. Visits somebody else does
      -- and somebody else booked, so a carer's own visit does not count.
      ('Planner', 'see the branch''s visits (step 7)', 'read',
        format('select count(*) from public.planner_bookings where company_id = %L and branch_id is not distinct from %L and conductor_profile_id is distinct from %L and created_by is distinct from %L', v_company, v_branch, v_profile, v_profile),
        format('select count(*) from public.planner_bookings where company_id = %L and branch_id is not distinct from %L and conductor_profile_id is distinct from %L and created_by is distinct from %L', v_company, v_branch, v_profile, v_profile), c_office),
      -- Evidence by FORM (step 7, audit F3 and critic point g). "Any published form" used to be
      -- tried here, which reads as refused for a Recruiter or On Call whenever it happens to be a
      -- check's form. Each form is now named, with who may fill it in about whom.
      ('Evidence', 'fill in a check''s form about somebody in their branch (step 7)', 'write',
        case when v_check_version is not null and v_person is not null then
          format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
                 v_check_version, v_branch, '{}', 'person', v_person, '[]') end, null, c_check),
      ('Evidence', 'fill in a DBS form about somebody in their branch (step 7)', 'write',
        case when v_dbs_version is not null and v_person is not null then
          format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
                 v_dbs_version, v_branch, '{}', 'person', v_person, '[]') end, null, c_office),
      ('Evidence', 'fill in a check''s form about themselves (step 7)', 'write',
        case when v_check_version is not null then
          format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
                 v_check_version, v_own_branch, '{}', 'person', v_own_person, '[]') end, null, c_nobody),
      -- Completing a check (step 7, audit F8 and F10). The two forms used were filled in by the
      -- probed user (made for this run, see the header): one about somebody in their branch, one
      -- about themselves.
      ('People', 'complete a check with a form they filled in (step 7)', 'write',
        case when v_check_instance is not null and v_check_version is not null then
          format('select public.complete_check(%L, null, %L, null, null)', v_check_instance, v_ev_other) end, null, c_check),
      ('People', 'complete a check with no form filled in (step 7)', 'write',
        case when v_check_instance is not null then
          format('select public.complete_check(%L, %L::date, null, %L::date, null)', v_check_instance, v_today, v_today + 3650) end, null, c_nobody),
      ('People', 'complete a check on their own record (step 7)', 'write',
        case when v_own_instance is not null and v_check_version is not null then
          format('select public.complete_check(%L, null, %L, null, null)', v_own_instance, v_ev_own) end, null, c_nobody),
      ('People', 'move a check''s due date to a date of their choosing (step 7)', 'write',
        case when v_person is not null then
          format('select public.set_person_check_due(%L, %L, %L::date)', v_person, 'spot_check', v_today + 3650) end, null, c_nobody),
      ('People', 'move a due date on somebody in a branch they are not linked to (step 7)', 'write',
        case when v_other_instance is not null then
          format('select public.reschedule_check_instances(%L, %L::jsonb)', v_other_def,
                 jsonb_build_array(jsonb_build_object('instance_id', v_other_instance, 'due_date', v_other_due))::text) end,
        null, array['company_admin','registered_individual','registered_manager','recruiter']),
      ('People', 'restart a supervision cycle directly (step 7)', 'read',
        $s$select case when has_function_privilege('public.reanchor_supervision_cycle(uuid,date)', 'execute') then 1 else 0 end$s$,
        'select 1', c_nobody),
      -- Audit F9: erasing what a completed form says is not something anybody signed in can do.
      ('Evidence', 'erase what a completed form says (step 7)', 'read',
        $s$select case when has_function_privilege('public.anonymise_evidence(uuid)', 'execute') then 1 else 0 end$s$,
        'select 1', c_nobody),
      -- The other half of an honest tile: what it does NOT offer must also be refused.
      ('Invoicing', 'see the invoices', 'read',
        format('select count(*) from public.invoices where company_id = %L', v_company),
        format('select count(*) from public.invoices where company_id = %L', v_company), c_mgmt),
      ('Whistleblowing', 'read a disclosure', 'read',
        format('select count(*) from public.whistleblowing_disclosures where company_id = %L', v_company),
        format('select count(*) from public.whistleblowing_disclosures where company_id = %L', v_company), c_mgmt),
      -- Step 7 (audit F65): a check's settings are company wide, so they are the Admin's.
      ('Settings', 'change how often a check is due (step 7)', 'write',
        format('update public.check_definitions set amber_days = amber_days where id = %L', v_definition), null, array['company_admin']),
      ('Settings', 'invite a user', 'write',
        -- With a name: an invite with a blank name is refused for everybody (invites_full_name_not_blank),
        -- which made an Admin read as refused.
        format('insert into public.invites (company_id, branch_id, email, full_name, role) values (%L, %L, %L, %L, %L)',
               v_company, v_branch, 'zz-access-probe@example.invalid', 'ZZ access probe', 'supervisor'), null, array['company_admin'])
    ) t(department, attempt, kind, stmt, total_stmt, expected)
  loop
    i := i + 1;
    total := null;
    if r.total_stmt is not null then
      execute r.total_stmt into total;
    end if;
    plan := plan || jsonb_build_object(
      'seq', i, 'department', r.department, 'attempt', r.attempt, 'kind', r.kind,
      'stmt', r.stmt,
      'expected', case when r.stmt is null then 'nothing to judge by'
                       when v_role = any(r.expected) then 'allowed' else 'blocked' end,
      'total', total);
  end loop;

  -- PASS TWO, inside a savepoint that is always rolled back (the __probe_done__ exception below),
  -- so a role swapped in for v_as_role never survives, and neither does anything else.
  begin
  if v_as_role is not null then
    update public.profiles set role = v_as_role where id = v_profile;
  end if;

  -- Step 7: what the attempts above need and the company may not have, made as ourselves and
  -- thrown away with the savepoint (see the header).
  if v_own_fixture then
    insert into public.people (id, company_id, branch_id, full_name, profile_id, start_date)
    values (v_own_person, v_company, v_own_branch, 'ZZ access probe (their own record)', v_profile, v_today - 365);
  end if;
  insert into public.people (id, company_id, branch_id, full_name, start_date, created_by, created_at)
  values (v_new_person, v_company, v_any_branch, 'ZZ access probe (just added)', v_today - 365, v_profile, now());
  if v_own_instance_fixture then
    insert into public.check_instances (id, company_id, branch_id, definition_id, record_type, person_id)
    values (v_own_instance, v_company, v_own_branch, v_check_def, 'person', v_own_person);
  end if;
  if v_check_version is not null then
    insert into public.evidence (id, company_id, branch_id, form_id, form_version_id, schema_snapshot, answers, author_id, record_type, record_id)
    select x.id, v_company, x.branch, fv.form_id, fv.id, fv.schema, '{}'::jsonb, v_profile, 'person', x.rec
      from public.form_versions fv
      cross join (values (v_ev_other, v_branch, v_person), (v_ev_own, v_own_branch, v_own_person)) x(id, branch, rec)
     where fv.id = v_check_version and x.rec is not null;
  end if;

  -- From here on we are them: the role the anon key carries, with their user id on it.
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', v_profile, 'role', 'authenticated')::text);

  for e in select value from jsonb_array_elements(plan) loop
    v_detail := null;
    v_expected := e->>'expected';
    if (e->>'stmt') is null then
      v_outcome := 'not tried';
      v_expected := 'nothing to judge by';
    elsif (e->>'kind') = 'read' then
      if coalesce((e->>'total')::int, 0) = 0 then
        v_outcome := 'no rows exist';
        v_expected := 'nothing to judge by';
      else
        begin
          execute (e->>'stmt') into n;
          v_outcome := case when n > 0 then 'allowed' else 'blocked' end;
          v_detail := n::text || ' of ' || (e->>'total') || ' visible';
        exception when others then
          v_outcome := 'blocked';
          v_detail := sqlerrm;
        end;
      end if;
    elsif (e->>'kind') = 'call' then
      -- A block that either finishes (allowed) or raises (blocked, with its reason).
      begin
        execute (e->>'stmt');
        raise exception using errcode = 'P0001', message = '__probe_allowed__';
      exception when others then
        if sqlerrm = '__probe_allowed__' then
          v_outcome := 'allowed';
        else
          v_outcome := 'blocked';
          v_detail := sqlerrm;
        end if;
      end;
    else
      begin
        execute (e->>'stmt');
        get diagnostics n = row_count;
        -- An update that matched nothing was refused as surely as one that raised: the row was
        -- invisible to them.
        if n = 0 then
          raise exception using errcode = 'P0001', message = '__probe_no_rows__';
        end if;
        raise exception using errcode = 'P0001', message = '__probe_allowed__';
      exception when others then
        if sqlerrm = '__probe_allowed__' then
          v_outcome := 'allowed';
        elsif sqlerrm = '__probe_no_rows__' then
          v_outcome := 'blocked';
          v_detail := 'the row was not visible to them';
        else
          v_outcome := 'blocked';
          v_detail := sqlerrm;
        end if;
      end;
    end if;

    res := res || jsonb_build_object(
      'seq', (e->>'seq')::int,
      'department', e->>'department',
      'attempt', e->>'attempt',
      'expected', v_expected,
      'outcome', v_outcome,
      'verdict', case
                   when v_expected = 'nothing to judge by' then 'nothing to judge by'
                   when v_expected = v_outcome then 'as the tile promises'
                   else 'DOES NOT MATCH THE TILE'
                 end,
      'detail', v_detail);
  end loop;

  execute 'set local role none';
  raise exception using errcode = 'P0001', message = '__probe_done__';
  exception when others then
    if sqlerrm <> '__probe_done__' then
      raise;
    end if;
  end;

  insert into probe_result (seq, department, attempt, expected, outcome, verdict, detail)
  select (x->>'seq')::int, x->>'department', x->>'attempt', x->>'expected', x->>'outcome', x->>'verdict', x->>'detail'
    from jsonb_array_elements(res) x;

  insert into probe_result (seq, department, attempt, expected, outcome, verdict, detail)
  values (0, 'PROBED', coalesce(v_email, '?') || ' (' || coalesce(v_role, '?') || case when v_as_role is not null then ', probed as this role' else '' end || ')', '', '', '',
          'branch ' || coalesce(v_branch::text, 'none') || ', person ' || coalesce(v_person::text, 'none')
          || case when v_own_fixture then ', own record made for this run' else ', own record ' || v_own_person::text end);
end
$probe$;

select seq, department, attempt, expected, outcome, verdict, detail
  from probe_result order by seq;

-- Proof that the probe kept its word and wrote nothing. Every one of these must be 0.
select
  (select count(*) from public.people where full_name like 'ZZ access probe%') as people,
  (select count(*) from public.service_users where full_name like 'ZZ access probe%') as service_users,
  (select count(*) from public.complaints where subject like 'ZZ access probe%') as complaints,
  (select count(*) from public.incidents where description like 'ZZ access probe%') as incidents,
  (select count(*) from public.on_call_logs where details like 'ZZ access probe%') as on_call,
  (select count(*) from public.planner_bookings where title like 'ZZ access probe%') as planner,
  (select count(*) from public.invites where email = 'zz-access-probe@example.invalid') as invites;
