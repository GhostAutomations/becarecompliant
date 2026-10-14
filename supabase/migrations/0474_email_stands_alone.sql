-- 0474: Email can stand alone (Phil, 2026-10-15, popup "Let Email stand alone";
-- docs/decisions/personal-notifications.md).
--
-- WAS (0473): Email always came with Recent activity: ticking Email ticked Recent activity, and the
-- database refused Email without it. NOW: two separate ticks. A person can be told by email only,
-- by Recent activity only, or both.
--
--  1. The rule that Email needs Recent activity goes.
--  2. user_notifications.show_in_app: a person told by email only still gets a row (it is what
--     the email is sent from, and its once only key), but it is not shown on their Recent activity
--     tile. Every row made so far was made for Recent activity, so they all default to true.
--  3. notify_check_completed: makes a row when Recent activity OR Email is on, and records which.
--  4. set_notification_preferences: stores the two ticks as given (no longer forcing Recent
--     activity on with Email).
-- Nothing else changes: who may be told, the branches, the default, idempotency and the audit.

-- 1.
alter table public.notification_preferences drop constraint if exists notification_preferences_email_needs_in_app;

-- 2.
alter table public.user_notifications add column if not exists show_in_app boolean not null default true;

-- 3.
create or replace function public.notify_check_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d record;
  v_module text;
  v_author uuid;
  v_author_name text;
begin
  select cd.key, cd.name, cd.population into d from public.check_definitions cd where cd.id = new.definition_id;
  if not found or new.branch_id is null then
    return null;
  end if;

  -- Archived records, leavers and discharged service users are not notified about. Paused
  -- (hospital, respite, maternity leave, long term sick) still are.
  if new.person_id is not null then
    if exists (select 1 from public.people pe where pe.id = new.person_id
                and (pe.archived_at is not null or pe.employment_status = 'leaver')) then
      return null;
    end if;
    v_module := 'people';
  elsif new.service_user_id is not null then
    if exists (select 1 from public.service_users su where su.id = new.service_user_id
                and (su.archived_at is not null or su.service_status = 'cancelled')) then
      return null;
    end if;
    v_module := 'service_users';
  else
    return null;
  end if;

  select ev.author_id, ev.author_name into v_author, v_author_name
    from public.evidence ev where ev.id = new.last_evidence_id;

  insert into public.user_notifications
    (company_id, branch_id, profile_id, event_type, definition_id, check_instance_id, evidence_id,
     person_id, service_user_id, actor_id, actor_name, completed_on, email_wanted, show_in_app)
  select new.company_id, new.branch_id, p.id, 'check_completed', new.definition_id, new.id, new.last_evidence_id,
         new.person_id, new.service_user_id, v_author, v_author_name, new.last_completed_on,
         coalesce(np.email, false),
         coalesce(np.in_app, public.notification_default_in_app(p.role, d.population, d.key))
    from public.profiles p
    left join public.notification_preferences np
      on np.profile_id = p.id and np.event_type = 'check_completed' and np.definition_id = new.definition_id
   where p.company_id = new.company_id
     and p.status = 'active'
     and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter')
     and p.id is distinct from v_author
     and (coalesce(np.in_app, public.notification_default_in_app(p.role, d.population, d.key))
          or coalesce(np.email, false))
     and new.branch_id = any (public.lead_branch_ids_for(p.id))
     -- A department switched off for their role, or their company's own role, is not reached.
     and not exists (select 1 from public.company_role_modules m
                      where m.company_id = new.company_id and m.role = p.role and m.module_key = v_module)
     and not exists (select 1 from public.company_role_modules_off o
                      where p.company_role_id is not null and o.company_role_id = p.company_role_id
                        and o.module_key = v_module)
  on conflict do nothing;
  return null;
end;
$$;

-- 4.
create or replace function public.set_notification_preferences(p_profile uuid, p_prefs jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.profiles;
  r jsonb;
  v_def uuid;
  v_in_app boolean;
  v_email boolean;
  v_n integer := 0;
begin
  select * into t from public.profiles where id = p_profile;
  if t.id is null or not (public.is_platform_admin() or public.is_company_admin(t.company_id)) then
    raise exception 'Only an Admin can change a person''s notifications.' using errcode = '42501';
  end if;
  if t.role not in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter') then
    raise exception 'This role cannot open other people''s checks, so it cannot be notified about them.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_prefs) <> 'array' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_prefs) loop
    v_def := (r ->> 'definition_id')::uuid;
    v_email := coalesce((r ->> 'email')::boolean, false);
    v_in_app := coalesce((r ->> 'in_app')::boolean, false);
    if not exists (select 1 from public.check_definitions where id = v_def and company_id = t.company_id) then
      raise exception 'That check type is not in this company.' using errcode = '22023';
    end if;
    insert into public.notification_preferences (company_id, profile_id, event_type, definition_id, in_app, email, updated_by, updated_at)
    values (t.company_id, t.id, 'check_completed', v_def, v_in_app, v_email, auth.uid(), now())
    on conflict (profile_id, event_type, coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set in_app = excluded.in_app, email = excluded.email, updated_by = excluded.updated_by, updated_at = now()
      where public.notification_preferences.in_app is distinct from excluded.in_app
         or public.notification_preferences.email is distinct from excluded.email;
    v_n := v_n + 1;
  end loop;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (t.company_id, auth.uid(), case when public.is_platform_admin() then 'platform_admin' else 'company_admin' end,
          'notifications.preferences_saved', 'profile', t.id::text, 'Saved notifications', jsonb_build_object('prefs', p_prefs));
  return v_n;
end;
$$;
