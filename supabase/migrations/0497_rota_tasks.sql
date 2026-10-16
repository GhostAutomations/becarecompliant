-- Rota and Visits Stage 4: care plan tasks per call (Phil's popups, 2026-10-16;
-- docs/decisions/rota-visits.md, Stage 4 decisions).
--
-- Additive only: three new tables and new functions; no existing table, view, policy, trigger or
-- function changes, the Care Schedule (care_plan_entries) is not touched, and nothing is added to
-- the supabase_realtime publication.
--
--   rota_task_library      a company's own custom tasks, beside the starter list in code
--   rota_call_task_lists   the task list for one call in a service user's Care Schedule; every
--                          save is a new version (the old one is kept, replaced_at set)
--   rota_task_outcomes     what the carer recorded for each task at a visit, sent from the phone;
--                          event_id is made on the phone and kept once (as clock events)
--
-- A call is keyed as rota_call_times keys it (0491): service user, day of week (0 Monday), service,
-- slot ('' when none) and occurrence, because Care Schedule saves delete and re-add their rows.
-- Who may set tasks is who may change the Care Schedule today (0309's care_plan_entries policy):
-- the Founder, a Company Admin, or a manager or supervisor of the service user's branch.

-- ============================================================================================
-- 1. Tables
-- ============================================================================================

create table if not exists public.rota_task_library (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- null: every branch
  name text not null check (length(btrim(name)) between 1 and 120),
  category text not null default 'Custom' check (length(category) <= 40),
  created_by uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid
);
create unique index if not exists rota_task_library_name_key on public.rota_task_library (company_id, lower(btrim(name))) where archived_at is null;
create index if not exists rota_task_library_company on public.rota_task_library (company_id, branch_id);

create table if not exists public.rota_call_task_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  service text not null check (length(service) between 1 and 40),
  slot_key text not null default '' check (length(slot_key) <= 40),
  occurrence smallint not null default 1 check (occurrence between 1 and 20),
  tasks jsonb not null default '[]' check (jsonb_typeof(tasks) = 'array'),
  created_by uuid,
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  replaced_by uuid
);
create unique index if not exists rota_call_task_lists_current on public.rota_call_task_lists
  (service_user_id, day_of_week, service, slot_key, occurrence) where replaced_at is null;
create index if not exists rota_call_task_lists_su on public.rota_call_task_lists (service_user_id, created_at);
create index if not exists rota_call_task_lists_company on public.rota_call_task_lists (company_id, branch_id);

create table if not exists public.rota_task_outcomes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  list_id uuid not null references public.rota_call_task_lists(id) on delete cascade,
  task_uid text not null check (length(task_uid) between 1 and 60),
  task_name text not null,
  is_key boolean not null default false,
  outcome text not null check (outcome in ('done', 'refused', 'not_needed')),
  reason_code text check (reason_code in ('declined', 'asleep', 'unwell', 'not_home', 'in_hospital', 'away',
                                          'done_earlier', 'done_by_family', 'done_by_professional', 'not_needed_today',
                                          'no_supplies', 'equipment', 'unsafe', 'no_time', 'other')),
  reason_text text check (reason_text is null or length(reason_text) <= 500),
  phone_time timestamptz not null,
  happened_at timestamptz not null,
  server_time timestamptz not null default now(),
  clock_skew_seconds integer,
  flags text[] not null default '{}',
  device_id text check (device_id is null or length(device_id) <= 100),
  device_seq integer,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  check ((outcome = 'done') = (reason_code is null))
);
create unique index if not exists rota_task_outcomes_event_key on public.rota_task_outcomes (event_id);
create index if not exists rota_task_outcomes_visit on public.rota_task_outcomes (visit_id, person_id, happened_at);
create index if not exists rota_task_outcomes_company on public.rota_task_outcomes (company_id, branch_id, happened_at);
create index if not exists rota_task_outcomes_list on public.rota_task_outcomes (list_id);
create index if not exists rota_task_outcomes_person on public.rota_task_outcomes (person_id);

