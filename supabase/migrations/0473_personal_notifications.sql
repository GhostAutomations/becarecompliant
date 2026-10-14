-- 0473: Per person notifications (Phil, 2026-10-14; docs/decisions/personal-notifications.md).
--
-- Thistle's Supervisors asked to be told when a Care Plan Review is completed, so they know to go
-- and do the audit. Notifications are set PER PERSON by the Company Admin (or the Founder).
--
--  1. notification_preferences: what a person is told about. One row per event type and check
--     type, with two ticks, Recent activity (in_app) and Email. Email always comes with Recent
--     activity. Only explicit choices are stored; with no row the DEFAULT applies:
--     a Supervisor is told about "Care Plan Review completed" in Recent activity; everything else
--     is off. Absence meaning the default covers every Supervisor, current and future, in every
--     company, current and future, with no seed to keep in step (0291 uses the same bargain).
--  2. user_notifications: one row per person per completion, read only by that person. Remove
--     sets dismissed_at for them alone. Unique per (person, check, Evidence), so a retry or a
--     double submit makes one row.
--  3. notify_check_completed(): an AFTER UPDATE trigger on check_instances. It fires only when a
--     check gets NEW Evidence (last_evidence_id set to a value it did not have). That is every
--     real completion (form, paper evidence: both go through complete_check) and never an import
--     or a history date (seed_migrated_completion leaves last_evidence_id empty), never a retry
--     with the same Evidence (complete_check changes nothing), and never a back dated form older
--     than the latest (complete_check records it as history and leaves the check alone).
--     Who is told: active people whose role can open the record, in a branch they lead
--     (public.lead_branch_ids_for mirrors my_lead_branch_ids, the RLS fast lane: Managers and
--     Supervisors their own branches; Admin, Responsible Individual, Registered Manager and
--     Recruiter every branch), with the event switched on, and not switched off for their role
--     in Settings (Roles, users and access). Not the person who completed it. Viewers, On Call
--     and carer logins can never be told: they cannot open other people's checks. Archived
--     records, leavers and discharged service users are not notified about; paused ones are.
--  4. set_notification_preferences() and add_notification_branch(): Company Admin and Founder
--     only, checked inside. Adding a branch gives the person that branch as an additional branch
--     (they can then open its records), as Phil chose by popup.
--  5. dismiss_user_notification(): the person's own Remove. Twice does nothing.
--  6. Live: REPLICA IDENTITY FULL and the 0418 broadcast triggers (the table name only, never
--     the row) so the dashboard tile refreshes.

-- 1.
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('check_completed')),
  definition_id uuid references public.check_definitions(id) on delete cascade,
  in_app boolean not null default false,
  email boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_email_needs_in_app check (not email or in_app)
);
create unique index if not exists notification_preferences_one_uidx
  on public.notification_preferences (profile_id, event_type, coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists notification_preferences_company_idx on public.notification_preferences (company_id);
create index if not exists notification_preferences_definition_idx on public.notification_preferences (definition_id);

alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id) or profile_id = (select auth.uid()));
revoke all on public.notification_preferences from anon;
revoke insert, update, delete, truncate on public.notification_preferences from authenticated;

-- 2.
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('check_completed')),
  definition_id uuid references public.check_definitions(id) on delete cascade,
  check_instance_id uuid references public.check_instances(id) on delete cascade,
  evidence_id uuid references public.evidence(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  service_user_id uuid references public.service_users(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  completed_on date,
  email_wanted boolean not null default false,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);
create unique index if not exists user_notifications_once_uidx
  on public.user_notifications (profile_id, event_type, check_instance_id, evidence_id);
create index if not exists user_notifications_mine_idx
  on public.user_notifications (profile_id, created_at desc) where dismissed_at is null;
create index if not exists user_notifications_company_idx on public.user_notifications (company_id);
create index if not exists user_notifications_evidence_idx on public.user_notifications (evidence_id);
alter table public.user_notifications replica identity full;

alter table public.user_notifications enable row level security;
drop policy if exists user_notifications_select on public.user_notifications;
create policy user_notifications_select on public.user_notifications
  for select to authenticated
  using (profile_id = (select auth.uid()));
revoke all on public.user_notifications from anon;
revoke insert, update, delete, truncate on public.user_notifications from authenticated;

-- 3.
-- The branches a person may open records in: my_lead_branch_ids (0415) for any person, not just
-- the caller.
create or replace function public.lead_branch_ids_for(p_profile uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) from (
    select ub.branch_id as id
      from public.profiles p join public.user_branches ub on ub.user_id = p.id
     where p.id = p_profile and p.status = 'active' and p.role in ('manager', 'supervisor')
    union
    select b.id
      from public.profiles p join public.branches b on b.company_id = p.company_id
     where p.id = p_profile and p.status = 'active'
       and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'recruiter')
  ) x;
$$;
revoke all on function public.lead_branch_ids_for(uuid) from public, anon, authenticated;

