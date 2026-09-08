-- 0248_manual_handling_is_thistles_competency_assessment
-- The Manual Handling Competency Assessment in the library was the raw import of Thistle's
-- form, keys truncated at 35 characters and every one of its twenty three fields in a
-- single block called "Details". This is Thistle's form as it actually reads, in sections,
-- with the questions that only matter sometimes asked only then.
--
-- DROPPED as givens, as on every other form: Name, Region and Completed By. The record
-- knows them and the Evidence stamps who submitted it and when. Completed By was in there
-- TWICE -- completed_by and completed_by_2, both required -- so two identical boxes had to
-- be filled in with the same name before the form would save.
--
-- DATE OF NEXT ASSESSMENT IS GONE (Phil, 2026-09-08, asked and answered: "drop it").
-- Thistle's form asks for it with the instruction "Above Date Plus 1 Year" printed
-- underneath, which is a sum, done by hand, at the end of an assessment. The check already
-- schedules the next one 365 days after the assessment date -- that is what anchor
-- 'completion' with a 365 day interval means -- so the box was a second answer to a
-- question the system answers itself, and the only thing it could add was disagreement.
-- The assessment date now says so in its help text.
--
-- THE DETAIL BOXES ARE ASKED ONLY WHEN THERE IS SOMETHING TO SAY. "What are your
-- concerns?" appears on Yes to concerns, "what was not met" on No to meeting the standards,
-- and "what training is required" on Yes to training needed -- each required when it is
-- asked, and storing nothing when it is not. On the paper form all three sit there on every
-- assessment whatever the answers were, which is how a form teaches people to skip boxes.
--
-- THE COMMENT LABELS SAY WHAT THEY ARE FOR. Thistle's form labels three of them
-- "Observational comment. Detail any coaching given." and leaves the other two as
-- "Comments on the above." -- the same box wanted for the same purpose, named five
-- different ways. Each is now named for its own task and asks for the observation and the
-- coaching, because the coaching is the part that makes an assessment worth doing.
--
-- SIGNATURES (Phil, 2026-09-08): the assessor's is required and the team member's is not,
-- as on the Annual Appraisal. The assessor is the one completing the form, so their
-- declaration is the record; the carer may have left before it is written up.
--
-- Replaced IN PLACE at version 1 across the master template and both company copies. No
-- Manual Handling evidence exists anywhere; the guard enforces that rather than trusting
-- this note.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v_schema jsonb := '{"schemaVersion": 1, "sections": [{"id": "assessment", "title": "The assessment", "fields": [{"key": "assessment_date", "type": "date", "label": "Date of assessment", "required": true, "help": "The next assessment falls due a year after this date."}, {"key": "previous_training", "type": "single_select", "label": "Has the staff member received previous manual handling training?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}]}, {"id": "observed", "title": "What was observed", "description": "Each task is either observed on the visit or it is not. Where it was, the comment is where the coaching goes.", "fields": [{"key": "assist_chair", "type": "single_select", "label": "Did the staff member assist the person forward or back in the chair?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "assist_chair_comments", "type": "long_text", "label": "Assisting in the chair - observational comment and any coaching given", "validation": {"maxLength": 2000}}, {"key": "assist_walk", "type": "single_select", "label": "Did the staff member assist to walk?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "assist_walk_comments", "type": "long_text", "label": "Assisting to walk - observational comment and any coaching given", "validation": {"maxLength": 2000}}, {"key": "explain_falling", "type": "single_select", "label": "Can the staff member explain the process of how to assist a falling client?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "explain_falling_comments", "type": "long_text", "label": "The answer the carer gave, and any coaching given", "validation": {"maxLength": 2000}}, {"key": "slide_sheets", "type": "single_select", "label": "Were slide sheets used?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "slide_sheets_comments", "type": "long_text", "label": "Slide sheets - observational comment and any coaching given", "validation": {"maxLength": 2000}}, {"key": "equipment", "type": "single_select", "label": "Was manual handling equipment used?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "equipment_comments", "type": "long_text", "label": "Equipment - observational comment and any coaching given", "validation": {"maxLength": 2000}}]}, {"id": "outcome", "title": "Outcome", "fields": [{"key": "concerns", "type": "single_select", "label": "Do you have any concerns?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "concerns_detail", "type": "long_text", "label": "What are your concerns?", "validation": {"maxLength": 2000}, "required": true, "visibleWhen": {"field": "concerns", "in": ["yes"]}}, {"key": "met_standards", "type": "single_select", "label": "Has the carer met the standards expected of them?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "not_met_detail", "type": "long_text", "label": "What was not met, and what coaching was given?", "validation": {"maxLength": 2000}, "required": true, "visibleWhen": {"field": "met_standards", "in": ["no"]}}, {"key": "training_required", "type": "single_select", "label": "Any recommended training or mentoring required?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "training_detail", "type": "long_text", "label": "What training or mentoring is required?", "validation": {"maxLength": 2000}, "required": true, "visibleWhen": {"field": "training_required", "in": ["yes"]}}]}, {"id": "sign_off", "title": "Sign off", "fields": [{"key": "assessor_signature", "type": "signature", "label": "Assessor''s declaration", "required": true, "help": "I confirm that this is an accurate and true record of the assessment."}, {"key": "team_member_signature", "type": "signature", "label": "Team member signature"}]}]}'::jsonb;
  v_blocked int;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'manual_handling_ca';

  if v_blocked > 0 then
    raise exception 'Manual Handling CA has % pieces of evidence against it; delete the test evidence or publish a new version', v_blocked;
  end if;

  update public.form_templates
     set schema = v_schema,
         name = 'Manual Handling Competency Assessment',
         updated_at = now()
   where key = 'manual_handling_ca';

  update public.form_versions fv
     set schema = v_schema
    from public.forms f
   where f.id = fv.form_id
     and f.key = 'manual_handling_ca'
     and fv.version = 1;

  update public.forms
     set name = 'Manual Handling Competency Assessment',
         updated_at = now()
   where key = 'manual_handling_ca';
end $$;
