-- Rota and Visits Stage 6: the MAR (Phil's popups, 2026-10-17; docs/decisions/rota-visits.md,
-- Stage 6 decisions 1 to 13). Record, never decide: no dose sums, no clinical advice.
--
--   service_users (EXISTING, approved: Stage 0 decision 13 and Stage 6 decision 7): four optional
--     columns for every company, shown in Manage record: date_of_birth, gp_practice, nhs_number,
--     allergies. NHS number and allergies are special category health data, held under the
--     existing service user RLS.
--   dmd_products, dmd_releases: our copy of the NHS dm+d (virtual medicinal products), fetched
--     every Monday from TRUD (Open Government Licence for TRUD). Platform reference data, no
--     company data, so no company_id: readable by anyone signed in, written only by the import.
--   rota_mar_medicines: a service user's medicines. Every change is a new version that a second
--     office person (Supervisor or above, not whoever made it) checks before it goes live; until
--     then carers see "call the office" for it. Stopping is immediate.
--   rota_mar_doses: what the carer recorded for each dose, sent from the phone (event id kept once).
--   rota_mar_stock: received, given and corrected quantities per medicine; the balance is the sum.
--   rota_mar_views: when a carer's phone was shown a service user's medicines (audit once a day).
--
-- Also: user_notifications and notification_preferences accept 'dose_issue' (a dose refused or not
-- available tells the office at once, Stage 6 decision 5) with a dose_id link, as 0498 did for
-- concerns; rota_visit_record_versions and rota_visit_record_touch learn about doses (module
-- objects). Nothing is added to the supabase_realtime publication.

-- ============================================================================================
-- 1. The service user record (every company, approved)
-- ============================================================================================

alter table public.service_users add column if not exists date_of_birth date;
alter table public.service_users add column if not exists gp_practice text;
alter table public.service_users add column if not exists nhs_number text;
alter table public.service_users add column if not exists allergies text;
alter table public.service_users drop constraint if exists service_users_gp_practice_len;
alter table public.service_users add constraint service_users_gp_practice_len check (gp_practice is null or length(gp_practice) <= 200);
alter table public.service_users drop constraint if exists service_users_nhs_number_format;
alter table public.service_users add constraint service_users_nhs_number_format check (nhs_number is null or nhs_number ~ '^[0-9]{10}$');
alter table public.service_users drop constraint if exists service_users_allergies_len;
alter table public.service_users add constraint service_users_allergies_len check (allergies is null or length(allergies) <= 1000);
alter table public.service_users drop constraint if exists service_users_dob_range;
alter table public.service_users add constraint service_users_dob_range check (date_of_birth is null or date_of_birth between date '1900-01-01' and date '2100-01-01');

-- ============================================================================================
-- 2. The NHS dm+d copy (platform reference data)
-- ============================================================================================

create table if not exists public.dmd_products (
  id text primary key,                 -- the dm+d VPID
  name text not null,
  form text,
  routes text[] not null default '{}',
  invalid boolean not null default false,
  release text not null,
  updated_at timestamptz not null default now()
);
create index if not exists dmd_products_name on public.dmd_products (lower(name) text_pattern_ops);

create table if not exists public.dmd_releases (
  release text primary key,
  status text not null check (status in ('loaded', 'failed')),
  products integer,
  error text,
  loaded_at timestamptz not null default now(),
  loaded_by uuid
);

alter table public.dmd_products enable row level security;
alter table public.dmd_releases enable row level security;
drop policy if exists dmd_products_read on public.dmd_products;
create policy dmd_products_read on public.dmd_products for select to authenticated using (true);
drop policy if exists dmd_releases_read on public.dmd_releases;
create policy dmd_releases_read on public.dmd_releases for select to authenticated using (true);
revoke insert, update, delete, truncate on public.dmd_products, public.dmd_releases from authenticated;
revoke all on public.dmd_products, public.dmd_releases from anon;

-- ============================================================================================
-- 3. The MAR tables
-- ============================================================================================

