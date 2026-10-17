-- Be Care Compliant 0503: a photo of the pharmacy label or prescription for the MAR's second check
-- (Rota and Visits Stage 6, Phil's popups 2026-10-17; docs/decisions/rota-visits.md).
--
-- Whoever adds or changes a medicine attaches a photo of the label or prescription, which the
-- second checker compares the entry against; or gives a reason there is none. The photo is health
-- data: a private bucket with no storage policies (only the server, with the service role, reads
-- or writes it), the path under the company and service user, shown through short lived signed
-- links with every view audit logged. Additive: two new columns on the Stage 6 table, a new
-- bucket, and the Stage 6 save function with the photo rule added. Applied before the code that
-- sends the photo; 0504 then requires it of every caller.

alter table public.rota_mar_medicines
  add column if not exists label_path text,
  add column if not exists label_skip_reason text check (label_skip_reason is null or length(label_skip_reason) <= 300);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rota_mar_medicines_label_path_in_company') then
    alter table public.rota_mar_medicines
      add constraint rota_mar_medicines_label_path_in_company check (public.path_in_company(label_path, company_id));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mar-labels', 'mar-labels', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create or replace function public.rota_mar_save(p_su uuid, p_med_uid uuid, p_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s record; v_uid uuid; v_id uuid; v_slots text[]; v_days smallint[]; v_prn boolean; v_name text;
  v_label text; v_skip text;
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

  -- The label photo the second checker compares against (Phil 2026-10-17), or why there is none.
  v_label := nullif(btrim(coalesce(p_data->>'label_path', '')), '');
  v_skip := nullif(btrim(coalesce(p_data->>'label_skip_reason', '')), '');
  -- Required from the screen that sends it; 0504 makes it required for every caller once that
  -- screen is live (the code live when this was applied did not send it).
  if (p_data ? 'label_path' or p_data ? 'label_skip_reason') and v_label is null and v_skip is null then
    raise exception 'Add a photo of the pharmacy label or prescription, or say why there is none.' using errcode = '22023';
  end if;
  if v_label is not null and not starts_with(v_label, s.company_id::text || '/' || s.id::text || '/') then
    raise exception 'That photo does not belong to this service user.' using errcode = '42501';
  end if;

  -- A change still waiting is replaced by this one.
  update public.rota_mar_medicines set status = 'replaced', replaced_at = now()
   where med_uid = v_uid and status = 'awaiting_check';

  insert into public.rota_mar_medicines (med_uid, company_id, branch_id, service_user_id, dmd_id, name, form, route, dose_text,
         dose_quantity, dose_unit, support, prn, slots, days, time_sensitive, instructions, start_date, stop_date, review_date,
         status, set_by, label_path, label_skip_reason)
  values (v_uid, s.company_id, s.branch_id, s.id, nullif(p_data->>'dmd_id', ''), left(v_name, 300),
          left(nullif(btrim(coalesce(p_data->>'form', '')), ''), 120), left(nullif(btrim(coalesce(p_data->>'route', '')), ''), 120),
          left(btrim(p_data->>'dose_text'), 300), nullif(p_data->>'dose_quantity', '')::numeric,
          left(nullif(btrim(coalesce(p_data->>'dose_unit', '')), ''), 30), coalesce(p_data->>'support', 'give'), v_prn,
          case when v_prn then '{}'::text[] else v_slots end, v_days, coalesce((p_data->>'time_sensitive')::boolean, false),
          left(nullif(btrim(coalesce(p_data->>'instructions', '')), ''), 1000),
          coalesce(nullif(p_data->>'start_date', '')::date, (now() at time zone 'Europe/London')::date),
          nullif(p_data->>'stop_date', '')::date, nullif(p_data->>'review_date', '')::date, 'awaiting_check', auth.uid(),
          v_label, case when v_label is null then left(v_skip, 300) end)
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

revoke all on function public.rota_mar_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rota_mar_save(uuid, uuid, jsonb) to authenticated;
