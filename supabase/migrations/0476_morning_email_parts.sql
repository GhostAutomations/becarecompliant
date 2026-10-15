-- 0476: The People and Service User morning reports, broken into parts (Phil, 2026-10-15;
-- docs/decisions/personal-notifications.md).
--
-- Phil: "Lucy needs to have something from People, but she only needs to see training, DBS and
-- right to work." Popups: the People report splits into one part per People check type plus
-- Training, Social Care Wales, DBS and Right to Work; the Service User report into one part per
-- Service User check type; "all" boxes on both bands; the Branch digest stays one row.
--
-- A person's People (or Service User) report carries only the parts ticked for them, and is not
-- sent at all when none is. Every part starts as the whole report did (ticked for Admin,
-- Responsible Individual, Registered Manager and Branch Manager), so nothing changes until an
-- Admin changes a tick. morning_email_preferences had no rows when this was written, so its shape
-- is changed in place.
--
-- email_key now:  branch_digest | briefings_overdue        part ''
--                 people_report                            part 'check:<definition id>' | training | scw | dbs | rtw
--                 service_user_report                      part 'check:<definition id>'

alter table public.morning_email_preferences add column if not exists part text not null default '';
alter table public.morning_email_preferences drop constraint if exists morning_email_preferences_profile_id_email_key_key;
create unique index if not exists morning_email_preferences_one_uidx
  on public.morning_email_preferences (profile_id, email_key, part);

-- Every part of every morning email a company has, in the grid's order, with its name.
create or replace function public.morning_email_parts(p_company uuid)
returns table (email_key text, part text, part_name text, n integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'branch_digest', '', 'Branch digest', 0
  union all
  select 'people_report', 'check:' || cd.id, cd.name, 100 + coalesce(cd.sort_order, 0)
    from public.check_definitions cd where cd.company_id = p_company and cd.population = 'people' and cd.active
  union all
  select 'people_report', x.part, x.name, x.n
    from (values ('training', 'Training', 900), ('scw', 'Social Care Wales', 901), ('dbs', 'DBS', 902), ('rtw', 'Right to Work', 903)) as x(part, name, n)
  union all
  select 'service_user_report', 'check:' || cd.id, cd.name, 1000 + coalesce(cd.sort_order, 0)
    from public.check_definitions cd where cd.company_id = p_company and cd.population = 'service_users' and cd.active
  union all
  select 'briefings_overdue', '', 'Briefings overdue', 2000;
$$;
revoke all on function public.morning_email_parts(uuid) from public, anon, authenticated;

-- The grid: one person's ticks, every part, the default filled in. Company Admin and Founder only.
drop function if exists public.get_morning_email_preferences(uuid);
create function public.get_morning_email_preferences(p_profile uuid)
returns table (email_key text, part text, part_name text, receive boolean, is_default boolean)
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
    select k.email_key, k.part, k.part_name,
           coalesce(mp.receive, public.morning_email_default(t.role, k.email_key)), mp.id is null
      from public.morning_email_parts(t.company_id) k
      left join public.morning_email_preferences mp
        on mp.profile_id = t.id and mp.email_key = k.email_key and mp.part = k.part
     order by k.n, k.part_name;
end;
$$;
revoke all on function public.get_morning_email_preferences(uuid) from public, anon;
grant execute on function public.get_morning_email_preferences(uuid) to authenticated;

-- p_prefs: [{"key": "people_report", "part": "training", "receive": true}, ...]
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
  v_part text;
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
    v_part := coalesce(r ->> 'part', '');
    if not exists (select 1 from public.morning_email_parts(t.company_id) k where k.email_key = v_key and k.part = v_part) then
      raise exception 'That is not one of this company''s morning emails.' using errcode = '22023';
    end if;
    insert into public.morning_email_preferences (company_id, profile_id, email_key, part, receive, updated_by, updated_at)
    values (t.company_id, t.id, v_key, v_part, coalesce((r ->> 'receive')::boolean, false), auth.uid(), now())
    on conflict (profile_id, email_key, part)
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

-- The cron's answer: every active person in a role that can get them, every part, ticked or not.
-- Service role only (the daily-digest cron).
drop function if exists public.morning_email_choices(uuid);
create function public.morning_email_choices(p_company uuid)
returns table (profile_id uuid, email_key text, part text, receive boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, k.email_key, k.part, coalesce(mp.receive, public.morning_email_default(p.role, k.email_key))
    from public.profiles p
    cross join public.morning_email_parts(p_company) k
    left join public.morning_email_preferences mp
      on mp.profile_id = p.id and mp.email_key = k.email_key and mp.part = k.part
   where p.company_id = p_company
     and p.status = 'active'
     and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter');
$$;
revoke all on function public.morning_email_choices(uuid) from public, anon, authenticated;
grant execute on function public.morning_email_choices(uuid) to service_role;