create table if not exists public.rota_mar_medicines (
  id uuid primary key default gen_random_uuid(),
  med_uid uuid not null,               -- the same medicine across its versions
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  dmd_id text references public.dmd_products(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 300),
  form text check (form is null or length(form) <= 120),
  route text check (route is null or length(route) <= 120),
  dose_text text not null check (length(btrim(dose_text)) between 1 and 300),
  dose_quantity numeric check (dose_quantity is null or (dose_quantity > 0 and dose_quantity <= 1000)),
  dose_unit text check (dose_unit is null or length(dose_unit) <= 30),
  support text not null check (support in ('prompt', 'assist', 'give')),
  prn boolean not null default false,
  slots text[] not null default '{}',
  days smallint[],                     -- null: every day; otherwise 0 Monday to 6 Sunday
  time_sensitive boolean not null default false,
  instructions text check (instructions is null or length(instructions) <= 1000),
  start_date date not null,
  stop_date date,
  review_date date,
  status text not null check (status in ('awaiting_check', 'live', 'replaced', 'stopped')),
  set_by uuid,
  set_at timestamptz not null default now(),
  checked_by uuid,
  checked_at timestamptz,
  replaced_at timestamptz,
  stopped_by uuid,
  stopped_at timestamptz,
  stop_reason text check (stop_reason is null or length(stop_reason) <= 500),
  created_at timestamptz not null default now(),
  check (prn or cardinality(slots) > 0),
  check (slots <@ array['morning', 'lunch', 'afternoon', 'evening', 'night']::text[]),
  check (days is null or (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])),
  check (stop_date is null or stop_date >= start_date)
);
create unique index if not exists rota_mar_medicines_one_live on public.rota_mar_medicines (med_uid) where status = 'live';
create unique index if not exists rota_mar_medicines_one_waiting on public.rota_mar_medicines (med_uid) where status = 'awaiting_check';
create index if not exists rota_mar_medicines_su on public.rota_mar_medicines (service_user_id, status);
create index if not exists rota_mar_medicines_company on public.rota_mar_medicines (company_id, branch_id);
create index if not exists rota_mar_medicines_dmd on public.rota_mar_medicines (dmd_id) where dmd_id is not null;

create table if not exists public.rota_mar_doses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  medicine_id uuid not null references public.rota_mar_medicines(id) on delete cascade,
  med_uid uuid not null,
  person_id uuid not null references public.people(id) on delete cascade,
  author_name text not null,
  slot text not null default '',       -- the call it was due at; '' for a when required dose
  outcome text not null check (outcome in ('given', 'refused', 'not_available', 'other')),
  reason_code text check (reason_code in ('declined', 'asleep', 'unwell', 'spat_out', 'nil_by_mouth',
                                          'out_of_stock', 'not_delivered', 'not_at_home', 'in_hospital',
                                          'given_by_family', 'given_by_professional', 'other')),
  reason_text text check (reason_text is null or length(reason_text) <= 500),
  quantity numeric check (quantity is null or (quantity > 0 and quantity <= 1000)),
  phone_time timestamptz not null,
  happened_at timestamptz not null,
  server_time timestamptz not null default now(),
  clock_skew_seconds integer,
  flags text[] not null default '{}',
  device_id text check (device_id is null or length(device_id) <= 100),
  device_seq integer,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  check ((outcome = 'given') = (reason_code is null)),
  check (reason_code is distinct from 'other' or length(btrim(coalesce(reason_text, ''))) > 0)
);
create unique index if not exists rota_mar_doses_event_key on public.rota_mar_doses (event_id);
create index if not exists rota_mar_doses_visit on public.rota_mar_doses (visit_id, happened_at);
create index if not exists rota_mar_doses_su on public.rota_mar_doses (service_user_id, happened_at desc);
create index if not exists rota_mar_doses_med on public.rota_mar_doses (med_uid, happened_at desc);
create index if not exists rota_mar_doses_medicine on public.rota_mar_doses (medicine_id);
create index if not exists rota_mar_doses_company on public.rota_mar_doses (company_id, branch_id, happened_at);
create index if not exists rota_mar_doses_person on public.rota_mar_doses (person_id);

create table if not exists public.rota_mar_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  med_uid uuid not null,
  change numeric not null check (change <> 0 and abs(change) <= 100000),
  kind text not null check (kind in ('received', 'given', 'corrected')),
  reason text check (reason is null or length(reason) <= 500),
  dose_id uuid references public.rota_mar_doses(id) on delete cascade,
  by_profile uuid,
  created_at timestamptz not null default now(),
  check (kind <> 'corrected' or length(btrim(coalesce(reason, ''))) > 0),
  check (kind <> 'received' or change > 0)
);
create index if not exists rota_mar_stock_med on public.rota_mar_stock (med_uid);
create index if not exists rota_mar_stock_su on public.rota_mar_stock (service_user_id);
create index if not exists rota_mar_stock_company on public.rota_mar_stock (company_id, branch_id);
create unique index if not exists rota_mar_stock_dose on public.rota_mar_stock (dose_id) where dose_id is not null;

create table if not exists public.rota_mar_views (
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  viewed_on date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, service_user_id, viewed_on)
);
create index if not exists rota_mar_views_company on public.rota_mar_views (company_id);
create index if not exists rota_mar_views_su on public.rota_mar_views (service_user_id);

-- ============================================================================================
-- 4. Notifications: 'dose_issue' (approved with the concern change, Stage 6 decision 5)
-- ============================================================================================

alter table public.user_notifications drop constraint if exists user_notifications_event_type_check;
alter table public.user_notifications add constraint user_notifications_event_type_check
  check (event_type in ('check_completed', 'concern_raised', 'dose_issue'));
alter table public.user_notifications add column if not exists dose_id uuid references public.rota_mar_doses(id) on delete cascade;
create unique index if not exists user_notifications_dose_once on public.user_notifications (profile_id, dose_id) where dose_id is not null;
create index if not exists user_notifications_dose_idx on public.user_notifications (dose_id) where dose_id is not null;
alter table public.notification_preferences drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences add constraint notification_preferences_event_type_check
  check (event_type in ('check_completed', 'concern_raised', 'dose_issue'));

