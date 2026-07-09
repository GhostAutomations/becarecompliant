-- 0024_appraisal_drop_period_covered
-- Remove the "Period covered" (period_covered) field from the Annual Appraisal form
-- (Phil, 2026-07-09). Removes it from the master template and every appraisal form
-- version. Past evidence is unaffected (each submission pins its own schema_snapshot).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.form_templates ft
set schema = jsonb_set(ft.schema, '{sections}', (
  select jsonb_agg(jsonb_set(sec, '{fields}', coalesce((
    select jsonb_agg(f order by ord)
    from jsonb_array_elements(sec->'fields') with ordinality e(f, ord)
    where f->>'key' <> 'period_covered'
  ), '[]'::jsonb)) order by sord)
  from jsonb_array_elements(ft.schema->'sections') with ordinality s(sec, sord)
))
where ft.key = 'appraisal';

update public.form_versions fv
set schema = jsonb_set(fv.schema, '{sections}', (
  select jsonb_agg(jsonb_set(sec, '{fields}', coalesce((
    select jsonb_agg(f order by ord)
    from jsonb_array_elements(sec->'fields') with ordinality e(f, ord)
    where f->>'key' <> 'period_covered'
  ), '[]'::jsonb)) order by sord)
  from jsonb_array_elements(fv.schema->'sections') with ordinality s(sec, sord)
))
from public.forms f
where fv.form_id = f.id and f.key = 'appraisal';
