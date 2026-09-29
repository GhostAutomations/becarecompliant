-- 0334_meeting_warning_follows_stage_actions
-- Phil, 2026-09-29: Settings, Absence gets a stage action per stage from a fixed list ("for
-- Thistle it is up to and including S1 verbal warning, S2 written warning, S3 final written
-- warning, S4 dismissal"). The Absence Management Meeting's warning question offered only
-- None, First written warning and Final written warning, so a verbal warning or a dismissal
-- could not be recorded and nothing could be compared with the stage.
--
-- The question becomes "Warning or dismissal": None, Verbal warning, Written warning, Final
-- written warning, Dismissal (WARNING_OPTIONS in lib/absence/stage-actions.ts, which the
-- server compares with the stage action). "Warning remains live until" shows for the three
-- warnings.
--
-- EDITED IN PLACE ON v1 (standing rule 2026-09-08: default forms stay at v1 while they are
-- built). Safe for the Evidence already held: every recorded answer is "None" or blank, and
-- "None" is still an option. Every company copy AND the founder template, so new companies
-- get the same. Idempotent: it sets values, it does not append.
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create or replace function pg_temp.meeting_warning_fix(schema jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(schema, '{sections}', coalesce((
    select jsonb_agg(
      case when s ? 'fields' then jsonb_set(s, '{fields}', coalesce((
        select jsonb_agg(
          case x->>'key'
            when 'warning_issued' then x || jsonb_build_object(
              'label', 'Warning or dismissal',
              'help', 'Leave as None unless a formal warning was given or the employee was dismissed.',
              'options', jsonb_build_array(
                jsonb_build_object('label', 'None', 'value', 'None'),
                jsonb_build_object('label', 'Verbal warning', 'value', 'Verbal warning'),
                jsonb_build_object('label', 'Written warning', 'value', 'Written warning'),
                jsonb_build_object('label', 'Final written warning', 'value', 'Final written warning'),
                jsonb_build_object('label', 'Dismissal', 'value', 'Dismissal')))
            when 'warning_live_until' then x || jsonb_build_object(
              'visibleWhen', jsonb_build_object(
                'field', 'warning_issued',
                'in', jsonb_build_array('Verbal warning', 'Written warning', 'Final written warning')))
            else x end
          order by fo)
        from jsonb_array_elements(s->'fields') with ordinality f(x, fo)), '[]'::jsonb))
      else s end
      order by so)
    from jsonb_array_elements(schema->'sections') with ordinality sec(s, so)), '[]'::jsonb))
$$;

update public.form_versions fv
set schema = pg_temp.meeting_warning_fix(fv.schema)
from public.forms f
where f.id = fv.form_id
  and f.key = 'absence_management_meeting'
  and fv.schema @? '$.sections[*].fields[*] ? (@.key == "warning_issued")';

update public.form_templates
set schema = pg_temp.meeting_warning_fix(schema), updated_at = now()
where key = 'absence_management_meeting'
  and schema @? '$.sections[*].fields[*] ? (@.key == "warning_issued")';