-- ============================================================================================
-- 5. Row level security. No writes for anyone signed in: every write goes through the
--    functions below.
-- ============================================================================================

alter table public.rota_mar_medicines enable row level security;
alter table public.rota_mar_doses enable row level security;
alter table public.rota_mar_stock enable row level security;
alter table public.rota_mar_views enable row level security;

drop policy if exists rota_mar_medicines_read on public.rota_mar_medicines;
create policy rota_mar_medicines_read on public.rota_mar_medicines for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));
drop policy if exists rota_mar_doses_read on public.rota_mar_doses;
create policy rota_mar_doses_read on public.rota_mar_doses for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or person_id = any ((select public.rota_my_person_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));
drop policy if exists rota_mar_stock_read on public.rota_mar_stock;
create policy rota_mar_stock_read on public.rota_mar_stock for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[])
         or ((select public.is_platform_admin()) and public.company_module_on(company_id, 'rota_visits')));

revoke insert, update, delete, truncate on public.rota_mar_medicines, public.rota_mar_doses, public.rota_mar_stock, public.rota_mar_views from authenticated;
revoke all on public.rota_mar_medicines, public.rota_mar_doses, public.rota_mar_stock, public.rota_mar_views from anon;

-- ============================================================================================
-- 6. Helpers (internal)
-- ============================================================================================

-- An in date Medication Competency (Stage 6 decision 12): the person's own check with the key
-- 'competency' is completed and not past its due date (or expiry).
create or replace function public.rota_med_competent(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.check_instances ci
      join public.check_definitions cd on cd.id = ci.definition_id
     where ci.person_id = p_person and ci.active
       and cd.key = 'competency' and cd.population = 'people'
       and ci.last_completed_on is not null
       and (ci.due_date is null or ci.due_date >= (now() at time zone 'Europe/London')::date)
       and (ci.expiry_date is null or ci.expiry_date >= (now() at time zone 'Europe/London')::date));
$$;

-- May the caller set a service user's MAR? The rota office of the branch, or the Founder.
create or replace function public.rota_mar_can_edit(p_su uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.service_users s
     where s.id = p_su and public.company_module_on(s.company_id, 'rota_visits')
       and (s.branch_id = any (public.rota_office_branch_ids()) or public.is_platform_admin()));
$$;

