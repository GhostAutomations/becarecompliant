-- Be Care Compliant 0506: live attendance alerts (Rota and Visits Stage 7, Phil's popups 2026-10-17;
-- docs/decisions/rota-visits.md, Stage 7).
--
-- A scheduled job (behind CRON_SECRET) calls rota_alerts_run every minute. It raises, once per
-- visit for each kind:
--   late              no clock in 15 minutes after the start (a double up while any carer on it
--                     has not clocked in; a visit with no carer too)
--   missed            no clock in at all 30 minutes after the end
--   dose_not_recorded every carer who clocked in has clocked out and a due regular dose was
--                     recorded neither way
-- Paused (hospital or respite), draft and cancelled visits never alert. A time sensitive medicine
-- due at the visit marks the alert urgent. Each alert tells, in the app only, the branch's office
-- (by their Settings, Notifications rows: on by default for Managers and Supervisors) and whoever
-- is on Out of Hours for that branch at that moment. A Supervisor or above clears each alert down
-- with a reason (Alerts tab).
--
-- Approved changes to existing objects (Phil's popups): user_notifications accepts visit_late,
-- visit_missed and dose_not_recorded and gains visit_id (empty for every other notice);
-- notification_preferences accepts the same three events. Everything else is new or a Stage 6/7
-- module function. Housekeeping: indexes on 13 module foreign keys the performance advisor flagged.

-- 1. The alerts ---------------------------------------------------------------------------------
create table if not exists public.rota_visit_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  visit_id uuid not null references public.rota_visits(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  kind text not null check (kind in ('late', 'missed', 'dose_not_recorded')),
  urgent boolean not null default false,
  detail jsonb not null default '{}'::jsonb,   -- carers not clocked in, medicines not recorded
  notified integer not null default 0,         -- how many people were told
  raised_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references public.profiles(id) on delete set null,
  clear_reason text check (clear_reason is null or clear_reason in (
    'arrived_late', 'forgot_clock_in', 'covered', 'su_cancelled', 'su_hospital', 'moved', 'forgot_record',
    'dose_reason_told', 'medicine_changed', 'other')),
  clear_text text check (clear_text is null or length(clear_text) <= 500),
  unique (visit_id, kind),
  check ((cleared_at is null) = (clear_reason is null)),
  check (clear_reason is distinct from 'other' or length(btrim(coalesce(clear_text, ''))) > 0)
);
create index if not exists rota_visit_alerts_company on public.rota_visit_alerts (company_id, raised_at desc);
create index if not exists rota_visit_alerts_branch on public.rota_visit_alerts (branch_id, raised_at desc);
create index if not exists rota_visit_alerts_open on public.rota_visit_alerts (branch_id) where cleared_at is null;
create index if not exists rota_visit_alerts_su on public.rota_visit_alerts (service_user_id);
create index if not exists rota_visit_alerts_cleared_by on public.rota_visit_alerts (cleared_by);

alter table public.rota_visit_alerts enable row level security;
drop policy if exists rota_visit_alerts_select on public.rota_visit_alerts;
create policy rota_visit_alerts_select on public.rota_visit_alerts
  for select to authenticated
  using (branch_id = any ((select public.rota_office_branch_ids())::uuid[]) or (select public.is_platform_admin()));
-- No insert, update or delete policies: the job and rota_alert_clear write.

-- 2. Approved changes to Notifications ----------------------------------------------------------
alter table public.user_notifications
  add column if not exists visit_id uuid references public.rota_visits(id) on delete cascade;
create index if not exists user_notifications_visit_idx on public.user_notifications (visit_id);
alter table public.user_notifications drop constraint if exists user_notifications_event_type_check;
alter table public.user_notifications add constraint user_notifications_event_type_check
  check (event_type = any (array['check_completed'::text, 'concern_raised'::text, 'dose_issue'::text, 'mar_sent_back'::text,
                                 'visit_late'::text, 'visit_missed'::text, 'dose_not_recorded'::text]));
alter table public.notification_preferences drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences add constraint notification_preferences_event_type_check
  check (event_type = any (array['check_completed'::text, 'concern_raised'::text, 'dose_issue'::text,
                                 'visit_late'::text, 'visit_missed'::text, 'dose_not_recorded'::text]));

-- 3. Helpers ------------------------------------------------------------------------------------
-- The regular medicines due at a visit (live, at its call, on its day, within their dates).
create or replace function public.rota_visit_due_medicines(p_visit uuid)
returns table (med_uid uuid, name text, time_sensitive boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.med_uid, m.name, m.time_sensitive
    from public.rota_visits v
    join public.rota_mar_medicines m on m.service_user_id = v.service_user_id and m.status = 'live' and not m.prn
   where v.id = p_visit
     and split_part(coalesce(v.generated_key, ''), ':', 4) = any (m.slots)
     and (m.days is null or (extract(isodow from v.visit_date)::int - 1)::smallint = any (m.days))
     and m.start_date <= v.visit_date
     and (m.stop_date is null or m.stop_date >= v.visit_date);
$$;
revoke all on function public.rota_visit_due_medicines(uuid) from public, anon, authenticated;

-- Tell the people for one alert: the branch office by their Settings rows (Managers and Supervisors
-- on by default), and whoever is on Out of Hours for the branch now (on unless they turned it off).
create or replace function public.rota_notify_alert(p_alert uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare a record; v record; ev text; who text; n integer;
begin
  select * into a from public.rota_visit_alerts where id = p_alert;
  if a.id is null then return 0; end if;
  select * into v from public.rota_visits where id = a.visit_id;
  ev := case a.kind when 'late' then 'visit_late' when 'missed' then 'visit_missed' else 'dose_not_recorded' end;
  select string_agg(pe.full_name, ', ' order by pe.full_name) into who
    from public.rota_visit_assignments x join public.people pe on pe.id = x.person_id
   where x.visit_id = a.visit_id and x.status = 'active';
  with office as (
    select p.id, coalesce(np.in_app, p.role in ('manager', 'supervisor')) as in_app, coalesce(np.email, false) as email
      from public.profiles p
      left join public.notification_preferences np
        on np.profile_id = p.id and np.event_type = ev and np.definition_id is null
     where p.company_id = a.company_id and p.status = 'active'
       and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')
       and a.branch_id = any (public.lead_branch_ids_for(p.id))
  ), out_of_hours as (
    select p.id, coalesce(np.in_app, true) as in_app, coalesce(np.email, false) as email
      from public.on_call_shifts s
      join public.profiles p on p.id = s.on_call_profile_id and p.status = 'active' and p.company_id = a.company_id
      left join public.notification_preferences np
        on np.profile_id = p.id and np.event_type = ev and np.definition_id is null
     where s.company_id = a.company_id and s.branch_id = a.branch_id and now() >= s.starts_at and now() < s.ends_at
  ), everyone as (
    select id, bool_or(in_app) as in_app, bool_or(email) as email from (select * from office union all select * from out_of_hours) u group by id
  )
  insert into public.user_notifications
    (company_id, branch_id, profile_id, event_type, service_user_id, visit_id, actor_name, completed_on, email_wanted, show_in_app)
  select a.company_id, a.branch_id, e.id, ev, a.service_user_id, a.visit_id, coalesce(who, 'No carer'), v.visit_date, e.email, e.in_app
    from everyone e
   where e.in_app or e.email;
  get diagnostics n = row_count;
  update public.rota_visit_alerts set notified = n where id = a.id;
  return n;
end;
$$;
revoke all on function public.rota_notify_alert(uuid) from public, anon, authenticated;

-- 4. The job ------------------------------------------------------------------------------------
-- Run by the cron route with the service role. Returns how many alerts it raised of each kind.
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
    select v.*
      from public.rota_visits v
      join public.service_users su on su.id = v.service_user_id
     where v.status = 'published'
       and v.starts_at > now() - interval '2 days'
       and v.starts_at + interval '15 minutes' <= now()
       and public.company_module_on(v.company_id, 'rota_visits')
       and coalesce(su.service_status, '') <> 'cancelled'
       and not (coalesce(su.service_status, '') in ('hospital', 'respite') and (su.hospital_since is null or su.hospital_since <= v.visit_date))
  loop
    select exists (select 1 from public.rota_visit_due_medicines(r.id) d where d.time_sensitive) into v_urgent;

    -- Missed: no clock in at all 30 minutes after the end.
    if now() >= r.ends_at + interval '30 minutes'
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

    -- Late: 15 minutes after the start, any carer on it not clocked in (or no carer at all). A visit
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
revoke all on function public.rota_alerts_run() from public, anon, authenticated;
grant execute on function public.rota_alerts_run() to service_role;

-- 5. Clear down ---------------------------------------------------------------------------------
create or replace function public.rota_alert_clear(p_alert uuid, p_reason text, p_text text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare a record; v_role text;
begin
  select * into a from public.rota_visit_alerts where id = p_alert;
  if a.id is null or not (a.branch_id = any (public.rota_office_branch_ids()) or public.is_platform_admin()) then
    raise exception 'That alert could not be found.' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if not (public.is_platform_admin() or v_role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')) then
    raise exception 'Only a Supervisor or above can clear an alert.' using errcode = '42501';
  end if;
  if a.cleared_at is not null then raise exception 'That alert has already been cleared.' using errcode = '22023'; end if;
  if a.kind in ('late', 'missed') and p_reason not in ('arrived_late', 'forgot_clock_in', 'covered', 'su_cancelled', 'su_hospital', 'moved', 'other') then
    raise exception 'Pick a reason from the list.' using errcode = '22023';
  end if;
  if a.kind = 'dose_not_recorded' and p_reason not in ('forgot_record', 'dose_reason_told', 'medicine_changed', 'other') then
    raise exception 'Pick a reason from the list.' using errcode = '22023';
  end if;
  if p_reason = 'other' and length(btrim(coalesce(p_text, ''))) = 0 then
    raise exception 'Type the reason.' using errcode = '22023';
  end if;
  update public.rota_visit_alerts
     set cleared_at = now(), cleared_by = auth.uid(), clear_reason = p_reason,
         clear_text = case when p_reason = 'other' then left(btrim(p_text), 500) end
   where id = a.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (a.company_id, auth.uid(), v_role, 'rota.alert_cleared', 'service_user', a.service_user_id::text,
          'Cleared a ' || replace(a.kind, '_', ' ') || ' alert', jsonb_build_object('alert_id', a.id, 'visit_id', a.visit_id, 'reason', p_reason));
end;
$$;
revoke all on function public.rota_alert_clear(uuid, text, text) from public, anon;
grant execute on function public.rota_alert_clear(uuid, text, text) to authenticated;

-- 6. Settings, Notifications rows for the new events (the Stage 6 grid functions, widened) ------
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
  if p_event not in ('concern_raised', 'dose_issue', 'visit_late', 'visit_missed', 'dose_not_recorded') then
    raise exception 'That is not a Rota and Visits alert.' using errcode = '22023';
  end if;
  if not public.company_module_on(p_company, 'rota_visits') then return; end if;
  return query
    select p.id,
           coalesce(np.in_app, case when p_event in ('visit_late', 'visit_missed', 'dose_not_recorded')
                                    then p.role in ('manager', 'supervisor') else p.role = 'supervisor' end),
           coalesce(np.email, false), np.id is null
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
  if p_event not in ('concern_raised', 'dose_issue', 'visit_late', 'visit_missed', 'dose_not_recorded') then
    raise exception 'That is not a Rota and Visits alert.' using errcode = '22023';
  end if;
  if not public.company_module_on(t.company_id, 'rota_visits') then raise exception 'Rota and Visits is not switched on.' using errcode = '42501'; end if;
  if t.role not in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor') then
    raise exception 'This role cannot open the rota, so it cannot be told about it.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (company_id, profile_id, event_type, definition_id, in_app, email, updated_by, updated_at)
  values (t.company_id, t.id, p_event, null, coalesce(p_in_app, false) or coalesce(p_email, false), coalesce(p_email, false), auth.uid(), now())
  on conflict (profile_id, event_type, coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set in_app = excluded.in_app, email = excluded.email, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
revoke all on function public.rota_alert_notification_grid(uuid, text) from public, anon;
grant execute on function public.rota_alert_notification_grid(uuid, text) to authenticated;
revoke all on function public.rota_set_alert_notification(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.rota_set_alert_notification(uuid, text, boolean, boolean) to authenticated;

-- 7. Live pushes for the Alerts and Today tabs (Broadcast on the company channel, as 0501) -------
do $$
begin
  execute 'drop trigger if exists bcc_live_ins on public.rota_visit_alerts';
  execute 'drop trigger if exists bcc_live_upd on public.rota_visit_alerts';
  execute 'drop trigger if exists bcc_live_del on public.rota_visit_alerts';
  execute 'create trigger bcc_live_ins after insert on public.rota_visit_alerts referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()';
  execute 'create trigger bcc_live_upd after update on public.rota_visit_alerts referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()';
  execute 'create trigger bcc_live_del after delete on public.rota_visit_alerts referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()';
end $$;

-- 8. Housekeeping: module foreign keys without an index (performance advisor) ------------------
create index if not exists rota_call_task_lists_branch on public.rota_call_task_lists (branch_id);
create index if not exists rota_care_notes_branch on public.rota_care_notes (branch_id);
create index if not exists rota_clock_events_branch on public.rota_clock_events (branch_id);
create index if not exists rota_clock_problems_branch on public.rota_clock_problems (branch_id);
create index if not exists rota_concerns_branch on public.rota_concerns (branch_id);
create index if not exists rota_mar_doses_branch on public.rota_mar_doses (branch_id);
create index if not exists rota_mar_medicines_branch on public.rota_mar_medicines (branch_id);
create index if not exists rota_mar_medicines_sent_back_by on public.rota_mar_medicines (sent_back_by);
create index if not exists rota_mar_stock_branch on public.rota_mar_stock (branch_id);
create index if not exists rota_task_library_branch on public.rota_task_library (branch_id);
create index if not exists rota_task_outcomes_branch on public.rota_task_outcomes (branch_id);
create index if not exists rota_visit_record_versions_branch on public.rota_visit_record_versions (branch_id);

select public.install_company_link_triggers();
