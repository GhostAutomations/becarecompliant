-- 0388_dbs_risk_no_opening_title
-- Phil, 2026-10-05: "I'm not sure we need the words, the application and the certificate on
-- there. I think that's going to get confusing." The opening section of the DBS Pending Risk
-- Assessment ("The application") and of the DBS Disclosure Risk Assessment ("The certificate")
-- lose their title. Library templates and every company's form. A company form with Evidence on
-- its current version gets a new version, so Evidence keeps the version that was completed.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function pg_temp.untitle(s jsonb, sec_id text) returns jsonb
language sql immutable as $$
  select jsonb_set(s, '{sections}', coalesce((
    select jsonb_agg(case when sec->>'id' = sec_id then sec || '{"title": ""}'::jsonb else sec end order by o)
    from jsonb_array_elements(s->'sections') with ordinality as x(sec, o)
  ), '[]'::jsonb))
$$;

update public.form_templates t
   set schema = pg_temp.untitle(t.schema, v.sec), version = t.version + 1
from (values ('dbs_pending', 'application'), ('dbs_disclosure', 'certificate')) as v(key, sec)
where t.key = v.key and t.schema is distinct from pg_temp.untitle(t.schema, v.sec);

do $$
declare
  r record;
  v_schema jsonb;
  v_new jsonb;
  v_used boolean;
  v_version integer;
begin
  for r in
    select f.id, f.company_id, f.current_version, f.library_schema, t.version as lib_version,
           case f.key when 'dbs_pending' then 'application' else 'certificate' end as sec
    from public.forms f
    join public.form_templates t on t.key = f.key
    where f.key in ('dbs_pending', 'dbs_disclosure')
  loop
    select schema into v_schema from public.form_versions where form_id = r.id and version = r.current_version;
    if v_schema is null then continue; end if;
    v_new := pg_temp.untitle(v_schema, r.sec);
    if v_new = v_schema then continue; end if;
    select exists (
      select 1 from public.evidence e join public.form_versions fv on fv.id = e.form_version_id
      where fv.form_id = r.id and fv.version = r.current_version
    ) into v_used;
    if v_used then
      select coalesce(max(version), 0) + 1 into v_version from public.form_versions where form_id = r.id;
      insert into public.form_versions (form_id, version, schema, status) values (r.id, v_version, v_new, 'published');
    else
      v_version := r.current_version;
      update public.form_versions set schema = v_new where form_id = r.id and version = v_version;
    end if;
    update public.forms
       set current_version = v_version,
           library_version = r.lib_version,
           library_schema = pg_temp.untitle(coalesce(r.library_schema, v_schema), r.sec),
           updated_at = now()
     where id = r.id;
    perform public.rebake_form_field_options(r.company_id);
  end loop;
end $$;
