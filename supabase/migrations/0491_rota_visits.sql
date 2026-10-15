-- 0491 Rota and Visits (beta), Stage 2: visits and runs (Phil, 2026-10-15).
--
-- ADDITIVE: new tables and functions, and new versions of 0489's own rota functions (this job's
-- objects, not pre-existing ones). No pre-existing table, policy, trigger or function is altered.
-- care_plan_entries (the Care Schedule Invoicing bills from) and service_users are only READ.
--
-- Decisions (docs/decisions/rota-visits.md, Stage 2):
--   - Visits are made from the Care Schedule. Each call's start time lives in rota_call_times,
--     keyed by what the call IS (service user, day, service, part of day, which one of those),
--     because the Care Schedule deletes and re-adds its rows on every save.
--   - Visits are made 4 weeks ahead, never duplicated (generated_key), and a visit that is
--     allocated or published is never overwritten: a schedule change flags it instead.
--   - Hospital or respite pauses visits from the day they went (worked out, nothing stored).
--   - Preferred carers rank higher; a carer on the not to send list is refused.
--   - The same Right to Work, DBS and availability rules as shifts, and nobody on a shift and a
--     visit (or two visits) at the same time.

-- ============================================================================================
-- 1. Tables
-- ============================================================================================

create table if not exists public.rota_call_times (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 Monday, as the Care Schedule
  service text not null,
  slot_key text not null default '', -- the Care Schedule's part of day, '' when none
  occurrence smallint not null default 1 check (occurrence between 1 and 20),
  start_time time not null,
  -- Only needed when the Care Schedule cannot say how long (a Fixed price call).
  length_minutes integer check (length_minutes is null or length_minutes between 5 and 1440),
  created_by uuid,
  updated_at timestamptz not null default now(),
  unique (service_user_id, day_of_week, service, slot_key, occurrence)
);
create index if not exists rota_call_times_company_idx on public.rota_call_times (company_id);
create index if not exists rota_call_times_branch_idx on public.rota_call_times (branch_id);

create table if not exists public.rota_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  visit_date date not null,
  start_time time not null,
  end_time time not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service text,
  carers_needed smallint not null default 1 check (carers_needed between 1 and 4),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  -- Made from the Care Schedule: one per call per date, so making visits twice adds nothing.
  generated_key text unique,
  -- The Care Schedule changed after this visit was allocated or published: the office decides.
  schedule_changed boolean not null default false,
  published_at timestamptz,
  published_by uuid,
  cancelled_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists rota_visits_company_idx on public.rota_visits (company_id);
create index if not exists rota_visits_branch_date_idx on public.rota_visits (branch_id, visit_date);
create index if not exists rota_visits_su_date_idx on public.rota_visits (service_user_id, visit_date);
create index if not exists rota_visits_starts_idx on public.rota_visits (company_id, starts_at);

create table if not exists public.rota_visit_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  via text not null default 'office' check (via in ('office', 'moved', 'run_moved')),
  warnings jsonb not null default '[]'::jsonb,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  removed_by uuid,
  removed_at timestamptz,
  removed_reason text
);
create unique index if not exists rota_visit_assignments_one_active on public.rota_visit_assignments (visit_id, person_id) where status = 'active';
create index if not exists rota_visit_assignments_company_idx on public.rota_visit_assignments (company_id);
create index if not exists rota_visit_assignments_branch_idx on public.rota_visit_assignments (branch_id);
create index if not exists rota_visit_assignments_visit_idx on public.rota_visit_assignments (visit_id);
create index if not exists rota_visit_assignments_person_idx on public.rota_visit_assignments (person_id, status);

create table if not exists public.rota_su_carer_prefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('preferred', 'not_to_send')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (service_user_id, person_id)
);
create index if not exists rota_su_carer_prefs_company_idx on public.rota_su_carer_prefs (company_id);
create index if not exists rota_su_carer_prefs_branch_idx on public.rota_su_carer_prefs (branch_id);
create index if not exists rota_su_carer_prefs_person_idx on public.rota_su_carer_prefs (person_id);

