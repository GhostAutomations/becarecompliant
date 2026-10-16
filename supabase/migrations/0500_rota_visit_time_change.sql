-- Rota and Visits Stage 5b: timeline views (Phil's popups, 2026-10-16; docs/decisions/rota-visits.md,
-- Stage 5b decisions 4 to 8). Dragging a visit along the timeline changes that one visit's start
-- time: same length, same day, 5 minute steps, locked once a carer has clocked in. The visit keeps
-- its new time when the Care Schedule changes later; it is flagged "Schedule changed" only when the
-- schedule itself changes after the office changed the time.
--
-- Module objects only: four columns on rota_visits, rota_generate_visits (0491) re-created with the
-- two rules above, and a new rota_change_visit_time. No existing non module object changes.

alter table public.rota_visits add column if not exists time_changed_from_start time;
alter table public.rota_visits add column if not exists time_changed_from_end time;
alter table public.rota_visits add column if not exists time_changed_at timestamptz;
alter table public.rota_visits add column if not exists time_changed_by uuid;

create or replace function public.rota_generate_visits(p_company uuid, p_from date, p_to date)
returns table (added integer, updated integer, cancelled integer, flagged integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_added int := 0;
  v_updated int := 0;
  v_cancelled int := 0;
  v_flagged int := 0;
  n int;
begin
  -- Internal (no signed in user can call it). Read the switch directly: the nightly job runs as the
  -- service role, which company_module_on (own company only) would always answer no for.
  if not exists (select 1 from public.company_modules m
                  where m.company_id = p_company and m.module = 'rota_visits' and m.enabled) then
    raise exception 'The rota is not switched on for that company.' using errcode = '42501';
  end if;

  -- What the Care Schedule asks for on each date, with the call's time.
  create temporary table if not exists rota_wanted (
    generated_key text, service_user_id uuid, branch_id uuid, visit_date date, start_time time,
    end_time time, service text, carers smallint) on commit drop;
  truncate rota_wanted;

  insert into rota_wanted
  with days as (
    select d::date as visit_date, (extract(isodow from d)::int - 1) as dow
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  calls as (
    select e.*, su.branch_id as su_branch, d.visit_date,
           coalesce(e.slot, '') as slot_key,
           row_number() over (partition by e.service_user_id, d.visit_date, e.service, coalesce(e.slot, '')
                              order by e.position nulls last, e.id) as occurrence
      from public.care_plan_entries e
      join public.service_users su on su.id = e.service_user_id
      join days d on d.dow = e.day_of_week
     where e.company_id = p_company
       and su.service_status <> 'cancelled' and su.archived_at is null
       and (su.discharge_date is null or su.discharge_date >= d.visit_date)
       and (su.package_start_date is null or su.package_start_date <= d.visit_date)
       and (e.effective_from is null or e.effective_from <= d.visit_date)
       and (e.effective_to is null or e.effective_to >= d.visit_date)
       and su.branch_id is not null
  )
  select concat_ws(':', c.service_user_id, c.visit_date, c.service, c.slot_key, c.occurrence),
         c.service_user_id, c.su_branch, c.visit_date, t.start_time,
         (t.start_time + make_interval(mins => coalesce(t.length_minutes, public.rota_call_minutes(c.unit, c.quantity))))::time,
         c.service, greatest(1, least(4, coalesce(c.carers, 1)))::smallint
    from calls c
    join public.rota_call_times t
      on t.service_user_id = c.service_user_id and t.day_of_week = c.day_of_week
     and t.service = c.service and t.slot_key = c.slot_key and t.occurrence = c.occurrence
   where coalesce(t.length_minutes, public.rota_call_minutes(c.unit, c.quantity)) between 5 and 1440;

  -- New visits.
  insert into public.rota_visits (company_id, branch_id, service_user_id, visit_date, start_time, end_time,
         starts_at, ends_at, service, carers_needed, generated_key)
  select p_company, w.branch_id, w.service_user_id, w.visit_date, w.start_time, w.end_time,
         now(), now() + interval '1 minute', w.service, w.carers, w.generated_key
    from rota_wanted w
  on conflict (generated_key) do nothing;
  get diagnostics n = row_count; v_added := n;

  -- Times or carers changed: drafts with nobody on them follow the schedule...
  update public.rota_visits v set start_time = w.start_time, end_time = w.end_time, carers_needed = w.carers,
         schedule_changed = false
    from rota_wanted w
   where v.generated_key = w.generated_key and v.status = 'draft'
     and v.time_changed_from_start is null -- the office changed its time: it keeps it (Stage 5b, 7)
     and (v.start_time, v.end_time, v.carers_needed) is distinct from (w.start_time, w.end_time, w.carers)
     and not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v.id and a.status = 'active');
  get diagnostics n = row_count; v_updated := n;

  -- ...anything allocated or published is flagged for the office instead. A visit whose time the
  -- office changed (Stage 5b, decision 7) is judged against the schedule times it had when it was
  -- changed, so it is flagged only when the Care Schedule itself changes afterwards.
  update public.rota_visits v set schedule_changed = true
    from rota_wanted w
   where v.generated_key = w.generated_key and v.status <> 'cancelled' and not v.schedule_changed
     and (coalesce(v.time_changed_from_start, v.start_time), coalesce(v.time_changed_from_end, v.end_time), v.carers_needed)
         is distinct from (w.start_time, w.end_time, w.carers);
  get diagnostics n = row_count; v_flagged := n;

  -- A call taken off the schedule: unallocated drafts go; the rest are flagged.
  update public.rota_visits v set status = 'cancelled', cancelled_reason = 'Care Schedule changed'
   where v.company_id = p_company and v.generated_key is not null and v.status = 'draft'
     and v.visit_date between p_from and p_to
     and not exists (select 1 from rota_wanted w where w.generated_key = v.generated_key)
     and not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v.id and a.status = 'active');
  get diagnostics n = row_count; v_cancelled := n;
  update public.rota_visits v set schedule_changed = true
   where v.company_id = p_company and v.generated_key is not null and v.status <> 'cancelled'
     and not v.schedule_changed and v.visit_date between p_from and p_to
     and not exists (select 1 from rota_wanted w where w.generated_key = v.generated_key);
  get diagnostics n = row_count; v_flagged := v_flagged + n;

  return query select v_added, v_updated, v_cancelled, v_flagged;
