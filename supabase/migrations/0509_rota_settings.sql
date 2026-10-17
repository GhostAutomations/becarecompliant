-- Be Care Compliant 0509: Settings, Rota (Rota and Visits Stage 7b part 2a, Phil's popup 2026-10-17;
-- docs/decisions/rota-visits.md, Stage 7b decision 14).
--
-- Each company can change the rota timings that were fixed until now: late after (15 minutes after
-- the start), missed (30 minutes after the end), overrunning (15 minutes after the end), when Clock in
-- opens (30 minutes before), the radius a new home gets (200 m), how far back a carer sees notes
-- (24 hours) and how long a pinned note stays (48 hours), and the low stock warning (7 days).
-- Location required stays fixed. A company with no row uses those defaults, so nothing changes for
-- anyone until a Company Admin saves the page.
--
-- One row per company (company wide, not per branch: decision 14 says each company). The module's
-- own functions that held the fixed numbers now read rota_settings_for(company); each is otherwise
-- exactly as before (copied from 0493, 0494, 0496, 0499 and 0507).

create table if not exists public.rota_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  late_after_min integer not null default 15 check (late_after_min between 5 and 120),
  missed_after_end_min integer not null default 30 check (missed_after_end_min between 0 and 240),
  overrun_after_end_min integer not null default 15 check (overrun_after_end_min between 5 and 120),
  clock_opens_min integer not null default 30 check (clock_opens_min between 0 and 120),
  default_radius_m integer not null default 200 check (default_radius_m between 25 and 2000),
  notes_earlier_hours integer not null default 24 check (notes_earlier_hours between 1 and 168),
  notes_pinned_hours integer not null default 48 check (notes_pinned_hours between 1 and 168),
  low_stock_days integer not null default 7 check (low_stock_days between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists rota_settings_updated_by on public.rota_settings (updated_by);

alter table public.rota_settings enable row level security;
drop policy if exists rota_settings_select on public.rota_settings;
create policy rota_settings_select on public.rota_settings
  for select to authenticated
  using ((select public.is_company_member(company_id)) or (select public.is_platform_admin()));
drop policy if exists rota_settings_write on public.rota_settings;
create policy rota_settings_write on public.rota_settings
  for all to authenticated
  using ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()))
  with check ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()));

-- The company's settings, or the defaults when it has saved none. Runs as the caller: inside the
-- module's SECURITY DEFINER functions that is the owner; from the app, RLS shows only one's own.
create or replace function public.rota_settings_for(p_company uuid)
returns public.rota_settings
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select s from public.rota_settings s where s.company_id = p_company),
    row(p_company, 15, 30, 15, 30, 200, 24, 48, 7, now(), null)::public.rota_settings);
$$;
revoke all on function public.rota_settings_for(uuid) from public, anon;
grant execute on function public.rota_settings_for(uuid) to authenticated, service_role;

-- Clock in counts as early before the company's opening time (was 30 minutes, 0496).
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
  if p_kind = 'in' and p_happened < v_starts - make_interval(mins => (public.rota_settings_for(v_company)).clock_opens_min) then v_flags := v_flags || 'early'::text; end if;
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
        -- A code scanned where the phone's own accurate position puts it well away from the home
        -- (a photo of the sheet, say): still kept, flagged for the office (Phil, 2026-10-16).
        if v_dist is not null and p_accuracy is not null and p_accuracy <= pl.radius_m and v_dist > pl.radius_m then
          v_flags := v_flags || 'code_far'::text;
        end if;
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

-- Clock by text finds the visit or shift open by the company's opening time (was 30 minutes, 0494).
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
   where p.text_code = upper(btrim(p_code)) and exists (select 1 from public.company_modules m where m.company_id = p.company_id and m.module = 'rota_visits' and m.enabled)
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
       and now() between s.starts_at - make_interval(mins => (public.rota_settings_for(pl.company_id)).clock_opens_min) and s.ends_at + interval '3 hours'
     order by abs(extract(epoch from (s.starts_at - now()))) limit 1;
  else
    select v.id, su.full_name, v.starts_at into v_visit, v_title, v_starts
      from public.rota_visit_assignments a join public.rota_visits v on v.id = a.visit_id
      join public.service_users su on su.id = v.service_user_id
     where a.person_id = v_person and a.status = 'active' and v.status = 'published' and v.service_user_id = pl.service_user_id
       and now() between v.starts_at - make_interval(mins => (public.rota_settings_for(pl.company_id)).clock_opens_min) and v.ends_at + interval '3 hours'
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