-- Postcode map points from postcodes.io (ONS data). A postcode only, linked to nobody. Read and
-- written by the server with the service role; no policy, so no signed in user reads it directly.
create table if not exists public.rota_postcode_points (
  postcode text primary key, -- normalised: upper case, single space
  lat double precision,
  lng double precision,
  found boolean not null,
  looked_up_at timestamptz not null default now()
);

-- ============================================================================================
-- 2. Visit times in Europe/London (own table's trigger only)
-- ============================================================================================

create or replace function public.rota_visit_instants()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.starts_at := (new.visit_date + new.start_time) at time zone 'Europe/London';
  new.ends_at := ((new.visit_date + case when new.end_time <= new.start_time then 1 else 0 end) + new.end_time)
                 at time zone 'Europe/London';
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.rota_visit_instants() from public, anon, authenticated;

drop trigger if exists rota_visit_instants on public.rota_visits;
create trigger rota_visit_instants before insert or update of visit_date, start_time, end_time, status, carers_needed
  on public.rota_visits for each row execute function public.rota_visit_instants();

-- ============================================================================================
-- 3. RLS
-- ============================================================================================

alter table public.rota_call_times enable row level security;
alter table public.rota_visits enable row level security;
alter table public.rota_visit_assignments enable row level security;
alter table public.rota_su_carer_prefs enable row level security;
alter table public.rota_postcode_points enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rota_call_times','rota_visits','rota_visit_assignments','rota_su_carer_prefs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_office_select', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
             or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')))$p$,
      t || '_office_select', t);
  end loop;
end $$;

