-- 0386_dbs_date_of_issue
-- Phil, 2026-10-05: "change the label so it says DBS date of issue" and Enhanced DBS is worked out
-- from it (issue date + 3 years, agreed by popup, still editable). This migration:
--   1. renames the DBS form's "DBS date" question to "DBS date of issue" and adds a line under
--      Enhanced DBS saying it fills itself in, in the library template and every company's form.
--      A company form that already has Evidence on its current version gets a NEW version, so
--      Evidence keeps the version that was completed (same rule as push_library_form);
--   2. fills a blank Enhanced DBS from the date of issue. A date already entered is never touched.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function pg_temp.dbs_relabel(s jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(s, '{sections}', coalesce((
    select jsonb_agg(
      jsonb_set(sec, '{fields}', coalesce((
        select jsonb_agg(
          case f->>'key'
            when 'dbs_date' then f || jsonb_build_object(
              'label', 'DBS date of issue',
              'help', 'The date printed on the certificate.')
            when 'enhanced_dbs_date' then f || jsonb_build_object(
              'help', 'Fills in as 3 years after the date of issue. Change it if yours is different.')
            else f end
          order by fo)
        from jsonb_array_elements(sec->'fields') with ordinality as x(f, fo)
      ), '[]'::jsonb))
      order by so)
    from jsonb_array_elements(s->'sections') with ordinality as y(sec, so)
  ), '[]'::jsonb))
$$;

-- 1a. The library template.
update public.form_templates
   set schema = pg_temp.dbs_relabel(schema),
       version = version + 1
 where key = 'dbs_renewal'
   and schema is distinct from pg_temp.dbs_relabel(schema);

-- 1b. Every company's DBS form.
do $$
declare
  r record;
  v_schema jsonb;
  v_new jsonb;
  v_used boolean;
  v_version integer;
  v_lib integer;
begin
  select version into v_lib from public.form_templates where key = 'dbs_renewal';
  for r in select id, company_id, current_version from public.forms where key = 'dbs_renewal' loop
    select schema into v_schema from public.form_versions
     where form_id = r.id and version = r.current_version;
    if v_schema is null then continue; end if;
    v_new := pg_temp.dbs_relabel(v_schema);
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
           library_schema = pg_temp.dbs_relabel(coalesce(library_schema, v_schema)),
           updated_at = now()
     where id = r.id;

    perform public.rebake_form_field_options(r.company_id);
  end loop;
end $$;

-- 2. Blank Enhanced DBS from the date of issue (29 February settles on 28 February).
update public.person_trackers
   set enhanced_dbs_date = (dbs_date + interval '3 years')::date
 where dbs_date is not null
   and enhanced_dbs_date is null;
