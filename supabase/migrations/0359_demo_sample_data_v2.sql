-- 0359 THE DEMO SAMPLE DATA, SECOND VERSION (Phil, 2026-10-01, after his first look inside a demo).
--
-- The first version made a company that looked in trouble: every Return to Work overdue, 34 checks
-- overdue, the PQS report at 0% and CIW readiness at "Action needed" everywhere, with nothing in the
-- Planner, policies, training, on call or recent activity. Phil's decision (popup): it should look
-- like a GOOD company with a few problems. About 85% in date, a handful due soon, 4 overdue, a year's
-- history behind every check so the PQS report scores it, training and registration in order,
-- satisfaction reviews answered positively, policies issued and mostly signed, one or two Return to
-- Works waiting, bookings in the planner for the demo login, an on call log and recent activity.
--
-- Everything is still invented, every email is @demo.invalid and there are no phone numbers, so
-- nothing can be sent to a made up person. Refuses any company that is not a live demo.

-- A made up signature, so the Evidence reads as signed. Not anybody's.
create or replace function public.demo_signature()
returns text language sql immutable set search_path = public, pg_temp as $$
  select 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABFAQMAAAA1uDvbAAAABlBMVEX///8ZGRm5XkpZAAAAAXRSTlMAQObYZgAAAWpJREFUeNrtlL9KxEAQh7/ZW4hYeNHqimBSWPgIFqIpfBNf4CytsmBh6xvok0jEQl9BEAwo2MmWEZcbi41JVK7V5qYa9tvZ+c0fFla2sr+0tSXnBruUbFEuYRlN56XyPQaYTQBxu8b9JAWutIYXYPaNpECxHtPtjIlwROmAAgBxPTEYK+lmBzDlKE9Xb69+FokHn0DGIGwnki7Kgl8Mml08TwUCOEpCBFL2ebBwEb36S8E70CpNzGPH9Sz8NXULXGkR9YWxajQ21vTiDaEiBPAQuGDevVfHGGuP2YSCe3mAgqPYGiQtydZ4pOXFQNJrkBt926j2Txf1nDw5c9mcwARAbi/vNsh96xumKvX+nLcu8Pk8CSQNJw2TIL7dkzumALwyaQEOa/BUzXauqg6gIpaSAySqqh+PGQAHQ+dUVfV8IfXeMCeYqqo2gATUD/M4VNVhPNXXClaq41uQOwBR1af69+5aQFYfwj/bJwFpdm6Jn0NuAAAAAElFTkSuQmCC'::text;
$$;
revoke all on function public.demo_signature() from public, anon;

-- The answer a well run company would give to one choice question.
create or replace function public.demo_pick_option(p_label text, p_opts text[])
returns text language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_low text[] := (select array_agg(lower(o)) from unnest(p_opts) o);
  v_want text;
  i int;
begin
  if 'yes' = any(v_low) and 'no' = any(v_low) then
    -- "Any issues", "any concerns", "any declarations", "improvement required": a good answer is No.
    v_want := case when p_label ~* '(\many\M|issue|concern|declaration|improvement|difficult|non-complian|telephone|escalat)'
                   then 'no' else 'yes' end;
    for i in 1..array_length(p_opts, 1) loop
      if v_low[i] = v_want then return p_opts[i]; end if;
    end loop;
  end if;
  if 'pass' = any(v_low) then return 'pass'; end if;
  if 'agree' = any(v_low) then return case when random() < 0.4 then 'strongly_agree' else 'agree' end; end if;
  if 'progress' = any(v_low) then return case when random() < 0.3 then 'Achieved' else 'Progress' end; end if;
  if 'confirm' = any(v_low) then return 'Confirm'; end if;
  if p_opts[1] = 'Setup' and array_length(p_opts, 1) >= 3 then return p_opts[3]; end if;
  if p_opts[1] ~ '^\d+$' and array_length(p_opts, 1) >= 2 then return p_opts[2]; end if;
  return p_opts[1];
end;
$$;
revoke all on function public.demo_pick_option(text, text[]) from public, anon, authenticated;

