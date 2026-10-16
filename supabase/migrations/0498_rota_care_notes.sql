-- Rota and Visits Stage 5: care notes, Visit records and concerns (Phil's popups, 2026-10-16;
-- docs/decisions/rota-visits.md, Stage 5 decisions 1 to 12).
--
--   rota_care_notes              a note written at a visit, sent from the phone (event id made on
--                                the phone, kept once). Never edited or deleted: a correction is a
--                                new note pointing at the one it corrects (decision 8).
--   rota_concerns                a concern raised at a visit: what it is and its type (the incident
--                                types); the office decides whether an incident form is needed.
--   rota_visit_record_versions   each Visit record PDF made for a visit: version 1 at clock out, a
--                                new version when something arrives after it (decision 2). A version
--                                shows everything received up to its made_at, so it never changes.
--   rota_note_views              when a carer was shown other carers' notes for a service user, so
--                                the view is audit logged once a day, not on every page load.
--
-- CHANGES TO EXISTING OBJECTS, approved by Phil by popup (decision 12): user_notifications and
-- notification_preferences also accept the event type 'concern_raised', and user_notifications gets
-- a concern_id (each person told once per concern). Nothing else existing changes: check
-- notifications, notify_check_completed and the preference functions are untouched. Nothing is
-- added to the supabase_realtime publication.
--
-- The cloud copy (decision 3): a new Visit record version is queued in cloud_sync_queue (a row, not
-- a schema change) when the company has a cloud drive connection; the app copies it into the
-- service user's Care notes folder, by year, month and day.

-- ============================================================================================
-- 1. Tables
-- ============================================================================================

create table if not exists public.rota_care_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  author_name text not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  for_next_carer boolean not null default false,
  corrects_note_id uuid references public.rota_care_notes(id) on delete cascade,
  phone_time timestamptz not null,
  happened_at timestamptz not null,
  server_time timestamptz not null default now(),
  clock_skew_seconds integer,
  flags text[] not null default '{}',
  device_id text check (device_id is null or length(device_id) <= 100),
  device_seq integer,
  recorded_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists rota_care_notes_event_key on public.rota_care_notes (event_id);
create index if not exists rota_care_notes_su on public.rota_care_notes (service_user_id, happened_at desc);
create index if not exists rota_care_notes_visit on public.rota_care_notes (visit_id, happened_at);
create index if not exists rota_care_notes_company on public.rota_care_notes (company_id, branch_id, happened_at);
create index if not exists rota_care_notes_person on public.rota_care_notes (person_id);
create index if not exists rota_care_notes_corrects on public.rota_care_notes (corrects_note_id) where corrects_note_id is not null;

create table if not exists public.rota_concerns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  author_name text not null,
  category text not null check (length(btrim(category)) between 1 and 80),
  body text not null check (length(btrim(body)) between 1 and 4000),
  phone_time timestamptz not null,
  happened_at timestamptz not null,
  server_time timestamptz not null default now(),
  clock_skew_seconds integer,
  flags text[] not null default '{}',
  device_id text check (device_id is null or length(device_id) <= 100),
  device_seq integer,
  recorded_by uuid,
  status text not null default 'open' check (status in ('open', 'incident', 'no_incident')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  incident_id uuid references public.incidents(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists rota_concerns_event_key on public.rota_concerns (event_id);
create index if not exists rota_concerns_company on public.rota_concerns (company_id, branch_id, status, happened_at desc);
create index if not exists rota_concerns_su on public.rota_concerns (service_user_id, happened_at desc);
create index if not exists rota_concerns_visit on public.rota_concerns (visit_id);
create index if not exists rota_concerns_person on public.rota_concerns (person_id);
create index if not exists rota_concerns_incident on public.rota_concerns (incident_id) where incident_id is not null;
create index if not exists rota_concerns_decided_by on public.rota_concerns (decided_by) where decided_by is not null;

create table if not exists public.rota_visit_record_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  version integer not null check (version >= 1),
  made_at timestamptz not null default now(),
  reason text not null check (reason in ('clock_out', 'task', 'note', 'correction', 'concern')),
  created_at timestamptz not null default now(),
  unique (visit_id, version)
);
create index if not exists rota_visit_record_versions_company on public.rota_visit_record_versions (company_id, branch_id, made_at);

create table if not exists public.rota_note_views (
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  viewed_on date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, service_user_id, viewed_on)
);
create index if not exists rota_note_views_company on public.rota_note_views (company_id);
create index if not exists rota_note_views_su on public.rota_note_views (service_user_id);

