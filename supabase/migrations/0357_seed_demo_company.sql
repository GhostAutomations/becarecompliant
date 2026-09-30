-- 0357 THE DEMO SAMPLE DATA (Phil, 2026-09-30: 3 branches, about 50 staff and 40 service users).
--
-- Fills a demo company with made up, clearly invented records: people and service users across
-- three branches, their checks with a green, amber and red mix (the first branch mostly green,
-- the third with the most to do, so the roll up tells a story), completed evidence for the checks
-- that have been done, some absences, holiday requests, complaints and incidents. Every email
-- address is @demo.invalid, which the senders refuse, and there are no phone numbers, so nothing
-- can ever be sent to a made up person. Refuses any company that is not a live demo.

create or replace function public.demo_sample_answers(p_schema jsonb, p_on date)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v jsonb := '{}'::jsonb;
  f jsonb;
  t text;
begin
  for f in select jsonb_array_elements(s->'fields') from jsonb_array_elements(coalesce(p_schema->'sections', '[]'::jsonb)) s
  loop
    -- A field that only shows on a "No" answer stays empty, so the evidence reads as all in order.
    if f ? 'visibleWhen' then continue; end if;
    t := f->>'type';
    if t = 'date' then v := v || jsonb_build_object(f->>'key', p_on::text);
    elsif t = 'time' then v := v || jsonb_build_object(f->>'key', '10:00');
    elsif t in ('single_select', 'radio', 'select') and jsonb_array_length(coalesce(f->'options', '[]'::jsonb)) > 0 then
      v := v || jsonb_build_object(f->>'key', f->'options'->0->>'value');
    elsif t in ('short_text', 'text') then v := v || jsonb_build_object(f->>'key', 'Discussed and agreed.');
    elsif t = 'long_text' then v := v || jsonb_build_object(f->>'key', 'Discussed together and all in order. No concerns raised. Next review booked in line with the schedule.');
    elsif t = 'number' then v := v || jsonb_build_object(f->>'key', 1);
    elsif t = 'rating' then v := v || jsonb_build_object(f->>'key', 4);
    elsif t in ('checkbox', 'yes_no', 'boolean') then v := v || jsonb_build_object(f->>'key', true);
    end if;
  end loop;
  return v;
end;
$$;
revoke all on function public.demo_sample_answers(jsonb, date) from public, anon, authenticated;

