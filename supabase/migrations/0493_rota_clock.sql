-- Rota and Visits Stage 3: clock in and out with location (Phil's popups, 2026-10-16;
-- docs/decisions/rota-visits.md, Stage 3 decisions; docs/project/rota-offline-design.md).
--
-- Additive only: three new tables, new functions, no change to any existing table, view, policy,
-- trigger or function, and nothing added to the supabase_realtime publication (live updates go
-- through the existing Broadcast trigger function, as in 0489 and 0491).
--
--   rota_places          a map point and radius for each service user's home and each branch
--                        office, with its QR token (printed sheet, NFC sticker) and text code.
--   rota_clock_events    one row per clock in or out. event_id is made on the phone and is the
--                        de-duplication key: the same event sent twice is kept once.
--   rota_clock_problems  events the server refused, kept for the office (never dropped).
--
-- Carers never read rota_places (the QR token must stay secret): their phone gets a map point and
-- radius through rota_my_day only. Every write goes through a guarded function.

-- ============================================================================================
-- 1. Tables
-- ============================================================================================

create table if not exists public.rota_places (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid references public.service_users(id) on delete cascade,
  for_branch boolean not null default false,
  lat double precision,
  lng double precision,
  radius_m integer not null default 200 check (radius_m between 25 and 2000),
  source text not null default 'postcode' check (source in ('postcode', 'map', 'on_site')),
  postcode text,
  qr_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  text_code text not null,
  set_by uuid,
  set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((service_user_id is not null) <> for_branch),
  check ((lat is null) = (lng is null)),
  check (lat is null or (lat between -90 and 90 and lng between -180 and 180))
);
create unique index if not exists rota_places_su_key on public.rota_places (service_user_id) where service_user_id is not null;
create unique index if not exists rota_places_branch_key on public.rota_places (branch_id) where for_branch;
create unique index if not exists rota_places_qr_key on public.rota_places (qr_token);
create unique index if not exists rota_places_code_key on public.rota_places (company_id, text_code);
create index if not exists rota_places_company_branch on public.rota_places (company_id, branch_id);

create table if not exists public.rota_clock_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  visit_id uuid references public.rota_visits(id) on delete cascade,
  shift_id uuid references public.rota_shifts(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  method text not null check (method in ('gps', 'qr', 'nfc', 'text', 'office')),
  phone_time timestamptz,
  server_time timestamptz not null default now(),
  happened_at timestamptz not null,
  clock_skew_seconds integer,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  distance_m integer,
  place_id uuid references public.rota_places(id) on delete set null,
  location text not null check (location in ('inside', 'outside', 'unclear', 'proved', 'text', 'office')),
  reason_code text check (reason_code in ('gps_wrong', 'met_elsewhere', 'poor_signal', 'other')),
  reason_text text check (reason_text is null or length(reason_text) <= 500),
  flags text[] not null default '{}',
  device_id text check (device_id is null or length(device_id) <= 100),
  device_seq integer,
  recorded_by uuid,
  added_by uuid,
  added_reason text check (added_reason is null or length(added_reason) <= 500),
  position_purged_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(visit_id, shift_id) = 1)
);
create unique index if not exists rota_clock_events_event_key on public.rota_clock_events (event_id);
create index if not exists rota_clock_events_visit on public.rota_clock_events (visit_id) where visit_id is not null;
create index if not exists rota_clock_events_shift on public.rota_clock_events (shift_id) where shift_id is not null;
create index if not exists rota_clock_events_person on public.rota_clock_events (person_id, happened_at);
create index if not exists rota_clock_events_branch on public.rota_clock_events (company_id, branch_id, happened_at);
create index if not exists rota_clock_events_place on public.rota_clock_events (place_id) where place_id is not null;
create index if not exists rota_clock_events_positions on public.rota_clock_events (happened_at) where lat is not null;