-- ============================================================================================
-- 2. Row level security
-- ============================================================================================

alter table public.rota_task_library enable row level security;
alter table public.rota_call_task_lists enable row level security;
alter table public.rota_task_outcomes enable row level security;

-- The company's own task names: anyone in the company (module on) may read them; changes go
-- through rota_add_library_task / rota_archive_library_task.
drop policy if exists rota_task_library_read on public.rota_task_library;
create policy rota_task_library_read on public.rota_task_library for select to authenticated
  using (((select public.is_platform_admin()) or public.is_company_member(company_id))
         and public.company_module_on(company_id, 'rota_visits'));

-- Task lists: whoever may read the Care Schedule (0309), the rota office of the branch, the Founder.
-- Carers read their own visits' tasks through rota_my_visit_tasks only.
drop policy if exists rota_call_task_lists_read on public.rota_call_task_lists;
create policy rota_call_task_lists_read on public.rota_call_task_lists for select to authenticated
  using (public.company_module_on(company_id, 'rota_visits') and (
           (select public.is_platform_admin()) or public.is_company_admin(company_id) or public.is_branch_lead(branch_id)
           or branch_id = any ((select public.rota_office_branch_ids())::uuid[])));

-- Outcomes: the rota office of the branch, the carer who recorded them, the Founder.
drop policy if exists rota_task_outcomes_read on public.rota_task_outcomes;
create policy rota_task_outcomes_read on public.rota_task_outcomes for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or person_id = any ((select public.rota_my_person_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

-- ============================================================================================
-- 3. Helpers (internal)
-- ============================================================================================

-- May the caller set this service user's tasks? The Care Schedule's own rule (0309), module on.
create or replace function public.rota_can_edit_tasks(p_su uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.service_users s
     where s.id = p_su
       and public.company_module_on(s.company_id, 'rota_visits')
       and (public.is_platform_admin() or public.is_company_admin(s.company_id) or public.is_branch_lead(s.branch_id)));
$$;

-- The current task list for the call a visit was made from (its generated key, 0491:
-- service_user:date:service:slot:occurrence), or null.
create or replace function public.rota_visit_task_list(p_visit uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id
    from public.rota_visits v
    join public.rota_call_task_lists l
      on l.service_user_id = v.service_user_id
     and l.day_of_week = (extract(isodow from v.visit_date)::int - 1)
     and l.service = split_part(v.generated_key, ':', 3)
     and l.slot_key = split_part(v.generated_key, ':', 4)
     and l.occurrence = nullif(split_part(v.generated_key, ':', 5), '')::smallint
     and l.replaced_at is null
   where v.id = p_visit and v.generated_key is not null;
$$;

-- ============================================================================================
-- 4. The office: task lists and the company's custom tasks
-- ============================================================================================

-- Save a call's task list. Each item: { uid?, name, category?, key? }. A list the same as the
-- current one changes nothing (so saving twice makes no extra version); otherwise the current
-- version is kept, marked replaced, and the new one becomes current.
create or replace function public.rota_save_call_tasks(p_su uuid, p_day smallint, p_service text, p_slot text,
                                                       p_occurrence smallint, p_tasks jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  su record; cur record; v_clean jsonb := '[]'; t jsonb; v_name text; v_id uuid; n int := 0;
begin
  if not public.rota_can_edit_tasks(p_su) then
    raise exception 'You cannot change this service user''s tasks.' using errcode = '42501';
  end if;
  select id, company_id, branch_id into su from public.service_users where id = p_su;
  if su.branch_id is null then raise exception 'This service user has no branch yet.' using errcode = '22023'; end if;
  if p_day is null or p_day not between 0 and 6 or nullif(btrim(coalesce(p_service, '')), '') is null
     or p_occurrence is null or p_occurrence not between 1 and 20 then
    raise exception 'That call could not be found.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 40 then
    raise exception 'A call can have up to 40 tasks.' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_tasks) loop
    v_name := btrim(coalesce(t->>'name', ''));
    if v_name = '' or length(v_name) > 120 then
      raise exception 'Each task needs a name of up to 120 characters.' using errcode = '22023';
    end if;
    n := n + 1;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'uid', coalesce(nullif(left(btrim(coalesce(t->>'uid', '')), 60), ''), gen_random_uuid()::text),
      'name', v_name,
      'category', left(coalesce(nullif(btrim(t->>'category'), ''), 'Custom'), 40),
      'key', coalesce((t->>'key')::boolean, false)));
  end loop;

  select * into cur from public.rota_call_task_lists
   where service_user_id = p_su and day_of_week = p_day and service = btrim(p_service)
     and slot_key = coalesce(p_slot, '') and occurrence = p_occurrence and replaced_at is null
   for update;
  if cur.id is not null then
    -- Unchanged (ignoring the uids the page may not have sent back): keep it.
    if (select coalesce(jsonb_agg(x - 'uid'), '[]') from jsonb_array_elements(cur.tasks) x)
       = (select coalesce(jsonb_agg(x - 'uid'), '[]') from jsonb_array_elements(v_clean) x) then
      return cur.id;
    end if;
    update public.rota_call_task_lists set replaced_at = now(), replaced_by = auth.uid() where id = cur.id;
  end if;
  insert into public.rota_call_task_lists (company_id, branch_id, service_user_id, day_of_week, service, slot_key, occurrence, tasks, created_by)
  values (su.company_id, su.branch_id, p_su, p_day, btrim(p_service), coalesce(p_slot, ''), p_occurrence, v_clean, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Add a custom task to the company's list (branch null: every branch).
create or replace function public.rota_add_library_task(p_company uuid, p_name text, p_category text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not (public.company_module_on(p_company, 'rota_visits')
          and (public.is_platform_admin() or public.is_company_admin(p_company)
               or exists (select 1 from public.branches b where b.company_id = p_company and public.is_branch_lead(b.id)))) then
    raise exception 'You cannot change this company''s tasks.' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'Give the task a name of up to 120 characters.' using errcode = '22023'; end if;
  select id into v_id from public.rota_task_library
   where company_id = p_company and lower(btrim(name)) = lower(v_name) and archived_at is null;
  if v_id is not null then return v_id; end if;
  insert into public.rota_task_library (company_id, name, category, created_by)
  values (p_company, v_name, left(coalesce(nullif(btrim(p_category), ''), 'Custom'), 40), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Remove a custom task from the company's list (task lists already using it keep it).
create or replace function public.rota_archive_library_task(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare t record;
begin
  select * into t from public.rota_task_library where id = p_id and archived_at is null;
  if t.id is null or not (public.company_module_on(t.company_id, 'rota_visits')
          and (public.is_platform_admin() or public.is_company_admin(t.company_id)
               or exists (select 1 from public.branches b where b.company_id = t.company_id and public.is_branch_lead(b.id)))) then
    raise exception 'That task could not be found.' using errcode = 'P0002';
  end if;
  update public.rota_task_library set archived_at = now(), archived_by = auth.uid() where id = p_id;
end;
$$;

-- ============================================================================================
-- 5. The carer: their visits' tasks, kept on the phone (offline design, section 1)
-- ============================================================================================

-- For the carer's own published visits from yesterday to tomorrow: the call's current task list
-- and the latest outcome they have recorded for each task.
create or replace function public.rota_my_visit_tasks()
returns table (visit_id uuid, list_id uuid, tasks jsonb, outcomes jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select unnest(public.rota_my_person_ids()) as person_id),
  today as (select (now() at time zone 'Europe/London')::date as d),
  mine as (
    select v.id as visit_id, a.person_id, public.rota_visit_task_list(v.id) as list_id
      from me
      join public.rota_visit_assignments a on a.person_id = me.person_id and a.status = 'active'
      join public.rota_visits v on v.id = a.visit_id and v.status = 'published'
     where v.visit_date between (select d from today) - 1 and (select d from today) + 1
  )
  select m.visit_id, m.list_id, l.tasks,
         coalesce((select jsonb_object_agg(o.task_uid, jsonb_build_object('outcome', o.outcome, 'reason_code', o.reason_code,
                                                                          'reason_text', o.reason_text, 'at', o.happened_at))
                     from (select distinct on (x.task_uid) x.* from public.rota_task_outcomes x
                            where x.visit_id = m.visit_id and x.person_id = m.person_id
                            order by x.task_uid, x.happened_at desc, x.server_time desc) o), '{}'::jsonb)
    from mine m
    join public.rota_call_task_lists l on l.id = m.list_id;
$$;

-- The phone sends its task outcomes: each once (Accepted / Already had it / Refused with the
-- reason, kept for the office in rota_clock_problems). The latest outcome per task counts; earlier
-- ones are kept, never overwritten.
create or replace function public.rota_task_submit(p_events jsonb, p_phone_now timestamptz)
returns table (event_id uuid, result text, reason text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  ev jsonb; v_event uuid; v_visit record; v_list record; v_task jsonb; v_person uuid; v_mine uuid[];
  v_skew integer; v_phone timestamptz; v_happened timestamptz; v_outcome text; v_reason text; v_flags text[];
  v_err text; v_company uuid; v_branch uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200 then
    raise exception 'A batch is a list of up to 200 records.' using errcode = '22023';
  end if;
  v_mine := public.rota_my_person_ids();
  v_skew := case when p_phone_now is null then null else round(extract(epoch from (now() - p_phone_now)))::integer end;

  for ev in select * from jsonb_array_elements(p_events) loop
    v_event := null; v_person := null; v_company := null; v_branch := null;
    begin
      v_event := (ev->>'event_id')::uuid;
      if v_event is null then raise exception 'The record has no id.' using errcode = '22023'; end if;
      if exists (select 1 from public.rota_task_outcomes o where o.event_id = v_event) then
        event_id := v_event; result := 'duplicate'; reason := null; return next; continue;
      end if;

      select v.id, v.company_id, v.branch_id, v.service_user_id into v_visit
        from public.rota_visits v where v.id = (ev->>'visit_id')::uuid;
      if v_visit.id is null then raise exception 'That visit could not be found.' using errcode = 'P0002'; end if;
      v_company := v_visit.company_id; v_branch := v_visit.branch_id;
      select pe.id into v_person from public.people pe where pe.id = any (v_mine) and pe.company_id = v_visit.company_id limit 1;
      if v_person is null then raise exception 'This record is not for the person signed in.' using errcode = '42501'; end if;
      if not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v_visit.id and a.person_id = v_person) then
        raise exception 'That visit was never yours.' using errcode = '42501';
      end if;

      select * into v_list from public.rota_call_task_lists l
       where l.id = (ev->>'list_id')::uuid and l.service_user_id = v_visit.service_user_id;
      if v_list.id is null then raise exception 'That task list is not for this visit.' using errcode = 'P0002'; end if;
      select x into v_task from jsonb_array_elements(v_list.tasks) x where x->>'uid' = ev->>'task_uid' limit 1;
      if v_task is null then raise exception 'That task is not on the list.' using errcode = 'P0002'; end if;

      v_outcome := ev->>'outcome';
      v_reason := nullif(ev->>'reason_code', '');
      if v_outcome not in ('done', 'refused', 'not_needed') then raise exception 'The record is not complete.' using errcode = '22023'; end if;
      if v_outcome = 'done' then v_reason := null;
      elsif v_reason is null then raise exception 'A task that was not done needs a reason.' using errcode = '22023';
      elsif v_reason = 'other' and nullif(btrim(coalesce(ev->>'reason_text', '')), '') is null then
        raise exception 'Other needs the reason typed.' using errcode = '22023';
      end if;

      v_phone := (ev->>'phone_time')::timestamptz;
      if v_phone is null then raise exception 'The record is not complete.' using errcode = '22023'; end if;
      v_happened := v_phone + make_interval(secs => coalesce(v_skew, 0));
      if v_happened > now() + interval '5 minutes' then raise exception 'The record is dated in the future.' using errcode = '22023'; end if;
      v_flags := '{}';
      if v_skew is not null and abs(v_skew) > 300 then v_flags := v_flags || 'phone_clock'::text; end if;
      if now() - v_happened > interval '10 minutes' then v_flags := v_flags || 'offline'::text; end if;
      if not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v_visit.id and a.person_id = v_person and a.status = 'active') then
        v_flags := v_flags || 'moved'::text;
      end if;
      if v_list.replaced_at is not null then v_flags := v_flags || 'old_list'::text; end if;

      insert into public.rota_task_outcomes (event_id, company_id, branch_id, person_id, visit_id, list_id, task_uid, task_name, is_key,
                                             outcome, reason_code, reason_text, phone_time, happened_at, clock_skew_seconds, flags,
                                             device_id, device_seq, recorded_by)
      values (v_event, v_visit.company_id, v_visit.branch_id, v_person, v_visit.id, v_list.id, v_task->>'uid', v_task->>'name',
              coalesce((v_task->>'key')::boolean, false), v_outcome, v_reason,
              case when v_reason = 'other' then left(btrim(ev->>'reason_text'), 500) end,
              v_phone, v_happened, v_skew, v_flags, left(ev->>'device_id', 100), nullif(ev->>'device_seq', '')::integer, auth.uid());
      event_id := v_event; result := 'accepted'; reason := null; return next;
    exception when others then
      if sqlstate = '23505' then
        event_id := v_event; result := 'duplicate'; reason := null; return next; continue;
      end if;
      v_err := sqlerrm;
      begin
        insert into public.rota_clock_problems (company_id, branch_id, person_id, profile_id, event_id, event, reason)
        values (coalesce(v_company, (select p.company_id from public.profiles p where p.id = auth.uid())),
                v_branch, v_person, auth.uid(), v_event, ev || jsonb_build_object('record', 'task'), v_err)
        on conflict do nothing;
      exception when others then null;
      end;
      event_id := v_event; result := 'refused'; reason := v_err; return next;
    end;
  end loop;
end;
$$;

-- ============================================================================================
-- 6. Grants
-- ============================================================================================

revoke all on function public.rota_can_edit_tasks(uuid) from public, anon, authenticated;
revoke all on function public.rota_visit_task_list(uuid) from public, anon, authenticated;

revoke all on function public.rota_save_call_tasks(uuid, smallint, text, text, smallint, jsonb) from public, anon;
grant execute on function public.rota_save_call_tasks(uuid, smallint, text, text, smallint, jsonb) to authenticated;
revoke all on function public.rota_add_library_task(uuid, text, text) from public, anon;
grant execute on function public.rota_add_library_task(uuid, text, text) to authenticated;
revoke all on function public.rota_archive_library_task(uuid) from public, anon;
grant execute on function public.rota_archive_library_task(uuid) to authenticated;
revoke all on function public.rota_my_visit_tasks() from public, anon;
grant execute on function public.rota_my_visit_tasks() to authenticated;
revoke all on function public.rota_task_submit(jsonb, timestamptz) from public, anon;
grant execute on function public.rota_task_submit(jsonb, timestamptz) to authenticated;

-- ============================================================================================
-- 7. Live updates (new tables only) and company links
-- ============================================================================================

do $$
declare t text;
begin
  foreach t in array array['rota_task_library','rota_call_task_lists','rota_task_outcomes'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

select public.install_company_link_triggers();
