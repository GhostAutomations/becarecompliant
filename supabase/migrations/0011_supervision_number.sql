-- 0011_supervision_number
-- The supervision "type" field becomes which supervision it is: 1, 2 or 3, so the
-- completion fills the matching Sup 1/2/3 slot on the register. Targets the
-- supervision_type field (first section, second field) in the master template and
-- every company's published version.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.form_templates
set schema = jsonb_set(
  schema,
  '{sections,0,fields,1}',
  '{"key":"supervision_type","type":"single_select","label":"Which supervision","required":true,"options":[{"value":"1","label":"Supervision 1"},{"value":"2","label":"Supervision 2"},{"value":"3","label":"Supervision 3"}]}'::jsonb
)
where key = 'supervision';

update public.form_versions
set schema = jsonb_set(
  schema,
  '{sections,0,fields,1}',
  '{"key":"supervision_type","type":"single_select","label":"Which supervision","required":true,"options":[{"value":"1","label":"Supervision 1"},{"value":"2","label":"Supervision 2"},{"value":"3","label":"Supervision 3"}]}'::jsonb
)
where form_id in (select id from public.forms where key = 'supervision');
