-- Rota and Visits Stage 3 (Phil's popup, 2026-10-16, after his own test scanned a home's QR code
-- off a computer screen 54 km away and it still counted as proof): a QR code or NFC sticker scan
-- whose phone position is accurate (within the place's radius) but outside the radius is kept,
-- still "proved", and flagged code_far for the office. Only rota_clock_record (0493) changes; it
-- stays internal (revoked from every signed in role).

create or replace function public.rota_clock_record(
  p_event_id uuid, p_person uuid, p_visit uuid, p_shift uuid, p_kind text, p_method text,
  p_phone_time timestamptz, p_happened timestamptz, p_skew integer,
  p_lat double precision, p_lng double precision, p_accuracy double precision,
  p_qr_token text, p_reason_code text, p_reason_text text,
  p_device_id text, p_device_seq integer, p_recorded_by uuid, p_added_by uuid, p_added_reason text,
  p_extra_flags text[])
returns table (location text, flags text[], distance_m integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_company uuid; v_branch uuid; v_su uuid; v_status text; v_starts timestamptz;
  v_place uuid; pl record; v_flags text[] := coalesce(p_extra_flags, '{}'); v_loc text; v_dist integer;
  v_assigned text;
begin
  if p_visit is not null then
    select v.company_id, v.branch_id, v.service_user_id, v.status, v.starts_at
      into v_company, v_branch, v_su, v_status, v_starts
      from public.rota_visits v where v.id = p_visit;
    select a.status into v_assigned from public.rota_visit_assignments a
     where a.visit_id = p_visit and a.person_id = p_person order by (a.status = 'active') desc, a.assigned_at desc limit 1;
    v_place := public.rota_place_for_su(v_su);
  else
    select s.company_id, s.branch_id, s.status, s.starts_at
      into v_company, v_branch, v_status, v_starts
      from public.rota_shifts s where s.id = p_shift;
    select a.status into v_assigned from public.rota_assignments a
     where a.shift_id = p_shift and a.person_id = p_person order by (a.status = 'active') desc, a.assigned_at desc limit 1;
    v_place := public.rota_place_for_branch(v_branch);
  end if;

  -- The world changed while the phone was offline: the care still happened, so it is kept and
  -- flagged for the office (offline design, section 6).
  if v_assigned is distinct from 'active' then v_flags := v_flags || 'moved'::text; end if;
  if v_status = 'cancelled' then v_flags := v_flags || 'cancelled'::text; end if;
  if v_status = 'draft' then v_flags := v_flags || 'not_published'::text; end if;
  if p_kind = 'in' and p_happened < v_starts - interval '30 minutes' then v_flags := v_flags || 'early'::text; end if;
  if p_kind = 'out' and not exists (
       select 1 from public.rota_clock_events e
        where e.person_id = p_person and e.kind = 'in'
          and e.visit_id is not distinct from p_visit and e.shift_id is not distinct from p_shift) then
    v_flags := v_flags || 'no_clock_in'::text;
  end if;
  if exists (select 1 from public.rota_clock_events e
              where e.person_id = p_person and e.kind = p_kind
                and e.visit_id is not distinct from p_visit and e.shift_id is not distinct from p_shift) then
    v_flags := v_flags || 'repeat'::text;
  end if;

  select * into pl from public.rota_places where id = v_place;
  if p_method = 'office' then
    v_loc := 'office';
  elsif p_method = 'text' then
    v_loc := 'text';
  else
    if p_lat is not null and pl.lat is not null then
      v_dist := public.rota_metres_between(p_lat, p_lng, pl.lat, pl.lng);
    end if;
    if p_method in ('qr', 'nfc') then
      if p_qr_token is not null and pl.id is not null and p_qr_token = pl.qr_token then
        v_loc := 'proved';
        -- A code scanned where the phone's own accurate position puts it well away from the home
        -- (a photo of the sheet, say): still kept, flagged for the office (Phil, 2026-10-16).
        if v_dist is not null and p_accuracy is not null and p_accuracy <= pl.radius_m and v_dist > pl.radius_m then
          v_flags := v_flags || 'code_far'::text;
        end if;
      else
        v_flags := v_flags || 'wrong_code'::text;
      end if;
    end if;
    if v_loc is null then
      if pl.lat is null then
        v_loc := 'unclear'; v_flags := v_flags || 'no_map_point'::text;
      elsif p_lat is null or p_accuracy is null or p_accuracy > pl.radius_m then
        v_loc := 'unclear';
      elsif v_dist <= pl.radius_m then
        v_loc := 'inside';
      else
        v_loc := 'outside';
        if p_reason_code is null then v_flags := v_flags || 'no_reason'::text; end if;
      end if;
    end if;
  end if;

  insert into public.rota_clock_events (
    event_id, company_id, branch_id, person_id, visit_id, shift_id, kind, method,
    phone_time, happened_at, clock_skew_seconds, lat, lng, accuracy_m, distance_m, place_id,
    location, reason_code, reason_text, flags, device_id, device_seq, recorded_by, added_by, added_reason)
  values (
    p_event_id, v_company, v_branch, p_person, p_visit, p_shift, p_kind, p_method,
    p_phone_time, p_happened, p_skew, p_lat, p_lng, p_accuracy, v_dist, v_place,
    v_loc, case when v_loc = 'outside' then p_reason_code end,
    case when v_loc = 'outside' and p_reason_code = 'other' then nullif(btrim(p_reason_text), '') end,
    (select coalesce(array_agg(distinct f order by f), '{}') from unnest(v_flags) f),
    p_device_id, p_device_seq, p_recorded_by, p_added_by, p_added_reason);

  location := v_loc;
  flags := (select coalesce(array_agg(distinct f order by f), '{}') from unnest(v_flags) f);
  distance_m := v_dist;
  return next;
end;
$$;

revoke all on function public.rota_clock_record(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, double precision, double precision, double precision, text, text, text, text, integer, uuid, uuid, text, text[]) from public, anon, authenticated;
