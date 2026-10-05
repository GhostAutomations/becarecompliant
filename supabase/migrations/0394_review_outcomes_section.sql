-- Be Care Compliant: the review's "Feedback and Outcomes" section becomes "Outcomes"
-- (Phil, 2026-10-05), on the CURRENT Individual Plan Review of the companies listed.
--
--   * The section is now one field, personal_outcomes (type outcomes_review): the person's
--     current outcomes filled in from the record, progress and a note each, then a new one.
--     The old "how many outcomes" question and the five retyped outcome pairs go.
--   * "Do you wish to give any feedback on your Care Workers?" and its detail box move to
--     Customer Satisfaction, NOT scored, before "Is there anything we can do to improve".
--   * "Were any other individuals present?" and "Who?" move to Review of Personal Plan.
--   * "Service Improvement" and its detail box are deleted: Customer Satisfaction asks it.
--
-- Completed reviews keep their own frozen copy, so nothing already recorded changes.
-- Bevan (test) first, then Thistle. Idempotent: a form that already has personal_outcomes
-- is left alone.

do $$
declare
  co uuid;
  vid uuid;
  sch jsonb;
  fb jsonb;
  present jsonb;
  outcomes_field jsonb := jsonb_build_object(
    'key', 'personal_outcomes', 'type', 'outcomes_review', 'label', 'Personal outcomes', 'required', true);
begin
  foreach co in array array[
    '84172279-54e4-4d5b-94b4-c92dc05c6baa'::uuid   -- Bevan Care Ltd (test)
  ] loop
    select fv.id, fv.schema into vid, sch
      from forms f join form_versions fv on fv.form_id = f.id and fv.version = f.current_version
     where f.company_id = co and f.key = 'care_plan_review';
    if vid is null or sch::text like '%"personal_outcomes"%' then continue; end if;

    select coalesce(jsonb_agg(
             case when f->>'key' = 'individuals_feedback'
                  then f || '{"required": true, "label": "Do you wish to give any feedback on your Care Workers?"}'::jsonb
                  when f->>'key' = 'feedback_detail' then f || '{"required": true}'::jsonb
                  else f end order by o), '[]'::jsonb)
      into fb
      from jsonb_array_elements(sch->'sections') s,
           jsonb_array_elements(s->'fields') with ordinality x(f, o)
     where s->>'title' = 'Feedback and Outcomes' and f->>'key' in ('individuals_feedback', 'feedback_detail');

    select coalesce(jsonb_agg(f order by o), '[]'::jsonb)
      into present
      from jsonb_array_elements(sch->'sections') s,
           jsonb_array_elements(s->'fields') with ordinality x(f, o)
     where s->>'title' = 'Feedback and Outcomes' and f->>'key' in ('other_individuals_present', 'who_present');

    sch := jsonb_set(sch, '{sections}', (
      select jsonb_agg(
        case
          when s->>'title' = 'Customer Satisfaction' then
            s || jsonb_build_object('fields', (
              select jsonb_agg(e order by k, o2)
                from (
                  select f e, 0 k, o o2 from jsonb_array_elements(s->'fields') with ordinality x(f, o)
                   where f->>'key' not in ('sat_improve_service', 'sat_further_comments')
                  union all
                  select f, 1, o from jsonb_array_elements(fb) with ordinality y(f, o)
                  union all
                  select f, 2, o from jsonb_array_elements(s->'fields') with ordinality z(f, o)
                   where f->>'key' in ('sat_improve_service', 'sat_further_comments')
                ) q))
          when s->>'title' = 'Review of Personal Plan' then
            s || jsonb_build_object('fields', (s->'fields') || present)
          when s->>'title' = 'Feedback and Outcomes' then
            (s - 'description') || jsonb_build_object(
              'title', 'Outcomes',
              'description', 'The outcomes on their record. Answers here update their Outcomes page.',
              'fields', jsonb_build_array(outcomes_field))
          else s end
        order by ord)
      from jsonb_array_elements(sch->'sections') with ordinality t(s, ord)));

    update form_versions set schema = sch where id = vid;
    insert into audit_log (company_id, action, entity_type, entity_id, summary, metadata)
    values (co, 'form.outcomes_section_rebuilt', 'form', vid::text,
            'Feedback and Outcomes became Outcomes, filled in from the Outcomes page', '{"migration":"0394"}');
  end loop;
end $$;