create or replace function public.seed_demo_company(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_branches uuid[];
  v_bias numeric[] := array[0.84, 0.72, 0.58];
  v_first text[] := array['Amelia','Rhys','Sophie','Owen','Megan','Dylan','Chloe','Gareth','Ffion','Liam',
    'Hannah','Callum','Nia','Jordan','Ellie','Tomos','Grace','Aled','Holly','Kieran','Seren','Jack','Lowri','Ben','Cerys'];
  v_last text[] := array['Pritchard','Morgan','Hughes','Price','Evans','Rees','Powell','Jenkins','Lloyd','Bevan',
    'Griffiths','Howells','Thomas','Llewellyn','Parry','Owens','Watkins','Harries','Phillips','Mathias'];
  v_su_first text[] := array['Margaret','Dennis','Joan','Harold','Betty','Arthur','Gwen','Ronald','Iris','Clifford',
    'Dorothy','Alwyn','Edna','Glyn','Maureen','Stanley','Olwen','Trevor','Beryl','Emrys'];
  v_su_last text[] := array['Ashworth','Beddoe','Crowther','Davies','Ellery','Farr','Gethin','Hopkin','Ivor','Jolley',
    'Kenward','Lewis','Maddox','Nash','Oakley','Probert','Quinnell','Roderick','Sayce','Tudor'];
  v_count_people int := 0;
  v_count_su int := 0;
  v_count_checks int := 0;
  v_count_evidence int := 0;
  i int;
  v_branch uuid;
  v_bi int;
  v_title text;
  v_id uuid;
  v_name text;
  v_start date;
  d record;
  r numeric;
  v_due date;
  v_done date;
  v_period interval;
  v_amber int;
  v_form record;
  v_ev uuid;
  v_inst uuid;
  v_people uuid[] := '{}';
  v_sus uuid[] := '{}';
begin
  if not public.is_platform_admin() then
    raise exception 'Only the founder may fill a demo company';
  end if;
  if not public.is_demo_company(p_company) then
    raise exception 'That company is not a live demo, so it was not filled';
  end if;
  if exists (select 1 from public.people where company_id = p_company) then
    return jsonb_build_object('already', true);  -- idempotent: never fill a demo twice
  end if;
  perform setseed(0.4242);

  -- THREE BRANCHES: the one provisioning made, plus two more.
  select array_agg(id order by created_at) into v_branches
    from public.branches where company_id = p_company and kind = 'branch';
  update public.branches set name = 'Cardiff' where id = v_branches[1];
  insert into public.branches (company_id, name, kind) values (p_company, 'Newport', 'branch') returning id into v_id;
  v_branches := v_branches[1:1] || v_id;
  insert into public.branches (company_id, name, kind) values (p_company, 'Swansea', 'branch') returning id into v_id;
  v_branches := v_branches || v_id;

  -- No digest emails and no SMS from a demo (its records are made up; the demo login is real).
  insert into public.notification_settings (company_id, email_digest_enabled, sms_enabled)
    values (p_company, false, false)
    on conflict (company_id) do update set email_digest_enabled = false, sms_enabled = false;

  -- PEOPLE: 50, one Registered Manager per branch.
  for i in 0..49 loop
    v_bi := (i % 3) + 1;
    v_branch := v_branches[v_bi];
    v_title := case
      when i in (0, 34, 17) then 'Registered Manager'
      when i % 11 = 2 then 'Team Leader'
      when i % 13 = 3 then 'Care Coordinator'
      when i % 7 = 1 then 'Senior Care Assistant'
      else 'Care Assistant' end;
    v_name := v_first[(i % array_length(v_first, 1)) + 1] || ' ' || v_last[((i * 7) % array_length(v_last, 1)) + 1];
    v_start := current_date - (90 + floor(random() * 1400))::int;
    insert into public.people (company_id, branch_id, full_name, job_title, employment_status, start_date, work_email)
      values (p_company, v_branch, v_name, v_title,
              case when i = 45 then 'mat_leave' when i = 46 then 'lts' else 'active' end,
              v_start,
              lower(replace(v_name, ' ', '.')) || i || '@demo.invalid')
      returning id into v_id;
    v_people := v_people || v_id;
    v_count_people := v_count_people + 1;

    for d in select * from public.check_definitions cd
              where cd.company_id = p_company and cd.population = 'people' and cd.active
                and (cd.job_titles is null or cardinality(cd.job_titles) = 0
                     or exists (select 1 from unnest(cd.job_titles) jt where lower(btrim(jt)) = lower(v_title)))
    loop
      v_due := null; v_done := null;
      if coalesce(d.recurring, false) and d.interval is not null then
        v_period := case d.frequency when 'day' then make_interval(days => d.interval)
                                     when 'week' then make_interval(days => 7 * d.interval)
                                     when 'month' then make_interval(months => d.interval)
                                     when 'year' then make_interval(years => d.interval)
                                     else make_interval(months => 3) end;
        v_amber := coalesce(d.amber_days, 14);
        r := random();
        if r < v_bias[v_bi] then
          v_due := current_date + (v_amber + 1 + floor(random() * 60))::int;
        elsif r < v_bias[v_bi] + 0.14 then
          v_due := current_date + floor(random() * (v_amber + 1))::int;
        elsif r < 0.98 then
          v_due := current_date - (1 + floor(random() * 40))::int;
        end if;
        if v_due is not null then
          v_done := (v_due - v_period)::date;
          if v_done < v_start or v_done > current_date then v_done := null; end if;
        end if;
      end if;
      insert into public.check_instances (company_id, branch_id, definition_id, record_type, person_id, due_date, last_completed_on)
        values (p_company, v_branch, d.id, 'person', v_id, v_due, v_done)
        on conflict (definition_id, person_id) do update set due_date = excluded.due_date, last_completed_on = excluded.last_completed_on
        returning id into v_inst;
      v_count_checks := v_count_checks + 1;
      if v_done is not null and d.form_id is not null then
        select f.id as form_id, fv.id as version_id, fv.schema into v_form
          from public.forms f join public.form_versions fv on fv.form_id = f.id and fv.version = f.current_version
         where f.id = d.form_id;
        if v_form.version_id is not null then
          insert into public.evidence (company_id, branch_id, form_id, form_version_id, schema_snapshot, answers,
                                       author_name, submitted_at, record_type, record_id)
            values (p_company, v_branch, v_form.form_id, v_form.version_id, v_form.schema,
                    public.demo_sample_answers(v_form.schema, v_done), 'Demo Manager',
                    v_done + time '10:30', 'person', v_id)
            returning id into v_ev;
          update public.check_instances set last_evidence_id = v_ev where id = v_inst;
          v_count_evidence := v_count_evidence + 1;
        end if;
      end if;
    end loop;
  end loop;

  -- SERVICE USERS: 40.
  for i in 0..39 loop
    v_bi := (i % 3) + 1;
    v_branch := v_branches[v_bi];
    v_name := v_su_first[(i % array_length(v_su_first, 1)) + 1] || ' ' || v_su_last[((i * 3) % array_length(v_su_last, 1)) + 1];
    v_start := current_date - (60 + floor(random() * 1200))::int;
    insert into public.service_users (company_id, branch_id, full_name, ssid, package_start_date, service_status)
      values (p_company, v_branch, v_name, 'DEMO' || lpad((1000 + i)::text, 5, '0'), v_start,
              case when i = 38 then 'hospital' else 'active' end)
      returning id into v_id;
    v_sus := v_sus || v_id;
    v_count_su := v_count_su + 1;

    for d in select * from public.check_definitions cd
              where cd.company_id = p_company and cd.population = 'service_users' and cd.active
    loop
      v_due := null; v_done := null;
      if coalesce(d.recurring, false) and d.interval is not null then
        v_period := case d.frequency when 'day' then make_interval(days => d.interval)
                                     when 'week' then make_interval(days => 7 * d.interval)
                                     when 'month' then make_interval(months => d.interval)
                                     when 'year' then make_interval(years => d.interval)
                                     else make_interval(months => 3) end;
        v_amber := coalesce(d.amber_days, 14);
        r := random();
        if r < v_bias[v_bi] then
          v_due := current_date + (v_amber + 1 + floor(random() * 60))::int;
        elsif r < v_bias[v_bi] + 0.14 then
          v_due := current_date + floor(random() * (v_amber + 1))::int;
        elsif r < 0.98 then
          v_due := current_date - (1 + floor(random() * 40))::int;
        end if;
        if v_due is not null then
          v_done := (v_due - v_period)::date;
          if v_done < v_start or v_done > current_date then v_done := null; end if;
        end if;
      else
        -- A one off (the Setup Visit) was done when the package started.
        v_done := v_start + 1;
      end if;
      insert into public.check_instances (company_id, branch_id, definition_id, record_type, service_user_id, due_date, last_completed_on)
        values (p_company, v_branch, d.id, 'service_user', v_id, v_due, v_done)
        on conflict do nothing
        returning id into v_inst;
      if v_inst is null then
        update public.check_instances set due_date = v_due, last_completed_on = v_done
         where service_user_id = v_id and definition_id = d.id returning id into v_inst;
      end if;
      v_count_checks := v_count_checks + 1;
      if v_done is not null and d.form_id is not null then
        select f.id as form_id, fv.id as version_id, fv.schema into v_form
          from public.forms f join public.form_versions fv on fv.form_id = f.id and fv.version = f.current_version
         where f.id = d.form_id;
        if v_form.version_id is not null then
          insert into public.evidence (company_id, branch_id, form_id, form_version_id, schema_snapshot, answers,
                                       author_name, submitted_at, record_type, record_id)
            values (p_company, v_branch, v_form.form_id, v_form.version_id, v_form.schema,
                    public.demo_sample_answers(v_form.schema, v_done), 'Demo Manager',
                    v_done + time '11:00', 'service_user', v_id)
            returning id into v_ev;
          update public.check_instances set last_evidence_id = v_ev where id = v_inst;
          v_count_evidence := v_count_evidence + 1;
        end if;
      end if;
    end loop;
  end loop;

  -- ABSENCES: a handful of short sicknesses in the last three months.
  for i in 1..8 loop
    v_start := current_date - (5 + i * 9);
    insert into public.absence_events (company_id, branch_id, person_id, start_date, end_date, return_date, days, reason)
      select p.company_id, p.branch_id, p.id, v_start, v_start + (i % 3), v_start + (i % 3) + 1, (i % 3) + 1,
             (array['Cold and flu', 'Stomach upset', 'Back pain', 'Migraine'])[(i % 4) + 1]
        from public.people p where p.id = v_people[i * 5];
  end loop;

  -- HOLIDAYS: two waiting for a decision, three approved.
  for i in 1..5 loop
    v_start := current_date + (7 + i * 6);
    insert into public.holiday_requests (company_id, branch_id, person_id, requester_name, start_date, end_date, hours, status, note)
      select p.company_id, p.branch_id, p.id, p.full_name, v_start, v_start + 4, 37.5,
             case when i <= 2 then 'pending' else 'approved' end, 'Family holiday'
        from public.people p where p.id = v_people[i * 7 + 2];
  end loop;

  -- COMPLAINTS: four, across the branches, open and closed.
  insert into public.complaints (company_id, branch_id, subject, details, complainant_name, complainant_relationship,
                                 service_user_id, status, date_raised, date_occurred, concern_type, formality, upheld, date_closed, outcome)
  values
    (p_company, v_branches[1], 'Late morning call', 'The morning call arrived 50 minutes late two days running.', 'Sarah Ashworth', 'relative',
     v_sus[1], 'open', current_date - 4, current_date - 6, 'Complaint', 'Formal', null, null, null),
    (p_company, v_branches[2], 'Medication prompt missed', 'Family noticed the lunchtime prompt was not recorded on one visit.', 'Paul Beddoe', 'relative',
     v_sus[2], 'in_progress', current_date - 12, current_date - 13, 'Concern', 'Informal', null, null, null),
    (p_company, v_branches[3], 'Carer did not wear a name badge', 'Service user asked who the carer was.', 'Joan Crowther', 'service_user',
     v_sus[3], 'closed', current_date - 40, current_date - 41, 'Minor Complaint', 'Informal', false, current_date - 30, 'Reminder issued to the team about badges.'),
    (p_company, v_branches[1], 'Rota changes not communicated', 'Visit times changed without notice.', 'Harold Davies', 'service_user',
     v_sus[4], 'closed', current_date - 70, current_date - 72, 'Complaint', 'Formal', true, current_date - 50, 'Apology given and rota change process tightened.');

  -- INCIDENTS: five.
  insert into public.incidents (company_id, branch_id, occurred_on, category, service_user_id, description, immediate_action, notifiable, safeguarding, status, closed_on, reported_on)
  values
    (p_company, v_branches[1], current_date - 3, 'Fall', v_sus[5], 'Found on the bedroom floor on arrival, no visible injury.', 'Helped up safely, GP informed, family told.', false, false, 'open', null, current_date - 3),
    (p_company, v_branches[2], current_date - 9, 'Medication error', v_sus[6], 'Evening dose given one hour late.', 'Pharmacist advice taken, no harm.', false, false, 'under_review', null, current_date - 9),
    (p_company, v_branches[3], current_date - 21, 'Missed or late call', v_sus[7], 'Lunch call missed after a rota error.', 'Call made up the same afternoon.', false, false, 'closed', current_date - 14, current_date - 21),
    (p_company, v_branches[1], current_date - 35, 'Serious accident or injury', v_sus[8], 'Fall on the stairs, hospital admission with a fractured wrist.', 'Ambulance called, next of kin informed.', true, false, 'closed', current_date - 20, current_date - 35),
    (p_company, v_branches[2], current_date - 15, 'Near miss', null, 'Wrong key safe code on the rota, spotted before the visit.', 'Rota corrected.', false, false, 'closed', current_date - 14, current_date - 15);

  return jsonb_build_object('people', v_count_people, 'service_users', v_count_su, 'checks', v_count_checks,
                            'evidence', v_count_evidence, 'branches', 3);
end;
$$;
revoke all on function public.seed_demo_company(uuid) from public, anon;
grant execute on function public.seed_demo_company(uuid) to authenticated;