create table if not exists public.rota_clock_problems (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  profile_id uuid,
  event_id uuid,
  event jsonb not null,
  reason text not null,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists rota_clock_problems_event_key on public.rota_clock_problems (event_id) where event_id is not null;
create index if not exists rota_clock_problems_company on public.rota_clock_problems (company_id, branch_id, created_at);
create index if not exists rota_clock_problems_person on public.rota_clock_problems (person_id) where person_id is not null;

-- ============================================================================================
-- 2. Row level security: office reads its branches; a carer reads only their own clock records
-- ============================================================================================

alter table public.rota_places enable row level security;
alter table public.rota_clock_events enable row level security;
alter table public.rota_clock_problems enable row level security;

drop policy if exists rota_places_office_read on public.rota_places;
create policy rota_places_office_read on public.rota_places for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

drop policy if exists rota_clock_events_read on public.rota_clock_events;
create policy rota_clock_events_read on public.rota_clock_events for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or person_id = any ((select public.rota_my_person_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

drop policy if exists rota_clock_problems_office_read on public.rota_clock_problems;
create policy rota_clock_problems_office_read on public.rota_clock_problems for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

-- ============================================================================================
-- 3. Small helpers (internal: revoked from every signed in role)
-- ============================================================================================

-- Straight line metres between two points (haversine, mean Earth radius).
create or replace function public.rota_metres_between(p_lat1 double precision, p_lng1 double precision,
                                                      p_lat2 double precision, p_lng2 double precision)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select round(2 * 6371008.8 * asin(least(1, sqrt(
           power(sin(radians(p_lat2 - p_lat1) / 2), 2)
           + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)))))::integer;
$$;

-- A UK mobile as digits with the country code (07700 900123, +44 7700 900123 and 447700900123
-- all become 447700900123), so a text's sender matches however the mobile was typed.
create or replace function public.rota_uk_mobile_digits(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
           when d is null or d = '' then null
           when d like '0044%' then substr(d, 3)
           when d like '44%' then d
           when d like '0%' then '44' || substr(d, 2)
           else d
         end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- A new text code, unique in the company: five letters and digits, without the ones that are
-- easily misread (0, O, 1, I, L).
create or replace function public.rota_new_text_code(p_company uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_code text; i int;
begin
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rota_places where company_id = p_company and text_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- The place for a service user's home, made if it does not exist yet (no map point until the
-- postcode is looked up or the office sets it).
create or replace function public.rota_place_for_su(p_su uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare su record; v_id uuid;
begin
  select id into v_id from public.rota_places where service_user_id = p_su;
  if v_id is not null then return v_id; end if;
  select id, company_id, branch_id into su from public.service_users where id = p_su;
  if su.id is null or su.branch_id is null then return null; end if;
  insert into public.rota_places (company_id, branch_id, service_user_id, text_code)
  values (su.company_id, su.branch_id, su.id, public.rota_new_text_code(su.company_id))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.rota_places where service_user_id = p_su; end if;
  return v_id;
end;
$$;

-- The place for a branch office, made if it does not exist yet.
create or replace function public.rota_place_for_branch(p_branch uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare b record; v_id uuid;
begin
  select id into v_id from public.rota_places where branch_id = p_branch and for_branch;
  if v_id is not null then return v_id; end if;
  select id, company_id into b from public.branches where id = p_branch;
  if b.id is null then return null; end if;
  insert into public.rota_places (company_id, branch_id, for_branch, text_code)
  values (b.company_id, b.id, true, public.rota_new_text_code(b.company_id))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.rota_places where branch_id = p_branch and for_branch; end if;
  return v_id;
end;
$$;

-- Record one clock event once all the facts are known. Shared by the phone, text and office
-- paths so the rules (flags, location, the place's distance) live in one place.
create or replace function public.rota_clock_record(
  p_event_id uuid, p_person uuid, p_visit uuid, p_shift uuid, p_kind text, p_method text,
  p_phone_time timestamptz, p_happened timestamptz, p_skew integer,
  p_lat double precision, p_lng double precision, p_accuracy double precision,
  p_qr_token text, p_reason_code text, p_reason_text text,
  p_device_id text, p_device_seq integer, p_recorded_by uuid, p_added_by uuid, p_added_reason text,
  p_extra_flags text[])
returns table (location text, flags text[], distance_m integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_company uuid; v_branch uuid; v_su uuid; v_status text; v_starts timestamptz;
  v_place uuid; pl record; v_flags text[] := coalesce(p_extra_flags, '{}'); v_loc text; v_dist integer;
  v_assigned text;
begin
  if p_visit is not null then
    select v.company_id, v.branch_id, v.service_user_id, v.status, v.starts_at
      into v_company, v_branch, v_su, v_status, v_starts
      from public.rota_visits v where v.id = p_visit;
    select a.status into v_assigned from public.rota_visit_assignments a
     where a.visit_id = p_visit and a.person_id = p_person order by (a.status = 'active') desc, a.assigned_at desc limit 1;
    v_place := public.rota_place_for_su(v_su);
  else
    select s.company_id, s.branch_id, s.status, s.starts_at
      into v_company, v_branch, v_status, v_starts
      from public.rota_shifts s where s.id = p_shift;
    select a.status into v_assigned from public.rota_assignments a
     where a.shift_id = p_shift and a.person_id = p_person order by (a.status = 'active') desc, a.assigned_at desc limit 1;
    v_place := public.rota_place_for_branch(v_branch);
  end if;

  -- The world changed while the phone was offline: the care still happened, so it is kept and
  -- flagged for the office (offline design, section 6).
  if v_assigned is distinct from 'active' then v_flags := v_flags || 'moved'::text; end if;
  if v_status = 'cancelled' then v_flags := v_flags || 'cancelled'::text; end if;
  if v_status = 'draft' then v_flags := v_flags || 'not_published'::text; end if;
  if p_kind = 'in' and p_happened < v_starts - interval '30 minutes' then v_flags := v_flags || 'early'::text; end if;
  if p_kind = 'out' and not exists (
       select 1 from public.rota_clock_events e
        where e.person_id = p_person and e.kind = 'in'
          and e.visit_id is not distinct from p_visit and e.shift_id is not distinct from p_shift) then
    v_flags := v_flags || 'no_clock_in'::text;
  end if;
  if exists (select 1 from public.rota_clock_events e
              where e.person_id = p_person and e.kind = p_kind
                and e.visit_id is not distinct from p_visit and e.shift_id is not distinct from p_shift) then
    v_flags := v_flags || 'repeat'::text;
  end if;

  select * into pl from public.rota_places where id = v_place;
  if p_method = 'office' then
    v_loc := 'office';
  elsif p_method = 'text' then
    v_loc := 'text';
  else
    if p_lat is not null and pl.lat is not null then
      v_dist := public.rota_metres_between(p_lat, p_lng, pl.lat, pl.lng);
    end if;
    if p_method in ('qr', 'nfc') then
      if p_qr_token is not null and pl.id is not null and p_qr_token = pl.qr_token then
        v_loc := 'proved';
      else
        v_flags := v_flags || 'wrong_code'::text;
      end if;
    end if;
    if v_loc is null then
      if pl.lat is null then
        v_loc := 'unclear'; v_flags := v_flags || 'no_map_point'::text;
      elsif p_lat is null or p_accuracy is null or p_accuracy > pl.radius_m then
        v_loc := 'unclear';
      elsif v_dist <= pl.radius_m then
        v_loc := 'inside';
      else
        v_loc := 'outside';
        if p_reason_code is null then v_flags := v_flags || 'no_reason'::text; end if;
      end if;
    end if;
  end if;

  insert into public.rota_clock_events (
    event_id, company_id, branch_id, person_id, visit_id, shift_id, kind, method,
    phone_time, happened_at, clock_skew_seconds, lat, lng, accuracy_m, distance_m, place_id,
    location, reason_code, reason_text, flags, device_id, device_seq, recorded_by, added_by, added_reason)
  values (
    p_event_id, v_company, v_branch, p_person, p_visit, p_shift, p_kind, p_method,
    p_phone_time, p_happened, p_skew, p_lat, p_lng, p_accuracy, v_dist, v_place,
    v_loc, case when v_loc = 'outside' then p_reason_code end,
    case when v_loc = 'outside' and p_reason_code = 'other' then nullif(btrim(p_reason_text), '') end,
    (select coalesce(array_agg(distinct f order by f), '{}') from unnest(v_flags) f),
    p_device_id, p_device_seq, p_recorded_by, p_added_by, p_added_reason);

  location := v_loc;
  flags := (select coalesce(array_agg(distinct f order by f), '{}') from unnest(v_flags) f);
  distance_m := v_dist;
  return next;
end;
$$;

-- ============================================================================================
-- 4. The carer's day, for the phone to keep (offline design, section 1)
-- ============================================================================================

-- Their own published visits and shifts from yesterday to tomorrow (a night shift crosses
-- midnight), each with its map point and radius (never the QR token), whether it is paused, and
-- what they have already clocked.
create or replace function public.rota_my_day()
returns table (target_kind text, target_id uuid, branch_id uuid, starts_at timestamptz, ends_at timestamptz,
               title text, address text, place_lat double precision, place_lng double precision,
               radius_m integer, paused boolean, clocked_in_at timestamptz, clocked_out_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select unnest(public.rota_my_person_ids()) as person_id),
  today as (select (now() at time zone 'Europe/London')::date as d)
  select 'visit', v.id, v.branch_id, v.starts_at, v.ends_at, su.full_name,
         concat_ws(', ', nullif(su.address->>'line1', ''), nullif(su.address->>'line2', ''),
                   nullif(su.address->>'city', ''), nullif(su.address->>'postcode', '')),
         pl.lat, pl.lng, coalesce(pl.radius_m, 200),
         public.rota_su_away(su.id, v.visit_date),
         (select min(e.happened_at) from public.rota_clock_events e where e.visit_id = v.id and e.person_id = a.person_id and e.kind = 'in'),
         (select max(e.happened_at) from public.rota_clock_events e where e.visit_id = v.id and e.person_id = a.person_id and e.kind = 'out')
    from me
    join public.rota_visit_assignments a on a.person_id = me.person_id and a.status = 'active'
    join public.rota_visits v on v.id = a.visit_id and v.status = 'published'
    join public.service_users su on su.id = v.service_user_id
    left join public.rota_places pl on pl.service_user_id = su.id
   where v.visit_date between (select d from today) - 1 and (select d from today) + 1
  union all
  select 'shift', s.id, s.branch_id, s.starts_at, s.ends_at, coalesce(nullif(s.location, ''), b.name),
         b.address, pl.lat, pl.lng, coalesce(pl.radius_m, 200), false,
         (select min(e.happened_at) from public.rota_clock_events e where e.shift_id = s.id and e.person_id = a.person_id and e.kind = 'in'),
         (select max(e.happened_at) from public.rota_clock_events e where e.shift_id = s.id and e.person_id = a.person_id and e.kind = 'out')
    from me
    join public.rota_assignments a on a.person_id = me.person_id and a.status = 'active'
    join public.rota_shifts s on s.id = a.shift_id and s.status = 'published'
    join public.branches b on b.id = s.branch_id
    left join public.rota_places pl on pl.branch_id = s.branch_id and pl.for_branch
   where s.shift_date between (select d from today) - 1 and (select d from today) + 1
   order by 4;
$$;

-- The visit or shift a scanned QR code (or NFC sticker) is for: the carer's own published visit
-- or shift at that place, open now (30 minutes before the start until 3 hours after the end).
-- Answers only for the carer's own; the token itself is never returned.
create or replace function public.rota_my_target_for_code(p_token text)
returns table (target_kind text, target_id uuid, title text, starts_at timestamptz, ends_at timestamptz,
               clocked_in boolean, clocked_out boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pl as (select * from public.rota_places where qr_token = p_token),
  me as (select unnest(public.rota_my_person_ids()) as person_id)
  select * from (
    select 'visit'::text, v.id, su.full_name, v.starts_at, v.ends_at,
           exists (select 1 from public.rota_clock_events e where e.visit_id = v.id and e.person_id = a.person_id and e.kind = 'in'),
           exists (select 1 from public.rota_clock_events e where e.visit_id = v.id and e.person_id = a.person_id and e.kind = 'out')
      from pl join public.rota_visits v on v.service_user_id = pl.service_user_id and v.status = 'published'
      join public.service_users su on su.id = v.service_user_id
      join public.rota_visit_assignments a on a.visit_id = v.id and a.status = 'active'
      join me on me.person_id = a.person_id
     where now() between v.starts_at - interval '30 minutes' and v.ends_at + interval '3 hours'
    union all
    select 'shift'::text, s.id, coalesce(nullif(s.location, ''), 'Shift'), s.starts_at, s.ends_at,
           exists (select 1 from public.rota_clock_events e where e.shift_id = s.id and e.person_id = a.person_id and e.kind = 'in'),
           exists (select 1 from public.rota_clock_events e where e.shift_id = s.id and e.person_id = a.person_id and e.kind = 'out')
      from pl join public.rota_shifts s on s.branch_id = pl.branch_id and pl.for_branch and s.status = 'published'
      join public.rota_assignments a on a.shift_id = s.id and a.status = 'active'
      join me on me.person_id = a.person_id
     where now() between s.starts_at - interval '30 minutes' and s.ends_at + interval '3 hours'
  ) x
  order by abs(extract(epoch from (x.starts_at - now())))
  limit 1;
$$;

-- ============================================================================================
-- 5. The phone sends its outbox (offline design, sections 3 to 6)
-- ============================================================================================

-- Each event once: Accepted, Already had it (duplicate), or Refused with the reason (and kept in
-- rota_clock_problems for the office). One bad event never stops the rest of the batch.
create or replace function public.rota_clock_submit(p_events jsonb, p_phone_now timestamptz)
returns table (event_id uuid, result text, reason text, location text, flags text[])
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  ev jsonb; v_event uuid; v_kind text; v_target_kind text; v_target uuid; v_method text;
  v_phone timestamptz; v_skew integer; v_happened timestamptz; v_company uuid; v_branch uuid;
  v_person uuid; v_reason text; v_flags text[]; r record; v_mine uuid[];
  v_lat double precision; v_lng double precision; v_acc double precision;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200 then
    raise exception 'A batch is a list of up to 200 records.' using errcode = '22023';
  end if;
  v_mine := public.rota_my_person_ids();
  v_skew := case when p_phone_now is null then null
                 else round(extract(epoch from (now() - p_phone_now)))::integer end;

  for ev in select * from jsonb_array_elements(p_events) loop
    v_event := null; v_reason := null; v_company := null; v_branch := null; v_person := null;
    begin
      v_event := (ev->>'event_id')::uuid;
      if v_event is null then raise exception 'The record has no id.' using errcode = '22023'; end if;

      if exists (select 1 from public.rota_clock_events e where e.event_id = v_event) then
        event_id := v_event; result := 'duplicate'; reason := null; location := null; flags := null;
        return next; continue;
      end if;

      v_kind := ev->>'kind';
      v_target_kind := ev->>'target_kind';
      v_target := (ev->>'target_id')::uuid;
      v_method := coalesce(ev->>'method', 'gps');
      v_phone := (ev->>'phone_time')::timestamptz;
      if v_kind not in ('in', 'out') or v_target_kind not in ('visit', 'shift') or v_target is null
         or v_method not in ('gps', 'qr', 'nfc') or v_phone is null then
        raise exception 'The record is not complete.' using errcode = '22023';
      end if;

      if v_target_kind = 'visit' then
        select v.company_id, v.branch_id into v_company, v_branch from public.rota_visits v where v.id = v_target;
      else
        select s.company_id, s.branch_id into v_company, v_branch from public.rota_shifts s where s.id = v_target;
      end if;
      if v_company is null then raise exception 'That visit or shift could not be found.' using errcode = 'P0002'; end if;

      -- The signed in carer, in that company. Never anybody else's record (offline design, 7).
      select pe.id into v_person from public.people pe where pe.id = any (v_mine) and pe.company_id = v_company limit 1;
      if v_person is null then raise exception 'This record is not for the person signed in.' using errcode = '42501'; end if;

      -- They must have been on it at some point (moved since is accepted and flagged).
      if v_target_kind = 'visit' and not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v_target and a.person_id = v_person)
         or v_target_kind = 'shift' and not exists (select 1 from public.rota_assignments a where a.shift_id = v_target and a.person_id = v_person) then
        raise exception 'That visit or shift was never yours.' using errcode = '42501';
      end if;

      v_happened := v_phone + make_interval(secs => coalesce(v_skew, 0));
      v_flags := '{}';
      if v_skew is not null and abs(v_skew) > 300 then v_flags := v_flags || 'phone_clock'::text; end if;
      if now() - v_happened > interval '10 minutes' then v_flags := v_flags || 'offline'::text; end if;
      if v_happened > now() + interval '5 minutes' then
        raise exception 'The record is dated in the future.' using errcode = '22023';
      end if;

      v_lat := nullif(ev->>'lat', '')::double precision;
      v_lng := nullif(ev->>'lng', '')::double precision;
      v_acc := nullif(ev->>'accuracy', '')::double precision;
      if v_lat is not null and (v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180) then
        v_lat := null; v_lng := null; v_acc := null;
      end if;

      select * into r from public.rota_clock_record(
        v_event, v_person,
        case when v_target_kind = 'visit' then v_target end,
        case when v_target_kind = 'shift' then v_target end,
        v_kind, v_method, v_phone, v_happened, v_skew, v_lat, v_lng, v_acc,
        nullif(ev->>'qr_token', ''),
        case when ev->>'reason_code' in ('gps_wrong', 'met_elsewhere', 'poor_signal', 'other') then ev->>'reason_code' end,
        left(ev->>'reason_text', 500),
        left(ev->>'device_id', 100), nullif(ev->>'device_seq', '')::integer,
        auth.uid(), null, null, v_flags);

      event_id := v_event; result := 'accepted'; reason := null; location := r.location; flags := r.flags;
      return next;
    exception when others then
      if sqlstate = '23505' then
        -- Two sends of the same record at the same moment: the other one kept it.
        event_id := v_event; result := 'duplicate'; reason := null; location := null; flags := null;
        return next; continue;
      end if;
      v_reason := sqlerrm;
      begin
        insert into public.rota_clock_problems (company_id, branch_id, person_id, profile_id, event_id, event, reason)
        values (coalesce(v_company, (select p.company_id from public.profiles p where p.id = auth.uid())),
                v_branch, v_person, auth.uid(), v_event, ev, v_reason)
        on conflict do nothing;
      exception when others then
        null; -- the refusal is still returned to the phone, which keeps the record
      end;
      event_id := v_event; result := 'refused'; reason := v_reason; location := null; flags := null;
      return next;
    end;
  end loop;
end;
$$;

-- ============================================================================================
-- 6. Clock in by text (Phil, 2026-10-16): IN <code> or OUT <code> from the carer's own mobile
-- ============================================================================================

-- Called only by the inbound text route (service role). The message's Twilio id makes the event
-- id, so a second delivery of the same text is kept once.
create or replace function public.rota_clock_by_text(p_from text, p_kind text, p_code text, p_sid text)
returns table (result text, message text, company_id uuid, person_id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_digits text := public.rota_uk_mobile_digits(p_from);
  pl record; v_person uuid; v_people int; v_visit uuid; v_shift uuid; v_title text; v_starts timestamptz;
  v_event uuid := md5('rota-text:' || coalesce(p_sid, ''))::uuid; r record;
begin
  if p_kind not in ('in', 'out') or v_digits is null or p_sid is null then
    result := 'ignored'; message := null; return next; return;
  end if;
  if exists (select 1 from public.rota_clock_events e where e.event_id = v_event) then
    result := 'duplicate'; message := null; return next; return;
  end if;

  select * into pl from public.rota_places p
   where p.text_code = upper(btrim(p_code)) and public.company_module_on(p.company_id, 'rota_visits')
     and exists (select 1 from public.people pe
                  where pe.company_id = p.company_id and pe.archived_at is null and pe.employment_status <> 'leaver'
                    and public.rota_uk_mobile_digits(pe.mobile) = v_digits)
   limit 1;
  if pl.id is null then
    result := 'unknown'; message := 'That code was not recognised. Check the code on the sheet at the home, or call the office.';
    return next; return;
  end if;
  company_id := pl.company_id;

  select count(*), (array_agg(pe.id))[1] into v_people, v_person from public.people pe
   where pe.company_id = pl.company_id and pe.archived_at is null and pe.employment_status <> 'leaver'
     and public.rota_uk_mobile_digits(pe.mobile) = v_digits;
  if v_people <> 1 then
    result := 'unknown'; message := 'This mobile is on more than one staff record, so it cannot clock in by text. Call the office.';
    return next; return;
  end if;
  person_id := v_person;

  if pl.for_branch then
    select s.id, coalesce(nullif(s.location, ''), 'your shift'), s.starts_at into v_shift, v_title, v_starts
      from public.rota_assignments a join public.rota_shifts s on s.id = a.shift_id
     where a.person_id = v_person and a.status = 'active' and s.status = 'published' and s.branch_id = pl.branch_id
       and now() between s.starts_at - interval '30 minutes' and s.ends_at + interval '3 hours'
     order by abs(extract(epoch from (s.starts_at - now()))) limit 1;
  else
    select v.id, su.full_name, v.starts_at into v_visit, v_title, v_starts
      from public.rota_visit_assignments a join public.rota_visits v on v.id = a.visit_id
      join public.service_users su on su.id = v.service_user_id
     where a.person_id = v_person and a.status = 'active' and v.status = 'published' and v.service_user_id = pl.service_user_id
       and now() between v.starts_at - interval '30 minutes' and v.ends_at + interval '3 hours'
     order by abs(extract(epoch from (v.starts_at - now()))) limit 1;
  end if;
  if v_visit is null and v_shift is null then
    result := 'no_visit'; message := 'You have no visit or shift there right now, so nothing was recorded. Call the office.';
    return next; return;
  end if;

  select * into r from public.rota_clock_record(
    v_event, v_person, v_visit, v_shift, p_kind, 'text', null, now(), null, null, null, null,
    null, null, null, null, null, null, null, null, '{}');

  result := 'accepted';
  message := case when p_kind = 'in' then 'Clocked in' else 'Clocked out' end
             || ' at ' || to_char(now() at time zone 'Europe/London', 'HH24:MI')
             || ' for the ' || to_char(v_starts at time zone 'Europe/London', 'HH24:MI')
             || case when v_visit is not null then ' visit.' else ' shift.' end;
  return next;
end;
$$;

-- ============================================================================================
-- 7. The office: map points, the printed sheet, and adding a missed clock in or out
-- ============================================================================================

-- Make the places for a branch's service users and the branch office, if they are missing.
-- Returns each place with its postcode, so the server can look the postcode up.
create or replace function public.rota_ensure_places(p_branch uuid)
returns table (place_id uuid, service_user_id uuid, for_branch boolean, name text, postcode text,
               lat double precision, lng double precision, radius_m integer, source text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare su record;
begin
  if not public.rota_can_office(p_branch) then
    raise exception 'You cannot change the rota for that branch.' using errcode = '42501';
  end if;
  perform public.rota_place_for_branch(p_branch);
  for su in select s.id from public.service_users s
             where s.branch_id = p_branch and s.archived_at is null and s.service_status <> 'cancelled' loop
    perform public.rota_place_for_su(su.id);
  end loop;
  return query
    select p.id, p.service_user_id, p.for_branch,
           case when p.for_branch then b.name else s.full_name end,
           case when p.for_branch
                then upper((regexp_match(coalesce(b.address, ''), '([A-Za-z]{1,2}[0-9][A-Za-z0-9]? ?[0-9][A-Za-z]{2})'))[1])
                else upper(nullif(btrim(s.address->>'postcode'), '')) end,
           p.lat, p.lng, p.radius_m, p.source
      from public.rota_places p
      join public.branches b on b.id = p.branch_id
      left join public.service_users s on s.id = p.service_user_id
     where p.branch_id = p_branch
       and (p.for_branch or (s.archived_at is null and s.service_status <> 'cancelled'))
     order by p.for_branch desc, s.full_name;
end;
$$;

-- Set a place's map point. Office roles only (Phil, 2026-10-16). A postcode point never
-- overwrites a point the office set on the map or at the home.
create or replace function public.rota_set_place(p_place uuid, p_lat double precision, p_lng double precision,
                                                 p_source text, p_postcode text, p_accuracy double precision)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare pl record;
begin
  select * into pl from public.rota_places where id = p_place;
  if pl.id is null or not public.rota_can_office(pl.branch_id) then
    raise exception 'That place could not be found.' using errcode = 'P0002';
  end if;
  if p_source not in ('postcode', 'map', 'on_site') then raise exception 'Unknown source.' using errcode = '22023'; end if;
  if p_lat is null or p_lng is null or p_lat not between 49 and 61.5 or p_lng not between -9 and 2.5 then
    raise exception 'That point is not in the UK.' using errcode = '22023';
  end if;
  if p_source = 'on_site' and (p_accuracy is null or p_accuracy > 50) then
    raise exception 'The phone''s position is not accurate enough (needs to be within 50 m). Step outside or wait a moment, then try again.' using errcode = '22023';
  end if;
  if p_source = 'postcode' and pl.source <> 'postcode' then
    return 'kept';
  end if;
  if p_source = 'postcode' and pl.lat is not null and pl.postcode is not distinct from p_postcode then
    return 'unchanged';
  end if;
  update public.rota_places
     set lat = p_lat, lng = p_lng, source = p_source,
         postcode = coalesce(p_postcode, postcode),
         set_by = case when p_source = 'postcode' then set_by else auth.uid() end,
         set_at = case when p_source = 'postcode' then set_at else now() end,
         updated_at = now()
   where id = p_place;
  return 'set';
end;
$$;

-- Change a place's radius (25 m to 2 km).
create or replace function public.rota_set_place_radius(p_place uuid, p_radius integer)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare pl record;
begin
  select * into pl from public.rota_places where id = p_place;
  if pl.id is null or not public.rota_can_office(pl.branch_id) then
    raise exception 'That place could not be found.' using errcode = 'P0002';
  end if;
  if p_radius is null or p_radius not between 25 and 2000 then
    raise exception 'The radius must be between 25 m and 2,000 m.' using errcode = '22023';
  end if;
  update public.rota_places set radius_m = p_radius, updated_at = now() where id = p_place;
end;
$$;

-- A new printed sheet: a new QR token and text code; the old sheet stops working at once.
create or replace function public.rota_new_sheet(p_place uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare pl record;
begin
  select * into pl from public.rota_places where id = p_place;
  if pl.id is null or not public.rota_can_office(pl.branch_id) then
    raise exception 'That place could not be found.' using errcode = 'P0002';
  end if;
  update public.rota_places
     set qr_token = encode(extensions.gen_random_bytes(18), 'hex'), text_code = public.rota_new_text_code(pl.company_id), updated_at = now()
   where id = p_place;
end;
$$;

-- Add a missed clock in or out (Phil, 2026-10-16): office roles, with a reason; marked as added
-- by the office; never replaces anything the carer recorded.
create or replace function public.rota_office_add_clock(p_target_kind text, p_target uuid, p_person uuid,
                                                        p_kind text, p_at timestamptz, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_branch uuid; v_event uuid := gen_random_uuid(); r record;
begin
  if p_target_kind = 'visit' then
    select v.branch_id into v_branch from public.rota_visits v where v.id = p_target;
  elsif p_target_kind = 'shift' then
    select s.branch_id into v_branch from public.rota_shifts s where s.id = p_target;
  end if;
  if v_branch is null or not public.rota_can_office(v_branch) then
    raise exception 'That visit or shift could not be found.' using errcode = 'P0002';
  end if;
  if p_kind not in ('in', 'out') then raise exception 'Clock in or clock out?' using errcode = '22023'; end if;
  if p_at is null or p_at > now() + interval '5 minutes' then
    raise exception 'The time cannot be in the future.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for adding it.' using errcode = '22023';
  end if;
  if p_target_kind = 'visit' and not exists (select 1 from public.rota_visit_assignments a where a.visit_id = p_target and a.person_id = p_person and a.status = 'active')
     or p_target_kind = 'shift' and not exists (select 1 from public.rota_assignments a where a.shift_id = p_target and a.person_id = p_person and a.status = 'active') then
    raise exception 'That carer is not on it.' using errcode = '23514';
  end if;
  if exists (select 1 from public.rota_clock_events e
              where e.person_id = p_person and e.kind = p_kind
                and e.visit_id is not distinct from (case when p_target_kind = 'visit' then p_target end)
                and e.shift_id is not distinct from (case when p_target_kind = 'shift' then p_target end)) then
    raise exception 'That carer already has a clock % recorded, so nothing was added.', p_kind using errcode = '23514';
  end if;
  select * into r from public.rota_clock_record(
    v_event, p_person,
    case when p_target_kind = 'visit' then p_target end,
    case when p_target_kind = 'shift' then p_target end,
    p_kind, 'office', null, p_at, null, null, null, null, null, null, null, null, null,
    auth.uid(), auth.uid(), left(btrim(p_reason), 500), '{}');
  return v_event;
end;
$$;

-- Clear a refused record once the office has dealt with it.
create or replace function public.rota_resolve_clock_problem(p_problem uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare pr record;
begin
  select * into pr from public.rota_clock_problems where id = p_problem;
  if pr.id is null or not (pr.branch_id is not null and public.rota_can_office(pr.branch_id)
                           or public.is_platform_admin() and public.company_module_on(pr.company_id, 'rota_visits')) then
    raise exception 'That record could not be found.' using errcode = 'P0002';
  end if;
  update public.rota_clock_problems set resolved_at = now(), resolved_by = auth.uid() where id = p_problem and resolved_at is null;
end;
$$;

-- ============================================================================================
-- 8. Raw positions kept 12 months (Stage 0 decision 10); the clock record stays
-- ============================================================================================

create or replace function public.rota_purge_positions()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  update public.rota_clock_events
     set lat = null, lng = null, accuracy_m = null, position_purged_at = now()
   where lat is not null and happened_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ============================================================================================
-- 9. Grants: internal pieces for the rota's own functions only (the 0490 rule)
-- ============================================================================================

revoke all on function public.rota_metres_between(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.rota_uk_mobile_digits(text) from public, anon, authenticated;
revoke all on function public.rota_new_text_code(uuid) from public, anon, authenticated;
revoke all on function public.rota_place_for_su(uuid) from public, anon, authenticated;
revoke all on function public.rota_place_for_branch(uuid) from public, anon, authenticated;
revoke all on function public.rota_clock_record(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, double precision, double precision, double precision, text, text, text, text, integer, uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.rota_clock_by_text(text, text, text, text) from public, anon, authenticated;
grant execute on function public.rota_clock_by_text(text, text, text, text) to service_role;
revoke all on function public.rota_purge_positions() from public, anon, authenticated;
grant execute on function public.rota_purge_positions() to service_role;

revoke all on function public.rota_my_day() from public, anon;
grant execute on function public.rota_my_day() to authenticated;
revoke all on function public.rota_my_target_for_code(text) from public, anon;
grant execute on function public.rota_my_target_for_code(text) to authenticated;
revoke all on function public.rota_clock_submit(jsonb, timestamptz) from public, anon;
grant execute on function public.rota_clock_submit(jsonb, timestamptz) to authenticated;
revoke all on function public.rota_ensure_places(uuid) from public, anon;
grant execute on function public.rota_ensure_places(uuid) to authenticated;
revoke all on function public.rota_set_place(uuid, double precision, double precision, text, text, double precision) from public, anon;
grant execute on function public.rota_set_place(uuid, double precision, double precision, text, text, double precision) to authenticated;
revoke all on function public.rota_set_place_radius(uuid, integer) from public, anon;
grant execute on function public.rota_set_place_radius(uuid, integer) to authenticated;
revoke all on function public.rota_new_sheet(uuid) from public, anon;
grant execute on function public.rota_new_sheet(uuid) to authenticated;
revoke all on function public.rota_office_add_clock(text, uuid, uuid, text, timestamptz, text) from public, anon;
grant execute on function public.rota_office_add_clock(text, uuid, uuid, text, timestamptz, text) to authenticated;
revoke all on function public.rota_resolve_clock_problem(uuid) from public, anon;
grant execute on function public.rota_resolve_clock_problem(uuid) to authenticated;

-- ============================================================================================
-- 10. Live updates (new tables only) and company links
-- ============================================================================================

do $$
declare t text;
begin
  foreach t in array array['rota_places','rota_clock_events','rota_clock_problems'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

select public.install_company_link_triggers();
