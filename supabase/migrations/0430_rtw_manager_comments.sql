-- 0430_rtw_manager_comments
-- Return to Work form, every company and the founder template (Phil, 2026-10-08):
--  * Employee comments moves up, out of Confirmation, to sit with the questions ("Prepared for
--    you", straight after "Questions asked and answers"). When the questions were drafted, the
--    dialog shows it inside the Questions to ask card.
--  * A new optional "Manager comments" box takes its place at the top of Confirmation.
-- Edited in place (default forms stay at v1). Keys are unchanged, so old Evidence still reads.
-- Idempotent: only touches a schema that has no manager_comments yet.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function pg_temp.rtw_comments(schema jsonb) returns jsonb
language sql immutable as $$
  with emp as (
    select coalesce(
      (select f from jsonb_array_elements(schema->'sections') s, jsonb_array_elements(s->'fields') f
        where f->>'key' = 'employee_comments' limit 1),
      '{"key": "employee_comments", "type": "long_text", "label": "Employee comments"}'::jsonb) as f
  )
  select jsonb_set(schema, '{sections}', coalesce((
    select jsonb_agg(
      case
        when s->>'title' = 'Prepared for you' then jsonb_set(s, '{fields}', coalesce((
          select jsonb_agg(x order by o, sub)
          from (
            select f as x, fo as o, 0 as sub from jsonb_array_elements(s->'fields') with ordinality t(f, fo)
              where f->>'key' <> 'employee_comments'
            union all
            select (select f from emp), coalesce((
              select fo from jsonb_array_elements(s->'fields') with ordinality t(f, fo)
               where f->>'key' = 'tailored_questions'), 999), 1
          ) q), '[]'::jsonb))
        when s->>'title' = 'Confirmation' then jsonb_set(s, '{fields}',
          jsonb_build_array(jsonb_build_object(
            'key', 'manager_comments', 'type', 'long_text', 'label', 'Manager comments', 'required', false))
          || coalesce((select jsonb_agg(f order by fo) from jsonb_array_elements(s->'fields') with ordinality t(f, fo)
                       where f->>'key' <> 'employee_comments'), '[]'::jsonb))
        else s end
      order by so)
    from jsonb_array_elements(schema->'sections') with ordinality sec(s, so)), '[]'::jsonb))
$$;

update public.form_versions fv
set schema = pg_temp.rtw_comments(fv.schema)
from public.forms f
where f.id = fv.form_id
  and f.key = 'return_to_work'
  and fv.schema @? '$.sections[*] ? (@.title == "Prepared for you")'
  and fv.schema @? '$.sections[*] ? (@.title == "Confirmation")'
  and not (fv.schema @? '$.sections[*].fields[*] ? (@.key == "manager_comments")');

update public.form_templates
set schema = pg_temp.rtw_comments(schema), updated_at = now()
where key = 'return_to_work'
  and schema @? '$.sections[*] ? (@.title == "Prepared for you")'
  and schema @? '$.sections[*] ? (@.title == "Confirmation")'
  and not (schema @? '$.sections[*].fields[*] ? (@.key == "manager_comments")');

-- The help under "Questions asked and answers" no longer promises adjustment or support
-- questions (the AI no longer asks them, Phil 2026-10-08).
update public.form_versions fv
set schema = replace(fv.schema::text,
  'The set always covers whether they are fit to return and any adjustments they need, whether anything at work played a part, and what support would help.',
  'The set always covers whether they are fit to return and whether anything at work played a part.')::jsonb
from public.forms f
where f.id = fv.form_id and f.key = 'return_to_work'
  and fv.schema::text like '%any adjustments they need%';

update public.form_templates
set schema = replace(schema::text,
  'The set always covers whether they are fit to return and any adjustments they need, whether anything at work played a part, and what support would help.',
  'The set always covers whether they are fit to return and whether anything at work played a part.')::jsonb,
  updated_at = now()
where key = 'return_to_work' and schema::text like '%any adjustments they need%';