-- The call a visit was made from: its slot ('' when none), from the generated key (0491).
create or replace function public.rota_visit_slot(p_visit uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(split_part(v.generated_key, ':', 4), '') from public.rota_visits v where v.id = p_visit;
$$;

-- ============================================================================================
-- 7. The office: setting up, checking, stopping, stock
-- ============================================================================================

-- p_data: {name, dmd_id, form, route, dose_text, dose_quantity, dose_unit, support, prn, slots[],
-- days[] or null, time_sensitive, instructions, start_date, stop_date, review_date}.
-- A new medicine (p_med_uid null) or a change to one: a new version waiting for its second check.
create or replace function public.rota_mar_save(p_su uuid, p_med_uid uuid, p_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s record; v_uid uuid; v_id uuid; v_slots text[]; v_days smallint[]; v_prn boolean; v_name text;
begin
  if not public.rota_mar_can_edit(p_su) then
    raise exception 'Only the rota office of the service user''s branch can set the MAR.' using errcode = '42501';
  end if;
  select id, company_id, branch_id, full_name into s from public.service_users where id = p_su;
  if p_med_uid is not null then
    if not exists (select 1 from public.rota_mar_medicines m where m.med_uid = p_med_uid and m.service_user_id = p_su and m.status in ('live', 'awaiting_check')) then
      raise exception 'That medicine could not be found.' using errcode = 'P0002';
    end if;
    v_uid := p_med_uid;
  else
    v_uid := gen_random_uuid();
  end if;
  v_name := btrim(coalesce(p_data->>'name', ''));
  if v_name = '' then raise exception 'Choose the medicine.' using errcode = '22023'; end if;
  if btrim(coalesce(p_data->>'dose_text', '')) = '' then raise exception 'Enter the dose as it is on the label.' using errcode = '22023'; end if;
  v_prn := coalesce((p_data->>'prn')::boolean, false);
  select coalesce(array_agg(distinct x), '{}') into v_slots from jsonb_array_elements_text(coalesce(p_data->'slots', '[]'::jsonb)) x;
  if not v_prn and cardinality(v_slots) = 0 then raise exception 'Choose at least one call it is given at, or tick When required.' using errcode = '22023'; end if;
  if jsonb_typeof(p_data->'days') = 'array' and jsonb_array_length(p_data->'days') between 1 and 6 then
    select array_agg(distinct (x)::smallint order by (x)::smallint) into v_days from jsonb_array_elements_text(p_data->'days') x;
  else
    v_days := null;
  end if;
  if (p_data->>'dmd_id') is not null and not exists (select 1 from public.dmd_products d where d.id = p_data->>'dmd_id') then
    raise exception 'That medicine is not on the NHS list.' using errcode = '22023';
  end if;

  -- A change still waiting is replaced by this one.
  update public.rota_mar_medicines set status = 'replaced', replaced_at = now()
   where med_uid = v_uid and status = 'awaiting_check';

  insert into public.rota_mar_medicines (med_uid, company_id, branch_id, service_user_id, dmd_id, name, form, route, dose_text,
         dose_quantity, dose_unit, support, prn, slots, days, time_sensitive, instructions, start_date, stop_date, review_date,
         status, set_by)
  values (v_uid, s.company_id, s.branch_id, s.id, nullif(p_data->>'dmd_id', ''), left(v_name, 300),
          left(nullif(btrim(coalesce(p_data->>'form', '')), ''), 120), left(nullif(btrim(coalesce(p_data->>'route', '')), ''), 120),
          left(btrim(p_data->>'dose_text'), 300), nullif(p_data->>'dose_quantity', '')::numeric,
          left(nullif(btrim(coalesce(p_data->>'dose_unit', '')), ''), 30), coalesce(p_data->>'support', 'give'), v_prn,
          case when v_prn then '{}'::text[] else v_slots end, v_days, coalesce((p_data->>'time_sensitive')::boolean, false),
          left(nullif(btrim(coalesce(p_data->>'instructions', '')), ''), 1000),
          coalesce(nullif(p_data->>'start_date', '')::date, (now() at time zone 'Europe/London')::date),
          nullif(p_data->>'stop_date', '')::date, nullif(p_data->>'review_date', '')::date, 'awaiting_check', auth.uid())
  returning id into v_id;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (s.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
          case when p_med_uid is null then 'rota.mar_medicine_added' else 'rota.mar_medicine_changed' end,
          'service_user', s.id::text,
          (case when p_med_uid is null then 'Added ' else 'Changed ' end) || left(v_name, 120) || ' on the MAR, waiting for a second check',
          jsonb_build_object('medicine_id', v_id, 'med_uid', v_uid));
  return v_id;
end;
$$;

-- The second check (Stage 6 decision 4): a different office login, Supervisor or above.
create or replace function public.rota_mar_check(p_medicine uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  m record; v_role text;
begin
  select * into m from public.rota_mar_medicines where id = p_medicine;
  if m.id is null or not public.rota_mar_can_edit(m.service_user_id) then
    raise exception 'That medicine could not be found.' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if not (public.is_platform_admin() or v_role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')) then
    raise exception 'Only a Supervisor or above can check a MAR.' using errcode = '42501';
  end if;
  if m.status <> 'awaiting_check' then raise exception 'That medicine is not waiting for a check.' using errcode = '22023'; end if;
  if m.set_by = auth.uid() then
    raise exception 'The second check must be done by someone other than the person who set it.' using errcode = '42501';
  end if;
  update public.rota_mar_medicines set status = 'replaced', replaced_at = now() where med_uid = m.med_uid and status = 'live';
  update public.rota_mar_medicines set status = 'live', checked_by = auth.uid(), checked_at = now() where id = m.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (m.company_id, auth.uid(), v_role, 'rota.mar_medicine_checked', 'service_user', m.service_user_id::text,
          'Checked ' || left(m.name, 120) || ' on the MAR: now live', jsonb_build_object('medicine_id', m.id, 'set_by', m.set_by));
end;
$$;

-- Withdraw a change still waiting for its check (the live version, if any, stays).
create or replace function public.rota_mar_withdraw(p_medicine uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare m record;
begin
  select * into m from public.rota_mar_medicines where id = p_medicine;
  if m.id is null or not public.rota_mar_can_edit(m.service_user_id) then
    raise exception 'That medicine could not be found.' using errcode = '42501';
  end if;
  if m.status <> 'awaiting_check' then raise exception 'That medicine is not waiting for a check.' using errcode = '22023'; end if;
  update public.rota_mar_medicines set status = 'replaced', replaced_at = now() where id = m.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (m.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()), 'rota.mar_change_withdrawn',
          'service_user', m.service_user_id::text, 'Withdrew a change to ' || left(m.name, 120) || ' on the MAR', jsonb_build_object('medicine_id', m.id));
end;
$$;

-- Stop a medicine: immediate (a stopped medicine must not be given while a check waits).
create or replace function public.rota_mar_stop(p_med_uid uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare m record;
begin
  select * into m from public.rota_mar_medicines where med_uid = p_med_uid and status in ('live', 'awaiting_check') order by (status = 'live') desc limit 1;
  if m.id is null or not public.rota_mar_can_edit(m.service_user_id) then
    raise exception 'That medicine could not be found.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Say why it is stopped.' using errcode = '22023'; end if;
  update public.rota_mar_medicines set status = 'stopped', stopped_by = auth.uid(), stopped_at = now(), stop_reason = left(btrim(p_reason), 500)
   where med_uid = p_med_uid and status in ('live', 'awaiting_check');
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (m.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()), 'rota.mar_medicine_stopped',
          'service_user', m.service_user_id::text, 'Stopped ' || left(m.name, 120) || ' on the MAR', jsonb_build_object('med_uid', p_med_uid, 'reason', left(btrim(p_reason), 500)));
end;
$$;

-- Stock received, or a correction with a reason (Stage 6 decision 8).
create or replace function public.rota_mar_stock_change(p_med_uid uuid, p_change numeric, p_kind text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare m record;
begin
  select * into m from public.rota_mar_medicines where med_uid = p_med_uid and status in ('live', 'awaiting_check', 'stopped') order by created_at desc limit 1;
  if m.id is null or not public.rota_mar_can_edit(m.service_user_id) then
    raise exception 'That medicine could not be found.' using errcode = '42501';
  end if;
  if p_kind not in ('received', 'corrected') then raise exception 'That is not a stock change.' using errcode = '22023'; end if;
  if p_change is null or p_change = 0 then raise exception 'Enter the quantity.' using errcode = '22023'; end if;
  if p_kind = 'received' and p_change < 0 then raise exception 'A quantity received cannot be negative.' using errcode = '22023'; end if;
  if p_kind = 'corrected' and nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Say why the count is corrected.' using errcode = '22023'; end if;
  insert into public.rota_mar_stock (company_id, branch_id, service_user_id, med_uid, change, kind, reason, by_profile)
  values (m.company_id, m.branch_id, m.service_user_id, p_med_uid, p_change, p_kind, nullif(left(btrim(coalesce(p_reason, '')), 500), ''), auth.uid());
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (m.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()), 'rota.mar_stock_' || p_kind,
          'service_user', m.service_user_id::text,
          (case when p_kind = 'received' then 'Recorded ' || p_change || ' received of ' else 'Corrected the count of ' end) || left(m.name, 120),
          jsonb_build_object('med_uid', p_med_uid, 'change', p_change, 'reason', p_reason));
end;
$$;

-- ============================================================================================
-- 8. The carer's phone: the doses on their visits, and sending what they recorded
-- ============================================================================================

-- For each of the carer's visits from yesterday to tomorrow: whether they may record doses, the
-- service user's allergies, and the medicines due at that call plus the when required ones, each
-- with its checked state, the last time a when required dose was given, and what this carer has
-- recorded on the visit. Shown medicines are audit logged once a day per service user.
create or replace function public.rota_my_visit_doses()
returns table (visit_id uuid, competent boolean, allergies text, meds jsonb)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_mine uuid[]; v_today date; r record;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  v_mine := public.rota_my_person_ids();
  if coalesce(array_length(v_mine, 1), 0) = 0 then return; end if;
  v_today := (now() at time zone 'Europe/London')::date;

  for r in
    select distinct rv.company_id, rv.service_user_id
      from public.rota_visit_assignments a
      join public.rota_visits rv on rv.id = a.visit_id and rv.status = 'published'
     where a.person_id = any (v_mine) and a.status = 'active'
       and rv.visit_date between v_today - 1 and v_today + 1
       and exists (select 1 from public.rota_mar_medicines m where m.service_user_id = rv.service_user_id and m.status in ('live', 'awaiting_check'))
  loop
    insert into public.rota_mar_views (company_id, profile_id, service_user_id, viewed_on)
    values (r.company_id, auth.uid(), r.service_user_id, v_today) on conflict do nothing;
    if found then
      insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary)
      values (r.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
              'rota.mar_viewed', 'service_user', r.service_user_id::text, 'Shown the MAR on the Clock in page');
    end if;
  end loop;

  return query
  with mine as (
    select distinct on (rv.id) rv.id as visit_id, rv.service_user_id, rv.visit_date, a.person_id,
           coalesce(split_part(rv.generated_key, ':', 4), '') as slot,
           (extract(isodow from rv.visit_date)::int - 1)::smallint as dow
      from public.rota_visit_assignments a
      join public.rota_visits rv on rv.id = a.visit_id and rv.status = 'published'
     where a.person_id = any (v_mine) and a.status = 'active'
       and rv.visit_date between v_today - 1 and v_today + 1
  ),
  current_meds as (
    -- One row per medicine: the live version, or the newest one waiting (then not recordable).
    select distinct on (m.med_uid) m.*, exists (select 1 from public.rota_mar_medicines w where w.med_uid = m.med_uid and w.status = 'awaiting_check') as waiting
      from public.rota_mar_medicines m
     where m.status in ('live', 'awaiting_check')
     order by m.med_uid, (m.status = 'live') desc, m.created_at desc
  )
  select mi.visit_id, public.rota_med_competent(mi.person_id),
         (select su.allergies from public.service_users su where su.id = mi.service_user_id),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'med_uid', cm.med_uid,
                     'medicine_id', case when cm.status = 'live' and not cm.waiting then cm.id end,
                     'name', cm.name, 'form', cm.form, 'route', cm.route, 'dose_text', cm.dose_text,
                     'dose_quantity', cm.dose_quantity, 'dose_unit', cm.dose_unit, 'support', cm.support, 'prn', cm.prn,
                     'time_sensitive', cm.time_sensitive, 'instructions', cm.instructions,
                     'waiting', cm.waiting or cm.status <> 'live',
                     'last_given', (select jsonb_build_object('at', d.happened_at, 'quantity', d.quantity)
                                      from public.rota_mar_doses d where d.med_uid = cm.med_uid and d.outcome = 'given'
                                     order by d.happened_at desc limit 1),
                     'recorded', (select jsonb_build_object('outcome', d.outcome, 'reason_code', d.reason_code, 'reason_text', d.reason_text,
                                                            'quantity', d.quantity, 'at', d.happened_at)
                                    from public.rota_mar_doses d where d.med_uid = cm.med_uid and d.visit_id = mi.visit_id and d.person_id = mi.person_id
                                   order by d.happened_at desc limit 1))
                     order by cm.prn, cm.name)
                     from current_meds cm
                    where cm.service_user_id = mi.service_user_id
                      and cm.start_date <= mi.visit_date
                      and (cm.stop_date is null or cm.stop_date >= mi.visit_date)
                      and (cm.prn or (mi.slot = any (cm.slots) and (cm.days is null or mi.dow = any (cm.days))))), '[]'::jsonb)
    from mine mi;
