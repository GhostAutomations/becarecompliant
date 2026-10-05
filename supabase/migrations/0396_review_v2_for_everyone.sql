-- Be Care Compliant: the Individual Plan Review v2 for EVERY company and every future one
-- (Phil, 2026-10-05: "yes but them on all companies and demos" ... "and future companies").
--
-- What Bevan tested and passed (0391, 0392, 0394, 0395), applied in one step to:
--   * the library template care_plan_review, which seed_company_forms_except copies into
--     every new company (version bumped, so the founder's library push view is honest);
--   * the CURRENT version of every company's care_plan_review not already on v2
--     (Thistle, Demo Care Company Limited, and anyone else).
--
-- The result, per form:
--   * Customer Satisfaction = the standard list below: three scored questions (happy with
--     the service, happy with the office's communication, unresolved issues with No as the
--     satisfied answer), then care plan changes, care worker feedback, improve, comments.
--     The care schedule and the old schedule questions go.
--   * "Feedback and Outcomes" becomes "Outcomes": one personal_outcomes field, filled in
--     from the Outcomes page and written back on submit (lib/service-users/outcomes-review.ts).
--   * "Were any other individuals present?" and "Who?" move to Review of Personal Plan.
--   * Service Improvement and the retyped outcomes are deleted.
--
-- Completed reviews keep their own frozen copy and score; nothing already recorded moves.
-- Idempotent: anything already carrying personal_outcomes is left alone.

create or replace function pg_temp.review_v2(sch jsonb) returns jsonb language plpgsql as $f$
declare
  cs jsonb := '[{"key": "sat_happy_service", "type": "single_select", "label": "Are you happy with the service you are being provided?", "options": [{"label": "No", "value": "No"}, {"label": "Yes", "value": "Yes"}], "required": true, "satisfaction": true}, {"key": "sat_happy_service_detail", "help": "Say what the individual told you, in their words where you can.", "type": "long_text", "label": "What is wrong?", "required": true, "visibleWhen": {"in": ["No"], "field": "sat_happy_service"}}, {"key": "sat_office_communication", "type": "single_select", "label": "Are you happy with the office team''s communication with you?", "options": [{"label": "No", "value": "No"}, {"label": "Yes", "value": "Yes"}], "required": true, "satisfaction": true}, {"key": "sat_office_communication_detail", "help": "Say what the individual told you, in their words where you can.", "type": "long_text", "label": "What is wrong?", "required": true, "visibleWhen": {"in": ["No"], "field": "sat_office_communication"}}, {"key": "sat_unresolved_issues", "type": "single_select", "label": "Are there any unresolved issues?", "options": [{"label": "No", "value": "No"}, {"label": "Yes", "value": "Yes"}], "required": true, "satisfaction": true, "satisfactionGood": "No"}, {"key": "sat_unresolved_issues_detail", "help": "Say what the individual told you, in their words where you can.", "type": "long_text", "label": "Please give details", "required": true, "visibleWhen": {"in": ["Yes"], "field": "sat_unresolved_issues"}}, {"key": "sat_care_plan_changes", "type": "single_select", "label": "Would you like to make any changes to your care plan?", "options": [{"label": "No", "value": "No"}, {"label": "Yes", "value": "Yes"}], "required": true}, {"key": "sat_care_plan_changes_detail", "type": "long_text", "label": "What changes would you like?", "required": true, "visibleWhen": {"in": ["Yes"], "field": "sat_care_plan_changes"}}, {"key": "individuals_feedback", "type": "single_select", "label": "Do you wish to give any feedback on your Care Workers?", "options": [{"label": "No", "value": "No"}, {"label": "Yes", "value": "Yes"}], "required": true}, {"key": "feedback_detail", "type": "long_text", "label": "Please detail feedback below", "required": true, "visibleWhen": {"in": ["Yes"], "field": "individuals_feedback"}}, {"key": "sat_improve_service", "type": "long_text", "label": "Is there anything we can do to improve this service?", "required": true}, {"key": "sat_further_comments", "type": "long_text", "label": "Do you have any further comments?", "required": true}]'::jsonb;
  present jsonb;
  has_cs boolean;
begin
  if sch::text like '%"personal_outcomes"%' then return sch; end if;
  select coalesce(jsonb_agg(f order by o), '[]'::jsonb) into present
    from jsonb_array_elements(sch->'sections') s, jsonb_array_elements(s->'fields') with ordinality x(f, o)
   where s->>'title' = 'Feedback and Outcomes' and f->>'key' in ('other_individuals_present', 'who_present');
  select exists (select 1 from jsonb_array_elements(sch->'sections') s where s->>'title' = 'Customer Satisfaction') into has_cs;
  return jsonb_set(sch, '{sections}', (
    select jsonb_agg(sec order by ord) from (
      select
        case
          when s->>'title' = 'Customer Satisfaction' then
            s || jsonb_build_object('fields', cs,
                   'description', 'These answers are the customer satisfaction score in the PQS return.')
          when s->>'title' = 'Review of Personal Plan' then
            s || jsonb_build_object('fields', (s->'fields') || present)
          when s->>'title' = 'Feedback and Outcomes' then
            (s - 'description') || jsonb_build_object('title', 'Outcomes',
              'description', 'The outcomes on their record. Answers here update their Outcomes page.',
              'fields', jsonb_build_array(jsonb_build_object(
                'key', 'personal_outcomes', 'type', 'outcomes_review', 'label', 'Personal outcomes', 'required', true)))
          else s end sec,
        ord::numeric ord
      from jsonb_array_elements(sch->'sections') with ordinality t(s, ord)
      union all
      -- A form without a Customer Satisfaction section gets one, just before Outcomes.
      select jsonb_build_object('id', 'customer_satisfaction', 'title', 'Customer Satisfaction',
               'description', 'These answers are the customer satisfaction score in the PQS return.',
               'fields', cs),
             (select ord - 0.5 from jsonb_array_elements(sch->'sections') with ordinality t(s, ord)
               where s->>'title' = 'Feedback and Outcomes' limit 1)
       where not has_cs
         and exists (select 1 from jsonb_array_elements(sch->'sections') s where s->>'title' = 'Feedback and Outcomes')
    ) q));
end $f$;

do $$
declare r record; tv int; tsch jsonb;
begin
  -- 1. The library: every future company.
  update form_templates
     set schema = pg_temp.review_v2(schema), version = version + 1
   where key = 'care_plan_review' and schema::text not like '%"personal_outcomes"%';
  select version, schema into tv, tsch from form_templates where key = 'care_plan_review';

  -- 2. Every company holding the form.
  for r in
    select f.id form_id, f.company_id, fv.id vid
      from forms f join form_versions fv on fv.form_id = f.id and fv.version = f.current_version
     where f.key = 'care_plan_review' and fv.schema::text not like '%"personal_outcomes"%'
  loop
    update form_versions set schema = pg_temp.review_v2(schema) where id = r.vid;
    update forms set library_version = tv, library_schema = tsch where id = r.form_id;
    insert into audit_log (company_id, action, entity_type, entity_id, summary, metadata)
    values (r.company_id, 'form.review_v2', 'form', r.vid::text,
            'Individual Plan Review updated: new satisfaction questions, Outcomes from the record',
            '{"migration":"0396"}');
  end loop;

  -- Bevan was moved by hand while testing; record that it now matches what it was handed.
  update forms set library_version = tv, library_schema = tsch
   where key = 'care_plan_review' and company_id = '84172279-54e4-4d5b-94b4-c92dc05c6baa';
end $$;
