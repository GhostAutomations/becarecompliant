-- 0456: Thistle's Service User Audit percentages take up to 125 (Phil's go by popup, 2026-10-13).
-- The same change as 0455, for Thistle only: version 2 with max 125 on calls_attended_pct and
-- avg_call_duration_pct; version 1 and its Evidence untouched (audit F128).
-- Safe to run twice: a form already at 125 is left alone.

create or replace function pg_temp.su_pct_125(s jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(s, '{sections}', coalesce((
    select jsonb_agg(
      jsonb_set(sec, '{fields}', coalesce((
        select jsonb_agg(
          case when f->>'key' in ('calls_attended_pct', 'avg_call_duration_pct')
               then f || jsonb_build_object('validation', coalesce(f->'validation', '{}'::jsonb) || '{"max": 125}'::jsonb)
               else f end
          order by fo)
        from jsonb_array_elements(sec->'fields') with ordinality as x(f, fo)
      ), '[]'::jsonb))
      order by so)
    from jsonb_array_elements(s->'sections') with ordinality as y(sec, so)
  ), '[]'::jsonb))
$$;

do $$
declare
  r record;
  v_schema jsonb;
  v_new jsonb;
  v_used boolean;
  v_version integer;
  v_lib integer;
begin
  select version into v_lib from public.form_templates where key = 'audit_su';
  for r in
    select f.id, f.company_id, f.current_version
      from public.forms f join public.companies c on c.id = f.company_id
     where f.key = 'audit_su' and c.name = 'Thistle Care Ltd'
  loop
    select schema into v_schema from public.form_versions
     where form_id = r.id and version = r.current_version;
    if v_schema is null then continue; end if;
    v_new := pg_temp.su_pct_125(v_schema);
    if v_new = v_schema then continue; end if;
    select exists (
      select 1 from public.evidence e
      join public.form_versions fv on fv.id = e.form_version_id
      where fv.form_id = r.id and fv.version = r.current_version
    ) into v_used;

    if v_used then
      select coalesce(max(version), 0) + 1 into v_version from public.form_versions where form_id = r.id;
      insert into public.form_versions (form_id, version, schema, status)
      values (r.id, v_version, v_new, 'published');
    else
      v_version := r.current_version;
      update public.form_versions set schema = v_new where form_id = r.id and version = v_version;
    end if;

    update public.forms
       set current_version = v_version,
           library_version = coalesce(v_lib, library_version),
           library_schema = pg_temp.su_pct_125(coalesce(library_schema, v_schema)),
           updated_at = now()
     where id = r.id;

    perform public.rebake_form_field_options(r.company_id);
  end loop;
end $$;
