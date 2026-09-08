-- 0242_probation_review_is_thistles_probation_review
-- The Probation Review in the library was scaffolding: an Outcome dropdown, two dates, a
-- comments box and a signature. Thistle's Employee Probation Review is the form the
-- service actually runs on, so it replaces it.
--
-- DROPPED as givens: Name, Region, Position, Employee Start Date and Completed By. The
-- record knows all five, and the Evidence stamps who submitted it and when. The two typed
-- Name boxes above the signature pads go for the same reason.
--
-- THE MONTH DROPDOWN IS GONE (Phil, 2026-09-08). Thistle's form asks "Please select
-- Probation Review Month": Month 1, Month 2, Month 3, Month 4 (due to probation
-- extension). Phil: "the month 1, 2, 3, 4 is for if they are seeing a person is not
-- performing they may complete one in month one and not sign them off then again in month
-- 2... it is so there is a paper trail, but i do not want this field i would like a better
-- option."
--
-- The better option is that nothing asks. A probation review can be completed as many
-- times as it needs to be, each one is a dated piece of Evidence on the record, and the
-- record already lists Evidence, so the trail is what actually happened rather than what
-- somebody remembered to select. A dropdown can say Month 1 twice, or skip to Month 3;
-- three dated reviews cannot.
--
-- WHAT MONTH 1/2/3 WAS REALLY SAYING is now the outcome question: "Not signed off yet,
-- review again" leaves the probation running and expects another review. The other three
-- options are Passed, Extended and Failed.
--
-- THE OUTCOME IS ADDED, NOT COPIED (Phil, 2026-09-08: "add it to the form"). Thistle's
-- form records no pass or fail at all -- its only decision is "should the employee's
-- probationary period be extended?" -- and the whole of BCC's probation wiring runs on
-- three answers this form has to produce: outcome sets probation_status, and
-- probation_end_actual is what makes Supervision 1 fall due. Copying the paper form
-- faithfully would have left every probation stuck on Due and no first supervision ever
-- scheduled for anybody. The extension question is folded into the outcome rather than
-- asked twice.
--
-- The two dates are conditional: the end date is asked only when they are signed off, the
-- extension date only when it is extended, so neither can be filled in for an outcome it
-- does not belong to. The care worker signature is asked only when the meeting was face to
-- face, which is what Thistle's label says in words; the meeting mode question therefore
-- moves above the signatures, where the answer exists in time to decide.
--
-- Replaced IN PLACE at version 1 across the master template and both company copies. No
-- Probation Review evidence exists anywhere; the guard enforces that rather than trusting
-- this note.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v_schema jsonb := '{"schemaVersion": 1, "sections": [{"id": "review", "title": "The review", "fields": [{"key": "review_date", "type": "date", "label": "Date of review", "required": true}, {"key": "training_manager", "type": "short_text", "label": "Training Manager full name"}, {"key": "positive_feedback", "type": "single_select", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "label": "Has the employee received any positive feedback from either management, colleagues or clients?"}]}, {"id": "concerns", "title": "Concerns", "fields": [{"key": "concerns", "type": "long_text", "validation": {"maxLength": 2000}, "label": "Any concerns Thistle Care Ltd has about the care worker, and the response from the care worker"}, {"key": "how_addressed", "type": "long_text", "validation": {"maxLength": 2000}, "label": "How will these areas be addressed during the remaining period of probation?"}]}, {"id": "outcome", "title": "Outcome", "fields": [{"key": "outcome", "type": "single_select", "label": "Outcome of this review", "required": true, "options": [{"value": "due", "label": "Not signed off yet, review again"}, {"value": "passed", "label": "Signed off, probation passed"}, {"value": "extended", "label": "Probation extended"}, {"value": "failed", "label": "Probation failed"}], "help": "Not signed off yet leaves the probation running and expects another review. There is no limit on how many reviews a probation can have."}, {"key": "probation_end_actual", "type": "date", "label": "Date probation ended", "required": true, "visibleWhen": {"field": "outcome", "in": ["passed"]}, "help": "The first supervision falls due from this date."}, {"key": "probation_extension_date", "type": "date", "label": "Probation extended to", "required": true, "visibleWhen": {"field": "outcome", "in": ["extended"]}}, {"key": "meeting_mode", "type": "single_select", "required": true, "label": "Was this probationary meeting conducted face to face or by telephone?", "options": [{"value": "face_to_face", "label": "Face to face"}, {"value": "telephone", "label": "Telephone"}]}, {"key": "manager_signature", "type": "signature", "label": "Manager''s declaration", "required": true, "help": "I confirm that this is an accurate and true record of the probation review."}, {"key": "carer_signature", "type": "signature", "label": "Care worker''s signature", "visibleWhen": {"field": "meeting_mode", "in": ["face_to_face"]}}]}]}'::jsonb;
  v_blocked int;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'probation_review';

  if v_blocked > 0 then
    raise exception 'Probation Review has % pieces of evidence against it; publish a new version instead of replacing v1', v_blocked;
  end if;

  update public.form_templates
     set schema = v_schema,
         name = 'Probation Review',
         updated_at = now()
   where key = 'probation_review';

  update public.form_versions fv
     set schema = v_schema
    from public.forms f
   where f.id = fv.form_id
     and f.key = 'probation_review'
     and fv.version = 1;
end $$;
