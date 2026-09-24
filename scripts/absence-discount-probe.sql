-- Absence discounting permission and behaviour probe (0328). Runs on Bevan Care Ltd test data and
-- ROLLS EVERYTHING BACK: the final raise aborts the block, so nothing it writes survives.
-- Run it with execute_sql; the report comes back as the error text "__probe_report__ ...".
-- Last run 2026-09-24 after 0328: ALL PASS (18 checks).
do $$
declare
  c_company constant uuid := '84172279-54e4-4d5b-94b4-c92dc05c6baa';
  c_branch  constant uuid := '8deb438e-98dd-4426-b6e7-fc1e6e19fc7b';
  c_person  constant uuid := '314eaa67-2548-497f-80e5-2430fdbef041';   -- ZZ TEST DBS Warn
  c_admin   constant uuid := 'ca13390c-ed11-49e8-b5f8-025036859b42';   -- Bev Admin
  c_sup     constant uuid := '9b7d6cae-a1ac-411e-9a6e-c041877de5cd';   -- ZZ Test Supervisor
  r text := '';
  fails int := 0;
  a1 uuid; a2 uuid; a3 uuid;
  v_occ int; v_nc int; v_stage int; v_from date;
  ok boolean;
begin
  -- Three recent single day absences and a Stage 1 meeting, written as the service (no user).
  insert into public.absence_events (company_id, branch_id, person_id, start_date, end_date, days, reason)
  values (c_company, c_branch, c_person, current_date - 30, current_date - 30, 1, 'probe one') returning id into a1;
  insert into public.absence_events (company_id, branch_id, person_id, start_date, end_date, days, reason)
  values (c_company, c_branch, c_person, current_date - 20, current_date - 20, 1, 'probe two') returning id into a2;
  insert into public.absence_events (company_id, branch_id, person_id, start_date, end_date, days, reason)
  values (c_company, c_branch, c_person, current_date - 10, current_date - 10, 1, 'probe three') returning id into a3;
  insert into public.absence_meetings (company_id, branch_id, person_id, stage, meeting_date)
  values (c_company, c_branch, c_person, 1, current_date - 5);

  select occasions into v_occ from public.person_absence_summary where person_id = c_person;
  r := r || format('start occasions=%s; ', v_occ);

  -- 1. Supervisor: can read, cannot discount, cannot edit the columns directly, cannot restart.
  perform set_config('request.jwt.claims', json_build_object('sub', c_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.discount_absence(a1, 'supervisor tries'); r := r || 'SUP discount ALLOWED (FAIL); '; fails := fails + 1;
  exception when others then r := r || 'SUP discount refused (PASS); '; end;
  begin update public.absence_events set discounted_at = now(), discount_reason = 'sneaky' where id = a1;
        if found then r := r || 'SUP direct column edit ALLOWED (FAIL); '; fails := fails + 1;
        else r := r || 'SUP direct edit touched nothing (PASS); '; end if;
  exception when others then r := r || 'SUP direct column edit refused (PASS); '; end;
  begin perform public.restart_absence_count(c_person, current_date, 'supervisor tries'); r := r || 'SUP restart ALLOWED (FAIL); '; fails := fails + 1;
  exception when others then r := r || 'SUP restart refused (PASS); '; end;
  begin update public.absence_events set end_date = end_date where id = a1;
        r := r || 'SUP last date edit still works (PASS); ';
  exception when others then r := r || 'SUP last date edit BROKEN (FAIL): ' || sqlerrm || '; '; fails := fails + 1; end;
  set local role none;

  -- 2. Manager of the branch (the supervisor's profile promoted for the probe).
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set role = 'manager' where id = c_sup;
  perform set_config('request.jwt.claims', json_build_object('sub', c_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.discount_absence(a1, 'x'); r := r || 'MGR short reason ALLOWED (FAIL); '; fails := fails + 1;
  exception when others then r := r || 'MGR short reason refused (PASS); '; end;
  begin perform public.discount_absence(a1, 'Car broke down, disallowed at Stage 1');
        perform public.discount_absence(a1, 'Twice is harmless');
        r := r || 'MGR discount allowed, twice is safe (PASS); ';
  exception when others then r := r || 'MGR discount REFUSED (FAIL): ' || sqlerrm || '; '; fails := fails + 1; end;
  set local role none;

  select occasions, not_counted into v_occ, v_nc from public.person_absence_summary where person_id = c_person;
  r := r || format('after one discount occasions=%s not_counted=%s (%s); ', v_occ, v_nc,
                   case when v_occ = 2 and v_nc = 1 then 'PASS' else 'FAIL' end);
  if not (v_occ = 2 and v_nc = 1) then fails := fails + 1; end if;
  select discount_reason is not distinct from 'Car broke down, disallowed at Stage 1' and discounted_by = c_sup and discounted_by_name is not null
    into ok from public.absence_events where id = a1;
  r := r || format('reason and who kept, first reason not overwritten (%s); ', case when ok then 'PASS' else 'FAIL' end);
  if not ok then fails := fails + 1; end if;

  -- 3. Restore puts it back.
  set local role authenticated;
  perform public.restore_absence(a1);
  set local role none;
  select occasions into v_occ from public.person_absence_summary where person_id = c_person;
  r := r || format('restored occasions=%s (%s); ', v_occ, case when v_occ = 3 then 'PASS' else 'FAIL' end);
  if v_occ <> 3 then fails := fails + 1; end if;

  -- 4. Restart from 15 days ago: two absences and the Stage 1 meeting stop counting.
  set local role authenticated;
  begin perform public.restart_absence_count(c_person, current_date + 1, 'future date'); r := r || 'future restart ALLOWED (FAIL); '; fails := fails + 1;
  exception when others then r := r || 'future restart refused (PASS); '; end;
  perform public.restart_absence_count(c_person, current_date - 40, 'first restart');
  perform public.restart_absence_count(c_person, current_date - 15, 'Good attendance review, count starts again');
  perform public.restart_absence_count(c_person, current_date - 15, 'same again');
  set local role none;
  select count(*) filter (where cleared_at is null), count(*) into v_occ, v_nc from public.absence_count_restarts where person_id = c_person;
  r := r || format('restarts active=%s total=%s (%s); ', v_occ, v_nc, case when v_occ = 1 and v_nc = 2 then 'PASS' else 'FAIL' end);
  if not (v_occ = 1 and v_nc = 2) then fails := fails + 1; end if;
  select occasions, latest_meeting_stage, count_restarted_from into v_occ, v_stage, v_from from public.person_absence_summary where person_id = c_person;
  r := r || format('after restart occasions=%s stage=%s from=%s (%s); ', v_occ, coalesce(v_stage::text, 'none'), v_from,
                   case when v_occ = 1 and v_stage = 1 and v_from = current_date - 15 then 'PASS' else 'CHECK' end);
  -- The Stage 1 meeting was 5 days ago, AFTER the restart, so it still counts. Move the restart past it.
  set local role authenticated;
  perform public.restart_absence_count(c_person, current_date - 2, 'After the meeting');
  set local role none;
  select occasions, latest_meeting_stage into v_occ, v_stage from public.person_absence_summary where person_id = c_person;
  r := r || format('restart after meeting occasions=%s stage=%s (%s); ', v_occ, coalesce(v_stage::text, 'none'),
                   case when v_occ = 0 and v_stage is null then 'PASS' else 'FAIL' end);
  if not (v_occ = 0 and v_stage is null) then fails := fails + 1; end if;

  -- 5. Supervisor can SEE the restart; team member of another company cannot.
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set role = 'supervisor' where id = c_sup;
  perform set_config('request.jwt.claims', json_build_object('sub', c_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_occ from public.absence_count_restarts where person_id = c_person;
  begin perform public.clear_absence_restart(c_person); r := r || 'SUP clear ALLOWED (FAIL); '; fails := fails + 1;
  exception when others then r := r || 'SUP clear refused (PASS); '; end;
  begin insert into public.absence_count_restarts (company_id, person_id, from_date, reason) values (c_company, c_person, current_date, 'direct');
        r := r || 'SUP direct insert ALLOWED (FAIL); '; fails := fails + 1;
  exception when others then r := r || 'SUP direct insert refused (PASS); '; end;
  set local role none;
  r := r || format('SUP sees restarts=%s (%s); ', v_occ, case when v_occ = 3 then 'PASS' else 'FAIL' end);
  if v_occ <> 3 then fails := fails + 1; end if;

  -- 6. Company Admin clears it; anon sees nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.clear_absence_restart(c_person);
  set local role none;
  select occasions, latest_meeting_stage into v_occ, v_stage from public.person_absence_summary where person_id = c_person;
  r := r || format('ADMIN cleared: occasions=%s stage=%s (%s); ', v_occ, v_stage, case when v_occ = 3 and v_stage = 1 then 'PASS' else 'FAIL' end);
  if not (v_occ = 3 and v_stage = 1) then fails := fails + 1; end if;
  perform set_config('request.jwt.claims', '', true);
  begin set local role anon; select count(*) into v_occ from public.absence_count_restarts;
        r := r || 'anon read restarts (FAIL); '; fails := fails + 1;
  exception when insufficient_privilege then r := r || 'anon refused (PASS); '; end;
  set local role none;

  raise exception '__probe_report__ % | %', case when fails = 0 then 'ALL PASS' else fails || ' FAIL' end, r;
end $$;