end;
$$;

-- The office drags a visit along the timeline. Returns the carers on it (texted by the app when the
-- visit is published). Every rule is checked here: the rota office of the branch, module on, not
-- cancelled, nobody clocked in, 5 minute steps, the same day, and every carer on it free and
-- available at the new time.
create or replace function public.rota_change_visit_time(p_visit uuid, p_start time)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v record; v_len int; v_end time; v_from timestamptz; v_to timestamptz; a record; v_reason text; v_people uuid[] := '{}';
begin
  select * into v from public.rota_visits where id = p_visit;
  if v.id is null or not (v.branch_id = any (public.rota_office_branch_ids())
                          or (public.is_platform_admin() and public.company_module_on(v.company_id, 'rota_visits'))) then
    raise exception 'That visit could not be found.' using errcode = '42501';
  end if;
  if v.status = 'cancelled' then raise exception 'That visit has been cancelled.' using errcode = '22023'; end if;
  if exists (select 1 from public.rota_clock_events e where e.visit_id = v.id and e.kind = 'in') then
    raise exception 'A carer has clocked in, so the time cannot be changed.' using errcode = '22023';
  end if;
  if p_start is null or extract(minute from p_start)::int % 5 <> 0 or extract(second from p_start) <> 0 then
    raise exception 'Times change in 5 minute steps.' using errcode = '22023';
  end if;
  v_len := round(extract(epoch from (v.ends_at - v.starts_at)) / 60)::int;
  if extract(epoch from p_start)::int / 60 + v_len > 1440 then
    raise exception 'The visit would run past midnight. A visit stays on its own day.' using errcode = '22023';
  end if;
  if p_start = v.start_time then return '{}'; end if;
  v_end := (p_start + make_interval(mins => v_len))::time;
  v_from := (v.visit_date + p_start) at time zone 'Europe/London';
  v_to := v_from + make_interval(mins => v_len);

  for a in select va.id, va.person_id, coalesce(nullif(btrim(pe.full_name), ''), 'A carer') as name
             from public.rota_visit_assignments va join public.people pe on pe.id = va.person_id
            where va.visit_id = v.id and va.status = 'active' loop
    v_reason := public.rota_unavailable_reason_at(a.person_id, v.visit_date, p_start, v_end);
    if v_reason is not null then raise exception '%', v_reason using errcode = '22023'; end if;
    if public.rota_person_busy(a.person_id, v_from, v_to, null, a.id) then
      raise exception '% is already working at that time.', a.name using errcode = '22023';
    end if;
    v_people := v_people || a.person_id;
  end loop;

  update public.rota_visits
     set start_time = p_start, end_time = v_end,
         time_changed_from_start = case when coalesce(time_changed_from_start, v.start_time) = p_start then null else coalesce(time_changed_from_start, v.start_time) end,
         time_changed_from_end = case when coalesce(time_changed_from_start, v.start_time) = p_start then null else coalesce(time_changed_from_end, v.end_time) end,
         time_changed_at = now(), time_changed_by = auth.uid()
   where id = v.id;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (v.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
          'rota.visit_time_changed', 'rota_visit', v.id::text,
          'Changed a visit''s time from ' || to_char(v.start_time, 'HH24:MI') || ' to ' || to_char(p_start, 'HH24:MI'),
          jsonb_build_object('from', to_char(v.start_time, 'HH24:MI'), 'to', to_char(p_start, 'HH24:MI'), 'visit_date', v.visit_date));
  return v_people;
end;
$$;

revoke all on function public.rota_change_visit_time(uuid, time) from public, anon;
grant execute on function public.rota_change_visit_time(uuid, time) to authenticated;
revoke all on function public.rota_generate_visits(uuid, date, date) from public, anon, authenticated;
