-- 0489 Rota and Visits (beta), Stage 1: the rota for shifts (Phil, 2026-10-15).
--
-- ADDITIVE ONLY: new tables and functions. No existing table, policy, trigger or function is
-- altered; nothing joins the supabase_realtime publication (live updates use the existing
-- Broadcast trigger function, attached to the NEW tables only). Existing tables are only read.
--
-- Every table: company_id and branch_id, RLS through rota_office_branch_ids() (office roles on
-- their branches, the module switched on) and, for carers, rota_my_person_ids(). Turning the
-- module off hides every row and deletes nothing.
--
-- The rules that refuse (decisions in docs/decisions/rota-visits.md) live in the database:
--   - Right to Work missing or expired on the shift date: refused, no override.
--   - DBS missing or lapsed: refused unless the latest DBS Pending Risk Assessment says they may
--     start (review not missed) AND the shift needs two or more people with someone on it whose
--     DBS is clear. On the adults' barred list: always refused.
--   - Unavailable (approved holiday, absence, parental leave, long term sick, a date the office
--     marked, outside their weekly pattern), a leaver or archived, or already on an overlapping
--     shift: refused.
-- Training and working time are warnings, worked out by the app and stored on the assignment.

-- ============================================================================================
-- 1. Access helpers (once per query lists, the 0480 pattern)
-- ============================================================================================

-- Branches where the caller may run the rota: Admin, RI, RM on every branch of their company;
-- Branch Manager and Supervisor on their own branches; only where the module is on.
create or replace function public.rota_office_branch_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) from (
    select ub.branch_id as id
      from public.profiles p join public.user_branches ub on ub.user_id = p.id
     where p.id = auth.uid() and p.status = 'active' and p.role in ('manager', 'supervisor')
    union
    select b.id
      from public.profiles p join public.branches b on b.company_id = p.company_id
     where p.id = auth.uid() and p.status = 'active'
       and p.role in ('company_admin', 'registered_individual', 'registered_manager')
  ) x
  join public.branches b2 on b2.id = x.id
  where public.company_module_on(b2.company_id, 'rota_visits');
$$;
revoke all on function public.rota_office_branch_ids() from public, anon;
grant execute on function public.rota_office_branch_ids() to authenticated;

-- The People records that are the caller's own (a carer's login), where the module is on.
create or replace function public.rota_my_person_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(pe.id), '{}'::uuid[])
    from public.people pe
   where pe.profile_id = auth.uid()
     and pe.archived_at is null
     and public.company_module_on(pe.company_id, 'rota_visits');
$$;
revoke all on function public.rota_my_person_ids() from public, anon;
grant execute on function public.rota_my_person_ids() to authenticated;

