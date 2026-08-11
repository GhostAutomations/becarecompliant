-- 0170_supervision_form_offers_supervision_4
--
-- FOUND IN LIVE TESTING, 2026-08-11: Supervision 4 could never be completed.
--
-- A person's record shows a FOUR slot supervision cycle (Supervision 1 to 4, the fourth
-- restarting the cycle), and each slot has its own Complete button. The Supervision form's
-- "Which supervision" question, however, only ever offered 1, 2 and 3. The complete page
-- hides that question and supplies the value from the button that was clicked, so the
-- browser validated a schema without the field and passed, and then the server, which
-- validates the WHOLE published form, refused the answer "4". The manager saw
-- "Please correct the highlighted fields" with no highlighted field anywhere on the page:
-- a dead end with nothing to correct. (The generic half of that failure is fixed in code:
-- a refusal now names the answers it refused. See lib/forms/validation-message.ts.)
--
-- This migration adds the missing option, following 0104's pattern:
--   A) the founder TEMPLATE, so every new company seeds a form that matches the cycle;
--   B) every existing company's form gains a NEW published version holding the fixed
--      schema, keeping the SAME form id, so the check link, the Supervision 1 to 4 matrix
--      and all stored evidence stay intact. Existing evidence keeps its own frozen
--      snapshot and is not rewritten: it is immutable.
--
-- Guarded and re-runnable: a form whose published version already offers "4" is skipped.

-- Add {"label":"Supervision 4","value":"4"} to the supervision_type field, preserving
-- section and field order (jsonb_agg with ordinality).
create or replace function pg_temp.bcc_add_supervision_4(schema jsonb) returns jsonb as $fn$
  select jsonb_set(
    schema,
    '{sections}',
    coalesce((
      select jsonb_agg(
               jsonb_set(
                 sec,
                 '{fields}',
                 coalesce((
                   select jsonb_agg(
                            case
                              when fld->>'key' = 'supervision_type'
                               and jsonb_typeof(fld->'options') = 'array'
                               and not (fld->'options' @> '[{"value":"4"}]'::jsonb)
                              then jsonb_set(
                                     fld,
                                     '{options}',
                                     (fld->'options') || '[{"label":"Supervision 4","value":"4"}]'::jsonb
                                   )
                              else fld
                            end
                            order by fld_idx
                          )
                   from jsonb_array_elements(sec->'fields') with ordinality as f(fld, fld_idx)
                 ), '[]'::jsonb)
               )
               order by sec_idx
             )
      from jsonb_array_elements(schema->'sections') with ordinality as s(sec, sec_idx)
    ), '[]'::jsonb)
  );
$fn$ language sql immutable;

-- A) Founder template, so a new company is seeded correctly.
update public.form_templates
set schema = pg_temp.bcc_add_supervision_4(schema),
    version = version + 1,
    updated_at = now()
where key = 'supervision'
  and jsonb_path_exists(schema, '$.sections[*].fields[*] ? (@.key == "supervision_type")')
  and not jsonb_path_exists(
        schema,
        '$.sections[*].fields[*] ? (@.key == "supervision_type").options[*] ? (@.value == "4")'
      );

-- B) Existing company forms: a new published version carrying the fixed schema.
do $$
declare target record;
begin
  for target in
    select f.id as form_id, f.current_version, fv.schema
    from public.forms f
    join public.form_versions fv
      on fv.form_id = f.id and fv.version = f.current_version and fv.status = 'published'
    where f.key = 'supervision'
      and jsonb_path_exists(
            fv.schema,
            '$.sections[*].fields[*] ? (@.key == "supervision_type")'
          )
      and not jsonb_path_exists(
            fv.schema,
            '$.sections[*].fields[*] ? (@.key == "supervision_type").options[*] ? (@.value == "4")'
          )
  loop
    insert into public.form_versions (form_id, version, schema, status)
    values (target.form_id, target.current_version + 1,
            pg_temp.bcc_add_supervision_4(target.schema), 'published');

    update public.form_versions
    set status = 'archived'
    where form_id = target.form_id and version = target.current_version and status = 'published';

    update public.forms
    set current_version = target.current_version + 1, updated_at = now()
    where id = target.form_id;
  end loop;
end $$;