-- A QR or NFC scan finds the visit or shift open by the company's opening time (was 30 minutes, 0493).
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
     where now() between v.starts_at - make_interval(mins => (public.rota_settings_for(pl.company_id)).clock_opens_min) and v.ends_at + interval '3 hours'
    union all
    select 'shift'::text, s.id, coalesce(nullif(s.location, ''), 'Shift'), s.starts_at, s.ends_at,
           exists (select 1 from public.rota_clock_events e where e.shift_id = s.id and e.person_id = a.person_id and e.kind = 'in'),
           exists (select 1 from public.rota_clock_events e where e.shift_id = s.id and e.person_id = a.person_id and e.kind = 'out')
      from pl join public.rota_shifts s on s.branch_id = pl.branch_id and pl.for_branch and s.status = 'published'
      join public.rota_assignments a on a.shift_id = s.id and a.status = 'active'
      join me on me.person_id = a.person_id
     where now() between s.starts_at - make_interval(mins => (public.rota_settings_for(pl.company_id)).clock_opens_min) and s.ends_at + interval '3 hours'
  ) x
  order by abs(extract(epoch from (x.starts_at - now())))
  limit 1;
$$;

-- A new home or office place gets the company's default radius (was the column default 200 m, 0493).
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
  insert into public.rota_places (company_id, branch_id, service_user_id, text_code, radius_m)
  values (su.company_id, su.branch_id, su.id, public.rota_new_text_code(su.company_id),
          (public.rota_settings_for(su.company_id)).default_radius_m)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.rota_places where service_user_id = p_su; end if;
  return v_id;
end;
$$;

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
  insert into public.rota_places (company_id, branch_id, for_branch, text_code, radius_m)
  values (b.company_id, b.id, true, public.rota_new_text_code(b.company_id),
          (public.rota_settings_for(b.company_id)).default_radius_m)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.rota_places where branch_id = p_branch and for_branch; end if;
  return v_id;
end;
$$;

-- The carer's notes: earlier notes and pinned notes by the company's windows (were 24 and 48 hours, 0499).
create or replace function public.rota_my_visit_notes()
returns table (visit_id uuid, notes jsonb, concerns jsonb)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_mine uuid[]; v_today date; r record; v_company uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  v_mine := public.rota_my_person_ids();
  if coalesce(array_length(v_mine, 1), 0) = 0 then return; end if;
  v_today := (now() at time zone 'Europe/London')::date;

  -- The audit line: once a day per service user whose notes from others are shown.
  for r in
    select distinct rv.company_id, rv.service_user_id, su.full_name
      from public.rota_visit_assignments a
      join public.rota_visits rv on rv.id = a.visit_id and rv.status = 'published'
      join public.service_users su on su.id = rv.service_user_id
     where a.person_id = any (v_mine) and a.status = 'active'
       and rv.visit_date between v_today - 1 and v_today + 1
       and exists (select 1 from public.rota_care_notes n
                    where n.service_user_id = rv.service_user_id and not (n.person_id = any (v_mine))
                      and (n.happened_at >= now() - make_interval(hours => (public.rota_settings_for(rv.company_id)).notes_earlier_hours)
                           or (n.for_next_carer and n.happened_at >= now() - make_interval(hours => (public.rota_settings_for(rv.company_id)).notes_pinned_hours))))
  loop
    insert into public.rota_note_views (company_id, profile_id, service_user_id, viewed_on)
    values (r.company_id, auth.uid(), r.service_user_id, v_today)
    on conflict do nothing;
    if found then
      insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
      values (r.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
              'rota.care_notes_viewed', 'service_user', r.service_user_id::text,
              'Shown recent care notes on the Clock in page', jsonb_build_object('window_hours', (public.rota_settings_for(r.company_id)).notes_earlier_hours));
    end if;
  end loop;

  return query
  with mine as (
    select distinct rv.id as visit_id, rv.service_user_id, rv.company_id
      from public.rota_visit_assignments a
      join public.rota_visits rv on rv.id = a.visit_id and rv.status = 'published'
     where a.person_id = any (v_mine) and a.status = 'active'
       and rv.visit_date between v_today - 1 and v_today + 1
  )
  select m.visit_id,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', n.id, 'event_id', n.event_id, 'visit_id', n.visit_id, 'author', n.author_name,
                     'mine', n.person_id = any (v_mine), 'body', n.body, 'for_next_carer', n.for_next_carer,
                     'corrects_note_id', n.corrects_note_id,
                     'corrected_at', (select min(c.happened_at) from public.rota_care_notes c where c.corrects_note_id = n.id),
                     'at', n.happened_at) order by n.happened_at)
                     from public.rota_care_notes n
                    where n.service_user_id = m.service_user_id
                      and (n.visit_id = m.visit_id and n.person_id = any (v_mine)
                           or n.happened_at >= now() - make_interval(hours => (public.rota_settings_for(m.company_id)).notes_earlier_hours)
                           or (n.for_next_carer and n.happened_at >= now() - make_interval(hours => (public.rota_settings_for(m.company_id)).notes_pinned_hours)))), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', c.id, 'event_id', c.event_id, 'category', c.category, 'body', c.body, 'at', c.happened_at,
                     'status', c.status) order by c.happened_at)
                     from public.rota_concerns c
                    where c.visit_id = m.visit_id and c.person_id = any (v_mine)), '[]'::jsonb)
    from mine m;
end;
$$;