-- Sample answers for one form: the answers a good, signed off visit would carry. p_ctx carries
-- the record's name ("name"), who completed it ("author") and the signature ("sig").
drop function if exists public.demo_sample_answers(jsonb, date);
create or replace function public.demo_sample_answers(p_schema jsonb, p_on date, p_ctx jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v jsonb := '{}'::jsonb;
  f jsonb;
  t text;
  k text;
  lbl text;
  vw jsonb;
  dep text;
  opts text[];
  txt text;
begin
  for f in
    select fld
      from jsonb_array_elements(coalesce(p_schema->'sections', '[]'::jsonb)) with ordinality s(sec, si),
           jsonb_array_elements(coalesce(sec->'fields', '[]'::jsonb)) with ordinality x(fld, fi)
     order by si, fi
  loop
    k := f->>'key';
    t := f->>'type';
    lbl := coalesce(f->>'label', '');
    if k is null then continue; end if;
    -- A conditional question is answered only when the answer it hangs on would show it.
    vw := f->'visibleWhen';
    if vw is not null then
      dep := v->>(vw->>'field');
      if dep is null or not exists (
        select 1 from jsonb_array_elements_text(coalesce(vw->'in', '[]'::jsonb)) w where w = dep
      ) then
        continue;
      end if;
    end if;

    if t = 'date' then
      v := v || jsonb_build_object(k, p_on::text);
    elsif t = 'time' then
      v := v || jsonb_build_object(k, case when lbl ~* 'end' then '11:00' else '10:00' end);
    elsif t in ('single_select', 'radio', 'select') then
      select array_agg(o->>'value' order by ord) into opts
        from jsonb_array_elements(coalesce(f->'options', '[]'::jsonb)) with ordinality y(o, ord);
      if opts is not null then
        v := v || jsonb_build_object(k, public.demo_pick_option(lbl, opts));
      end if;
    elsif t = 'signature' then
      v := v || jsonb_build_object(k, coalesce(p_ctx->>'sig', public.demo_signature()));
    elsif t in ('short_text', 'text') then
      txt := case
        when lbl ~* '(service user name|employee name|staff name|full name|^name)' then coalesce(p_ctx->>'name', 'Recorded')
        when lbl ~* '(completed by|who should|conduct|manager)' then coalesce(p_ctx->>'author', 'Registered Manager')
        when lbl ~* 'calls attended' then (90 + floor(random() * 60))::int::text
        when lbl ~* 'missed' then '0'
        when lbl ~* 'average duration' then '31 minutes'
        when lbl ~* 'earliness' then '2 minutes'
        when lbl ~* 'lateness' then '4 minutes'
        when lbl ~* 'handback' then '0'
        when lbl ~* '(sickness|absence)' then 'None'
        when lbl ~* 'one to one' then '1'
        when lbl ~* '^who' then 'Their daughter'
        else 'Discussed and agreed.' end;
      v := v || jsonb_build_object(k, txt);
    elsif t = 'long_text' then
      txt := case
        when lbl ~* 'observation' then 'Arrived on time and announced themselves. Gained consent before each task, used PPE correctly and kept the home tidy. Warm and respectful throughout.'
        when lbl ~* '(follow up|action)' then 'No further action needed. Keep up the good practice.'
        when lbl ~* '(summary|overall)' then 'A positive meeting. Everything discussed is in order and the next one is booked in line with the schedule.'
        when lbl ~* '(feedback|suggest)' then 'Very happy with the carers, who are kind and patient.'
        when lbl ~* 'comment' then 'Nothing further to add.'
        when lbl ~* '(why|reason|differen|not suiting|times that suit)' then 'Would prefer the lunch call 30 minutes later. Agreed to look at the rota this week.'
        else 'Discussed together and all in order. No concerns raised.' end;
      v := v || jsonb_build_object(k, txt);
    elsif t = 'number' then
      v := v || jsonb_build_object(k, 1);
    elsif t = 'rating' then
      v := v || jsonb_build_object(k, case when random() < 0.6 then 5 else 4 end);
    elsif t in ('checkbox', 'yes_no', 'boolean') then
      v := v || jsonb_build_object(k, lbl !~* 'escalat');
    end if;
  end loop;
  return v;
end;
$$;
revoke all on function public.demo_sample_answers(jsonb, date, jsonb) from public, anon, authenticated;

-- One piece of Evidence for a demo record, with sample answers. Returns its id.
create or replace function public.demo_add_evidence(
  p_company uuid, p_branch uuid, p_form uuid, p_record_type text, p_record uuid, p_on date, p_ctx jsonb
) returns uuid language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_form record;
  v_id uuid;
begin
  select f.id as form_id, fv.id as version_id, fv.schema into v_form
    from public.forms f join public.form_versions fv on fv.form_id = f.id and fv.version = f.current_version
   where f.id = p_form;
  if v_form.version_id is null then return null; end if;
  insert into public.evidence (company_id, branch_id, form_id, form_version_id, schema_snapshot, answers,
                               author_name, submitted_at, record_type, record_id)
    values (p_company, p_branch, v_form.form_id, v_form.version_id, v_form.schema,
            public.demo_sample_answers(v_form.schema, p_on, p_ctx), coalesce(p_ctx->>'author', 'Registered Manager'),
            least((p_on + time '08:30' + make_interval(mins => floor(random() * 420)::int)) at time zone 'Europe/London',
                  now() - make_interval(mins => 20 + floor(random() * 60)::int)),
            p_record_type, p_record)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.demo_add_evidence(uuid, uuid, uuid, text, uuid, date, jsonb) from public, anon, authenticated;

-- A check's history: the completions behind its current due date, about nine months of them, nearly
-- all on time, so the PQS report and the on time figures have real cycles to score. Sets the
-- check's due date, last completion and last Evidence. Returns how many pieces of Evidence it made.
create or replace function public.demo_check_history(
  p_inst uuid, p_def public.check_definitions, p_record_type text, p_record uuid, p_branch uuid,
  p_start date, p_due date, p_today date, p_ctx jsonb
) returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_period interval;
  v_grade interval;
  v_last date;
  v_prev date;
  v_floor date;
  v_dates date[];
  v_jit int;
  d date;
  v_ev uuid;
  n int := 0;
begin
  v_period := case p_def.frequency
    when 'day' then make_interval(days => p_def.interval)
    when 'week' then make_interval(days => 7 * p_def.interval)
    when 'month' then make_interval(months => p_def.interval)
    when 'year' then make_interval(years => p_def.interval)
    else make_interval(months => 3) end;
  v_grade := case when coalesce(p_def.reporting_interval_days, 0) > 0
                  then make_interval(days => p_def.reporting_interval_days) else v_period end;
  v_last := (p_due - v_period)::date;
  if v_last > p_today then v_last := p_today; end if;

  if v_last < p_start then
    -- Not done yet since they started: the first one is due a period after the start.
    update public.check_instances
       set due_date = greatest((p_start + v_period)::date, p_today + 1), last_completed_on = null, last_evidence_id = null
     where id = p_inst;
    return 0;
  end if;

  v_jit := case when (v_last - (v_last - v_period)::date) <= 31 then 4 else 10 end;
  v_floor := greatest(p_start, p_today - 280);
  v_dates := array[v_last];
  loop
    if random() < 0.05 then
      v_prev := (v_dates[1] - v_grade)::date - (3 + floor(random() * 10))::int;   -- one done late
    else
      v_prev := (v_dates[1] - v_period)::date + floor(random() * (v_jit + 1))::int;
    end if;
    exit when v_prev < v_floor;
    v_dates := v_prev || v_dates;
  end loop;

  foreach d in array v_dates loop
    v_ev := public.demo_add_evidence(
      (select company_id from public.check_instances where id = p_inst), p_branch, p_def.form_id,
      p_record_type, p_record, d, p_ctx);
    if v_ev is not null then n := n + 1; end if;
  end loop;

  update public.check_instances
     set due_date = p_due, last_completed_on = v_last, last_evidence_id = v_ev
   where id = p_inst;
  return n;
end;
$$;
revoke all on function public.demo_check_history(uuid, public.check_definitions, text, uuid, uuid, date, date, date, jsonb) from public, anon, authenticated;

-- The wording of the four sample policies. Short, plain and clearly a sample.
create or replace function public.demo_policy_body(p_title text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_title
  when 'Safeguarding Adults' then $p$# Safeguarding Adults

This is a sample policy written for the Be Care Compliant demo.

## Purpose
Everyone who works for us has a duty to protect the people we support from abuse, neglect and harm, and to act when they are worried.

## Who it applies to
Every member of staff, including office staff, carers and anyone working on our behalf.

## Recognising abuse
Abuse can be physical, emotional, financial, sexual, neglect or discrimination. Signs include unexplained injuries, changes in mood, missing money and a person seeming frightened of someone.

## What to do if you are worried
1. Make sure the person is safe. Call 999 if they are in immediate danger.
2. Listen, and do not promise to keep a secret.
3. Write down what you saw or were told, in the person's own words, with the date and time.
4. Tell the Registered Manager or the on call manager straight away.

## What the manager will do
The manager will record the concern, make a referral to the local authority safeguarding team the same day where needed, and notify the regulator when required.

## Training
Everyone completes safeguarding training at induction and every year after that.$p$
  when 'Medication Support' then $p$# Medication Support

This is a sample policy written for the Be Care Compliant demo.

## Purpose
To make sure people get the right medicine, in the right dose, at the right time, safely.

## Levels of support
- **Prompting**: reminding someone to take their own medication.
- **Assisting**: helping someone, for example opening a blister pack.
- **Administering**: giving medication, only after training and a competency assessment.

## The six rights
Right person, right medicine, right dose, right time, right route and the right to refuse.

## Recording
Every dose is recorded on the medication record at the time it is given. Never record a dose in advance.

## Errors
If a dose is missed or given wrongly, get advice from the GP or pharmacist, tell the office straight away and complete an incident report.$p$
  when 'Lone Working' then $p$# Lone Working

This is a sample policy written for the Be Care Compliant demo.

## Purpose
Our carers spend most of their day working alone in people's homes. This policy keeps them safe.

## Before a visit
Check the visit notes and any risk assessment for the home. Keep your phone charged.

## During a visit
Log in and out of every call. If something feels unsafe, leave and ring the office or the on call manager.

## If you do not log out
The office will try to reach you within 30 minutes of a missed log out, then your next of kin, then the police if needed.

## Reporting
Report any incident, near miss or worry about your safety the same day.$p$
  else $p$# Infection Prevention and Control

This is a sample policy written for the Be Care Compliant demo.

## Purpose
To stop infections spreading between the people we support, our staff and their families.

## Hand hygiene
Wash or gel your hands before and after every contact, before preparing food and after removing gloves.

## PPE
Wear gloves and an apron for personal care. Put on and take off PPE in the right order and dispose of it safely.

## If you are unwell
Do not come to work with sickness or diarrhoea until 48 hours after your last symptoms. Tell the office as early as you can.

## Spills and waste
Clean spills straight away and put clinical waste in the right bag.$p$
  end;
$$;
revoke all on function public.demo_policy_body(text) from public, anon, authenticated;

-- The demo login's planner: nine visits over the next working days, two a day at 10:00 and 14:00,
-- each booked against a check coming due. Never two at once (the planner refuses a double booking).
create or replace function public.demo_seed_planner(p_company uuid, p_conductor uuid, p_today date)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  c record;
  j int := 0;
  k int;
  v_day date;
  v_id uuid;
begin
  for c in
    select ci.id, ci.branch_id, ci.person_id, ci.service_user_id, cd.name as def_name
      from public.check_instances ci join public.check_definitions cd on cd.id = ci.definition_id
     where ci.company_id = p_company and ci.due_date between p_today and p_today + 14
     order by ci.due_date, ci.id
     limit 9
  loop
    v_day := p_today;
    while extract(isodow from v_day) > 5 loop v_day := v_day + 1; end loop;
    for k in 1..(j / 2) loop
      v_day := v_day + 1;
      while extract(isodow from v_day) > 5 loop v_day := v_day + 1; end loop;
    end loop;
    insert into public.planner_bookings (company_id, branch_id, population, subject_person_id, subject_service_user_id,
                                         conductor_profile_id, scheduled_date, start_time, duration_minutes, status, created_by)
      values (p_company, c.branch_id,
              case when c.person_id is not null then 'people' else 'service_users' end,
              c.person_id, c.service_user_id, p_conductor, v_day,
              case when j % 2 = 0 then time '10:00' else time '14:00' end, 60, 'planned', p_conductor)
      returning id into v_id;
    insert into public.planner_booking_tasks (booking_id, company_id, check_instance_id, check_kind, position)
      values (v_id, p_company, c.id, c.def_name, 1);
    j := j + 1;
  end loop;
  return j;
end;
$$;
revoke all on function public.demo_seed_planner(uuid, uuid, date) from public, anon, authenticated;

-- THE SAMPLE COMPANY. p_conductor is the demo login, who gets the planner bookings.
drop function if exists public.seed_demo_company(uuid);
create or replace function public.seed_demo_company(p_company uuid, p_conductor uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_branches uuid[];
  v_branch_names text[] := array['Cardiff', 'Newport', 'Swansea'];
  v_managers text[] := array['Amelia Pritchard', 'Rhys Morgan', 'Sophie Hughes'];
  v_first text[] := array['Amelia','Rhys','Sophie','Owen','Megan','Dylan','Chloe','Gareth','Ffion','Liam',
    'Hannah','Callum','Nia','Jordan','Ellie','Tomos','Grace','Aled','Holly','Kieran','Seren','Jack','Lowri','Ben','Cerys'];
  v_last text[] := array['Pritchard','Morgan','Hughes','Price','Evans','Rees','Powell','Jenkins','Lloyd','Bevan',
    'Griffiths','Howells','Thomas','Llewellyn','Parry','Owens','Watkins','Harries','Phillips','Mathias'];
  v_su_first text[] := array['Margaret','Dennis','Joan','Harold','Betty','Arthur','Gwen','Ronald','Iris','Clifford',
    'Dorothy','Alwyn','Edna','Glyn','Maureen','Stanley','Olwen','Trevor','Beryl','Emrys'];
  v_su_last text[] := array['Ashworth','Beddoe','Crowther','Davies','Ellery','Farr','Gethin','Hopkin','Ivor','Jolley',
    'Kenward','Lewis','Maddox','Nash','Oakley','Probert','Quinnell','Roderick','Sayce','Tudor'];
  -- The four overdue checks Phil asked for, so the red and the drill down can still be shown.
  v_red text[] := array['p6:supervision', 'p23:spot_check', 'p38:appraisal', 's11:care_plan_review'];
  v_people uuid[] := '{}';
  v_people_names text[] := '{}';
  v_people_branch uuid[] := '{}';
  v_sus uuid[] := '{}';
  v_su_names text[] := '{}';
  v_count_people int := 0;
  v_count_su int := 0;
  v_count_checks int := 0;
  v_count_evidence int := 0;
  i int;
  j int;
  v_bi int;
  v_branch uuid;
  v_title text;
  v_id uuid;
  v_name text;
  v_start date;
  v_due date;
  v_amber int;
  v_span int;
  v_inst uuid;
  v_ev uuid;
  v_ctx jsonb;
  v_form uuid;
  v_ack_form uuid;
  v_rtw_form uuid;
  v_policy uuid;
  v_done date;
  d public.check_definitions;
  c record;
  r numeric;
  v_def_amber int;
  v_policy_titles text[];
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
  select coalesce(amber_days_default, 14) into v_def_amber from public.companies where id = p_company;

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

  -- The library forms name Thistle Care in a few questions. In the demo they name the demo company.
  update public.form_versions fv
     set schema = replace(fv.schema::text, 'Thistle Care', 'Demo Care Company')::jsonb
    from public.forms f
   where f.id = fv.form_id and f.company_id = p_company and fv.schema::text like '%Thistle Care%';

  -- PEOPLE: 50, one Registered Manager per branch.
  for i in 0..49 loop
    v_bi := (i % 3) + 1;
    v_branch := v_branches[v_bi];
    v_title := case
      when i in (0, 1, 2) then 'Registered Manager'
      when i % 11 = 4 then 'Team Leader'
      when i % 13 = 5 then 'Care Coordinator'
      when i % 7 = 1 then 'Senior Care Assistant'
      else 'Care Assistant' end;
    v_name := case when i < 3 then v_managers[i + 1]
                   else v_first[(i % array_length(v_first, 1)) + 1] || ' ' || v_last[((i * 7) % array_length(v_last, 1)) + 1] end;
    v_start := v_today - (case when i in (47, 48, 49) then 40 + i else 200 + floor(random() * 1500)::int end);
    insert into public.people (company_id, branch_id, full_name, job_title, employment_status, start_date, work_email,
                               scw_registration_number)
      values (p_company, v_branch, v_name, v_title,
              case when i = 45 then 'mat_leave' else 'active' end,
              v_start,
              lower(replace(v_name, ' ', '.')) || i || '@demo.invalid',
              case when i in (29, 44) then null else 'D' || lpad((604000 + i * 37)::text, 7, '0') end)
      returning id into v_id;
    v_people := v_people || v_id;
    v_people_names := v_people_names || v_name;
    v_people_branch := v_people_branch || v_branch;
    v_count_people := v_count_people + 1;

    update public.person_trackers
       set dbs_date = greatest(v_start - 21, v_today - (60 + floor(random() * 900))::int),
           rtw_expiry_date = null
     where person_id = v_id;

    v_ctx := jsonb_build_object('name', v_name, 'author', v_managers[v_bi], 'sig', public.demo_signature());
    for d in select * from public.check_definitions cd
              where cd.company_id = p_company and cd.population = 'people' and cd.active
                and (cd.job_titles is null or cardinality(cd.job_titles) = 0
                     or exists (select 1 from unnest(cd.job_titles) jt where lower(btrim(jt)) = lower(v_title)))
              order by cd.name
    loop
      insert into public.check_instances (company_id, branch_id, definition_id, record_type, person_id)
        values (p_company, v_branch, d.id, 'person', v_id)
        on conflict (definition_id, person_id) do nothing;
      select id into v_inst from public.check_instances where definition_id = d.id and person_id = v_id;
      v_count_checks := v_count_checks + 1;
      if not (coalesce(d.recurring, false) and coalesce(d.interval, 0) > 0 and d.form_id is not null) then continue; end if;

      v_amber := coalesce(d.amber_days, v_def_amber);
      v_span := ((v_today + case d.frequency when 'month' then make_interval(months => d.interval)
                                             when 'year' then make_interval(years => d.interval)
                                             when 'week' then make_interval(days => 7 * d.interval)
                                             else make_interval(days => d.interval) end)::date - v_today);
      r := random();
      if ('p' || i || ':' || d.key) = any(v_red) then
        v_due := v_today - (4 + (i % 9));
      elsif r < 0.10 or v_span <= v_amber + 1 then
        v_due := v_today + floor(random() * (v_amber + 1))::int;
      else
        v_due := v_today + v_amber + 1 + floor(random() * greatest(1, v_span - v_amber - 1))::int;
      end if;
      v_count_evidence := v_count_evidence
        + public.demo_check_history(v_inst, d, 'person', v_id, v_branch, v_start, v_due, v_today, v_ctx);
    end loop;
  end loop;

  -- SERVICE USERS: 40.
  for i in 0..39 loop
    v_bi := (i % 3) + 1;
    v_branch := v_branches[v_bi];
    v_name := v_su_first[(i % array_length(v_su_first, 1)) + 1] || ' ' || v_su_last[((i * 3) % array_length(v_su_last, 1)) + 1];
    v_start := v_today - (case when i in (38, 39) then 30 + i else 200 + floor(random() * 1200)::int end);
    insert into public.service_users (company_id, branch_id, full_name, ssid, package_start_date, service_status)
      values (p_company, v_branch, v_name, 'DEMO' || lpad((1000 + i)::text, 5, '0'), v_start,
              case when i = 37 then 'hospital' else 'active' end)
      returning id into v_id;
    v_sus := v_sus || v_id;
    v_su_names := v_su_names || v_name;
    v_count_su := v_count_su + 1;

    v_ctx := jsonb_build_object('name', v_name, 'author', v_managers[v_bi], 'sig', public.demo_signature());
    for d in select * from public.check_definitions cd
              where cd.company_id = p_company and cd.population = 'service_users' and cd.active
              order by cd.name
    loop
      insert into public.check_instances (company_id, branch_id, definition_id, record_type, service_user_id)
        values (p_company, v_branch, d.id, 'service_user', v_id)
        on conflict do nothing;
      select id into v_inst from public.check_instances where definition_id = d.id and service_user_id = v_id;
      v_count_checks := v_count_checks + 1;
      if d.form_id is null then continue; end if;
      if not (coalesce(d.recurring, false) and coalesce(d.interval, 0) > 0) then
        -- A one off (the Setup Visit) was done when the package started.
        v_ev := public.demo_add_evidence(p_company, v_branch, d.form_id, 'service_user', v_id, v_start + 1, v_ctx);
        update public.check_instances set due_date = null, last_completed_on = v_start + 1, last_evidence_id = v_ev where id = v_inst;
        v_count_evidence := v_count_evidence + 1;
        continue;
      end if;
      v_amber := coalesce(d.amber_days, v_def_amber);
      v_span := ((v_today + case d.frequency when 'month' then make_interval(months => d.interval)
                                             when 'year' then make_interval(years => d.interval)
                                             when 'week' then make_interval(days => 7 * d.interval)
                                             else make_interval(days => d.interval) end)::date - v_today);
      r := random();
      if ('s' || i || ':' || d.key) = any(v_red) then
        v_due := v_today - (5 + (i % 7));
      elsif r < 0.10 or v_span <= v_amber + 1 then
        v_due := v_today + floor(random() * (v_amber + 1))::int;
      else
        v_due := v_today + v_amber + 1 + floor(random() * greatest(1, v_span - v_amber - 1))::int;
      end if;
      v_count_evidence := v_count_evidence
        + public.demo_check_history(v_inst, d, 'service_user', v_id, v_branch, v_start, v_due, v_today, v_ctx);
    end loop;
    -- One review in sixteen says the call times do not suit, so satisfaction is high but believable.
    if i % 16 = 7 then
      update public.evidence e
         set answers = e.answers || jsonb_build_object('call_times_suit', 'No',
               'times_not_suiting', 'The morning call is earlier than they would like.',
               'times_that_suit', 'After 8.30 in the morning.')
       where e.id = (select ev.id from public.evidence ev join public.forms f on f.id = ev.form_id
                      where ev.record_id = v_id and f.key = 'care_plan_review'
                      order by ev.submitted_at desc limit 1);
    end if;

    -- PERSONAL OUTCOMES: two or three each, mostly achieved or progressing.
    for j in 1..(2 + (i % 2)) loop
      insert into public.service_user_outcomes (company_id, service_user_id, title, statement, status, position,
                                                last_reviewed, last_update_at, target_date)
        values (p_company, v_id,
          (array['Stay independent with personal care', 'Get out to the community lunch club each week',
                 'Take medication safely with a prompt', 'Keep in touch with family by video call',
                 'Walk to the end of the garden with a frame'])[((i + j) % 5) + 1],
          (array['I want to wash and dress myself with a little help.', 'I want to see my friends at the club on Thursdays.',
                 'I want to stay well and take my tablets on time.', 'I want to talk to my grandchildren every Sunday.',
                 'I want to get stronger on my feet.'])[((i + j) % 5) + 1],
          case when (i + j) % 7 = 0 then 'achieved' when (i + j) % 11 = 3 then 'working_towards' else 'progressing' end,
          j, v_today - (5 + floor(random() * 50))::int,
          (v_today - (5 + floor(random() * 50))::int)::timestamptz,
          v_today + (30 + floor(random() * 120))::int);
    end loop;
  end loop;

  -- TRAINING: every mandatory course for everybody, nearly all in date; some optional courses too.
  for i in 1..array_length(v_people, 1) loop
    select start_date into v_start from public.people where id = v_people[i];
    for c in select * from public.training_courses where company_id = p_company and active order by sort_order loop
      if not c.mandatory and random() > 0.35 then continue; end if;
      r := random();
      if c.mandatory and r < 0.02 and i > 46 then
        insert into public.person_training (company_id, branch_id, person_id, course_id, status)
          values (p_company, v_people_branch[i], v_people[i], c.id, 'not_done')
          on conflict do nothing;
        continue;
      end if;
      if c.renewal_months is not null and r < 0.04 then
        -- Lapsed a few weeks ago: a handful of red cells to chase.
        v_done := ((v_today - (5 + floor(random() * 25))::int) - make_interval(months => c.renewal_months))::date;
      elsif c.renewal_months is not null then
        v_done := v_today - floor(random() * greatest(30, c.renewal_months * 30 - 45))::int;
      else
        v_done := v_start + (3 + floor(random() * 20))::int;
      end if;
      if v_done < v_start then v_done := v_start + (1 + floor(random() * 10))::int; end if;
      if v_done > v_today then v_done := v_today - 1; end if;
      insert into public.person_training (company_id, branch_id, person_id, course_id, status, completed_on, expiry_on)
        values (p_company, v_people_branch[i], v_people[i], c.id, 'completed', v_done,
                case when c.renewal_months is null then null else (v_done + make_interval(months => c.renewal_months))::date end)
        on conflict do nothing;
    end loop;
  end loop;

  -- ABSENCES: eight short sicknesses. Six have their Return to Work done; one is due this week and
  -- one is a few days late, so the absence work on the dashboard has something real in it.
  select id into v_rtw_form from public.forms where company_id = p_company and key = 'return_to_work';
  for i in 1..8 loop
    v_start := case when i = 1 then v_today - 4 when i = 2 then v_today - 12 else v_today - (14 + i * 9) end;
    insert into public.absence_events (company_id, branch_id, person_id, start_date, end_date, return_date, days, reason)
      values (p_company, v_people_branch[i * 5], v_people[i * 5], v_start, v_start + (i % 3), v_start + (i % 3) + 1, (i % 3) + 1,
              (array['Cold and flu', 'Stomach upset', 'Back pain', 'Migraine'])[(i % 4) + 1])
      returning id into v_id;
    if i > 2 and v_rtw_form is not null then
      v_ev := public.demo_add_evidence(p_company, v_people_branch[i * 5], v_rtw_form, 'person', v_people[i * 5],
                v_start + (i % 3) + 1,
                jsonb_build_object('name', v_people_names[i * 5], 'author', v_managers[((i * 5 - 1) % 3) + 1], 'sig', public.demo_signature()));
      update public.absence_events set rtw_evidence_id = v_ev where id = v_id;
      v_count_evidence := v_count_evidence + 1;
    end if;
  end loop;

  -- HOLIDAYS: two waiting for a decision, three approved.
  for i in 1..5 loop
    v_start := v_today + (7 + i * 6);
    insert into public.holiday_requests (company_id, branch_id, person_id, requester_name, start_date, end_date, hours, status, note)
      values (p_company, v_people_branch[i * 7 + 2], v_people[i * 7 + 2], v_people_names[i * 7 + 2], v_start, v_start + 4, 37.5,
              case when i <= 2 then 'pending' else 'approved' end, 'Family holiday');
  end loop;

  -- COMPLAINTS: four, acknowledged and answered on time.
  insert into public.complaints (company_id, branch_id, subject, details, complainant_name, complainant_relationship,
                                 service_user_id, status, date_raised, date_occurred, concern_type, formality, upheld,
                                 acknowledgement_due, date_acknowledged, response_due, date_closed, outcome)
  values
    (p_company, v_branches[1], 'Late morning call', 'The morning call arrived 50 minutes late two days running.', 'Sarah Ashworth', 'relative',
     v_sus[1], 'open', v_today - 4, v_today - 6, 'Complaint', 'Formal', null,
     v_today - 2, v_today - 3, v_today + 16, null, null),
    (p_company, v_branches[2], 'Medication prompt not recorded', 'Family noticed the lunchtime prompt was not recorded on one visit.', 'Paul Beddoe', 'relative',
     v_sus[2], 'in_progress', v_today - 12, v_today - 13, 'Concern', 'Informal', null,
     v_today - 10, v_today - 11, v_today + 2, null, null),
    (p_company, v_branches[3], 'Carer did not wear a name badge', 'Service user asked who the carer was.', 'Joan Crowther', 'service_user',
     v_sus[3], 'closed', v_today - 40, v_today - 41, 'Minor Complaint', 'Informal', false,
     v_today - 38, v_today - 39, v_today - 30, v_today - 33, 'Reminder issued to the team about badges.'),
    (p_company, v_branches[1], 'Rota changes not communicated', 'Visit times changed without notice.', 'Harold Davies', 'service_user',
     v_sus[4], 'closed', v_today - 70, v_today - 72, 'Complaint', 'Formal', true,
     v_today - 68, v_today - 69, v_today - 50, v_today - 55, 'Apology given and the rota change process tightened.');

  -- INCIDENTS: five, investigated and closed on time, one new this week.
  insert into public.incidents (company_id, branch_id, occurred_on, category, service_user_id, description, immediate_action,
                                notifiable, notified_on, safeguarding, status, reported_on, investigation_completed,
                                no_further_action, outcome_recorded_on, closed_on, lessons_learnt)
  values
    (p_company, v_branches[1], v_today - 3, 'Fall', v_sus[5], 'Found on the bedroom floor on arrival, no visible injury.',
     'Helped up safely, GP informed, family told.', false, null, false, 'open', v_today - 3, null, null, null, null, null),
    (p_company, v_branches[2], v_today - 9, 'Medication error', v_sus[6], 'Evening dose given one hour late.',
     'Pharmacist advice taken, no harm.', false, null, false, 'under_review', v_today - 9, v_today - 4, null, null, null, null),
    (p_company, v_branches[3], v_today - 21, 'Missed or late call', v_sus[7], 'Lunch call missed after a rota error.',
     'Call made up the same afternoon.', false, null, false, 'closed', v_today - 21, v_today - 17, true, null, v_today - 14,
     'Rota changes are now checked by a second coordinator.'),
    (p_company, v_branches[1], v_today - 35, 'Serious accident or injury', v_sus[8], 'Fall on the stairs, hospital admission with a fractured wrist.',
     'Ambulance called, next of kin informed.', true, v_today - 34, false, 'closed', v_today - 35, v_today - 28, false, v_today - 22, v_today - 20,
     'Stair rail and moving and handling plan reviewed with the occupational therapist.'),
    (p_company, v_branches[2], v_today - 15, 'Near miss', null, 'Wrong key safe code on the rota, spotted before the visit.',
     'Rota corrected.', false, null, false, 'closed', v_today - 15, v_today - 14, true, null, v_today - 14, null);

  -- POLICIES: four written policies, issued to everybody and nearly all signed. The PDF of each is
  -- drawn and stored by the app straight after this (lib/demo/policies.ts), which is why the
  -- storage path starts as "pending", exactly as a newly written policy does.
  select id into v_ack_form from public.forms where company_id = p_company and key = 'policy_acknowledgement';
  v_policy_titles := array['Safeguarding Adults', 'Medication Support', 'Lone Working', 'Infection Prevention and Control'];
  for j in 1..4 loop
    insert into public.company_policies (company_id, title, summary, source, body, signature_mode, reassign_on_new_version,
                                         assign_to_new_starters, status, version, storage_path, file_name, mime_type, bytes)
      values (p_company, v_policy_titles[j],
        (array['How we recognise, report and act on abuse or neglect.',
               'How carers prompt, assist and administer medication safely.',
               'Keeping carers safe when they work alone in the community.',
               'Hand hygiene, PPE and stopping infections spreading.'])[j],
        'text', public.demo_policy_body(v_policy_titles[j]), 'either', 'ask', true, 'active', 1,
        'pending', replace(v_policy_titles[j], ' ', '_') || '.pdf', 'application/pdf', 0)
      returning id into v_policy;
    for i in 1..array_length(v_people, 1) loop
      if (i + j) % 13 = 0 then
        insert into public.assignments (company_id, person_id, kind, policy_id, policy_version, status, due_date, assigned_at)
          values (p_company, v_people[i], 'policy', v_policy, 1, 'assigned', v_today + 7, now() - interval '5 days');
      else
        v_done := v_today - (10 + floor(random() * 80))::int;
        v_ev := null;
        if v_ack_form is not null then
          v_ev := public.demo_add_evidence(p_company, v_people_branch[i], v_ack_form, 'person', v_people[i], v_done,
                    jsonb_build_object('name', v_people_names[i], 'author', v_people_names[i], 'sig', public.demo_signature()));
          v_count_evidence := v_count_evidence + 1;
        end if;
        insert into public.assignments (company_id, person_id, kind, policy_id, policy_version, status, due_date,
                                        assigned_at, completed_at, evidence_id)
          values (p_company, v_people[i], 'policy', v_policy, 1, 'completed', v_done + 7,
                  (v_done - 3)::timestamptz, (v_done + time '14:00') at time zone 'Europe/London', v_ev);
      end if;
    end loop;
  end loop;

  -- ON CALL: a fortnight of out of hours calls, all followed up except two.
  for i in 1..12 loop
    v_start := v_today - (i + (i / 3));
    insert into public.on_call_logs (company_id, branch_id, shift_date, slot, occurred_at, handler_name, caller_name,
                                     caller_relationship, service_user_id, details, action_taken, outcome,
                                     follow_up_required, follow_up_notes, follow_up_done, follow_up_done_at, finalised, finalised_at)
      values (p_company, v_branches[(i % 3) + 1], v_start, case when i % 2 = 0 then 'am' else 'pm' end,
        (v_start + time '19:15' + make_interval(mins => i * 7)) at time zone 'Europe/London',
        v_managers[(i % 3) + 1],
        (array['Daughter of the service user', 'Care Assistant', 'District nurse', 'Service user'])[(i % 4) + 1],
        (array['relative', 'staff', 'professional', 'service_user'])[(i % 4) + 1],
        v_sus[i + 2],
        (array['Asked to move tomorrow''s morning call to 9am for a hospital appointment.',
               'Carer running 20 minutes late after a long visit, asked us to let the next client know.',
               'District nurse asked for the dressing to be checked at the evening call.',
               'Feeling unwell and asked for a welfare call.'])[(i % 4) + 1],
        'Rota updated and the family informed.',
        'Resolved',
        i in (1, 4, 7),
        case when i in (1, 4, 7) then 'Ring the family in the morning to confirm the new times.' end,
        i not in (1, 7),
        case when i = 4 then (v_start + 1 + time '09:30') at time zone 'Europe/London' end,
        true, (v_start + 1 + time '08:00') at time zone 'Europe/London');
  end loop;

  -- PLANNER: the demo login's week, booked against checks coming due.
  if p_conductor is not null then
    perform public.demo_seed_planner(p_company, p_conductor, v_today);
  end if;

  -- RECENT ACTIVITY: the last few completions, as the audit log would have recorded them.
  insert into public.audit_log (company_id, actor_role, action, entity_type, entity_id, summary, created_at)
  select p_company, 'manager', 'check.completed', 'evidence', e.id::text,
         'Completed ' || f.name || ' for ' || coalesce(p.full_name, s.full_name), e.submitted_at
    from public.evidence e
    join public.forms f on f.id = e.form_id
    left join public.people p on p.id = e.record_id
    left join public.service_users s on s.id = e.record_id
   where e.company_id = p_company and f.key <> 'policy_acknowledgement'
   order by e.submitted_at desc
   limit 10;

  return jsonb_build_object('people', v_count_people, 'service_users', v_count_su, 'checks', v_count_checks,
                            'evidence', v_count_evidence, 'branches', 3);
end;
$$;
revoke all on function public.seed_demo_company(uuid, uuid) from public, anon;
grant execute on function public.seed_demo_company(uuid, uuid) to authenticated;
