-- 0075_relabel_region_to_branch
-- Rename every form field labelled "Region" to "Branch", across all master
-- templates and every form version (all populations). Field KEYS are left
-- unchanged (so stored answers and the branch auto-fill still resolve) — only the
-- user-facing label changes. Updated in place: already-submitted evidence keeps its
-- own frozen schema_snapshot, so past records are unaffected.
-- Applied to ref bgrtcvyjuwopunpnudeu only.

update public.form_versions v
set schema = jsonb_set(v.schema, '{sections}', (
  select jsonb_agg(
    jsonb_set(sec, '{fields}', coalesce((
      select jsonb_agg(
        case when fld->>'label' = 'Region' then jsonb_set(fld, '{label}', '"Branch"'::jsonb) else fld end
        order by fo
      )
      from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
    ), '[]'::jsonb))
    order by so
  )
  from jsonb_array_elements(v.schema->'sections') with ordinality as ss(sec, so)
))
where exists (
  select 1 from jsonb_array_elements(v.schema->'sections') s, jsonb_array_elements(s->'fields') f
  where f->>'label' = 'Region'
);

update public.form_templates t
set schema = jsonb_set(t.schema, '{sections}', (
  select jsonb_agg(
    jsonb_set(sec, '{fields}', coalesce((
      select jsonb_agg(
        case when fld->>'label' = 'Region' then jsonb_set(fld, '{label}', '"Branch"'::jsonb) else fld end
        order by fo
      )
      from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
    ), '[]'::jsonb))
    order by so
  )
  from jsonb_array_elements(t.schema->'sections') with ordinality as ss(sec, so)
)),
    updated_at = now()
where exists (
  select 1 from jsonb_array_elements(t.schema->'sections') s, jsonb_array_elements(s->'fields') f
  where f->>'label' = 'Region'
);
