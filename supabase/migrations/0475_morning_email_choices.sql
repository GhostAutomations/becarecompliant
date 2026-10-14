-- 0475: Who gets the morning emails, per person (Phil, 2026-10-15; docs/decisions/personal-notifications.md).
--
-- The same rules as the completion notifications (0473): set per person by the Company Admin or
-- the Founder, in a grid on Settings, Notifications, people across the top, one row per morning
-- email, one Receive tick each. Phil's popups: one row per email; an Admin may give anyone any of
-- them, each covering only what that person can open; Recruiters appear, starting with nothing.
--
-- The four morning emails (the daily-digest cron):
--   branch_digest        overdue and due soon checks in their branches     (today: Supervisors)
--   people_report        People checks, training, SCW, DBS, Right to Work (today: Admin, RI, RM, Branch Manager)
--   service_user_report  Service User checks                               (today: the same)
--   briefings_overdue    briefings past their date                         (today: the same)
--
-- Only explicit choices are stored. With no row, morning_email_default() gives exactly what each
-- role gets today, so applying this changes nobody's email until an Admin changes a tick.
-- The company wide "morning emails on" switch (notification_settings) still governs all of it.

create table if not exists public.morning_email_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email_key text not null check (email_key in ('branch_digest','people_report','service_user_report','briefings_overdue')),
  receive boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (profile_id, email_key)
);
create index if not exists morning_email_preferences_company_idx on public.morning_email_preferences (company_id);

alter table public.morning_email_preferences enable row level security;
drop policy if exists morning_email_preferences_select on public.morning_email_preferences;
create policy morning_email_preferences_select on public.morning_email_preferences
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id) or profile_id = (select auth.uid()));
revoke all on public.morning_email_preferences from anon;
revoke insert, update, delete, truncate on public.morning_email_preferences from authenticated;

-- What each role gets today, unchanged.
create or replace function public.morning_email_default(p_role text, p_key text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_key
    when 'branch_digest' then p_role = 'supervisor'
    else p_role in ('company_admin', 'registered_individual', 'registered_manager', 'manager')
  end;
$$;

-- The grid: one person's four ticks, the default filled in. Company Admin and Founder only.
create or replace function public.get_morning_email_preferences(p_profile uuid)
returns table (email_key text, receive boolean, is_default boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t public.profiles;
begin
  select * into t from public.profiles where id = p_profile;
  if t.id is null or not (public.is_platform_admin() or public.is_company_admin(t.company_id)) then
    raise exception 'Only an Admin can see a person''s morning emails.' using errcode = '42501';
  end if;
  return query
    select k.key, coalesce(mp.receive, public.morning_email_default(t.role, k.key)), mp.id is null
      from unnest(array['branch_digest','people_report','service_user_report','briefings_overdue']) with ordinality as k(key, n)
      left join public.morning_email_preferences mp on mp.profile_id = t.id and mp.email_key = k.key
     order by k.n;
end;
$$;
revoke all on function public.get_morning_email_preferences(uuid) from public, anon;
grant execute on function public.get_morning_email_preferences(uuid) to authenticated;

-- p_prefs: [{"key": "people_report", "receive": true}, ...]
create or replace function public.set_morning_email_preferences(p_profile uuid, p_prefs jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.profiles;
  r jsonb;
  v_key text;
  v_n integer := 0;
begin
  select * into t from public.profiles where id = p_profile;
  if t.id is null or not (public.is_platform_admin() or public.is_company_admin(t.company_id)) then
    raise exception 'Only an Admin can change a person''s morning emails.' using errcode = '42501';
  end if;
  if t.role not in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter') then
    raise exception 'This role cannot open other people''s records, so it cannot get the morning emails.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_prefs) <> 'array' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_prefs) loop
    v_key := r ->> 'key';
    if v_key not in ('branch_digest','people_report','service_user_report','briefings_overdue') then
      raise exception 'That is not one of the morning emails.' using errcode = '22023';
    end if;
    insert into public.morning_email_preferences (company_id, profile_id, email_key, receive, updated_by, updated_at)
    values (t.company_id, t.id, v_key, coalesce((r ->> 'receive')::boolean, false), auth.uid(), now())
    on conflict (profile_id, email_key)
    do update set receive = excluded.receive, updated_by = excluded.updated_by, updated_at = now()
      where public.morning_email_preferences.receive is distinct from excluded.receive;
    v_n := v_n + 1;
  end loop;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (t.company_id, auth.uid(), case when public.is_platform_admin() then 'platform_admin' else 'company_admin' end,
          'notifications.morning_emails_saved', 'profile', t.id::text, 'Saved morning emails', jsonb_build_object('prefs', p_prefs));
  return v_n;
end;
$$;
revoke all on function public.set_morning_email_preferences(uuid, jsonb) from public, anon;
grant execute on function public.set_morning_email_preferences(uuid, jsonb) to authenticated;

-- The cron's answer: for every active person in a role that can get them, which of the four they
-- get. Service role only (the daily-digest cron).
create or replace function public.morning_email_choices(p_company uuid)
returns table (profile_id uuid, email_key text, receive boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, k.key, coalesce(mp.receive, public.morning_email_default(p.role, k.key))
    from public.profiles p
    cross join unnest(array['branch_digest','people_report','service_user_report','briefings_overdue']) as k(key)
    left join public.morning_email_preferences mp on mp.profile_id = p.id and mp.email_key = k.key
   where p.company_id = p_company
     and p.status = 'active'
     and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter');
$$;
revoke all on function public.morning_email_choices(uuid) from public, anon, authenticated;
grant execute on function public.morning_email_choices(uuid) to service_role;

-- Records stay in their own company (0443).
select public.install_company_link_triggers();
