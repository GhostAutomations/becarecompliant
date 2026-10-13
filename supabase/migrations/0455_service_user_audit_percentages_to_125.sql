-- 0455: the Service User Audit's two percentages take up to 125, like the People Audit (0297)
-- (Phil, 2026-10-13, Thistle ticket: an average call duration of 108% was refused).
--
-- WHAT CHANGES. Only validation.max on calls_attended_pct and avg_call_duration_pct in the
-- Service User Audit (key audit_su): 100 becomes 125. Matched by those two exact keys, so no other
-- field, wording, scoring or figure moves. PQS, Readiness and Reg 80 do not read these answers
-- (they count completed audits), so nothing they show changes.
--
-- A NEW VERSION, NOT A REWRITE (audit F128; Phil popup "Publish version 2"). Every company's
-- version 1 already has Evidence, so each gets version 2 with the new limit and version 1 is left
-- exactly as it was completed, as 0386 did. New audits are done on version 2. The library
-- template (form_templates, which the seed functions copy for new companies) goes up a version too.
--
-- THISTLE IS NOT IN THIS MIGRATION. Phil asked to approve Thistle's forms separately; it is done by
-- 0456 after the Bevan tests and his go. This one covers the template and every other company.
--
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

-- 1. The library template (new companies are seeded from it).
update public.form_templates
   set schema = pg_temp.su_pct_125(schema),
       version = version + 1,
       updated_at = now()
 where key = 'audit_su'
   and schema is distinct from pg_temp.su_pct_125(schema);

-- 2. Every company's Service User Audit except Thistle (0456).
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
     where f.key = 'audit_su' and c.name <> 'Thistle Care Ltd'
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
