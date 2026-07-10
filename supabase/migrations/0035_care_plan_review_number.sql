-- 0035_care_plan_review_number
-- Complex branches run four rolling reviews (Review 1-4), like People's Supervision
-- 1/2/3. To tag which review a completion satisfies (so the drill-down can show four
-- slot cards and the register can key REV1-4 by number), add an optional
-- "review_number" single select to the Care Plan Review form. It is preset + hidden
-- from the slot's Complete button on Complex branches, and hidden entirely on Simple
-- branches (which run a single annual review). Idempotent. Updates every company's
-- published Care Plan Review form and the master template.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- Company forms.
update public.form_versions fv
set schema = jsonb_set(
  fv.schema,
  '{sections,0,fields}',
  '[{"key":"review_number","type":"single_select","label":"Which review","options":[{"value":"1","label":"Review 1"},{"value":"2","label":"Review 2"},{"value":"3","label":"Review 3"},{"value":"4","label":"Review 4"}]}]'::jsonb
    || (fv.schema #> '{sections,0,fields}')
)
from public.forms f
where fv.form_id = f.id
  and f.key = 'care_plan_review'
  and not ((fv.schema #> '{sections,0,fields}') @> '[{"key":"review_number"}]');

-- Master template (for new companies).
update public.form_templates
set schema = jsonb_set(
  schema,
  '{sections,0,fields}',
  '[{"key":"review_number","type":"single_select","label":"Which review","options":[{"value":"1","label":"Review 1"},{"value":"2","label":"Review 2"},{"value":"3","label":"Review 3"},{"value":"4","label":"Review 4"}]}]'::jsonb
    || (schema #> '{sections,0,fields}')
)
where key = 'care_plan_review'
  and not ((schema #> '{sections,0,fields}') @> '[{"key":"review_number"}]');
