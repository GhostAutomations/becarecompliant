-- 0459: cancel a Return to Work (Phil, 2026-10-13; docs/decisions/absence-stage-history.md, the
-- Absence section job, Part B). Also retires the absence stage history switch (Part A).
--
-- WHY. A Return to Work is raised for every absence (0142) and there was no way to say one will
-- not happen: Thistle had a backlog of overdue ones from before they started on the system and
-- asked for them to be cancelled. A cancelled Return to Work is NOT deleted: it stays on the
-- absence with who, when and why (the same four fields as discounting, 0328), it leaves every
-- outstanding list (lib/absence/rtw.ts, the one rule), and it can be reinstated.
--
-- WHO. Managers and above (Phil): Company Admin, Responsible Individual, Registered Manager, a
-- Branch Manager for their own branch, and the Founder. Checked here, in the database, against
-- the absence's own person and branch, never only on screen. Supervisors and everyone else are
-- refused.
--
-- THE TEXTED LINK. If questions were drafted or sent for that absence, cancelling closes them
-- (status 'cancelled'): the employee's page says the Return to Work was cancelled, and their
-- answers cannot be sent. Reinstating puts the questions back to drafted, so nothing goes to the
-- employee until a manager sends them again.
--
-- A recorded Return to Work (rtw_evidence_id set) can never be cancelled. Cancelling one already
-- cancelled does nothing and says so. Nothing here touches absence counts or stages.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------
-- 1. The fields, guarded like discounting: only the functions below may set them.
-- ---------------------------------------------------------------------------------------------
alter table public.absence_events
  add column if not exists rtw_cancelled_at timestamptz,
  add column if not exists rtw_cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists rtw_cancelled_by_name text,
  add column if not exists rtw_cancel_reason text;

create index if not exists absence_events_rtw_cancelled_by_idx on public.absence_events (rtw_cancelled_by);

