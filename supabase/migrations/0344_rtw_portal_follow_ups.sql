-- 0344_rtw_portal_follow_ups
-- Phil, 2026-09-29 (Absence round 2, item 5), from his own test of the portal questions: "if they
-- answer that they have a fit note and haven't already uploaded it, they need to upload it there
-- and then. 'Is there any support' should be Yes/No, and if Yes, ask what they need. Same for Q8
-- ('anything else you would like to raise')." Agreed by popup the same day:
--  * Yes to a fit note: a photo or PDF must be uploaded before the answers can go, unless one is
--    already uploaded for this absence. It is kept with the Return to Work (the manager sees it and
--    can download it) and filed into the Return to Work Evidence when the interview is recorded.
--  * Support Yes: "What do you need?"; anything else Yes: "What would you like to raise?". The box
--    must be filled in.
--  * The AI marks these questions when it drafts (followUp: fit_note / need / raise, on the question
--    in the stored JSON) and always asks the support and anything else ones.
--
-- 1. rtw_questionnaires: answer_details (what they need / want to raise, per question, null where
--    none) and the fit note file (private evidence bucket, {company}/rtw-fit-notes/{questionnaire}).
-- 2. my_rtw_questions also says whether a fit note is already uploaded.
-- 3. submit_my_rtw_answers takes the details and checks the follow ups. The old two argument
--    version is replaced by one with p_details defaulting to null, so a page still on the old code
--    keeps working until it reloads.
-- 4. The Return to Work form gains "Fit note" (fit_note, file_upload, optional) at the end of "The
--    absence", so the uploaded note can be filed into the Evidence. v1 edited in place on every
--    company and the template (standing rule 2026-09-08), only where missing.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

alter table public.rtw_questionnaires
  add column if not exists answer_details jsonb check (answer_details is null or jsonb_typeof(answer_details) = 'array'),
  add column if not exists fit_note_path text,
  add column if not exists fit_note_name text,
  add column if not exists fit_note_type text,
  add column if not exists fit_note_uploaded_at timestamptz,
  add column if not exists fit_note_evidence_id uuid references public.evidence(id) on delete set null;

create or replace function public.my_rtw_questions(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.rtw_questionnaires;
  v_first text;
  v_company text;
begin
  if auth.uid() is null then return null; end if;

  select q.* into v_row
  from public.rtw_questionnaires q
  join public.people pe on pe.id = q.person_id
  where q.id = p_id
    and pe.profile_id = auth.uid()
    and q.status in ('sent', 'answered', 'recorded');
  if v_row.id is null then return null; end if;

  select split_part(pe.full_name, ' ', 1), c.name into v_first, v_company
  from public.people pe join public.companies c on c.id = pe.company_id
  where pe.id = v_row.person_id;

  return jsonb_build_object(
    'id', v_row.id,
    'first_name', v_first,
    'company_name', v_company,
    'questions', v_row.questions,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'answered_at', v_row.answered_at,
    'expired', (v_row.status = 'sent' and v_row.expires_at is not null and v_row.expires_at < now()),
    'fit_note_name', v_row.fit_note_name
  );
end;
$$;

drop function if exists public.submit_my_rtw_answers(uuid, jsonb);

create or replace function public.submit_my_rtw_answers(p_id uuid, p_answers jsonb, p_details jsonb default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.rtw_questionnaires;
  v_q jsonb;
  v_a text;
  v_d text;
  v_i integer;
  v_n integer;
  v_details jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  select q.* into v_row
  from public.rtw_questionnaires q
  join public.people pe on pe.id = q.person_id
  where q.id = p_id and pe.profile_id = auth.uid()
  for update of q;
  if v_row.id is null then raise exception 'These questions could not be found.'; end if;

  if v_row.status <> 'sent' then return 'already'; end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then
    raise exception 'This link has expired. Please ask your manager to send it again.';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Your answers could not be read.';
  end if;
  if p_details is not null and jsonb_typeof(p_details) <> 'array' then
    raise exception 'Your answers could not be read.';
  end if;
  v_n := jsonb_array_length(v_row.questions);
  if jsonb_array_length(p_answers) <> v_n then
    raise exception 'Please answer every question.';
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_q := v_row.questions -> v_i;
    if jsonb_typeof(p_answers -> v_i) <> 'string' then
      raise exception 'Please answer every question.';
    end if;
    v_a := btrim(p_answers ->> v_i);
    if v_a = '' then raise exception 'Please answer every question.'; end if;
    if length(v_a) > 2000 then raise exception 'One of your answers is too long.'; end if;
    if v_q ->> 'type' = 'yes_no' and v_a not in ('Yes', 'No') then
      raise exception 'Please answer Yes or No where it asks.';
    end if;
    if v_q ->> 'type' = 'choice'
       and not exists (select 1 from jsonb_array_elements_text(coalesce(v_q -> 'options', '[]'::jsonb)) o where o = v_a) then
      raise exception 'Please choose one of the answers given.';
    end if;

    -- The follow ups (0344). A Yes to a fit note needs the note uploaded first.
    if v_q ->> 'followUp' = 'fit_note' and v_a = 'Yes' and v_row.fit_note_path is null then
      raise exception 'Please upload your fit note where it asks.';
    end if;
    v_d := null;
    if v_q ->> 'followUp' in ('need', 'raise') and v_a = 'Yes' then
      v_d := btrim(coalesce(p_details ->> v_i, ''));
      if v_d = '' then
        raise exception 'Please tell us more where you answered Yes.';
      end if;
      if length(v_d) > 2000 then raise exception 'One of your answers is too long.'; end if;
    end if;
    v_details := v_details || to_jsonb(v_d);
  end loop;

  update public.rtw_questionnaires
  set answers = (select jsonb_agg(btrim(x)) from jsonb_array_elements_text(p_answers) x),
      answer_details = v_details,
      status = 'answered',
      answered_at = now()
  where id = v_row.id;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (v_row.company_id, auth.uid(), 'staff', 'absence.rtw_questions_answered', 'person', v_row.person_id,
          'Answered their Return to Work questions', jsonb_build_object('rtw_questionnaire_id', v_row.id, 'absence_event_id', v_row.absence_event_id));

  return 'answered';
end;
$$;
revoke all on function public.submit_my_rtw_answers(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.submit_my_rtw_answers(uuid, jsonb, jsonb) to authenticated;

create or replace function pg_temp.add_fit_note(schema jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(schema, '{sections}', coalesce((
    select jsonb_agg(
      case when s->>'title' = 'The absence' and s ? 'fields'
        then jsonb_set(s, '{fields}', (s->'fields') || jsonb_build_array(jsonb_build_object(
          'key', 'fit_note',
          'type', 'file_upload',
          'label', 'Fit note',
          'help', 'Filed here automatically when they uploaded it with their answers. Otherwise attach a photo or PDF of it if they have one.',
          'required', false)))
        else s end
      order by so)
    from jsonb_array_elements(schema->'sections') with ordinality sec(s, so)), '[]'::jsonb))
$$;

update public.form_versions fv
set schema = pg_temp.add_fit_note(fv.schema)
from public.forms f
where f.id = fv.form_id
  and f.key = 'return_to_work'
  and fv.schema @? '$.sections[*] ? (@.title == "The absence")'
  and not (fv.schema @? '$.sections[*].fields[*] ? (@.key == "fit_note")');

update public.form_templates
set schema = pg_temp.add_fit_note(schema), updated_at = now()
where key = 'return_to_work'
  and schema @? '$.sections[*] ? (@.title == "The absence")'
  and not (schema @? '$.sections[*].fields[*] ? (@.key == "fit_note")');
