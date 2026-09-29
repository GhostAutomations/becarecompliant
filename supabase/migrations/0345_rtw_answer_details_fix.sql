-- 0345_rtw_answer_details_fix
-- Found by the rolled back probe of 0344 before anything shipped: a question with no follow up
-- adds SQL null to answer_details, and jsonb || null is null, so every set of details was lost.
-- Each unanswered detail is now a JSON null, keeping one entry per question.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

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
    v_details := v_details || coalesce(to_jsonb(v_d), 'null'::jsonb);
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
