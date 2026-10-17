-- Rota and Visits Stage 6, found while proving 0501 (2026-10-17): a carer could still record a dose
-- against the live version of a medicine whose change was waiting for its second check. Stage 6
-- decision 4 says carers see "call the office" until the change is checked, so the dose is refused
-- then too. Only rota_dose_submit changes (a module function).

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
      -- A change waiting for its second check: nothing is recorded against the old version either
      -- (Stage 6 decision 4: carers see "call the office" until it is checked).
      if exists (select 1 from public.rota_mar_medicines w where w.med_uid = v_med.med_uid and w.status = 'awaiting_check') then
        raise exception 'That medicine has been changed and is waiting for its second check. Call the office.' using errcode = '22023';
      end if;
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

revoke all on function public.rota_dose_submit(jsonb, timestamptz) from public, anon;
grant execute on function public.rota_dose_submit(jsonb, timestamptz) to authenticated;