-- May the caller run the rota for this branch? (Founder included, module on.)
create or replace function public.rota_can_office(p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_branch = any (public.rota_office_branch_ids())
      or (public.is_platform_admin() and exists (
            select 1 from public.branches b
             where b.id = p_branch and public.company_module_on(b.company_id, 'rota_visits')));
$$;
revoke all on function public.rota_can_office(uuid) from public, anon;
grant execute on function public.rota_can_office(uuid) to authenticated;

-- ============================================================================================
-- 2. Tables
-- ============================================================================================

create table if not exists public.rota_shift_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  headcount integer not null default 1 check (headcount between 1 and 20),
  location text check (location is null or length(location) <= 120),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rota_shift_templates_company_idx on public.rota_shift_templates (company_id);
create index if not exists rota_shift_templates_branch_idx on public.rota_shift_templates (branch_id);

create table if not exists public.rota_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  template_id uuid references public.rota_shift_templates(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  -- Worked out from the date and times in Europe/London (trigger below), so the clock change is
  -- right. An end time at or before the start time finishes the next day.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  headcount integer not null default 1 check (headcount between 1 and 20),
  location text check (location is null or length(location) <= 120),
  notes text check (notes is null or length(notes) <= 500),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  published_at timestamptz,
  published_by uuid,
  cancelled_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists rota_shifts_company_idx on public.rota_shifts (company_id);
create index if not exists rota_shifts_branch_date_idx on public.rota_shifts (branch_id, shift_date);
create index if not exists rota_shifts_template_idx on public.rota_shifts (template_id);
create index if not exists rota_shifts_starts_idx on public.rota_shifts (company_id, starts_at);

create table if not exists public.rota_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_id uuid not null references public.rota_shifts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  via text not null default 'office' check (via in ('office', 'open_request', 'swap', 'handover', 'copy')),
  -- Training and working time warnings shown when it was made (never a block).
  warnings jsonb not null default '[]'::jsonb,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  removed_by uuid,
  removed_at timestamptz,
  removed_reason text
);
create unique index if not exists rota_assignments_one_active on public.rota_assignments (shift_id, person_id) where status = 'active';
create index if not exists rota_assignments_company_idx on public.rota_assignments (company_id);
create index if not exists rota_assignments_branch_idx on public.rota_assignments (branch_id);
create index if not exists rota_assignments_shift_idx on public.rota_assignments (shift_id);
create index if not exists rota_assignments_person_idx on public.rota_assignments (person_id, status);

-- Weekly pattern: when someone CAN work. No rows for a person means any time.
create table if not exists public.rota_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 Monday, 7 Sunday
  start_time time not null,
  end_time time not null, -- at or before start_time: runs into the next day
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists rota_availability_company_idx on public.rota_availability (company_id);
create index if not exists rota_availability_branch_idx on public.rota_availability (branch_id);
create index if not exists rota_availability_person_idx on public.rota_availability (person_id);

-- Dates someone cannot work (recorded by the office).
create table if not exists public.rota_unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text check (reason is null or length(reason) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists rota_unavailable_company_idx on public.rota_unavailable_dates (company_id);
create index if not exists rota_unavailable_branch_idx on public.rota_unavailable_dates (branch_id);
create index if not exists rota_unavailable_person_idx on public.rota_unavailable_dates (person_id, start_date);

-- Per person rota settings: the 48 hour opt out, ticked once (Phil, 2026-10-15).
create table if not exists public.rota_person_settings (
  person_id uuid primary key references public.people(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  opted_out_48h boolean not null default false,
  opted_out_set_at timestamptz,
  opted_out_set_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists rota_person_settings_company_idx on public.rota_person_settings (company_id);
create index if not exists rota_person_settings_branch_idx on public.rota_person_settings (branch_id);

-- A carer asking for an open shift.
create table if not exists public.rota_open_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_id uuid not null references public.rota_shifts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300)
);
create unique index if not exists rota_open_requests_one_pending on public.rota_open_requests (shift_id, person_id) where status = 'pending';
create index if not exists rota_open_requests_company_idx on public.rota_open_requests (company_id);
create index if not exists rota_open_requests_branch_idx on public.rota_open_requests (branch_id, status);
create index if not exists rota_open_requests_shift_idx on public.rota_open_requests (shift_id);
create index if not exists rota_open_requests_person_idx on public.rota_open_requests (person_id);

-- Every text the rota sends (publish, a change, an open shift offer): who, what, the result.
create table if not exists public.rota_texts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  shift_id uuid references public.rota_shifts(id) on delete set null,
  kind text not null check (kind in ('published', 'changed', 'offer')),
  result text not null, -- sent, or why not (no mobile, test company, opted out, no credits)
  sent_by uuid,
  sent_at timestamptz not null default now()
);
create index if not exists rota_texts_company_idx on public.rota_texts (company_id, sent_at desc);
create index if not exists rota_texts_branch_idx on public.rota_texts (branch_id);
create index if not exists rota_texts_person_idx on public.rota_texts (person_id);
create index if not exists rota_texts_shift_idx on public.rota_texts (shift_id);

-- ============================================================================================
-- 3. Shift times in Europe/London (own table's trigger only)
-- ============================================================================================

create or replace function public.rota_shift_instants()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.starts_at := (new.shift_date + new.start_time) at time zone 'Europe/London';
  new.ends_at := ((new.shift_date + case when new.end_time <= new.start_time then 1 else 0 end) + new.end_time)
                 at time zone 'Europe/London';
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.rota_shift_instants() from public, anon, authenticated;

drop trigger if exists rota_shift_instants on public.rota_shifts;
create trigger rota_shift_instants before insert or update of shift_date, start_time, end_time, break_minutes, headcount, location, notes, status
  on public.rota_shifts for each row execute function public.rota_shift_instants();

-- ============================================================================================
-- 4. RLS
-- ============================================================================================

alter table public.rota_shift_templates enable row level security;
alter table public.rota_shifts enable row level security;
alter table public.rota_assignments enable row level security;
alter table public.rota_availability enable row level security;
alter table public.rota_unavailable_dates enable row level security;
alter table public.rota_person_settings enable row level security;
alter table public.rota_open_requests enable row level security;
alter table public.rota_texts enable row level security;

-- Office read on every rota table; office write on the simple ones (templates, availability,
-- dates, settings). Shifts, assignments and requests are written only through the functions below.
do $$
declare t text;
begin
  foreach t in array array['rota_shift_templates','rota_shifts','rota_assignments','rota_availability',
                           'rota_unavailable_dates','rota_person_settings','rota_open_requests','rota_texts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_office_select', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
             or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')))$p$,
      t || '_office_select', t);
  end loop;
  foreach t in array array['rota_shift_templates','rota_availability','rota_unavailable_dates','rota_person_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_office_write', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
             or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')))
      with check ((branch_id = any ((select public.rota_office_branch_ids())::uuid[])
             or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')))
             %s)$p$,
      t || '_office_write', t,
      case when t = 'rota_shift_templates' then ''
           else format('and exists (select 1 from public.people pe where pe.id = %I.person_id and pe.branch_id = %I.branch_id and pe.company_id = %I.company_id)', t, t, t) end);
  end loop;
end $$;

-- Carers: their own assignments on published shifts, and those shifts. Both read one definer
-- list, so neither policy looks through the other table's RLS (which would loop).
create or replace function public.rota_my_shift_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct a.shift_id), '{}'::uuid[])
    from public.rota_assignments a join public.rota_shifts s on s.id = a.shift_id
   where a.person_id = any (public.rota_my_person_ids()) and s.status <> 'draft';
$$;
revoke all on function public.rota_my_shift_ids() from public, anon;
grant execute on function public.rota_my_shift_ids() to authenticated;

drop policy if exists rota_assignments_own_select on public.rota_assignments;
create policy rota_assignments_own_select on public.rota_assignments for select to authenticated
  using (person_id = any ((select public.rota_my_person_ids())::uuid[])
         and shift_id = any ((select public.rota_my_shift_ids())::uuid[]));

drop policy if exists rota_shifts_own_select on public.rota_shifts;
create policy rota_shifts_own_select on public.rota_shifts for select to authenticated
  using (id = any ((select public.rota_my_shift_ids())::uuid[]));

-- Carers: their own open shift requests.
drop policy if exists rota_open_requests_own_select on public.rota_open_requests;
create policy rota_open_requests_own_select on public.rota_open_requests for select to authenticated
  using (person_id = any ((select public.rota_my_person_ids())::uuid[]));

-- ============================================================================================
-- 5. The rules
-- ============================================================================================

-- DBS on a date: 'clear', 'barred', 'risk_ok' (no DBS, working under a Pending Risk Assessment
-- that says start and is in review), or 'red'. Mirrors lib/people/doc-gaps.ts and dbs-pending.ts.
create or replace function public.rota_dbs_state(p_person uuid, p_on date)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date;
  t record;
  v_disc record;
  v_pend record;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_missing boolean;
  v_lapsed boolean;
  v_applied date;
  v_cert_covers boolean;
  v_review_missed boolean;
begin
  select pe.start_date into v_start from public.people pe where pe.id = p_person;
  select pt.dbs_date, pt.enhanced_dbs_date into t from public.person_trackers pt where pt.person_id = p_person;

  -- Barred: the latest DBS Disclosure Risk Assessment recorded the adults' barred list, and it
  -- covers the certificate on file (a later certificate needs its own assessment).
  select e.answers->>'barred' as barred, e.answers->>'cert_issue_date' as cert into v_disc
    from public.evidence e join public.forms f on f.id = e.form_id
   where e.record_type = 'person' and e.record_id = p_person and f.key = 'dbs_disclosure'
   order by e.submitted_at desc limit 1;
  if found and v_disc.barred = 'barred' then
    -- PL/pgSQL reads an IF condition only up to its first THEN, so the CASE is worked out first.
    v_cert_covers := t.dbs_date is null
      or (case when v_disc.cert ~ '^\d{4}-\d{2}-\d{2}$' then v_disc.cert::date >= t.dbs_date else true end);
    if v_cert_covers then return 'barred'; end if;
  end if;

  v_missing := (t.dbs_date is null and t.enhanced_dbs_date is null)
               and (v_start is null or v_start <= p_on);
  v_lapsed := t.enhanced_dbs_date is not null and t.enhanced_dbs_date < p_on;
  if not v_missing and not v_lapsed then return 'clear'; end if;

  select e.answers->>'decision' as decision, e.answers->>'review_date' as review,
         e.answers->>'dbs_applied_on' as applied into v_pend
    from public.evidence e join public.forms f on f.id = e.form_id
   where e.record_type = 'person' and e.record_id = p_person and f.key = 'dbs_pending'
   order by e.submitted_at desc limit 1;
  if not found then return 'red'; end if;
  v_applied := case when v_pend.applied ~ '^\d{4}-\d{2}-\d{2}$' then v_pend.applied::date end;
  -- The certificate came in after it was applied for: the assessment has done its job, so it no
  -- longer covers a lapse.
  if t.dbs_date is not null and (v_applied is null or t.dbs_date >= v_applied) then return 'red'; end if;
  if v_pend.decision is distinct from 'start' then return 'red'; end if;
  v_review_missed := case when v_pend.review ~ '^\d{4}-\d{2}-\d{2}$' then v_pend.review::date < v_today else false end;
  if v_review_missed then return 'red'; end if;
  return 'risk_ok';
end;
$$;
revoke all on function public.rota_dbs_state(uuid, date) from public, anon;
grant execute on function public.rota_dbs_state(uuid, date) to authenticated;

-- Right to Work on a date: true when it is missing (after their start) or expired.
create or replace function public.rota_rtw_red(p_person uuid, p_on date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select (pt.rtw_limits is null and pt.rtw_expiry_date is null and (pe.start_date is null or pe.start_date <= p_on))
           or (pt.rtw_expiry_date is not null and pt.rtw_expiry_date < p_on)
      from public.people pe left join public.person_trackers pt on pt.person_id = pe.id
     where pe.id = p_person), true);
