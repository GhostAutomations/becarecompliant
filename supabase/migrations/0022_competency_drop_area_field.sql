-- 0022_competency_drop_area_field
-- Remove the "Competency area" (competency_area) dropdown from the competency
-- assessment form (Phil, 2026-07-09): the competency is already defined by the check
-- being completed, so the field is redundant. Removes it from the master template and
-- every competency_assessment form version. Past evidence is unaffected (each
-- submission pins its own schema_snapshot). Applied to the becarecompliant Supabase
-- project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.form_templates ft
set schema = jsonb_set(ft.schema, '{sections}', (
  select jsonb_agg(jsonb_set(sec, '{fields}', coalesce((
    select jsonb_agg(f order by ord)
    from jsonb_array_elements(sec->'fields') with ordinality e(f, ord)
    where f->>'key' <> 'competency_area'
  ), '[]'::jsonb)) order by sord)
  from jsonb_array_elements(ft.schema->'sections') with ordinality s(sec, sord)
))
where ft.key = 'competency_assessment';

update public.form_versions fv
set schema = jsonb_set(fv.schema, '{sections}', (
  select jsonb_agg(jsonb_set(sec, '{fields}', coalesce((
    select jsonb_agg(f order by ord)
    from jsonb_array_elements(sec->'fields') with ordinality e(f, ord)
    where f->>'key' <> 'competency_area'
  ), '[]'::jsonb)) order by sord)
  from jsonb_array_elements(fv.schema->'sections') with ordinality s(sec, sord)
))
from public.forms f
where fv.form_id = f.id and f.key = 'competency_assessment';