-- ============================================================================================
-- 2. The approved changes to the existing notification stores (decision 12)
-- ============================================================================================

alter table public.user_notifications drop constraint if exists user_notifications_event_type_check;
alter table public.user_notifications add constraint user_notifications_event_type_check
  check (event_type in ('check_completed', 'concern_raised'));
alter table public.user_notifications add column if not exists concern_id uuid references public.rota_concerns(id) on delete cascade;
create unique index if not exists user_notifications_concern_once on public.user_notifications (profile_id, concern_id) where concern_id is not null;
create index if not exists user_notifications_concern_idx on public.user_notifications (concern_id) where concern_id is not null;

alter table public.notification_preferences drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences add constraint notification_preferences_event_type_check
  check (event_type in ('check_completed', 'concern_raised'));

-- ============================================================================================
-- 3. Row level security. No insert, update or delete for anyone signed in: writes go through
--    the functions below, and notes are never changed.
-- ============================================================================================

alter table public.rota_care_notes enable row level security;
alter table public.rota_concerns enable row level security;
alter table public.rota_visit_record_versions enable row level security;
alter table public.rota_note_views enable row level security;

-- Notes: the rota office of the branch, the carer who wrote them, the Founder. Other carers see
-- recent notes on their own visits through rota_my_visit_notes only (decision 6).
drop policy if exists rota_care_notes_read on public.rota_care_notes;
create policy rota_care_notes_read on public.rota_care_notes for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or person_id = any ((select public.rota_my_person_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

drop policy if exists rota_concerns_read on public.rota_concerns;
create policy rota_concerns_read on public.rota_concerns for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or person_id = any ((select public.rota_my_person_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

drop policy if exists rota_visit_record_versions_read on public.rota_visit_record_versions;
create policy rota_visit_record_versions_read on public.rota_visit_record_versions for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

-- rota_note_views: no policy, read by nobody signed in (the audit log is the record).

revoke insert, update, delete, truncate on public.rota_care_notes, public.rota_concerns,
  public.rota_visit_record_versions, public.rota_note_views from authenticated;
revoke all on public.rota_care_notes, public.rota_concerns, public.rota_visit_record_versions, public.rota_note_views from anon;

-- ============================================================================================
-- 4. The Visit record: a new version at clock out, and when something arrives after it
-- ============================================================================================

create or replace function public.rota_visit_record_touch(p_visit uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v record; v_last record; v_id uuid;
begin
  select rv.id, rv.company_id, rv.branch_id into v from public.rota_visits rv where rv.id = p_visit;
  if v.id is null then return; end if;
  -- Made at clock out: nothing before the first clock out of the visit.
  if not exists (select 1 from public.rota_clock_events e where e.visit_id = p_visit and e.kind = 'out') then return; end if;
  select x.version, x.made_at into v_last from public.rota_visit_record_versions x
   where x.visit_id = p_visit order by x.version desc limit 1;
  -- A version shows everything received up to its made_at; rows written in the same moment
  -- (the same transaction) are already in it, so they make no extra version.
  if v_last.version is not null and not (
       exists (select 1 from public.rota_clock_events e where e.visit_id = p_visit and e.server_time > v_last.made_at)
    or exists (select 1 from public.rota_task_outcomes o where o.visit_id = p_visit and o.server_time > v_last.made_at)
    or exists (select 1 from public.rota_care_notes n where n.visit_id = p_visit and n.server_time > v_last.made_at)
    or exists (select 1 from public.rota_concerns c where c.visit_id = p_visit and c.server_time > v_last.made_at)) then
    return;
  end if;
  insert into public.rota_visit_record_versions (company_id, branch_id, visit_id, version, made_at, reason)
  values (v.company_id, v.branch_id, p_visit, coalesce(v_last.version, 0) + 1, now(),
          case when v_last.version is null then 'clock_out' else p_reason end)
  on conflict (visit_id, version) do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  -- The cloud copy, when the company has a drive connected (or one that needs reconnecting, so
  -- nothing is lost), the same rule as lib/cloud/queue.ts.
  if exists (select 1 from public.cloud_connections c where c.company_id = v.company_id and c.status <> 'disconnected') then
    insert into public.cloud_sync_queue (company_id, source_kind, source_id, dedupe_key)
    values (v.company_id, 'visit_record', v_id::text, 'visit_record:' || v_id::text)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.rota_visit_record_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'rota_clock_events' then
    if new.kind = 'out' and new.visit_id is not null then perform public.rota_visit_record_touch(new.visit_id, 'clock_out'); end if;
  elsif tg_table_name = 'rota_task_outcomes' then
    perform public.rota_visit_record_touch(new.visit_id, 'task');
  elsif tg_table_name = 'rota_care_notes' then
    perform public.rota_visit_record_touch(new.visit_id, case when new.corrects_note_id is null then 'note' else 'correction' end);
  elsif tg_table_name = 'rota_concerns' then
    perform public.rota_visit_record_touch(new.visit_id, 'concern');
  end if;
  return null;
end;
$$;

drop trigger if exists rota_visit_record_version on public.rota_clock_events;
create trigger rota_visit_record_version after insert on public.rota_clock_events
  for each row execute function public.rota_visit_record_after_insert();
drop trigger if exists rota_visit_record_version on public.rota_task_outcomes;
create trigger rota_visit_record_version after insert on public.rota_task_outcomes
  for each row execute function public.rota_visit_record_after_insert();
drop trigger if exists rota_visit_record_version on public.rota_care_notes;
create trigger rota_visit_record_version after insert on public.rota_care_notes
  for each row execute function public.rota_visit_record_after_insert();
drop trigger if exists rota_visit_record_version on public.rota_concerns;
create trigger rota_visit_record_version after insert on public.rota_concerns
  for each row execute function public.rota_visit_record_after_insert();

-- ============================================================================================
-- 5. The phone sends notes and concerns (the approved offline design: each event once,
--    Accepted / Already had it / Refused with the reason, kept for the office)
-- ============================================================================================

-- Tells the office about a new concern (decisions 9 and 12): the Admin, Responsible Individual,
-- Registered Manager, and the Branch Managers and Supervisors of the service user's branch, by
-- their own choice in Settings, Notifications, or the default (Supervisors: Recent activity on).
-- The same department rule as completed checks. Never the carer who raised it.
create or replace function public.rota_notify_concern(p_concern uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c record; n integer;
begin
  select * into c from public.rota_concerns where id = p_concern;
  if c.id is null then return 0; end if;
  insert into public.user_notifications
    (company_id, branch_id, profile_id, event_type, service_user_id, actor_id, actor_name, completed_on,
     email_wanted, show_in_app, concern_id)
  select c.company_id, c.branch_id, p.id, 'concern_raised', c.service_user_id, c.recorded_by, c.author_name,
         (c.happened_at at time zone 'Europe/London')::date,
         coalesce(np.email, false),
         coalesce(np.in_app, p.role = 'supervisor'),
         c.id
    from public.profiles p
    left join public.notification_preferences np
      on np.profile_id = p.id and np.event_type = 'concern_raised' and np.definition_id is null
   where p.company_id = c.company_id
     and p.status = 'active'
     and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')
     and p.id is distinct from c.recorded_by
     and (coalesce(np.in_app, p.role = 'supervisor') or coalesce(np.email, false))
     and c.branch_id = any (public.lead_branch_ids_for(p.id))
     and not exists (select 1 from public.company_role_modules m
                      where m.company_id = c.company_id and m.role = p.role and m.module_key = 'service_users')
     and not exists (select 1 from public.company_role_modules_off o
                      where p.company_role_id is not null and o.company_role_id = p.company_role_id
                        and o.module_key = 'service_users')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Each event: {event_id, kind: 'note' | 'concern', visit_id, body, phone_time, device_id, device_seq}
-- plus for a note {for_next_carer, corrects_event_id} and for a concern {category}.
create or replace function public.rota_note_submit(p_events jsonb, p_phone_now timestamptz)
returns table (event_id uuid, result text, reason text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  ev jsonb; v_event uuid; v_visit record; v_person uuid; v_name text; v_mine uuid[]; v_kind text;
  v_skew integer; v_phone timestamptz; v_happened timestamptz; v_flags text[]; v_body text;
  v_corrects uuid; v_err text; v_company uuid; v_branch uuid; v_concern uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200 then
    raise exception 'A batch is a list of up to 200 records.' using errcode = '22023';
  end if;
  v_mine := public.rota_my_person_ids();
  v_skew := case when p_phone_now is null then null else round(extract(epoch from (now() - p_phone_now)))::integer end;

  for ev in select * from jsonb_array_elements(p_events) loop
    v_event := null; v_person := null; v_company := null; v_branch := null; v_corrects := null; v_concern := null;
    begin
      v_event := (ev->>'event_id')::uuid;
      v_kind := ev->>'kind';
      if v_event is null then raise exception 'The record has no id.' using errcode = '22023'; end if;
      if v_kind not in ('note', 'concern') then raise exception 'The record is not complete.' using errcode = '22023'; end if;
      if exists (select 1 from public.rota_care_notes n where n.event_id = v_event)
         or exists (select 1 from public.rota_concerns c where c.event_id = v_event) then
        event_id := v_event; result := 'duplicate'; reason := null; return next; continue;
      end if;

      select rv.id, rv.company_id, rv.branch_id, rv.service_user_id into v_visit
        from public.rota_visits rv where rv.id = (ev->>'visit_id')::uuid;
      if v_visit.id is null then raise exception 'That visit could not be found.' using errcode = 'P0002'; end if;
      v_company := v_visit.company_id; v_branch := v_visit.branch_id;
      if not public.company_module_on(v_visit.company_id, 'rota_visits') then
        raise exception 'Rota and Visits is not switched on.' using errcode = '42501';
      end if;
      select pe.id, pe.full_name into v_person, v_name from public.people pe
       where pe.id = any (v_mine) and pe.company_id = v_visit.company_id limit 1;
      if v_person is null then raise exception 'This record is not for the person signed in.' using errcode = '42501'; end if;
      if not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v_visit.id and a.person_id = v_person) then
        raise exception 'That visit was never yours.' using errcode = '42501';
      end if;

      v_body := btrim(coalesce(ev->>'body', ''));
      if v_body = '' then raise exception 'The note is empty.' using errcode = '22023'; end if;
      if length(v_body) > 4000 then raise exception 'The note is too long (4,000 characters at most).' using errcode = '22023'; end if;

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

      if v_kind = 'note' then
        if nullif(ev->>'corrects_event_id', '') is not null then
          -- Only the author corrects their own note (decision 8), on the same service user.
          select n.id into v_corrects from public.rota_care_notes n
           where n.event_id = (ev->>'corrects_event_id')::uuid and n.person_id = v_person
             and n.service_user_id = v_visit.service_user_id;
          if v_corrects is null then raise exception 'Only your own note can be corrected.' using errcode = '42501'; end if;
        end if;
        insert into public.rota_care_notes (event_id, company_id, branch_id, service_user_id, visit_id, person_id, author_name,
                                            body, for_next_carer, corrects_note_id, phone_time, happened_at, clock_skew_seconds,
                                            flags, device_id, device_seq, recorded_by)
        values (v_event, v_visit.company_id, v_visit.branch_id, v_visit.service_user_id, v_visit.id, v_person, coalesce(v_name, 'Carer'),
                v_body, coalesce((ev->>'for_next_carer')::boolean, false), v_corrects, v_phone, v_happened, v_skew,
                v_flags, left(ev->>'device_id', 100), nullif(ev->>'device_seq', '')::integer, auth.uid());
      else
        if nullif(btrim(coalesce(ev->>'category', '')), '') is null then
          raise exception 'Pick what kind of concern it is.' using errcode = '22023';
        end if;
        insert into public.rota_concerns (event_id, company_id, branch_id, service_user_id, visit_id, person_id, author_name,
                                          category, body, phone_time, happened_at, clock_skew_seconds, flags, device_id,
                                          device_seq, recorded_by)
        values (v_event, v_visit.company_id, v_visit.branch_id, v_visit.service_user_id, v_visit.id, v_person, coalesce(v_name, 'Carer'),
                left(btrim(ev->>'category'), 80), v_body, v_phone, v_happened, v_skew, v_flags, left(ev->>'device_id', 100),
                nullif(ev->>'device_seq', '')::integer, auth.uid())
        returning id into v_concern;
        perform public.rota_notify_concern(v_concern);
      end if;
      event_id := v_event; result := 'accepted'; reason := null; return next;
    exception when others then
      if sqlstate = '23505' then
        event_id := v_event; result := 'duplicate'; reason := null; return next; continue;
      end if;
      v_err := sqlerrm;
      begin
        insert into public.rota_clock_problems (company_id, branch_id, person_id, profile_id, event_id, event, reason)
        values (coalesce(v_company, (select p.company_id from public.profiles p where p.id = auth.uid())),
                v_branch, v_person, auth.uid(), v_event, ev || jsonb_build_object('record', coalesce(v_kind, 'note')), v_err)
        on conflict do nothing;
      exception when others then null;
      end;
      event_id := v_event; result := 'refused'; reason := v_err; return next;
    end;
  end loop;
end;
$$;

-- ============================================================================================
-- 6. What the carer's phone shows: for each of their visits from yesterday to tomorrow, the notes
--    for that service user from the last 48 hours, "for the next carer" notes from the last 3
--    days, their own notes on the visit, and their own concerns (decisions 6 and 7). Showing other
--    carers' notes is audit logged once a day per service user.
-- ============================================================================================

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
                      and (n.happened_at >= now() - interval '48 hours' or (n.for_next_carer and n.happened_at >= now() - interval '3 days')))
  loop
    insert into public.rota_note_views (company_id, profile_id, service_user_id, viewed_on)
    values (r.company_id, auth.uid(), r.service_user_id, v_today)
    on conflict do nothing;
    if found then
      insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
      values (r.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
              'rota.care_notes_viewed', 'service_user', r.service_user_id::text,
              'Shown recent care notes on the Clock in page', jsonb_build_object('window_hours', 48));
    end if;
  end loop;

  return query
  with mine as (
    select distinct rv.id as visit_id, rv.service_user_id
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
                           or n.happened_at >= now() - interval '48 hours'
                           or (n.for_next_carer and n.happened_at >= now() - interval '3 days'))), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', c.id, 'event_id', c.event_id, 'category', c.category, 'body', c.body, 'at', c.happened_at,
                     'status', c.status) order by c.happened_at)
                     from public.rota_concerns c
                    where c.visit_id = m.visit_id and c.person_id = any (v_mine)), '[]'::jsonb)
    from mine m;