$$;
revoke all on function public.rota_rtw_red(uuid, date) from public, anon;
grant execute on function public.rota_rtw_red(uuid, date) to authenticated;

-- Why this person cannot work this shift because they are unavailable, or null.
create or replace function public.rota_unavailable_reason(p_person uuid, p_shift uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  pe record;
  v_dow int;
  v_has_pattern boolean;
  v_fits boolean;
  v_start int;
  v_end int;
begin
  select * into s from public.rota_shifts where id = p_shift;
  select * into pe from public.people where id = p_person;
  if pe.id is null then return 'That person could not be found.'; end if;
  pe.full_name := coalesce(nullif(btrim(pe.full_name), ''), 'This person');
  if pe.archived_at is not null or pe.employment_status = 'leaver' then
    return pe.full_name || ' has left, so cannot be put on the rota.';
  end if;
  if pe.employment_status in ('mat_leave', 'lts') and (pe.leave_since is null or pe.leave_since <= s.shift_date) then
    return pe.full_name || ' is on ' || case when pe.employment_status = 'lts' then 'long term sick' else 'parental leave' end || '.';
  end if;
  if exists (select 1 from public.holiday_requests h
              where h.person_id = p_person
                and ((h.status = 'approved' and s.shift_date between h.start_date and h.end_date)
                  or (h.status = 'pending' and h.change_kind is not null
                      and s.shift_date between h.previous_start_date and h.previous_end_date))) then
    return pe.full_name || ' is on holiday that day.';
  end if;
  if exists (select 1 from public.absence_events a
              where a.person_id = p_person and a.start_date <= s.shift_date
                and (coalesce(a.end_date, a.return_date - 1) is null or coalesce(a.end_date, a.return_date - 1) >= s.shift_date)) then
    return pe.full_name || ' is absent that day.';
  end if;
  if exists (select 1 from public.rota_unavailable_dates u
              where u.person_id = p_person and s.shift_date between u.start_date and u.end_date) then
    return pe.full_name || ' cannot work that day (marked unavailable).';
  end if;

  -- Weekly pattern: with any rows at all, the shift must fit inside one on its weekday.
  select exists (select 1 from public.rota_availability v where v.person_id = p_person) into v_has_pattern;
  if v_has_pattern then
    v_dow := extract(isodow from s.shift_date)::int;
    v_start := extract(hour from s.start_time)::int * 60 + extract(minute from s.start_time)::int;
    v_end := extract(hour from s.end_time)::int * 60 + extract(minute from s.end_time)::int;
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
revoke all on function public.rota_unavailable_reason(uuid, uuid) from public, anon;
grant execute on function public.rota_unavailable_reason(uuid, uuid) to authenticated;

-- Every refusal for putting this person on this shift, or null when they may go on it.
-- p_ignore: an assignment to leave out of the overlap and double up counts (a swap or handover).
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

  v_reason := public.rota_unavailable_reason(p_person, p_shift);
  if v_reason is not null then return v_reason; end if;

  if exists (select 1 from public.rota_assignments a join public.rota_shifts o on o.id = a.shift_id
              where a.person_id = p_person and a.status = 'active' and o.status <> 'cancelled'
                and o.id <> p_shift and a.id is distinct from p_ignore
                and o.starts_at < s.ends_at and o.ends_at > s.starts_at) then
    return pe.full_name || ' is already on another shift at that time.';
  end if;

  if public.rota_rtw_red(p_person, s.shift_date) then
    return pe.full_name || ' has no current Right to Work on file, so cannot be put on the rota.';
  end if;

  v_dbs := public.rota_dbs_state(p_person, s.shift_date);
  if v_dbs = 'barred' then
    return pe.full_name || ' is recorded on the barred list, so cannot be put on the rota.';
  end if;
  if v_dbs = 'red' then
    return pe.full_name || ' has no current DBS and no DBS Pending Risk Assessment that lets them start.';
  end if;
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
revoke all on function public.rota_assign_refusal(uuid, uuid, uuid) from public, anon;
grant execute on function public.rota_assign_refusal(uuid, uuid, uuid) to authenticated;

-- Is every person on this shift who has no DBS yet paired with someone whose DBS is clear?
create or replace function public.rota_shift_dbs_paired(p_shift uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.rota_assignments o join public.rota_shifts s on s.id = o.shift_id
                      where o.shift_id = p_shift and o.status = 'active'
                        and public.rota_dbs_state(o.person_id, s.shift_date) = 'risk_ok')
      or exists (select 1 from public.rota_assignments o join public.rota_shifts s on s.id = o.shift_id
                  where o.shift_id = p_shift and o.status = 'active'
                    and public.rota_dbs_state(o.person_id, s.shift_date) = 'clear');
$$;
revoke all on function public.rota_shift_dbs_paired(uuid) from public, anon;
grant execute on function public.rota_shift_dbs_paired(uuid) to authenticated;

-- Would removing this assignment leave someone without a DBS on their own? Returns the refusal.
create or replace function public.rota_removal_refusal(p_assignment uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  a record;
  s record;
begin
  select * into a from public.rota_assignments where id = p_assignment;
  select * into s from public.rota_shifts where id = a.shift_id;
  if public.rota_dbs_state(a.person_id, s.shift_date) <> 'clear' then return null; end if;
  if exists (select 1 from public.rota_assignments o
              where o.shift_id = a.shift_id and o.status = 'active' and o.id <> a.id
                and public.rota_dbs_state(o.person_id, s.shift_date) = 'risk_ok')
     and not exists (select 1 from public.rota_assignments o
              where o.shift_id = a.shift_id and o.status = 'active' and o.id <> a.id
                and public.rota_dbs_state(o.person_id, s.shift_date) = 'clear') then
    return 'Someone on this shift has no DBS yet and needs a colleague with a clear DBS. Take them off first, or put another person with a clear DBS on.';
  end if;
  return null;
end;
$$;
revoke all on function public.rota_removal_refusal(uuid) from public, anon;
grant execute on function public.rota_removal_refusal(uuid) to authenticated;

-- ============================================================================================
-- 6. Writes (every one checks the module, the caller's branch and the rules)
-- ============================================================================================

-- Create or change a shift. Returns the shift id. A change to an assigned shift re-checks every
-- person on it and is refused if any of them can no longer work it.
create or replace function public.rota_save_shift(
  p_id uuid, p_branch uuid, p_date date, p_start time, p_end time,
  p_break integer, p_headcount integer, p_location text, p_notes text, p_template uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_id uuid;
  r record;
  v_reason text;
  v_count int;
begin
  if not public.rota_can_office(p_branch) then
    raise exception 'You cannot change the rota for that branch.' using errcode = '42501';
  end if;
  select company_id into v_company from public.branches where id = p_branch;
  if p_date is null or p_start is null or p_end is null then
    raise exception 'A shift needs a date, a start and a finish.' using errcode = '22023';
  end if;
  if p_template is not null and not exists (select 1 from public.rota_shift_templates t where t.id = p_template and t.company_id = v_company) then
    raise exception 'That template could not be found.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.rota_shifts (company_id, branch_id, template_id, shift_date, start_time, end_time,
           starts_at, ends_at, break_minutes, headcount, location, notes, created_by, updated_by)
    values (v_company, p_branch, p_template, p_date, p_start, p_end, now(), now() + interval '1 minute',
           coalesce(p_break, 0), coalesce(p_headcount, 1), nullif(btrim(p_location), ''), nullif(btrim(p_notes), ''),
           auth.uid(), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  if not exists (select 1 from public.rota_shifts s where s.id = p_id and s.branch_id = p_branch and s.status <> 'cancelled') then
    raise exception 'That shift could not be found.' using errcode = 'P0002';
  end if;
  select count(*) into v_count from public.rota_assignments a where a.shift_id = p_id and a.status = 'active';
  if coalesce(p_headcount, 1) < v_count then
    raise exception 'This shift has % people on it. Take someone off before needing fewer.', v_count using errcode = '22023';
  end if;
  update public.rota_shifts set shift_date = p_date, start_time = p_start, end_time = p_end,
         break_minutes = coalesce(p_break, 0), headcount = coalesce(p_headcount, 1),
         location = nullif(btrim(p_location), ''), notes = nullif(btrim(p_notes), ''),
         template_id = p_template, updated_by = auth.uid()
   where id = p_id;
  -- Everyone on it must still be able to work it (each checked as if put on again).
  for r in select a.id, a.person_id from public.rota_assignments a where a.shift_id = p_id and a.status = 'active' loop
    v_reason := public.rota_assign_refusal(p_id, r.person_id, r.id);
    if v_reason is not null then
      raise exception '%', v_reason using errcode = '23514';
    end if;
  end loop;
  return p_id;
end;
$$;
revoke all on function public.rota_save_shift(uuid, uuid, date, time, time, integer, integer, text, text, uuid) from public, anon;
grant execute on function public.rota_save_shift(uuid, uuid, date, time, time, integer, integer, text, text, uuid) to authenticated;

-- Cancel a shift. Returns the people who were on it (the app tells them if it was published).
create or replace function public.rota_cancel_shift(p_id uuid, p_reason text)
returns table (person_id uuid, was_published boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  s record;
begin
  select * into s from public.rota_shifts where id = p_id;
  if s.id is null or not public.rota_can_office(s.branch_id) then
    raise exception 'That shift could not be found.' using errcode = 'P0002';
  end if;
  update public.rota_shifts set status = 'cancelled', cancelled_reason = nullif(btrim(p_reason), ''), updated_by = auth.uid()
   where id = p_id;
  return query
    update public.rota_assignments a set status = 'removed', removed_by = auth.uid(), removed_at = now(),
           removed_reason = 'Shift cancelled'
     where a.shift_id = p_id and a.status = 'active'
    returning a.person_id, s.status = 'published';
end;
$$;
revoke all on function public.rota_cancel_shift(uuid, text) from public, anon;
grant execute on function public.rota_cancel_shift(uuid, text) to authenticated;

-- Put someone on a shift. Refused by the rules above; warnings are stored with it.
create or replace function public.rota_assign(p_shift uuid, p_person uuid, p_warnings jsonb, p_via text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  v_reason text;
  v_id uuid;
begin
  select * into s from public.rota_shifts where id = p_shift for update;
  if s.id is null or not public.rota_can_office(s.branch_id) then
    raise exception 'That shift could not be found.' using errcode = 'P0002';
  end if;
  v_reason := public.rota_assign_refusal(p_shift, p_person, null);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  insert into public.rota_assignments (company_id, branch_id, shift_id, person_id, via, warnings, assigned_by)
  values (s.company_id, s.branch_id, p_shift, p_person,
          case when p_via in ('office', 'open_request', 'swap', 'handover', 'copy') then p_via else 'office' end,
          case when jsonb_typeof(p_warnings) = 'array' then p_warnings else '[]'::jsonb end, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.rota_assign(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.rota_assign(uuid, uuid, jsonb, text) to authenticated;

-- Take someone off a shift.
create or replace function public.rota_unassign(p_assignment uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  a record;
  v_reason text;
begin
  select * into a from public.rota_assignments where id = p_assignment and status = 'active';
  if a.id is null or not public.rota_can_office(a.branch_id) then
    raise exception 'That person is not on this shift.' using errcode = 'P0002';
  end if;
  v_reason := public.rota_removal_refusal(p_assignment);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  update public.rota_assignments set status = 'removed', removed_by = auth.uid(), removed_at = now(),
         removed_reason = nullif(btrim(p_reason), '')
   where id = p_assignment;
  return a.person_id;
end;
$$;
revoke all on function public.rota_unassign(uuid, text) from public, anon;
grant execute on function public.rota_unassign(uuid, text) to authenticated;

-- Hand a shift over: the person on it comes off and another goes on, in one step.
create or replace function public.rota_handover(p_assignment uuid, p_to_person uuid, p_warnings jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  a record;
  v_reason text;
  v_id uuid;
begin
  select * into a from public.rota_assignments where id = p_assignment and status = 'active';
  if a.id is null or not public.rota_can_office(a.branch_id) then
    raise exception 'That person is not on this shift.' using errcode = 'P0002';
  end if;
  v_reason := public.rota_assign_refusal(a.shift_id, p_to_person, p_assignment);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  update public.rota_assignments set status = 'removed', removed_by = auth.uid(), removed_at = now(),
         removed_reason = 'Handed over'
   where id = p_assignment;
  -- The new person must also keep any colleague without a DBS covered (checked as a removal).
  insert into public.rota_assignments (company_id, branch_id, shift_id, person_id, via, warnings, assigned_by)
  values (a.company_id, a.branch_id, a.shift_id, p_to_person, 'handover',
          case when jsonb_typeof(p_warnings) = 'array' then p_warnings else '[]'::jsonb end, auth.uid())
  returning id into v_id;
  if not public.rota_shift_dbs_paired(a.shift_id) then
    raise exception 'Someone on this shift has no DBS yet and needs a colleague with a clear DBS.' using errcode = '23514';
  end if;
  return v_id;
end;
$$;
revoke all on function public.rota_handover(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rota_handover(uuid, uuid, jsonb) to authenticated;

-- Swap two people between two shifts, in one step; both moves must pass every rule.
create or replace function public.rota_swap(p_a uuid, p_b uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  a record;
  b record;
  v_reason text;
begin
  select * into a from public.rota_assignments where id = p_a and status = 'active';
  select * into b from public.rota_assignments where id = p_b and status = 'active';
  if a.id is null or b.id is null or a.company_id <> b.company_id
     or not public.rota_can_office(a.branch_id) or not public.rota_can_office(b.branch_id) then
    raise exception 'Those shifts could not be found.' using errcode = 'P0002';
  end if;
  if a.person_id = b.person_id then raise exception 'That is the same person.' using errcode = '22023'; end if;
  update public.rota_assignments set status = 'removed', removed_by = auth.uid(), removed_at = now(), removed_reason = 'Swapped'
   where id in (p_a, p_b);
  v_reason := public.rota_assign_refusal(a.shift_id, b.person_id, null);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  insert into public.rota_assignments (company_id, branch_id, shift_id, person_id, via, assigned_by)
  values (a.company_id, a.branch_id, a.shift_id, b.person_id, 'swap', auth.uid());
  v_reason := public.rota_assign_refusal(b.shift_id, a.person_id, null);
  if v_reason is not null then raise exception '%', v_reason using errcode = '23514'; end if;
  insert into public.rota_assignments (company_id, branch_id, shift_id, person_id, via, assigned_by)
  values (b.company_id, b.branch_id, b.shift_id, a.person_id, 'swap', auth.uid());
  if not public.rota_shift_dbs_paired(a.shift_id) or not public.rota_shift_dbs_paired(b.shift_id) then
    raise exception 'That swap would leave someone without a DBS on a shift with no colleague whose DBS is clear.' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.rota_swap(uuid, uuid) from public, anon;
grant execute on function public.rota_swap(uuid, uuid) to authenticated;

-- Publish the drafts of a branch between two dates. Returns the people on them (to be told).
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
    )
    select distinct a.person_id from public.rota_assignments a join pub on pub.id = a.shift_id where a.status = 'active';
end;
$$;
revoke all on function public.rota_publish(uuid, date, date) from public, anon;
grant execute on function public.rota_publish(uuid, date, date) to authenticated;

-- Copy one week of a branch to another week, as drafts, with the same people where every rule
-- still allows it (anyone refused is left off and the slot stays open). Returns the counts.
-- Running it twice does not duplicate: a shift already copied there (same template or times,
-- same date, same location) is skipped.
create or replace function public.rota_copy_week(p_branch uuid, p_from_monday date, p_to_monday date)
returns table (shifts_copied integer, people_copied integer, people_left_off integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  a record;
  v_new uuid;
  v_shifts int := 0;
  v_people int := 0;
  v_off int := 0;
  v_offset int;
begin
  if not public.rota_can_office(p_branch) then
    raise exception 'You cannot change the rota for that branch.' using errcode = '42501';
  end if;
  if extract(isodow from p_from_monday) <> 1 or extract(isodow from p_to_monday) <> 1 or p_from_monday = p_to_monday then
    raise exception 'Choose two different weeks.' using errcode = '22023';
  end if;
  v_offset := p_to_monday - p_from_monday;
  for s in select * from public.rota_shifts
            where branch_id = p_branch and status <> 'cancelled'
              and shift_date between p_from_monday and p_from_monday + 6
            order by shift_date, start_time loop
    if exists (select 1 from public.rota_shifts d
                where d.branch_id = p_branch and d.status <> 'cancelled'
                  and d.shift_date = s.shift_date + v_offset and d.start_time = s.start_time and d.end_time = s.end_time
                  and d.location is not distinct from s.location) then
      continue;
    end if;
    insert into public.rota_shifts (company_id, branch_id, template_id, shift_date, start_time, end_time,
           starts_at, ends_at, break_minutes, headcount, location, notes, created_by, updated_by)
    values (s.company_id, s.branch_id, s.template_id, s.shift_date + v_offset, s.start_time, s.end_time,
           now(), now() + interval '1 minute', s.break_minutes, s.headcount, s.location, s.notes, auth.uid(), auth.uid())
    returning id into v_new;
    v_shifts := v_shifts + 1;
    -- People with a clear DBS first, so a colleague without one can be paired.
    for a in select x.person_id from public.rota_assignments x
              where x.shift_id = s.id and x.status = 'active'
              order by (public.rota_dbs_state(x.person_id, s.shift_date + v_offset) = 'clear') desc loop
      if public.rota_assign_refusal(v_new, a.person_id, null) is null then
        insert into public.rota_assignments (company_id, branch_id, shift_id, person_id, via, assigned_by)
        values (s.company_id, s.branch_id, v_new, a.person_id, 'copy', auth.uid());
        v_people := v_people + 1;
      else
        v_off := v_off + 1;
      end if;
    end loop;
  end loop;
  return query select v_shifts, v_people, v_off;
end;
$$;
revoke all on function public.rota_copy_week(uuid, date, date) from public, anon;
grant execute on function public.rota_copy_week(uuid, date, date) to authenticated;

-- ============================================================================================
-- 7. Carers and open shifts
-- ============================================================================================

-- The open shifts a carer may ask for: published, not full, in their own branch, from today,
-- and ones they could actually work (every rule passes).
create or replace function public.rota_my_open_shifts()
returns table (shift_id uuid, shift_date date, start_time time, end_time time, location text,
               branch_name text, requested boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.shift_date, s.start_time, s.end_time, s.location, b.name,
         exists (select 1 from public.rota_open_requests r where r.shift_id = s.id and r.person_id = me.id and r.status = 'pending')
    from public.people me
    join public.rota_shifts s on s.branch_id = me.branch_id and s.company_id = me.company_id
    join public.branches b on b.id = s.branch_id
   where me.id = any (public.rota_my_person_ids())
     and s.status = 'published'
     and s.shift_date >= (now() at time zone 'Europe/London')::date
     and (select count(*) from public.rota_assignments a where a.shift_id = s.id and a.status = 'active') < s.headcount
     and public.rota_assign_refusal(s.id, me.id, null) is null
   order by s.shift_date, s.start_time
   limit 50;
$$;
revoke all on function public.rota_my_open_shifts() from public, anon;
grant execute on function public.rota_my_open_shifts() to authenticated;

-- A carer asks for an open shift. Idempotent: asking twice keeps one request.
create or replace function public.rota_request_open_shift(p_shift uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  me record;
  s record;
  v_id uuid;
begin
  select * into s from public.rota_shifts where id = p_shift;
  select pe.* into me from public.people pe
   where pe.id = any (public.rota_my_person_ids()) and pe.branch_id = s.branch_id limit 1;
  if me.id is null or s.id is null or s.status <> 'published' then
    raise exception 'That shift is not open to you.' using errcode = 'P0002';
  end if;
  if public.rota_assign_refusal(p_shift, me.id, null) is not null then
    raise exception 'You cannot take that shift: %', public.rota_assign_refusal(p_shift, me.id, null) using errcode = '23514';
  end if;
  select id into v_id from public.rota_open_requests where shift_id = p_shift and person_id = me.id and status = 'pending';
  if v_id is not null then return v_id; end if;
  insert into public.rota_open_requests (company_id, branch_id, shift_id, person_id)
  values (s.company_id, s.branch_id, p_shift, me.id) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.rota_request_open_shift(uuid) from public, anon;
grant execute on function public.rota_request_open_shift(uuid) to authenticated;

-- A carer withdraws their own pending request.
create or replace function public.rota_withdraw_open_request(p_request uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.rota_open_requests set status = 'withdrawn', decided_at = now()
   where id = p_request and status = 'pending' and person_id = any (public.rota_my_person_ids());
  if not found then raise exception 'That request could not be found.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.rota_withdraw_open_request(uuid) from public, anon;
grant execute on function public.rota_withdraw_open_request(uuid) to authenticated;

-- The office approves (puts them on, through every rule) or declines a request.
create or replace function public.rota_decide_open_request(p_request uuid, p_approve boolean, p_note text, p_warnings jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_assignment uuid;
begin
  select * into r from public.rota_open_requests where id = p_request and status = 'pending' for update;
  if r.id is null or not public.rota_can_office(r.branch_id) then
    raise exception 'That request could not be found.' using errcode = 'P0002';
  end if;
  if p_approve then
    v_assignment := public.rota_assign(r.shift_id, r.person_id, p_warnings, 'open_request');
  end if;
  update public.rota_open_requests set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = p_request;
  return v_assignment;
end;
$$;
revoke all on function public.rota_decide_open_request(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.rota_decide_open_request(uuid, boolean, text, jsonb) to authenticated;

-- ============================================================================================
-- 8. Live updates on the company's private channel (new tables only), and company links
-- ============================================================================================

do $$
declare t text;
begin
  foreach t in array array['rota_shift_templates','rota_shifts','rota_assignments','rota_availability',
                           'rota_unavailable_dates','rota_person_settings','rota_open_requests'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

-- Records stay in their own company (0443).
select public.install_company_link_triggers();
