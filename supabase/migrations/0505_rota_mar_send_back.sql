-- Be Care Compliant 0505: the second checker sends a MAR medicine back for a correction (Rota and
-- Visits Stage 6, Phil's popups 2026-10-17; docs/decisions/rota-visits.md).
--
-- A sent back medicine stays waiting (carers are still told to call the office) and carries who
-- sent it back, when and why; it cannot be checked until the person who set it corrects it, which
-- saves a new waiting version in its place (rota_mar_save, unchanged). Only the person who set it
-- may withdraw it. The person who set it is told on Recent activity: the one approved change to
-- the Notifications feature is that user_notifications accepts the event 'mar_sent_back'.

alter table public.rota_mar_medicines
  add column if not exists sent_back_at timestamptz,
  add column if not exists sent_back_by uuid references public.profiles(id) on delete set null,
  add column if not exists sent_back_reason text check (sent_back_reason is null or length(sent_back_reason) <= 500);

alter table public.user_notifications drop constraint if exists user_notifications_event_type_check;
alter table public.user_notifications add constraint user_notifications_event_type_check
  check (event_type = any (array['check_completed'::text, 'concern_raised'::text, 'dose_issue'::text, 'mar_sent_back'::text]));

create or replace function public.rota_mar_send_back(p_medicine uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  m record; v_role text; v_name text;
begin
  select * into m from public.rota_mar_medicines where id = p_medicine;
  if m.id is null or not public.rota_mar_can_edit(m.service_user_id) then
    raise exception 'That medicine could not be found.' using errcode = '42501';
  end if;
  select role, full_name into v_role, v_name from public.profiles where id = auth.uid();
  if not (public.is_platform_admin() or v_role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')) then
    raise exception 'Only a Supervisor or above can check a MAR.' using errcode = '42501';
  end if;
  if m.status <> 'awaiting_check' then raise exception 'That medicine is not waiting for a check.' using errcode = '22023'; end if;
  if m.sent_back_at is not null then raise exception 'It has already been sent back.' using errcode = '22023'; end if;
  if m.set_by = auth.uid() then
    raise exception 'The second check must be done by someone other than the person who set it.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Say what needs correcting.' using errcode = '22023'; end if;

  update public.rota_mar_medicines
     set sent_back_at = now(), sent_back_by = auth.uid(), sent_back_reason = left(btrim(p_reason), 500)
   where id = m.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (m.company_id, auth.uid(), v_role, 'rota.mar_medicine_sent_back', 'service_user', m.service_user_id::text,
          'Sent ' || left(m.name, 120) || ' back for a correction: ' || left(btrim(p_reason), 200),
          jsonb_build_object('medicine_id', m.id, 'set_by', m.set_by));
  -- The person who set it, in the app only (Phil's popup: Recent activity, no email).
  if m.set_by is not null and exists (select 1 from public.profiles p where p.id = m.set_by and p.company_id = m.company_id) then
    insert into public.user_notifications
      (company_id, branch_id, profile_id, event_type, service_user_id, actor_id, actor_name, completed_on, email_wanted, show_in_app)
    values (m.company_id, m.branch_id, m.set_by, 'mar_sent_back', m.service_user_id, auth.uid(), coalesce(v_name, 'Someone'),
            (now() at time zone 'Europe/London')::date, false, true);
  end if;
end;
$$;

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
  if m.sent_back_at is not null then
    raise exception 'It was sent back for a correction; the person who set it corrects it first.' using errcode = '22023';
  end if;
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
  -- Only the person who set it takes it back (Phil 2026-10-17); a checker sends it back instead.
  if m.set_by is distinct from auth.uid() and not public.is_platform_admin() then
    raise exception 'Only the person who set it can withdraw it. Send it back with a reason instead.' using errcode = '42501';
  end if;
  update public.rota_mar_medicines set status = 'replaced', replaced_at = now() where id = m.id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (m.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()), 'rota.mar_change_withdrawn',
          'service_user', m.service_user_id::text, 'Withdrew a change to ' || left(m.name, 120) || ' on the MAR', jsonb_build_object('medicine_id', m.id));
end;
$$;

revoke all on function public.rota_mar_send_back(uuid, text) from public, anon;
grant execute on function public.rota_mar_send_back(uuid, text) to authenticated;
revoke all on function public.rota_mar_check(uuid) from public, anon;
grant execute on function public.rota_mar_check(uuid) to authenticated;
revoke all on function public.rota_mar_withdraw(uuid) from public, anon;
grant execute on function public.rota_mar_withdraw(uuid) to authenticated;

select public.install_company_link_triggers();