end;
$$;

-- ============================================================================================
-- 7. The office: deciding a concern, and linking the incident started from it
-- ============================================================================================

create or replace function public.rota_concern_decide(p_concern uuid, p_decision text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  select * into c from public.rota_concerns where id = p_concern;
  if c.id is null or not (c.branch_id = any (public.rota_office_branch_ids())
                          or (public.is_platform_admin() and public.company_module_on(c.company_id, 'rota_visits'))) then
    raise exception 'That concern could not be found.' using errcode = '42501';
  end if;
  if p_decision not in ('no_incident', 'open') then raise exception 'That is not a decision.' using errcode = '22023'; end if;
  if p_decision = 'no_incident' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why no incident form is needed.' using errcode = '22023';
  end if;
  if c.status = 'incident' then raise exception 'An incident form has already been started from this concern.' using errcode = '22023'; end if;
  update public.rota_concerns
     set status = p_decision,
         decided_by = case when p_decision = 'open' then null else auth.uid() end,
         decided_at = case when p_decision = 'open' then null else now() end,
         decision_note = case when p_decision = 'open' then null else left(btrim(p_note), 1000) end
   where id = c.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (c.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
          'rota.concern_decided', 'rota_concern', c.id::text,
          case when p_decision = 'open' then 'Reopened a concern' else 'Decided no incident form is needed for a concern' end,
          jsonb_build_object('decision', p_decision));
end;
$$;

create or replace function public.rota_concern_link_incident(p_concern uuid, p_incident uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c record; i record;
begin
  select * into c from public.rota_concerns where id = p_concern;
  if c.id is null or not (c.branch_id = any (public.rota_office_branch_ids())
                          or (public.is_platform_admin() and public.company_module_on(c.company_id, 'rota_visits'))) then
    raise exception 'That concern could not be found.' using errcode = '42501';
  end if;
  select id, company_id, created_by into i from public.incidents where id = p_incident;
  if i.id is null or i.company_id <> c.company_id or i.created_by is distinct from auth.uid() then
    raise exception 'That incident could not be linked.' using errcode = '42501';
  end if;
  update public.rota_concerns set status = 'incident', incident_id = i.id, decided_by = auth.uid(), decided_at = now()
   where id = c.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (c.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
          'rota.concern_incident', 'rota_concern', c.id::text, 'Started an incident form from a concern',
          jsonb_build_object('incident_id', i.id));
end;
$$;

-- ============================================================================================
-- 8. Settings, Notifications: the "Concern raised in a care note" row (decision 12).
--    Company Admin and Founder only, the same as the check rows.
-- ============================================================================================

create or replace function public.rota_concern_notification_grid(p_company uuid)
returns table (profile_id uuid, in_app boolean, email boolean, is_default boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_platform_admin() or public.is_company_admin(p_company)) then
    raise exception 'Only an Admin can see notifications.' using errcode = '42501';
  end if;
  if not public.company_module_on(p_company, 'rota_visits') then return; end if;
  return query
    select p.id, coalesce(np.in_app, p.role = 'supervisor'), coalesce(np.email, false), np.id is null
      from public.profiles p
      left join public.notification_preferences np
        on np.profile_id = p.id and np.event_type = 'concern_raised' and np.definition_id is null
     where p.company_id = p_company and p.status in ('active', 'invited')
       and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor');
end;
$$;

create or replace function public.rota_set_concern_notification(p_profile uuid, p_in_app boolean, p_email boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  t public.profiles;
begin
  select * into t from public.profiles where id = p_profile;
  if t.id is null or not (public.is_platform_admin() or public.is_company_admin(t.company_id)) then
    raise exception 'Only an Admin can change a person''s notifications.' using errcode = '42501';
  end if;
  if not public.company_module_on(t.company_id, 'rota_visits') then
    raise exception 'Rota and Visits is not switched on.' using errcode = '42501';
  end if;
  if t.role not in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor') then
    raise exception 'This role cannot open concerns, so it cannot be told about them.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (company_id, profile_id, event_type, definition_id, in_app, email, updated_by, updated_at)
  values (t.company_id, t.id, 'concern_raised', null, coalesce(p_in_app, false) or coalesce(p_email, false), coalesce(p_email, false), auth.uid(), now())
  on conflict (profile_id, event_type, coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set in_app = excluded.in_app, email = excluded.email, updated_by = excluded.updated_by, updated_at = now()
    where public.notification_preferences.in_app is distinct from excluded.in_app
       or public.notification_preferences.email is distinct from excluded.email;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (t.company_id, auth.uid(), case when public.is_platform_admin() then 'platform_admin' else 'company_admin' end,
          'notifications.preferences_saved', 'profile', t.id::text, 'Saved notifications: Concern raised in a care note',
          jsonb_build_object('concern_raised', jsonb_build_object('in_app', p_in_app, 'email', p_email)));
end;
$$;

-- ============================================================================================
-- 9. Grants
-- ============================================================================================

revoke all on function public.rota_visit_record_touch(uuid, text) from public, anon, authenticated;
revoke all on function public.rota_visit_record_after_insert() from public, anon, authenticated;
revoke all on function public.rota_notify_concern(uuid) from public, anon, authenticated;

revoke all on function public.rota_note_submit(jsonb, timestamptz) from public, anon;
grant execute on function public.rota_note_submit(jsonb, timestamptz) to authenticated;
revoke all on function public.rota_my_visit_notes() from public, anon;
grant execute on function public.rota_my_visit_notes() to authenticated;
revoke all on function public.rota_concern_decide(uuid, text, text) from public, anon;
grant execute on function public.rota_concern_decide(uuid, text, text) to authenticated;
revoke all on function public.rota_concern_link_incident(uuid, uuid) from public, anon;
grant execute on function public.rota_concern_link_incident(uuid, uuid) to authenticated;
revoke all on function public.rota_concern_notification_grid(uuid) from public, anon;
grant execute on function public.rota_concern_notification_grid(uuid) to authenticated;
revoke all on function public.rota_set_concern_notification(uuid, boolean, boolean) from public, anon;
grant execute on function public.rota_set_concern_notification(uuid, boolean, boolean) to authenticated;

-- ============================================================================================
-- 10. Live updates (new tables only) and company links
-- ============================================================================================

do $$
declare t text;
begin
  foreach t in array array['rota_care_notes','rota_concerns','rota_visit_record_versions'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

select public.install_company_link_triggers();
