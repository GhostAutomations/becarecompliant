-- 0331 Return to Work questions answered by the employee (Phil, 2026-09-25).
--
-- Phil: "i press draft it for me in a return to work, and a Questions to ask section is created,
-- what i want to happen is when that is drafted it stays for that specific return to work, so it
-- stops using ai credits, then it sends a text with a link to those questions in the employee
-- portal, then they must complete those questions. it then comes back to the return to work and
-- the return to work tile is updated."
--
-- Agreed by popup the same day:
--  * the questions are checked by whoever drafted them before anything is sent;
--  * the text carries a link into the employee's portal, and they must be signed in to open it;
--  * the answers come back to a Supervisor or above, who can ring the employee and change them
--    before recording the interview as Evidence.
--
-- ONE ROW PER ABSENCE. The draft is saved here the moment it is written, so pressing Draft it for
-- me again reads it back instead of spending another AI credit.
--
-- WHO CAN SEE IT. The people who run the Return to Work: Company Admin, the branch's Manager or
-- Supervisor, and the person's own supervisor. NOT on call and NOT the employee, because the row
-- also holds the manager's summary of the absence record. The employee reaches their own questions
-- through my_rtw_questions and submit_my_rtw_answers below, which hand back the questions and
-- nothing else, and which check the row belongs to the SIGNED IN person (auth.uid()), not merely
-- to someone in the same company.

create or replace function public.can_run_rtw(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person_id
      and ( public.is_platform_admin()
         or public.is_company_admin(pe.company_id)
         or (pe.branch_id is not null and public.is_branch_lead(pe.branch_id))
         or public.is_person_supervisor(pe.id) )
  );
$$;
revoke all on function public.can_run_rtw(uuid) from public, anon;
grant execute on function public.can_run_rtw(uuid) to authenticated;

create table if not exists public.rtw_questionnaires (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  absence_event_id uuid not null unique references public.absence_events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  summary text,
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  answers jsonb check (answers is null or jsonb_typeof(answers) = 'array'),
  status text not null default 'drafted'
    check (status in ('drafted', 'sent', 'answered', 'recorded')),
  drafted_by uuid references public.profiles(id) on delete set null,
  drafted_by_name text,
  drafted_at timestamptz not null default now(),
  questions_changed_at timestamptz,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text,
  sent_to_last4 text,
  send_count integer not null default 0,
  expires_at timestamptz,
  answered_at timestamptz,
  answers_changed_at timestamptz,
  answers_changed_by uuid references public.profiles(id) on delete set null,
  answers_changed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rtw_questionnaires_company_idx on public.rtw_questionnaires (company_id, status);
create index if not exists rtw_questionnaires_person_idx on public.rtw_questionnaires (person_id);

drop trigger if exists rtw_questionnaires_updated_at on public.rtw_questionnaires;
create trigger rtw_questionnaires_updated_at
  before update on public.rtw_questionnaires
  for each row execute function public.set_updated_at();

alter table public.rtw_questionnaires enable row level security;
revoke all on public.rtw_questionnaires from anon;
revoke truncate, references, trigger, delete on public.rtw_questionnaires from authenticated;

drop policy if exists rtw_questionnaires_select on public.rtw_questionnaires;
create policy rtw_questionnaires_select on public.rtw_questionnaires
  for select to authenticated
  using (public.can_run_rtw(person_id));

drop policy if exists rtw_questionnaires_insert on public.rtw_questionnaires;
create policy rtw_questionnaires_insert on public.rtw_questionnaires
  for insert to authenticated
  with check (
    public.can_run_rtw(person_id)
    and exists (
      select 1 from public.absence_events ev
      where ev.id = absence_event_id
        and ev.person_id = rtw_questionnaires.person_id
        and ev.company_id = rtw_questionnaires.company_id
    )
  );

drop policy if exists rtw_questionnaires_update on public.rtw_questionnaires;
create policy rtw_questionnaires_update on public.rtw_questionnaires
  for update to authenticated
  using (public.can_run_rtw(person_id))
  with check (public.can_run_rtw(person_id));

-- The dashboard and the Absence page change the moment an employee answers.
alter table public.rtw_questionnaires replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rtw_questionnaires'
  ) then
    alter publication supabase_realtime add table public.rtw_questionnaires;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The employee's side. Both functions look the row up THROUGH people.profile_id = auth.uid(), so
-- the only questions anyone can read or answer are their own, whatever id they type.
-- ---------------------------------------------------------------------------------------------

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
    'expired', (v_row.status = 'sent' and v_row.expires_at is not null and v_row.expires_at < now())
  );
end;
$$;
revoke all on function public.my_rtw_questions(uuid) from public, anon;
grant execute on function public.my_rtw_questions(uuid) to authenticated;

create or replace function public.my_open_rtw_questions()
returns table (id uuid, sent_at timestamptz, expires_at timestamptz, question_count integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select q.id, q.sent_at, q.expires_at, jsonb_array_length(q.questions)
  from public.rtw_questionnaires q
  join public.people pe on pe.id = q.person_id
  where auth.uid() is not null
    and pe.profile_id = auth.uid()
    and q.status = 'sent'
    and (q.expires_at is null or q.expires_at >= now())
  order by q.sent_at desc;
$$;
revoke all on function public.my_open_rtw_questions() from public, anon;
grant execute on function public.my_open_rtw_questions() to authenticated;

create or replace function public.submit_my_rtw_answers(p_id uuid, p_answers jsonb)
returns text
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.rtw_questionnaires;
  v_q jsonb;
  v_a text;
  v_i integer;
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  select q.* into v_row
  from public.rtw_questionnaires q
  join public.people pe on pe.id = q.person_id
  where q.id = p_id and pe.profile_id = auth.uid()
  for update of q;
  if v_row.id is null then raise exception 'These questions could not be found.'; end if;

  -- Safe to press twice: a second submit is told it already went, and changes nothing.
  if v_row.status <> 'sent' then return 'already'; end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then
    raise exception 'This link has expired. Please ask your manager to send it again.';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
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
  end loop;

  update public.rtw_questionnaires
  set answers = (select jsonb_agg(btrim(x)) from jsonb_array_elements_text(p_answers) x),
      status = 'answered',
      answered_at = now()
  where id = v_row.id;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (v_row.company_id, auth.uid(), 'staff', 'absence.rtw_questions_answered', 'person', v_row.person_id,
          'Answered their Return to Work questions', jsonb_build_object('rtw_questionnaire_id', v_row.id, 'absence_event_id', v_row.absence_event_id));

  return 'answered';
end;
$$;
revoke all on function public.submit_my_rtw_answers(uuid, jsonb) from public, anon;
grant execute on function public.submit_my_rtw_answers(uuid, jsonb) to authenticated;