end;
$$;

-- Tells the office about a dose refused or not available (Stage 6 decision 5): the same people
-- and rules as a concern (0498), by their own choice or the default (Supervisors: Recent activity).
create or replace function public.rota_notify_dose(p_dose uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare d record; n integer;
begin
  select * into d from public.rota_mar_doses where id = p_dose;
  if d.id is null or d.outcome not in ('refused', 'not_available') then return 0; end if;
  insert into public.user_notifications
    (company_id, branch_id, profile_id, event_type, service_user_id, actor_id, actor_name, completed_on, email_wanted, show_in_app, dose_id)
  select d.company_id, d.branch_id, p.id, 'dose_issue', d.service_user_id, d.recorded_by, d.author_name,
         (d.happened_at at time zone 'Europe/London')::date, coalesce(np.email, false), coalesce(np.in_app, p.role = 'supervisor'), d.id
    from public.profiles p
    left join public.notification_preferences np
      on np.profile_id = p.id and np.event_type = 'dose_issue' and np.definition_id is null
   where p.company_id = d.company_id and p.status = 'active'
     and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')
     and p.id is distinct from d.recorded_by
     and (coalesce(np.in_app, p.role = 'supervisor') or coalesce(np.email, false))
     and d.branch_id = any (public.lead_branch_ids_for(p.id))
     and not exists (select 1 from public.company_role_modules m
                      where m.company_id = d.company_id and m.role = p.role and m.module_key = 'service_users')
     and not exists (select 1 from public.company_role_modules_off o
                      where p.company_role_id is not null and o.company_role_id = p.company_role_id and o.module_key = 'service_users')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Each event: {event_id, visit_id, med_uid, medicine_id, outcome, reason_code, reason_text,
-- quantity, phone_time, device_id, device_seq}. The approved offline rules: each once, Accepted /
-- Already had it / Refused with the reason (kept for the office).
create or replace function public.rota_dose_submit(p_events jsonb, p_phone_now timestamptz)
returns table (event_id uuid, result text, reason text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  ev jsonb; v_event uuid; v_visit record; v_med record; v_person uuid; v_name text; v_mine uuid[];
  v_skew integer; v_phone timestamptz; v_happened timestamptz; v_flags text[]; v_outcome text; v_reason text;
  v_qty numeric; v_err text; v_company uuid; v_branch uuid; v_slot text; v_dow smallint; v_dose uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200 then
    raise exception 'A batch is a list of up to 200 records.' using errcode = '22023';
  end if;
  v_mine := public.rota_my_person_ids();
  v_skew := case when p_phone_now is null then null else round(extract(epoch from (now() - p_phone_now)))::integer end;

  for ev in select * from jsonb_array_elements(p_events) loop
    v_event := null; v_person := null; v_company := null; v_branch := null; v_dose := null;
    begin
      v_event := (ev->>'event_id')::uuid;
      if v_event is null then raise exception 'The record has no id.' using errcode = '22023'; end if;
      if exists (select 1 from public.rota_mar_doses d where d.event_id = v_event) then
        event_id := v_event; result := 'duplicate'; reason := null; return next; continue;
      end if;
      select rv.id, rv.company_id, rv.branch_id, rv.service_user_id, rv.visit_date, rv.generated_key into v_visit
        from public.rota_visits rv where rv.id = (ev->>'visit_id')::uuid;
      if v_visit.id is null then raise exception 'That visit could not be found.' using errcode = 'P0002'; end if;
      v_company := v_visit.company_id; v_branch := v_visit.branch_id;
      if not public.company_module_on(v_visit.company_id, 'rota_visits') then raise exception 'Rota and Visits is not switched on.' using errcode = '42501'; end if;
      select pe.id, pe.full_name into v_person, v_name from public.people pe where pe.id = any (v_mine) and pe.company_id = v_visit.company_id limit 1;
      if v_person is null then raise exception 'This record is not for the person signed in.' using errcode = '42501'; end if;
      if not exists (select 1 from public.rota_visit_assignments a where a.visit_id = v_visit.id and a.person_id = v_person) then
        raise exception 'That visit was never yours.' using errcode = '42501';
      end if;
      if not public.rota_med_competent(v_person) then
        raise exception 'You have no in date Medication Competency, so you cannot record doses. Call the office.' using errcode = '42501';
      end if;
      select * into v_med from public.rota_mar_medicines m where m.id = (ev->>'medicine_id')::uuid and m.med_uid = (ev->>'med_uid')::uuid;
      if v_med.id is null or v_med.service_user_id <> v_visit.service_user_id then raise exception 'That medicine is not on this service user''s MAR.' using errcode = 'P0002'; end if;
      if v_med.status <> 'live' then raise exception 'That medicine has changed or stopped. Call the office.' using errcode = '22023'; end if;
      v_slot := coalesce(split_part(v_visit.generated_key, ':', 4), '');
      v_dow := (extract(isodow from v_visit.visit_date)::int - 1)::smallint;
      if not v_med.prn and not (v_slot = any (v_med.slots) and (v_med.days is null or v_dow = any (v_med.days))) then
        raise exception 'That medicine is not due at this visit.' using errcode = '22023';
      end if;

      v_outcome := ev->>'outcome';
      v_reason := nullif(ev->>'reason_code', '');
      if v_outcome not in ('given', 'refused', 'not_available', 'other') then raise exception 'The record is not complete.' using errcode = '22023'; end if;
      if v_outcome = 'given' then
        v_reason := null;
        v_qty := coalesce(nullif(ev->>'quantity', '')::numeric, v_med.dose_quantity);
        if v_med.prn and v_qty is null then raise exception 'Enter how many were given.' using errcode = '22023'; end if;
      else
        v_qty := null;
        if v_outcome = 'other' then v_reason := 'other'; end if;
        if v_reason is null then raise exception 'A dose not given needs a reason.' using errcode = '22023'; end if;
        if v_outcome = 'refused' and v_reason not in ('declined', 'asleep', 'unwell', 'spat_out', 'nil_by_mouth', 'other') then
          raise exception 'That reason does not fit Refused.' using errcode = '22023';
        end if;
        if v_outcome = 'not_available' and v_reason not in ('out_of_stock', 'not_delivered', 'not_at_home', 'in_hospital', 'given_by_family', 'given_by_professional', 'other') then
          raise exception 'That reason does not fit Not available.' using errcode = '22023';
        end if;
        if v_reason = 'other' and nullif(btrim(coalesce(ev->>'reason_text', '')), '') is null then raise exception 'Type the reason.' using errcode = '22023'; end if;
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

      insert into public.rota_mar_doses (event_id, company_id, branch_id, service_user_id, visit_id, medicine_id, med_uid, person_id,
             author_name, slot, outcome, reason_code, reason_text, quantity, phone_time, happened_at, clock_skew_seconds, flags,
             device_id, device_seq, recorded_by)
      values (v_event, v_visit.company_id, v_visit.branch_id, v_visit.service_user_id, v_visit.id, v_med.id, v_med.med_uid, v_person,
              coalesce(v_name, 'Carer'), case when v_med.prn then '' else v_slot end, v_outcome, v_reason,
              case when v_reason = 'other' then left(btrim(ev->>'reason_text'), 500) end, v_qty, v_phone, v_happened, v_skew, v_flags,
              left(ev->>'device_id', 100), nullif(ev->>'device_seq', '')::integer, auth.uid())
      returning id into v_dose;
      if v_outcome = 'given' and v_qty is not null then
        insert into public.rota_mar_stock (company_id, branch_id, service_user_id, med_uid, change, kind, dose_id, by_profile)
        values (v_visit.company_id, v_visit.branch_id, v_visit.service_user_id, v_med.med_uid, -v_qty, 'given', v_dose, auth.uid());
      end if;
      perform public.rota_notify_dose(v_dose);
      event_id := v_event; result := 'accepted'; reason := null; return next;
    exception when others then
      if sqlstate = '23505' then
        event_id := v_event; result := 'duplicate'; reason := null; return next; continue;
      end if;
      v_err := sqlerrm;
      begin
        insert into public.rota_clock_problems (company_id, branch_id, person_id, profile_id, event_id, event, reason)
        values (coalesce(v_company, (select p.company_id from public.profiles p where p.id = auth.uid())),
                v_branch, v_person, auth.uid(), v_event, ev || jsonb_build_object('record', 'dose'), v_err)
        on conflict do nothing;
      exception when others then null;
      end;
      event_id := v_event; result := 'refused'; reason := v_err; return next;
    end;
  end loop;
end;
$$;

-- ============================================================================================
-- 9. The Visit record learns about doses (module objects)
-- ============================================================================================

alter table public.rota_visit_record_versions drop constraint if exists rota_visit_record_versions_reason_check;
alter table public.rota_visit_record_versions add constraint rota_visit_record_versions_reason_check
  check (reason in ('clock_out', 'task', 'note', 'correction', 'concern', 'dose'));

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
    or exists (select 1 from public.rota_concerns c where c.visit_id = p_visit and c.server_time > v_last.made_at)
    or exists (select 1 from public.rota_mar_doses d where d.visit_id = p_visit and d.server_time > v_last.made_at)) then
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
  elsif tg_table_name = 'rota_mar_doses' then
    perform public.rota_visit_record_touch(new.visit_id, 'dose');
  end if;
  return null;
end;
$$;

drop trigger if exists rota_visit_record_version on public.rota_mar_doses;
create trigger rota_visit_record_version after insert on public.rota_mar_doses
  for each row execute function public.rota_visit_record_after_insert();

-- ============================================================================================
-- 10. Settings, Notifications: the "Dose refused or not available" row (generic for module alerts)
-- ============================================================================================

create or replace function public.rota_alert_notification_grid(p_company uuid, p_event text)
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
  if p_event not in ('concern_raised', 'dose_issue') then raise exception 'That is not a Rota and Visits alert.' using errcode = '22023'; end if;
  if not public.company_module_on(p_company, 'rota_visits') then return; end if;
  return query
    select p.id, coalesce(np.in_app, p.role = 'supervisor'), coalesce(np.email, false), np.id is null
      from public.profiles p
      left join public.notification_preferences np
        on np.profile_id = p.id and np.event_type = p_event and np.definition_id is null
     where p.company_id = p_company and p.status in ('active', 'invited')
       and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor');
end;
$$;

create or replace function public.rota_set_alert_notification(p_profile uuid, p_event text, p_in_app boolean, p_email boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare t public.profiles;
begin
  select * into t from public.profiles where id = p_profile;
  if t.id is null or not (public.is_platform_admin() or public.is_company_admin(t.company_id)) then
    raise exception 'Only an Admin can change a person''s notifications.' using errcode = '42501';
  end if;
  if p_event not in ('concern_raised', 'dose_issue') then raise exception 'That is not a Rota and Visits alert.' using errcode = '22023'; end if;
  if not public.company_module_on(t.company_id, 'rota_visits') then raise exception 'Rota and Visits is not switched on.' using errcode = '42501'; end if;
  if t.role not in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor') then
    raise exception 'This role cannot open the MAR or concerns, so it cannot be told about them.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (company_id, profile_id, event_type, definition_id, in_app, email, updated_by, updated_at)
  values (t.company_id, t.id, p_event, null, coalesce(p_in_app, false) or coalesce(p_email, false), coalesce(p_email, false), auth.uid(), now())
  on conflict (profile_id, event_type, coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set in_app = excluded.in_app, email = excluded.email, updated_by = excluded.updated_by, updated_at = now()
    where public.notification_preferences.in_app is distinct from excluded.in_app
       or public.notification_preferences.email is distinct from excluded.email;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (t.company_id, auth.uid(), case when public.is_platform_admin() then 'platform_admin' else 'company_admin' end,
          'notifications.preferences_saved', 'profile', t.id::text, 'Saved notifications: ' || p_event,
          jsonb_build_object(p_event, jsonb_build_object('in_app', p_in_app, 'email', p_email)));
end;
$$;

-- ============================================================================================
-- 11. Grants, live updates, company links
-- ============================================================================================

revoke all on function public.rota_med_competent(uuid) from public, anon, authenticated;
revoke all on function public.rota_mar_can_edit(uuid) from public, anon, authenticated;
revoke all on function public.rota_visit_slot(uuid) from public, anon, authenticated;
revoke all on function public.rota_notify_dose(uuid) from public, anon, authenticated;

revoke all on function public.rota_mar_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rota_mar_save(uuid, uuid, jsonb) to authenticated;
revoke all on function public.rota_mar_check(uuid) from public, anon;
grant execute on function public.rota_mar_check(uuid) to authenticated;
revoke all on function public.rota_mar_withdraw(uuid) from public, anon;
grant execute on function public.rota_mar_withdraw(uuid) to authenticated;
revoke all on function public.rota_mar_stop(uuid, text) from public, anon;
grant execute on function public.rota_mar_stop(uuid, text) to authenticated;
revoke all on function public.rota_mar_stock_change(uuid, numeric, text, text) from public, anon;
grant execute on function public.rota_mar_stock_change(uuid, numeric, text, text) to authenticated;
revoke all on function public.rota_my_visit_doses() from public, anon;
grant execute on function public.rota_my_visit_doses() to authenticated;
revoke all on function public.rota_dose_submit(jsonb, timestamptz) from public, anon;
grant execute on function public.rota_dose_submit(jsonb, timestamptz) to authenticated;
revoke all on function public.rota_alert_notification_grid(uuid, text) from public, anon;
grant execute on function public.rota_alert_notification_grid(uuid, text) to authenticated;
revoke all on function public.rota_set_alert_notification(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.rota_set_alert_notification(uuid, text, boolean, boolean) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['rota_mar_medicines','rota_mar_doses','rota_mar_stock'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

select public.install_company_link_triggers();