-- Late and missed by the company's timings (were 15 minutes after the start and 30 after the end, 0507).
create or replace function public.rota_alerts_run()
returns table (late integer, missed integer, doses integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare r record; v_id uuid; n_late integer := 0; n_missed integer := 0; n_doses integer := 0; v_urgent boolean; v_detail jsonb;
begin
  for r in
    select v.*, st.missed_after_end_min as st_missed
      from public.rota_visits v
      join public.service_users su on su.id = v.service_user_id
      cross join lateral public.rota_settings_for(v.company_id) st
     where v.status = 'published'
       and v.starts_at > now() - interval '2 days'
       and v.starts_at + make_interval(mins => st.late_after_min) <= now()
       and exists (select 1 from public.company_modules cm
                    where cm.company_id = v.company_id and cm.module = 'rota_visits' and cm.enabled)
       and coalesce(su.service_status, '') <> 'cancelled'
       and not (coalesce(su.service_status, '') in ('hospital', 'respite') and (su.hospital_since is null or su.hospital_since <= v.visit_date))
  loop
    select exists (select 1 from public.rota_visit_due_medicines(r.id) d where d.time_sensitive) into v_urgent;

    -- Missed: no clock in at all by the company's missed time after the end (default 30 minutes).
    if now() >= r.ends_at + make_interval(mins => r.st_missed)
       and not exists (select 1 from public.rota_clock_events c where c.visit_id = r.id and c.kind = 'in')
       and not exists (select 1 from public.rota_visit_alerts x where x.visit_id = r.id and x.kind = 'missed') then
      select jsonb_build_object('medicines', coalesce(jsonb_agg(d.name order by d.name), '[]'::jsonb)) into v_detail
        from public.rota_visit_due_medicines(r.id) d;
      insert into public.rota_visit_alerts (company_id, branch_id, visit_id, service_user_id, kind, urgent, detail)
      values (r.company_id, r.branch_id, r.id, r.service_user_id, 'missed', v_urgent, v_detail)
      on conflict (visit_id, kind) do nothing
      returning id into v_id;
      if v_id is not null then perform public.rota_notify_alert(v_id); n_missed := n_missed + 1; end if;
      v_id := null;
    end if;

    -- Late: by the company's late time after the start (default 15 minutes), any carer on it not clocked in (or no carer at all). A visit
    -- already missed is not also called late.
    if (not exists (select 1 from public.rota_visit_assignments x where x.visit_id = r.id and x.status = 'active')
        or exists (select 1 from public.rota_visit_assignments x
                    where x.visit_id = r.id and x.status = 'active'
                      and not exists (select 1 from public.rota_clock_events c where c.visit_id = r.id and c.person_id = x.person_id and c.kind = 'in')))
       and not exists (select 1 from public.rota_visit_alerts x where x.visit_id = r.id and x.kind in ('late', 'missed')) then
      select jsonb_build_object('not_clocked_in', coalesce(jsonb_agg(pe.full_name order by pe.full_name), '[]'::jsonb)) into v_detail
        from public.rota_visit_assignments x join public.people pe on pe.id = x.person_id
       where x.visit_id = r.id and x.status = 'active'
         and not exists (select 1 from public.rota_clock_events c where c.visit_id = r.id and c.person_id = x.person_id and c.kind = 'in');
      insert into public.rota_visit_alerts (company_id, branch_id, visit_id, service_user_id, kind, urgent, detail)
      values (r.company_id, r.branch_id, r.id, r.service_user_id, 'late', v_urgent, v_detail)
      on conflict (visit_id, kind) do nothing
      returning id into v_id;
      if v_id is not null then perform public.rota_notify_alert(v_id); n_late := n_late + 1; end if;
      v_id := null;
    end if;

    -- Dose not recorded: everyone who clocked in has clocked out, and a due dose has nothing.
    if exists (select 1 from public.rota_clock_events c where c.visit_id = r.id and c.kind = 'in')
       and not exists (select 1 from public.rota_clock_events c where c.visit_id = r.id and c.kind = 'in'
                        and not exists (select 1 from public.rota_clock_events o where o.visit_id = r.id and o.person_id = c.person_id and o.kind = 'out'))
       and not exists (select 1 from public.rota_visit_alerts x where x.visit_id = r.id and x.kind = 'dose_not_recorded') then
      select jsonb_build_object('medicines', jsonb_agg(d.name order by d.name)), bool_or(d.time_sensitive) into v_detail, v_urgent
        from public.rota_visit_due_medicines(r.id) d
       where not exists (select 1 from public.rota_mar_doses md where md.visit_id = r.id and md.med_uid = d.med_uid);
      if v_detail is not null and v_detail->'medicines' is not null and jsonb_typeof(v_detail->'medicines') = 'array' then
        insert into public.rota_visit_alerts (company_id, branch_id, visit_id, service_user_id, kind, urgent, detail)
        values (r.company_id, r.branch_id, r.id, r.service_user_id, 'dose_not_recorded', coalesce(v_urgent, false), v_detail)
        on conflict (visit_id, kind) do nothing
        returning id into v_id;
        if v_id is not null then perform public.rota_notify_alert(v_id); n_doses := n_doses + 1; end if;
        v_id := null;
      end if;
    end if;
  end loop;
  return query select n_late, n_missed, n_doses;
end;
$$;

select public.install_company_link_triggers();
