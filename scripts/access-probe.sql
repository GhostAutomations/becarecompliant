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

  plan jsonb := '[]'::jsonb;
  -- WHO EACH TILE IS FOR: a transcription of lib/auth/module-catalogue.ts. When that changes,
  -- this changes in the same commit.
  c_office text[] := array['company_admin','registered_individual','registered_manager','manager','supervisor','recruiter'];
  c_mgmt text[] := array['company_admin','registered_individual','registered_manager','manager'];
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

  -- Somebody the probed user does NOT have on their own caseload, so a caseload clause cannot
  -- make a branch wide permission look like it works.
  select pe.id into v_person from public.people pe
   where pe.company_id = v_company and pe.branch_id is not distinct from v_branch
     and not exists (select 1 from public.person_assignments pa
                      where pa.person_id = pe.id and pa.user_id = v_profile)
   order by pe.created_at limit 1;

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

  -- PASS ONE, still ourselves: how many rows exist at all, so "they see nothing" is never
  -- confused with "there is nothing to see".
  for r in
    select * from (values
      -- department, what the screen offers, write|read, the attempt, what exists at all, expected
      ('People', 'add a person to their branch', 'write',
        format('insert into public.people (company_id, branch_id, full_name) values (%L, %L, %L)',
               v_company, v_branch, 'ZZ access probe'), null, c_office),
      ('People', 'open a tracker on somebody not on their caseload', 'write',
        format('update public.person_trackers set updated_at = now() where person_id = %L', v_person), null, c_office),
      ('People', 'see the register', 'read',
        format('select count(*) from public.people where company_id = %L', v_company),
        format('select count(*) from public.people where company_id = %L', v_company), c_office || array['team_member','on_call']),
      -- "They already work here" on Add a person (0315) goes through this, and so does the bulk
      -- import. A Supervisor who may add the carer may say when their last check was.
      ('People', 'record a check done before they joined', 'write',
        format('select public.seed_migrated_completion(%L, %L, %L, current_date - 30, current_date + 30, true, null, null)',
               'person', v_person, v_definition), null, c_office),
      ('Training', 'record training for somebody in their branch', 'write',
        format('insert into public.person_training (company_id, branch_id, person_id, course_id, status, completed_on) values (%L, %L, %L, %L, %L, current_date)',
               v_company, v_branch, v_person, v_course, 'completed'), null, c_office),
      ('Holiday', 'book holiday for somebody else', 'write',
        format('insert into public.holiday_requests (company_id, branch_id, person_id, requested_by, start_date, end_date) values (%L, %L, %L, %L, current_date, current_date)',
               v_company, v_branch, v_person, v_profile), null, c_office),
      ('Holiday', 'see the branch''s requests', 'read',
        format('select count(*) from public.holiday_requests where company_id = %L', v_company),
        format('select count(*) from public.holiday_requests where company_id = %L', v_company), c_office),
      ('Absence', 'record a sickness for somebody else', 'write',
        format('insert into public.absence_events (company_id, branch_id, person_id, start_date) values (%L, %L, %L, current_date)',
               v_company, v_branch, v_person), null, c_office || array['on_call']),
      ('Absence', 'book the return to work meeting', 'write',
        format('insert into public.absence_meetings (company_id, branch_id, person_id, meeting_date) values (%L, %L, %L, current_date)',
               v_company, v_branch, v_person), null, c_office || array['on_call']),
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
      ('On Call', 'record an out of hours call', 'write',
        format('insert into public.on_call_logs (company_id, branch_id, ref_number, details) values (%L, %L, 999999, %L)',
               v_company, v_branch, 'ZZ access probe'), null, c_office || array['on_call']),
      -- The conductor is the probed user themselves, so this asks both questions at once:
      -- may they book on the Planner, and may they be given the visit (0313).
      ('Planner', 'book a visit, with themselves doing it', 'write',
        format('insert into public.planner_bookings (company_id, branch_id, conductor_profile_id, subject_person_id, title, scheduled_date) values (%L, %L, %L, %L, %L, current_date)',
               v_company, v_branch, v_profile, v_person, 'ZZ access probe'), null, c_office),
      ('Evidence', 'submit a Check (through submit_evidence)', 'write',
        format('select public.submit_evidence(gen_random_uuid(), %L, %L, %L::jsonb, null, null, null, %L, %L, %L::jsonb)',
               v_version, v_branch, '{}', 'person', v_person, '[]'), null, c_office || array['on_call']),
      -- The other half of an honest tile: what it does NOT offer must also be refused.
      ('Invoicing', 'see the invoices', 'read',
        format('select count(*) from public.invoices where company_id = %L', v_company),
        format('select count(*) from public.invoices where company_id = %L', v_company), c_mgmt),
      ('Whistleblowing', 'read a disclosure', 'read',
        format('select count(*) from public.whistleblowing_disclosures where company_id = %L', v_company),
        format('select count(*) from public.whistleblowing_disclosures where company_id = %L', v_company), c_mgmt),
      ('Settings', 'invite a user', 'write',
        format('insert into public.invites (company_id, branch_id, email, role) values (%L, %L, %L, %L)',
               v_company, v_branch, 'zz-access-probe@example.invalid', 'supervisor'), null, array['company_admin'])
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
      'expected', case when v_role = any(r.expected) then 'allowed' else 'blocked' end,
      'total', total);
  end loop;

  -- PASS TWO, inside a savepoint that is always rolled back (the __probe_done__ exception below),
  -- so a role swapped in for v_as_role never survives, and neither does anything else.
  begin
  if v_as_role is not null then
    update public.profiles set role = v_as_role where id = v_profile;
  end if;

  -- From here on we are them: the role the anon key carries, with their user id on it.
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', v_profile, 'role', 'authenticated')::text);

  for e in select value from jsonb_array_elements(plan) loop
    v_detail := null;
    v_expected := e->>'expected';
    if (e->>'kind') = 'read' then
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
          'branch ' || coalesce(v_branch::text, 'none') || ', person ' || coalesce(v_person::text, 'none'));
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