create or replace function public.absence_events_guard_rtw_cancel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- The service role (no signed in user) is trusted: retention and anonymisation run there.
  if auth.uid() is null then return new; end if;
  if coalesce(current_setting('bcc.rtw_cancel', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.rtw_cancelled_at is not null or new.rtw_cancelled_by is not null
       or new.rtw_cancelled_by_name is not null or new.rtw_cancel_reason is not null then
      raise exception 'A Return to Work is cancelled with Cancel, after the absence is recorded.';
    end if;
  elsif (new.rtw_cancelled_at, new.rtw_cancelled_by, new.rtw_cancelled_by_name, new.rtw_cancel_reason)
        is distinct from (old.rtw_cancelled_at, old.rtw_cancelled_by, old.rtw_cancelled_by_name, old.rtw_cancel_reason) then
    raise exception 'A Return to Work is cancelled or reinstated with Cancel and Reinstate, not edited directly.';
  end if;
  return new;
end;
$$;

drop trigger if exists absence_events_guard_rtw_cancel on public.absence_events;
create trigger absence_events_guard_rtw_cancel
  before insert or update on public.absence_events
  for each row execute function public.absence_events_guard_rtw_cancel();

-- ---------------------------------------------------------------------------------------------
-- 2. A closed questionnaire.
-- ---------------------------------------------------------------------------------------------
alter table public.rtw_questionnaires drop constraint if exists rtw_questionnaires_status_check;
alter table public.rtw_questionnaires add constraint rtw_questionnaires_status_check
  check (status in ('drafted', 'sent', 'answered', 'recorded', 'cancelled'));

-- ---------------------------------------------------------------------------------------------
-- 3. Who may cancel: Managers and above, for the absence's own person and branch.
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_cancel_rtw(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person
      and ( public.is_platform_admin()
         or public.is_company_wide(pe.company_id)
         or (pe.branch_id is not null and public.is_branch_manager(pe.branch_id)) )
  );
$$;
revoke all on function public.can_cancel_rtw(uuid) from public, anon;
grant execute on function public.can_cancel_rtw(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Cancel one or several. All or nothing: one refused absence refuses the lot, with its reason.
--    Returns {"cancelled": n, "already": m}.
-- ---------------------------------------------------------------------------------------------
create or replace function public.cancel_rtw(p_ids uuid[], p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
  v_row public.absence_events%rowtype;
  v_name text := public.absence_actor_name();
  v_role text;
  v_done int := 0;
  v_already int := 0;
  v_closed int;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Choose at least one Return to Work.'; end if;
  if cardinality(p_ids) > 200 then raise exception 'Cancel at most 200 at a time.'; end if;
  if char_length(v_reason) < 3 then raise exception 'Say why the Return to Work is being cancelled.'; end if;
  select role into v_role from public.profiles where id = auth.uid();

  foreach v_id in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    select * into v_row from public.absence_events where id = v_id for update;
    if not found then raise exception 'That Return to Work could not be found.'; end if;
    if not public.can_cancel_rtw(v_row.person_id) then
      raise exception 'Only a Manager or above can cancel a Return to Work.' using errcode = '42501';
    end if;
    if v_row.rtw_evidence_id is not null then
      raise exception 'The Return to Work for the absence of % has been recorded, so it cannot be cancelled.',
        to_char(v_row.start_date, 'FMDD FMMonth YYYY');
    end if;
    if v_row.rtw_due_date is null then
      raise exception 'The absence of % has no Return to Work due yet.', to_char(v_row.start_date, 'FMDD FMMonth YYYY');
    end if;
    if v_row.rtw_cancelled_at is not null then
      v_already := v_already + 1;
      continue;
    end if;

    perform set_config('bcc.rtw_cancel', 'on', true);
    update public.absence_events
       set rtw_cancelled_at = now(), rtw_cancelled_by = auth.uid(),
           rtw_cancelled_by_name = v_name, rtw_cancel_reason = left(v_reason, 500)
     where id = v_id;
    perform set_config('bcc.rtw_cancel', '', true);

    -- Close any questions drafted or sent for it, so the employee's link stops working.
    update public.rtw_questionnaires set status = 'cancelled'
     where absence_event_id = v_id and status in ('drafted', 'sent');
    get diagnostics v_closed = row_count;

    insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
    values (v_row.company_id, auth.uid(), coalesce(v_role, 'unknown'), 'absence.rtw_cancelled', 'person', v_row.person_id,
            'Cancelled the Return to Work for the absence of ' || to_char(v_row.start_date, 'FMDD FMMonth YYYY') || ': ' || left(v_reason, 500),
            jsonb_build_object('absence_event_id', v_id, 'rtw_due_date', v_row.rtw_due_date, 'questions_closed', v_closed > 0));
    v_done := v_done + 1;
  end loop;

  return jsonb_build_object('cancelled', v_done, 'already', v_already);
end;
$$;
revoke all on function public.cancel_rtw(uuid[], text) from public, anon;
grant execute on function public.cancel_rtw(uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Reinstate: back to outstanding. Returns 'reinstated' or 'not_cancelled'.
-- ---------------------------------------------------------------------------------------------
create or replace function public.reinstate_rtw(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.absence_events%rowtype;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into v_row from public.absence_events where id = p_id for update;
  if not found then raise exception 'That Return to Work could not be found.'; end if;
  if not public.can_cancel_rtw(v_row.person_id) then
    raise exception 'Only a Manager or above can reinstate a Return to Work.' using errcode = '42501';
  end if;
  if v_row.rtw_cancelled_at is null then return 'not_cancelled'; end if;
  select role into v_role from public.profiles where id = auth.uid();

  perform set_config('bcc.rtw_cancel', 'on', true);
  update public.absence_events
     set rtw_cancelled_at = null, rtw_cancelled_by = null, rtw_cancelled_by_name = null, rtw_cancel_reason = null
   where id = p_id;
  perform set_config('bcc.rtw_cancel', '', true);

  -- Questions closed by the cancel go back to drafted: nothing reaches the employee until sent again.
  update public.rtw_questionnaires set status = 'drafted' where absence_event_id = p_id and status = 'cancelled';

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (v_row.company_id, auth.uid(), coalesce(v_role, 'unknown'), 'absence.rtw_reinstated', 'person', v_row.person_id,
          'Reinstated the Return to Work for the absence of ' || to_char(v_row.start_date, 'FMDD FMMonth YYYY'),
          jsonb_build_object('absence_event_id', p_id, 'was_cancelled_by', v_row.rtw_cancelled_by_name,
                             'was_cancel_reason', v_row.rtw_cancel_reason));
  return 'reinstated';
end;
$$;
revoke all on function public.reinstate_rtw(uuid) from public, anon;
grant execute on function public.reinstate_rtw(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. The employee's page: a cancelled set is shown as cancelled, and cannot be answered.
--    Both functions as in 0331/0344, with only the cancelled status added.
-- ---------------------------------------------------------------------------------------------
create or replace function public.my_rtw_questions(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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
    and q.status in ('sent', 'answered', 'recorded', 'cancelled');
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
$function$;

create or replace function public.submit_my_rtw_answers(p_id uuid, p_answers jsonb, p_details jsonb default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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

  if v_row.status = 'cancelled' then return 'cancelled'; end if;
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
$function$;

-- ---------------------------------------------------------------------------------------------
-- 7. Part A: the stage history switch is retired. The new counting applies to every company
--    (Phil, 2026-10-13: "No per-company switch"); nothing reads this column any more.
-- ---------------------------------------------------------------------------------------------
update public.companies set absence_stage_history = true where absence_stage_history is distinct from true;
alter table public.companies alter column absence_stage_history set default true;
comment on column public.companies.absence_stage_history is
  'Retired 2026-10-13 (0459): absence stages are worked out at the date of each absence for every company. Nothing reads this.';

select public.install_company_link_triggers();