-- Preferences: office writes them directly, for service users and people in its own branches.
drop policy if exists rota_su_carer_prefs_office_write on public.rota_su_carer_prefs;
create policy rota_su_carer_prefs_office_write on public.rota_su_carer_prefs for all to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')))
  with check ((branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')))
         and exists (select 1 from public.service_users su
                      where su.id = rota_su_carer_prefs.service_user_id
                        and su.branch_id = rota_su_carer_prefs.branch_id
                        and su.company_id = rota_su_carer_prefs.company_id)
         and exists (select 1 from public.people pe
                      where pe.id = rota_su_carer_prefs.person_id and pe.company_id = rota_su_carer_prefs.company_id));

-- ============================================================================================
-- 4. Shared rules, now covering shifts and visits
-- ============================================================================================

-- Unavailable on a date and between two clock times (the body of 0489's shift version).
create or replace function public.rota_unavailable_reason_at(p_person uuid, p_date date, p_start time, p_end time)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  pe record;
  v_dow int;
  v_has_pattern boolean;
  v_fits boolean;
  v_start int;
  v_end int;
begin
  select * into pe from public.people where id = p_person;
  if pe.id is null then return 'That person could not be found.'; end if;
  pe.full_name := coalesce(nullif(btrim(pe.full_name), ''), 'This person');
  if pe.archived_at is not null or pe.employment_status = 'leaver' then
    return pe.full_name || ' has left, so cannot be put on the rota.';
  end if;
  if pe.employment_status in ('mat_leave', 'lts') and (pe.leave_since is null or pe.leave_since <= p_date) then
    return pe.full_name || ' is on ' || case when pe.employment_status = 'lts' then 'long term sick' else 'parental leave' end || '.';
  end if;
  if exists (select 1 from public.holiday_requests h
              where h.person_id = p_person
                and ((h.status = 'approved' and p_date between h.start_date and h.end_date)
                  or (h.status = 'pending' and h.change_kind is not null
                      and p_date between h.previous_start_date and h.previous_end_date))) then
    return pe.full_name || ' is on holiday that day.';
  end if;
  if exists (select 1 from public.absence_events a
              where a.person_id = p_person and a.start_date <= p_date
                and (coalesce(a.end_date, a.return_date - 1) is null or coalesce(a.end_date, a.return_date - 1) >= p_date)) then
    return pe.full_name || ' is absent that day.';
  end if;
  if exists (select 1 from public.rota_unavailable_dates u
              where u.person_id = p_person and p_date between u.start_date and u.end_date) then
    return pe.full_name || ' cannot work that day (marked unavailable).';
  end if;
  select exists (select 1 from public.rota_availability v where v.person_id = p_person) into v_has_pattern;
  if v_has_pattern then
    v_dow := extract(isodow from p_date)::int;
    v_start := extract(hour from p_start)::int * 60 + extract(minute from p_start)::int;
    v_end := extract(hour from p_end)::int * 60 + extract(minute from p_end)::int;
    if v_end <= v_start then v_end := v_end + 1440; end if;
    select exists (
      select 1 from public.rota_availability v
       where v.person_id = p_person and v.weekday = v_dow
         and (extract(hour from v.start_time)::int * 60 + extract(minute from v.start_time)::int) <= v_start
         and (case when v.end_time <= v.start_time
                   then extract(hour from v.end_time)::int * 60 + extract(minute from v.end_time)::int + 1440
                   else extract(hour from v.end_time)::int * 60 + extract(minute from v.end_time)::int end) >= v_end
    ) into v_fits;
    if not v_fits then
      return pe.full_name || ' is not available at those times (weekly availability).';
    end if;
  end if;
  return null;
end;
$$;

-- 0489's shift version now asks the shared one.
create or replace function public.rota_unavailable_reason(p_person uuid, p_shift uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare s record;
begin
  select * into s from public.rota_shifts where id = p_shift;
  return public.rota_unavailable_reason_at(p_person, s.shift_date, s.start_time, s.end_time);
end;
$$;

-- Is this person already working (a shift or a visit) at any moment between two instants?
create or replace function public.rota_person_busy(p_person uuid, p_from timestamptz, p_to timestamptz,
                                                   p_ignore_shift_assignment uuid, p_ignore_visit_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.rota_assignments a join public.rota_shifts o on o.id = a.shift_id
                  where a.person_id = p_person and a.status = 'active' and o.status <> 'cancelled'
                    and a.id is distinct from p_ignore_shift_assignment
                    and o.starts_at < p_to and o.ends_at > p_from)
      or exists (select 1 from public.rota_visit_assignments a join public.rota_visits v on v.id = a.visit_id
                  where a.person_id = p_person and a.status = 'active' and v.status <> 'cancelled'
                    and a.id is distinct from p_ignore_visit_assignment
                    and v.starts_at < p_to and v.ends_at > p_from);
$$;

-- 0489's shift refusal, now also refusing a person who is on a visit at the same time.
create or replace function public.rota_assign_refusal(p_shift uuid, p_person uuid, p_ignore uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  pe record;
  v_reason text;
  v_dbs text;
  v_taken int;
begin
  select * into s from public.rota_shifts where id = p_shift;
  if s.id is null then return 'That shift could not be found.'; end if;
  if s.status = 'cancelled' then return 'That shift has been cancelled.'; end if;
  select * into pe from public.people where id = p_person;
  if pe.id is null or pe.company_id <> s.company_id then return 'That person could not be found.'; end if;
  pe.full_name := coalesce(nullif(btrim(pe.full_name), ''), 'This person');
  select count(*) into v_taken from public.rota_assignments a
   where a.shift_id = p_shift and a.status = 'active' and a.id is distinct from p_ignore;
  if exists (select 1 from public.rota_assignments a
              where a.shift_id = p_shift and a.person_id = p_person and a.status = 'active' and a.id is distinct from p_ignore) then
    return pe.full_name || ' is already on this shift.';
  end if;
  if v_taken >= s.headcount then return 'This shift is already full.'; end if;
  v_reason := public.rota_unavailable_reason_at(p_person, s.shift_date, s.start_time, s.end_time);
  if v_reason is not null then return v_reason; end if;
  -- Busy on another shift, or on a visit, at that time. This shift's own rows do not count.
  if exists (select 1 from public.rota_assignments a join public.rota_shifts o on o.id = a.shift_id
              where a.person_id = p_person and a.status = 'active' and o.status <> 'cancelled'
                and o.id <> p_shift and a.id is distinct from p_ignore
                and o.starts_at < s.ends_at and o.ends_at > s.starts_at)
     or exists (select 1 from public.rota_visit_assignments a join public.rota_visits v on v.id = a.visit_id
              where a.person_id = p_person and a.status = 'active' and v.status <> 'cancelled'
                and v.starts_at < s.ends_at and v.ends_at > s.starts_at) then
    return pe.full_name || ' is already working at that time.';
  end if;
  if public.rota_rtw_red(p_person, s.shift_date) then
    return pe.full_name || ' has no current Right to Work on file, so cannot be put on the rota.';
  end if;
  v_dbs := public.rota_dbs_state(p_person, s.shift_date);
  if v_dbs = 'barred' then return pe.full_name || ' is recorded on the barred list, so cannot be put on the rota.'; end if;
  if v_dbs = 'red' then return pe.full_name || ' has no current DBS and no DBS Pending Risk Assessment that lets them start.'; end if;
  if v_dbs = 'risk_ok' then
    if s.headcount < 2 or not exists (
      select 1 from public.rota_assignments a
       where a.shift_id = p_shift and a.status = 'active' and a.id is distinct from p_ignore
         and a.person_id <> p_person and public.rota_dbs_state(a.person_id, s.shift_date) = 'clear') then
      return pe.full_name || ' has no DBS yet, so can only work a double up shift alongside someone whose DBS is clear. Put that person on first.';
    end if;
  end if;
  return null;
end;
$$;

-- Is the service user away (hospital or respite) on a date? Paused from the day they went.
create or replace function public.rota_su_away(p_su uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select su.service_status in ('hospital', 'respite')
                          and (su.hospital_since is null or su.hospital_since <= p_date)
                     from public.service_users su where su.id = p_su), false);
$$;

-- Every refusal for putting this person on this visit, or null.
create or replace function public.rota_visit_refusal(p_visit uuid, p_person uuid, p_ignore uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  pe record;
  v_reason text;
  v_dbs text;
  v_taken int;
begin
  select * into v from public.rota_visits where id = p_visit;
  if v.id is null then return 'That visit could not be found.'; end if;
  if v.status = 'cancelled' then return 'That visit has been cancelled.'; end if;
  select * into pe from public.people where id = p_person;
  if pe.id is null or pe.company_id <> v.company_id then return 'That person could not be found.'; end if;
  pe.full_name := coalesce(nullif(btrim(pe.full_name), ''), 'This person');
  if exists (select 1 from public.rota_visit_assignments a
              where a.visit_id = p_visit and a.person_id = p_person and a.status = 'active' and a.id is distinct from p_ignore) then
    return pe.full_name || ' is already on this visit.';
  end if;
  select count(*) into v_taken from public.rota_visit_assignments a
   where a.visit_id = p_visit and a.status = 'active' and a.id is distinct from p_ignore;
  if v_taken >= v.carers_needed then return 'This visit already has all the carers it needs.'; end if;
  if exists (select 1 from public.rota_su_carer_prefs p
              where p.service_user_id = v.service_user_id and p.person_id = p_person and p.kind = 'not_to_send') then
    return pe.full_name || ' is on this service user''s not to send list.';
  end if;
  v_reason := public.rota_unavailable_reason_at(p_person, v.visit_date, v.start_time, v.end_time);
  if v_reason is not null then return v_reason; end if;
  if exists (select 1 from public.rota_assignments a join public.rota_shifts o on o.id = a.shift_id
              where a.person_id = p_person and a.status = 'active' and o.status <> 'cancelled'
                and o.starts_at < v.ends_at and o.ends_at > v.starts_at)
     or exists (select 1 from public.rota_visit_assignments a join public.rota_visits o on o.id = a.visit_id
              where a.person_id = p_person and a.status = 'active' and o.status <> 'cancelled'
                and o.id <> p_visit and a.id is distinct from p_ignore
                and o.starts_at < v.ends_at and o.ends_at > v.starts_at) then
    return pe.full_name || ' is already working at that time.';
  end if;
  if public.rota_rtw_red(p_person, v.visit_date) then
    return pe.full_name || ' has no current Right to Work on file, so cannot be put on the rota.';
  end if;
  v_dbs := public.rota_dbs_state(p_person, v.visit_date);
  if v_dbs = 'barred' then return pe.full_name || ' is recorded on the barred list, so cannot be put on the rota.'; end if;
  if v_dbs = 'red' then return pe.full_name || ' has no current DBS and no DBS Pending Risk Assessment that lets them start.'; end if;
  if v_dbs = 'risk_ok' then
    if v.carers_needed < 2 or not exists (
      select 1 from public.rota_visit_assignments a
       where a.visit_id = p_visit and a.status = 'active' and a.id is distinct from p_ignore
         and a.person_id <> p_person and public.rota_dbs_state(a.person_id, v.visit_date) = 'clear') then
      return pe.full_name || ' has no DBS yet, so can only do a double up visit alongside someone whose DBS is clear. Put that person on first.';
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.rota_visit_dbs_paired(p_visit uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.rota_visit_assignments o join public.rota_visits v on v.id = o.visit_id
                      where o.visit_id = p_visit and o.status = 'active'
                        and public.rota_dbs_state(o.person_id, v.visit_date) = 'risk_ok')
      or exists (select 1 from public.rota_visit_assignments o join public.rota_visits v on v.id = o.visit_id
                  where o.visit_id = p_visit and o.status = 'active'
                    and public.rota_dbs_state(o.person_id, v.visit_date) = 'clear');
$$;

-- ============================================================================================
-- 5. Making visits from the Care Schedule
-- ============================================================================================

-- How long a Care Schedule call lasts, in minutes (null for a Fixed price call).
create or replace function public.rota_call_minutes(p_unit text, p_quantity numeric)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_unit ~ '^\d+m$' then (substring(p_unit from '^(\d+)')::int * coalesce(p_quantity, 1))::int
    when p_unit ~ '^\d+hr$' then (substring(p_unit from '^(\d+)')::int * 60 * coalesce(p_quantity, 1))::int
    else null end;
$$;

-- Make (or tidy) the visits of one company between two dates. Internal: called by the nightly job
-- and by rota_refresh_visits. Returns how many were added, updated, cancelled and flagged.
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
     and (v.start_time, v.end_time, v.carers_needed) is distinct from (w.start_time, w.end_time, w.carers)
     and not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v.id and a.status = 'active');
  get diagnostics n = row_count; v_updated := n;

  -- ...anything allocated or published is flagged for the office instead.
  update public.rota_visits v set schedule_changed = true
    from rota_wanted w
   where v.generated_key = w.generated_key and v.status <> 'cancelled' and not v.schedule_changed
     and (v.start_time, v.end_time, v.carers_needed) is distinct from (w.start_time, w.end_time, w.carers);
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

-- The office: make the next 4 weeks of visits for its company now (after a time change, or when
-- the visits page opens). Same work as the nightly job, idempotent.
create or replace function public.rota_refresh_visits(p_branch uuid)
returns table (added integer, updated integer, cancelled integer, flagged integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_company uuid; v_today date := (now() at time zone 'Europe/London')::date;
begin
  if not public.rota_can_office(p_branch) then
    raise exception 'You cannot change the rota for that branch.' using errcode = '42501';
  end if;
  select company_id into v_company from public.branches where id = p_branch;
  return query select * from public.rota_generate_visits(v_company, v_today, v_today + 27);
end;
$$;

-- Set (or clear) a call's start time, and its length when the schedule cannot say.
create or replace function public.rota_save_call_time(p_su uuid, p_day smallint, p_service text, p_slot text,
                                                      p_occurrence smallint, p_start time, p_length integer)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare su record;
begin
  select * into su from public.service_users where id = p_su;
  if su.id is null or su.branch_id is null or not public.rota_can_office(su.branch_id) then
    raise exception 'That service user could not be found.' using errcode = 'P0002';
  end if;
  if p_start is null then
    delete from public.rota_call_times
     where service_user_id = p_su and day_of_week = p_day and service = p_service
       and slot_key = coalesce(p_slot, '') and occurrence = p_occurrence;
    return;
  end if;
  insert into public.rota_call_times (company_id, branch_id, service_user_id, day_of_week, service, slot_key,
         occurrence, start_time, length_minutes, created_by)
  values (su.company_id, su.branch_id, p_su, p_day, p_service, coalesce(p_slot, ''), p_occurrence, p_start,
          p_length, auth.uid())
  on conflict (service_user_id, day_of_week, service, slot_key, occurrence)
  do update set start_time = excluded.start_time, length_minutes = excluded.length_minutes,
                branch_id = excluded.branch_id, updated_at = now();
end;
$$;

-- ============================================================================================
-- 6. Putting carers on visits, and runs
-- ============================================================================================

create or replace function public.rota_visit_assign(p_visit uuid, p_person uuid, p_warnings jsonb, p_via text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v record; v_reason text; v_id uuid;
begin
  select * into v from public.rota_visits where id = p_visit for update;
  if v.id is null or not public.rota_can_office(v.branch_id) then
    raise exception 'That visit could not be found.' using errcode = 'P0002';
  end if;
  v_reason := public.rota_visit_refusal(p_visit, p_person, null);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  insert into public.rota_visit_assignments (company_id, branch_id, visit_id, person_id, via, warnings, assigned_by)
  values (v.company_id, v.branch_id, p_visit, p_person,
          case when p_via in ('office', 'moved', 'run_moved') then p_via else 'office' end,
          case when jsonb_typeof(p_warnings) = 'array' then p_warnings else '[]'::jsonb end, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rota_visit_unassign(p_assignment uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare a record; v record;
begin
  select * into a from public.rota_visit_assignments where id = p_assignment and status = 'active';
  if a.id is null or not public.rota_can_office(a.branch_id) then
    raise exception 'That carer is not on this visit.' using errcode = 'P0002';
  end if;
  update public.rota_visit_assignments set status = 'removed', removed_by = auth.uid(), removed_at = now(),
         removed_reason = nullif(btrim(p_reason), '')
   where id = p_assignment;
  if not public.rota_visit_dbs_paired(a.visit_id) then
    raise exception 'Someone on this visit has no DBS yet and needs a colleague with a clear DBS. Take them off first, or put another person with a clear DBS on.' using errcode = '23514';
  end if;
  return a.person_id;
end;
$$;

-- Move one visit to another carer (cover for leave or sickness, or a reshuffle).
create or replace function public.rota_visit_move(p_assignment uuid, p_to_person uuid, p_warnings jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare a record; v_reason text; v_id uuid;
begin
  select * into a from public.rota_visit_assignments where id = p_assignment and status = 'active';
  if a.id is null or not public.rota_can_office(a.branch_id) then
    raise exception 'That carer is not on this visit.' using errcode = 'P0002';
  end if;
  v_reason := public.rota_visit_refusal(a.visit_id, p_to_person, p_assignment);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  update public.rota_visit_assignments set status = 'removed', removed_by = auth.uid(), removed_at = now(),
         removed_reason = 'Moved to another carer'
   where id = p_assignment;
  insert into public.rota_visit_assignments (company_id, branch_id, visit_id, person_id, via, warnings, assigned_by)
  values (a.company_id, a.branch_id, a.visit_id, p_to_person, 'moved',
          case when jsonb_typeof(p_warnings) = 'array' then p_warnings else '[]'::jsonb end, auth.uid())
  returning id into v_id;
  if not public.rota_visit_dbs_paired(a.visit_id) then
    raise exception 'Someone on this visit has no DBS yet and needs a colleague with a clear DBS.' using errcode = '23514';
  end if;
  return v_id;
end;
$$;

-- Move a whole run (one carer's visits on one day in one branch) to another carer. Each visit goes
-- through every rule; any that cannot move stay where they are and are listed with the reason.
create or replace function public.rota_move_run(p_branch uuid, p_date date, p_from_person uuid, p_to_person uuid)
returns table (visit_id uuid, moved boolean, reason text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r record; v_reason text;
begin
  if not public.rota_can_office(p_branch) then
    raise exception 'You cannot change the rota for that branch.' using errcode = '42501';
  end if;
  if p_from_person = p_to_person then raise exception 'Choose a different carer.' using errcode = '22023'; end if;
  for r in select a.id as assignment_id, v.id as vid
             from public.rota_visit_assignments a join public.rota_visits v on v.id = a.visit_id
            where v.branch_id = p_branch and v.visit_date = p_date and v.status <> 'cancelled'
              and a.person_id = p_from_person and a.status = 'active'
            order by v.starts_at loop
    v_reason := public.rota_visit_refusal(r.vid, p_to_person, r.assignment_id);
    if v_reason is null then
      update public.rota_visit_assignments set status = 'removed', removed_by = auth.uid(), removed_at = now(),
             removed_reason = 'Run moved to another carer'
       where id = r.assignment_id;
      insert into public.rota_visit_assignments (company_id, branch_id, visit_id, person_id, via, assigned_by)
      select v.company_id, v.branch_id, v.id, p_to_person, 'run_moved', auth.uid() from public.rota_visits v where v.id = r.vid;
      return query select r.vid, true, null::text;
    else
      return query select r.vid, false, v_reason;
    end if;
  end loop;
end;
$$;

create or replace function public.rota_cancel_visit(p_visit uuid, p_reason text)
returns table (person_id uuid, was_published boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v record;
begin
  select * into v from public.rota_visits where id = p_visit;
  if v.id is null or not public.rota_can_office(v.branch_id) then
    raise exception 'That visit could not be found.' using errcode = 'P0002';
  end if;
  update public.rota_visits set status = 'cancelled', cancelled_reason = nullif(btrim(p_reason), '') where id = p_visit;
  return query
    update public.rota_visit_assignments a set status = 'removed', removed_by = auth.uid(), removed_at = now(),
           removed_reason = 'Visit cancelled'
     where a.visit_id = p_visit and a.status = 'active'
    returning a.person_id, v.status = 'published';
end;
$$;

-- The office acknowledges a "schedule changed" flag after checking the visit.
create or replace function public.rota_visit_clear_flag(p_visit uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select * into v from public.rota_visits where id = p_visit;
  if v.id is null or not public.rota_can_office(v.branch_id) then
    raise exception 'That visit could not be found.' using errcode = 'P0002';
  end if;
  update public.rota_visits set schedule_changed = false where id = p_visit;
end;
$$;

-- Who could go on this visit: refusal, DBS, home postcode (read from their address), preference
-- and continuity (their visits to this service user from 8 weeks back to 4 ahead). For the office's
-- picker; only people in the caller's rota branches.
create or replace function public.rota_visit_candidates(p_visit uuid)
returns table (person_id uuid, full_name text, job_title text, branch_id uuid, dbs text, refusal text,
               home_postcode text, preferred boolean, continuity integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v record; v_branches uuid[]; v_founder boolean;
begin
  select * into v from public.rota_visits where id = p_visit;
  if v.id is null or not public.rota_can_office(v.branch_id) then
    raise exception 'That visit could not be found.' using errcode = 'P0002';
  end if;
  v_branches := public.rota_office_branch_ids();
  v_founder := public.is_platform_admin();
  return query
    select pe.id, pe.full_name, pe.job_title, pe.branch_id,
           public.rota_dbs_state(pe.id, v.visit_date),
           public.rota_visit_refusal(p_visit, pe.id, null),
           upper((regexp_match(coalesce(pe.home_address, ''), '([A-Za-z]{1,2}[0-9][A-Za-z0-9]? ?[0-9][A-Za-z]{2})'))[1]),
           exists (select 1 from public.rota_su_carer_prefs p where p.service_user_id = v.service_user_id and p.person_id = pe.id and p.kind = 'preferred'),
           (select count(*)::int from public.rota_visit_assignments a join public.rota_visits o on o.id = a.visit_id
             where a.person_id = pe.id and a.status = 'active' and o.service_user_id = v.service_user_id
               and o.status <> 'cancelled' and o.visit_date between v.visit_date - 56 and v.visit_date + 28)
      from public.people pe
     where pe.company_id = v.company_id and pe.archived_at is null and pe.employment_status <> 'leaver'
       and (v_founder or pe.branch_id = any (v_branches))
     order by pe.full_name;
end;
$$;

-- ============================================================================================
-- 7. Publish covers visits too (0489's function, extended)
-- ============================================================================================

create or replace function public.rota_publish(p_branch uuid, p_from date, p_to date)
returns table (person_id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.rota_can_office(p_branch) then
    raise exception 'You cannot change the rota for that branch.' using errcode = '42501';
  end if;
  return query
    with pub as (
      update public.rota_shifts s set status = 'published', published_at = now(), published_by = auth.uid(), updated_by = auth.uid()
       where s.branch_id = p_branch and s.status = 'draft' and s.shift_date between p_from and p_to
      returning s.id
    ), pubv as (
      update public.rota_visits v set status = 'published', published_at = now(), published_by = auth.uid()
       where v.branch_id = p_branch and v.status = 'draft' and v.visit_date between p_from and p_to
      returning v.id
    )
    select a.person_id from public.rota_assignments a join pub on pub.id = a.shift_id where a.status = 'active'
    union
    select a.person_id from public.rota_visit_assignments a join pubv on pubv.id = a.visit_id where a.status = 'active';
end;
$$;

-- ============================================================================================
-- 8. A carer's own visits: name, address and time only (Phil's popup, 2026-10-15)
-- ============================================================================================

create or replace function public.rota_my_visits()
returns table (visit_id uuid, visit_date date, start_time time, end_time time, service_user_name text,
               address jsonb, paused boolean, colleagues integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.id, v.visit_date, v.start_time, v.end_time, su.full_name,
         jsonb_build_object('line1', su.address->>'line1', 'line2', su.address->>'line2',
                            'city', su.address->>'city', 'postcode', su.address->>'postcode'),
         public.rota_su_away(su.id, v.visit_date),
         (select count(*)::int - 1 from public.rota_visit_assignments o where o.visit_id = v.id and o.status = 'active')
    from public.rota_visit_assignments a
    join public.rota_visits v on v.id = a.visit_id
    join public.service_users su on su.id = v.service_user_id
   where a.person_id = any (public.rota_my_person_ids()) and a.status = 'active'
     and v.status = 'published'
     and v.visit_date between (now() at time zone 'Europe/London')::date and (now() at time zone 'Europe/London')::date + 27
   order by v.starts_at;
$$;

-- ============================================================================================
-- 9. Grants: internal rules are for the rota's own functions only (the 0490 rule)
-- ============================================================================================

revoke all on function public.rota_unavailable_reason_at(uuid, date, time, time) from public, anon, authenticated;
revoke all on function public.rota_unavailable_reason(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rota_person_busy(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rota_assign_refusal(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rota_su_away(uuid, date) from public, anon, authenticated;
revoke all on function public.rota_visit_refusal(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rota_visit_dbs_paired(uuid) from public, anon, authenticated;
revoke all on function public.rota_call_minutes(text, numeric) from public, anon, authenticated;
revoke all on function public.rota_generate_visits(uuid, date, date) from public, anon, authenticated;
grant execute on function public.rota_generate_visits(uuid, date, date) to service_role;

revoke all on function public.rota_refresh_visits(uuid) from public, anon;
grant execute on function public.rota_refresh_visits(uuid) to authenticated;
revoke all on function public.rota_save_call_time(uuid, smallint, text, text, smallint, time, integer) from public, anon;
grant execute on function public.rota_save_call_time(uuid, smallint, text, text, smallint, time, integer) to authenticated;
revoke all on function public.rota_visit_assign(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.rota_visit_assign(uuid, uuid, jsonb, text) to authenticated;
revoke all on function public.rota_visit_unassign(uuid, text) from public, anon;
grant execute on function public.rota_visit_unassign(uuid, text) to authenticated;
revoke all on function public.rota_visit_move(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rota_visit_move(uuid, uuid, jsonb) to authenticated;
revoke all on function public.rota_move_run(uuid, date, uuid, uuid) from public, anon;
grant execute on function public.rota_move_run(uuid, date, uuid, uuid) to authenticated;
revoke all on function public.rota_cancel_visit(uuid, text) from public, anon;
grant execute on function public.rota_cancel_visit(uuid, text) to authenticated;
revoke all on function public.rota_visit_clear_flag(uuid) from public, anon;
grant execute on function public.rota_visit_clear_flag(uuid) to authenticated;
revoke all on function public.rota_visit_candidates(uuid) from public, anon;
grant execute on function public.rota_visit_candidates(uuid) to authenticated;
revoke all on function public.rota_publish(uuid, date, date) from public, anon;
grant execute on function public.rota_publish(uuid, date, date) to authenticated;
revoke all on function public.rota_my_visits() from public, anon;
grant execute on function public.rota_my_visits() to authenticated;

-- ============================================================================================
-- 10. Live updates (new tables only) and company links
-- ============================================================================================

do $$
declare t text;
begin
  foreach t in array array['rota_call_times','rota_visits','rota_visit_assignments','rota_su_carer_prefs'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

select public.install_company_link_triggers();