-- The default when a person has no row for an event: Care Plan Review completed, Recent
-- activity only, for Supervisors. Everything else off.
create or replace function public.notification_default_in_app(p_role text, p_population text, p_key text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_role = 'supervisor' and p_population = 'service_users' and p_key = 'care_plan_review';
$$;

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
     person_id, service_user_id, actor_id, actor_name, completed_on, email_wanted)
  select new.company_id, new.branch_id, p.id, 'check_completed', new.definition_id, new.id, new.last_evidence_id,
         new.person_id, new.service_user_id, v_author, v_author_name, new.last_completed_on,
         coalesce(np.email, false)
    from public.profiles p
    left join public.notification_preferences np
      on np.profile_id = p.id and np.event_type = 'check_completed' and np.definition_id = new.definition_id
   where p.company_id = new.company_id
     and p.status = 'active'
     and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter')
     and p.id is distinct from v_author
     and coalesce(np.in_app, public.notification_default_in_app(p.role, d.population, d.key))
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
revoke all on function public.notify_check_completed() from public, anon, authenticated;

drop trigger if exists check_instances_notify_completed on public.check_instances;
create trigger check_instances_notify_completed
  after update of last_evidence_id on public.check_instances
  for each row
  when (new.last_evidence_id is not null and new.last_evidence_id is distinct from old.last_evidence_id)
  execute function public.notify_check_completed();

-- 4.
-- Every check type of the person's company with what they are told, the default filled in.
-- Company Admin and Founder only.
create or replace function public.get_notification_preferences(p_profile uuid)
returns table (definition_id uuid, population text, check_key text, check_name text, sort_order integer,
               in_app boolean, email boolean, is_default boolean)
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
    raise exception 'Only an Admin can see a person''s notifications.' using errcode = '42501';
  end if;
  return query
    select cd.id, cd.population, cd.key, cd.name, cd.sort_order,
           coalesce(np.in_app, public.notification_default_in_app(t.role, cd.population, cd.key)),
           coalesce(np.email, false),
           np.id is null
      from public.check_definitions cd
      left join public.notification_preferences np
        on np.profile_id = t.id and np.event_type = 'check_completed' and np.definition_id = cd.id
     where cd.company_id = t.company_id and cd.active
     order by cd.population, cd.sort_order, cd.name;
end;
$$;
revoke all on function public.get_notification_preferences(uuid) from public, anon;
grant execute on function public.get_notification_preferences(uuid) to authenticated;

-- p_prefs: [{"definition_id": "...", "in_app": true, "email": false}, ...]
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
    v_in_app := coalesce((r ->> 'in_app')::boolean, false) or v_email;
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
revoke all on function public.set_notification_preferences(uuid, jsonb) from public, anon;
grant execute on function public.set_notification_preferences(uuid, jsonb) to authenticated;

create or replace function public.add_notification_branch(p_profile uuid, p_branch uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.profiles;
begin
  select * into t from public.profiles where id = p_profile;
  if t.id is null or not (public.is_platform_admin() or public.is_company_admin(t.company_id)) then
    raise exception 'Only an Admin can add a branch for a person.' using errcode = '42501';
  end if;
  if t.role not in ('manager', 'supervisor') then
    raise exception 'This role already covers every branch, or cannot be notified.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch and b.company_id = t.company_id
                  and b.kind = 'branch' and b.status = 'active') then
    raise exception 'Choose one of this company''s branches.' using errcode = '22023';
  end if;
  insert into public.user_branches (user_id, branch_id, is_primary)
  values (t.id, p_branch, false)
  on conflict do nothing;
  if found then
    insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
    values (t.company_id, auth.uid(), case when public.is_platform_admin() then 'platform_admin' else 'company_admin' end,
            'notifications.branch_added', 'profile', t.id::text, 'Added a branch for notifications (and access)',
            jsonb_build_object('branch_id', p_branch));
  end if;
end;
$$;
revoke all on function public.add_notification_branch(uuid, uuid) from public, anon;
grant execute on function public.add_notification_branch(uuid, uuid) to authenticated;

-- 5.
create or replace function public.dismiss_user_notification(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.user_notifications
     set dismissed_at = now()
   where id = p_id and profile_id = auth.uid() and dismissed_at is null;
$$;
revoke all on function public.dismiss_user_notification(uuid) from public, anon;
grant execute on function public.dismiss_user_notification(uuid) to authenticated;

-- 6. The 0418 live broadcast: the table name only, to the company's private channel.
drop trigger if exists bcc_live_ins on public.user_notifications;
drop trigger if exists bcc_live_upd on public.user_notifications;
drop trigger if exists bcc_live_del on public.user_notifications;
create trigger bcc_live_ins after insert on public.user_notifications
  referencing new table as new_rows for each statement execute function public.bcc_broadcast_change();
create trigger bcc_live_upd after update on public.user_notifications
  referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change();
create trigger bcc_live_del after delete on public.user_notifications
  referencing old table as old_rows for each statement execute function public.bcc_broadcast_change();

-- Records stay in their own company (0443).
select public.install_company_link_triggers();
