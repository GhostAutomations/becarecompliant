-- Be Care Compliant 0507: the alerts job reads the module switch directly (Rota and Visits Stage 7).
-- company_module_on answers only for a signed in member of the company, so run by the scheduled
-- job (no signed in person) it always said off and no alert was ever raised. Otherwise as 0506.

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
       and exists (select 1 from public.company_modules cm
                    where cm.company_id = v.company_id and cm.module = 'rota_visits' and cm.enabled)
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
