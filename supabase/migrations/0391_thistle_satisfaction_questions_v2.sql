-- Be Care Compliant: Thistle's new customer satisfaction questions (Phil, 2026-10-05).
--
-- Replaces the three schedule questions in the Customer Satisfaction section of the
-- company's CURRENT Individual Plan Review with Thistle's own list. Four are scored, each
-- review counts once in the percentage (lib/service-users/satisfaction.ts).
--
-- Evidence already recorded keeps its frozen copy of the old questions and is scored on
-- those, so the percentage already reported does not move.
--
-- Run for Bevan (test) first, then Thistle. Idempotent: a form that already has
-- sat_happy_service is left alone.

do $$
declare
  co uuid;
  v record;
  new_fields jsonb := jsonb_build_array(
    -- The schedule the office holds, read out at the visit (kept from 0263).
    jsonb_build_object('key','current_care_schedule','type','care_package','label','Care schedule on record','readOnly',true,
      'help','This is the schedule the office holds and Invoicing bills from. Read it out and check it against what is actually happening.'),
    jsonb_build_object('key','sat_wellbeing','type','long_text','label','How is the individual''s well-being?','required',true),

    jsonb_build_object('key','sat_happy_service','type','single_select','label','Are you happy with the service you are being provided?','required',true,'satisfaction',true,
      'options', jsonb_build_array(jsonb_build_object('label','No','value','No'), jsonb_build_object('label','Yes','value','Yes'))),
    jsonb_build_object('key','sat_happy_service_detail','type','long_text','label','What is wrong?','required',true,
      'help','Say what the individual told you, in their words where you can.',
      'visibleWhen', jsonb_build_object('field','sat_happy_service','in',jsonb_build_array('No'))),

    jsonb_build_object('key','sat_office_communication','type','single_select','label','Are you happy with the office team''s communication with you?','required',true,'satisfaction',true,
      'options', jsonb_build_array(jsonb_build_object('label','No','value','No'), jsonb_build_object('label','Yes','value','Yes'))),
    jsonb_build_object('key','sat_office_communication_detail','type','long_text','label','What is wrong?','required',true,
      'help','Say what the individual told you, in their words where you can.',
      'visibleWhen', jsonb_build_object('field','sat_office_communication','in',jsonb_build_array('No'))),

    jsonb_build_object('key','sat_unresolved_issues','type','single_select','label','Are there any unresolved issues?','required',true,'satisfaction',true,'satisfactionGood','No',
      'options', jsonb_build_array(jsonb_build_object('label','No','value','No'), jsonb_build_object('label','Yes','value','Yes'))),
    jsonb_build_object('key','sat_unresolved_issues_detail','type','long_text','label','Please give details','required',true,
      'help','Say what the individual told you, in their words where you can.',
      'visibleWhen', jsonb_build_object('field','sat_unresolved_issues','in',jsonb_build_array('Yes'))),

    jsonb_build_object('key','sat_outcomes_not_assisted','type','single_select','label','Are there any outcomes you would like to achieve that are not currently being assisted with?','required',true,'satisfaction',true,'satisfactionGood','No',
      'options', jsonb_build_array(jsonb_build_object('label','No','value','No'), jsonb_build_object('label','Yes','value','Yes'))),
    jsonb_build_object('key','sat_outcomes_not_assisted_detail','type','long_text','label','Please give details','required',true,
      'help','Say what the individual told you, in their words where you can.',
      'visibleWhen', jsonb_build_object('field','sat_outcomes_not_assisted','in',jsonb_build_array('Yes'))),

    -- Not scored: wanting a change is not dissatisfaction.
    jsonb_build_object('key','sat_care_plan_changes','type','single_select','label','Would you like to make any changes to your care plan?','required',true,
      'options', jsonb_build_array(jsonb_build_object('label','No','value','No'), jsonb_build_object('label','Yes','value','Yes'))),
    jsonb_build_object('key','sat_care_plan_changes_detail','type','long_text','label','What changes would you like?','required',true,
      'visibleWhen', jsonb_build_object('field','sat_care_plan_changes','in',jsonb_build_array('Yes'))),

    jsonb_build_object('key','sat_improve_service','type','long_text','label','Is there anything we can do to improve this service?','required',true),
    jsonb_build_object('key','sat_further_comments','type','long_text','label','Do you have any further comments?','required',true)
  );
begin
  foreach co in array array[
    '84172279-54e4-4d5b-94b4-c92dc05c6baa'::uuid,  -- Bevan Care Ltd (test), applied 2026-10-05
    'eae26e83-1e41-472b-abc0-e2b39b907e49'::uuid   -- Thistle Care Ltd, applied 2026-10-05 after Bevan passed
  ] loop
    select fv.id, fv.schema into v
      from forms f join form_versions fv on fv.form_id = f.id and fv.version = f.current_version
     where f.company_id = co and f.key = 'care_plan_review';
    if v.id is null then continue; end if;
    if v.schema::text like '%"sat_happy_service"%' then continue; end if;

    update form_versions
       set schema = jsonb_set(schema, '{sections}', (
         select jsonb_agg(
                  case when s->>'title' = 'Customer Satisfaction'
                       then s || jsonb_build_object('fields', new_fields)
                       else s end
                  order by ord)
           from jsonb_array_elements(schema->'sections') with ordinality as t(s, ord)))
     where id = v.id;

    insert into audit_log (company_id, action, entity_type, entity_id, summary, metadata)
    values (co, 'satisfaction.questions_replaced', 'form', v.id::text,
            'Customer satisfaction questions replaced with the 2026-10 list',
            jsonb_build_object('version_id', v.id, 'migration', '0391'));
  end loop;
end $$;
