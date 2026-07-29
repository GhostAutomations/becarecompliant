-- 0148_return_to_work_v4
-- Phase 10 Additions (Phil, 2026-07-29, the day after 0147). Version 4 of the Return to
-- Work form. Phil, on seeing v3: "'The conversation' tile ... needs to also be ai and
-- relevent to the absence."
--
-- He is right again, and it is the same argument that produced v3. v3 moved the six
-- health questions to the AI and left a FIXED core behind: fit to return, ongoing
-- symptoms, was it work related, adjustments needed, support agreed. Those five are
-- questions, they are asked in the same conversation, and asking them in the same words
-- after every absence trains a manager to tick through them. A stomach bug, a back
-- injury and a run of single days do not deserve the same five questions either.
--
-- So v4 folds them into the mechanism that already works: the AI writes the questions
-- for THIS absence, the dialog renders each as a real labelled control, and the whole
-- set is serialised into the one tailored_questions long_text as readable "Q: ..." then
-- "A: ..." blocks. The reasoning for one long_text rather than a field per question is
-- unchanged from 0147: Evidence pins a form_version id and lib/form-validate.ts
-- validates every answer on the SERVER against the STORED published schema, so a
-- question the AI invented this morning cannot be an ordinary schema answer, and
-- minting a form version per absence would wreck the audit trail.
--
-- THE GROUND THOSE FIELDS COVERED IS NOT DROPPED. lib/absence/rtw-actions.ts is widened
-- in the same change: the model is now told its set MUST cover whether they are fit to
-- return and any adjustments they need, whether anything at work caused or worsened the
-- absence, and what support would help, on top of whatever this particular absence
-- calls for. The cap rises from 6 questions to 8 (lib/forms.ts), which is as far as it
-- goes: a manager will not work through twenty. The guardrails are untouched: never
-- diagnose, never speculate about a medical cause, never suggest an outcome or
-- disciplinary action.
--
-- Changes from v3:
--  * REMOVED the whole "The conversation" section: fit_to_return, ongoing_symptoms,
--    work_related and the conditional adjustments_needed. Nothing in the app reads any
--    of those keys (checked across lib, components and app before removing them); they
--    were only ever read back out of Evidence.
--  * REMOVED support_agreed, which is a question in the same conversation.
--  * KEPT referral and follow_up_date, renamed to the "Next steps" section. Those are
--    record keeping, not interview questions: what the manager DID and when they will
--    look at it again. A structured referral value and a real date field are worth more
--    than the same facts buried in prose, so they stay as fields.
--  * KEPT everything else: absence_summary and tailored_questions, "The absence"
--    (absence_dates, days_lost, reason_given), employee_comments, the conducted_by
--    single_select whose options are baked by public.rebake_form_field_options,
--    interview_date, completed_over_phone and the two signature fields it switches
--    between.
--  * tailored_questions now says in its help text what the drafted set covers, so a
--    manager who never presses "Draft it for me" still knows what to record.
--
-- Old evidence keeps the version it was completed against, so a v3 record still reads
-- with its conversation answers in place. Idempotent: the marker phrase "whether they
-- are fit to return" appears only in v4, so a re-run does nothing.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v4 jsonb := $j${
    "schemaVersion": 1,
    "sections": [
      {
        "id": "section-1",
        "title": "Prepared for you",
        "description": "Drafted from the absence record. Read it, change anything that is not right, and delete what you did not use. Nothing here is sent anywhere until you complete the form.",
        "fields": [
          {"key": "absence_summary", "type": "long_text", "label": "Summary of the absence"},
          {"key": "tailored_questions", "type": "long_text", "label": "Questions asked and answers",
           "help": "Draft it for me writes a set of questions for this absence and turns them into boxes for you to fill in. The set always covers whether they are fit to return and any adjustments they need, whether anything at work played a part, and what support would help. Whatever you answer is recorded here, and you can type in it yourself."}
        ]
      },
      {
        "id": "section-2",
        "title": "The absence",
        "fields": [
          {"key": "absence_dates", "type": "short_text", "label": "Dates of absence"},
          {"key": "days_lost", "type": "short_text", "label": "Working days lost"},
          {"key": "reason_given", "type": "long_text", "label": "Reason given for the absence"}
        ]
      },
      {
        "id": "section-3",
        "title": "Next steps",
        "description": "What you did after the conversation, and when you will look at it again.",
        "fields": [
          {"key": "referral", "type": "single_select", "label": "Referral made",
           "options": [
             {"label": "None", "value": "None"},
             {"label": "Occupational health", "value": "Occupational health"},
             {"label": "HR", "value": "HR"},
             {"label": "Their GP", "value": "Their GP"}
           ]},
          {"key": "follow_up_date", "type": "date", "label": "Follow up date"}
        ]
      },
      {
        "id": "section-4",
        "title": "Confirmation",
        "fields": [
          {"key": "employee_comments", "type": "long_text", "label": "Employee comments"},
          {"key": "conducted_by", "type": "single_select", "label": "Interview conducted by",
           "help": "Your staff list. Ask an administrator to add anyone missing.",
           "options": []},
          {"key": "interview_date", "type": "date", "label": "Date of the interview", "required": true},
          {"key": "completed_over_phone", "type": "checkbox",
           "label": "This interview was completed over the phone",
           "help": "Tick this and the interviewer signs instead of the employee."},
          {"key": "employee_signature", "type": "signature", "label": "Employee signature",
           "visibleWhen": {"field": "completed_over_phone", "in": ["false"]}},
          {"key": "interviewer_signature", "type": "signature",
           "label": "Interviewer signature confirming a conversation held over the phone",
           "help": "The employee is not present to sign, so you sign to confirm the conversation took place and this record is accurate.",
           "visibleWhen": {"field": "completed_over_phone", "in": ["true"]}}
        ]
      }
    ]
  }$j$::jsonb;
  f record;
  c record;
begin
  update public.form_templates
  set schema = v4, version = version + 1, updated_at = now()
  where key = 'return_to_work';

  for f in
    select fo.id
    from public.forms fo
    where fo.key = 'return_to_work'
      and not coalesce((
        select fv.schema::text like '%whether they are fit to return%'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      ), false)
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v4, 'published'
    from public.form_versions fv
    where fv.form_id = f.id;
  end loop;

  -- conducted_by ships with no options, exactly as in 0145 and 0147, so the brand new
  -- version needs the company staff list baking into it. Without this the dropdown is
  -- empty and server side validation would reject any answer.
  for c in select id from public.companies loop
    perform public.rebake_form_field_options(c.id);
  end loop;
end $$;
