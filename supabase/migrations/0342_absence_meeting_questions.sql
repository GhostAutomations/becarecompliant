-- 0342_absence_meeting_questions
-- Phil, 2026-09-29 (Absence round 2, item 2): "Record a meeting: add AI that generates questions
-- based on the person's absences and Return to Works." Agreed by popup: a new "Questions to ask"
-- section like Return to Work, whose answers are saved with the meeting Evidence, and the drafted
-- questions saved so opening the meeting again costs no second AI credit.
--
-- 1. absence_meeting_questions: one drafted set per meeting.
--    * A BOOKED meeting keys on its absence_meetings row (meeting_id, unique). Cancelling the
--      booking deletes the row and its questions with it (on delete cascade): a rebooked meeting is
--      a new meeting.
--    * A meeting recorded WITHOUT a booking (DEF-072) has no absence_meetings row until it is
--      recorded, so its draft waits with meeting_id null; one such open draft per person.
--    * Recording the meeting stamps evidence_id (and meeting_id for the unbooked case), which
--      closes the draft: the asked questions and answers live on in the Evidence itself.
--    Nothing here is shown to the employee, like rtw_questionnaires: it is the manager's
--    preparation. What was actually asked is in the meeting Evidence, which the subject access
--    export already includes.
--
-- 2. The Absence Management Meeting form gains "Questions asked and answers" (meeting_questions,
--    long_text, optional) at the top of Summary of Discussion. The drafted questions and the
--    answers typed against them are written into it on save, as Return to Work does with
--    tailored_questions. Edited in place on v1 of every company copy and the founder template
--    (standing rule 2026-09-08: default forms stay at v1 while they are built); an optional field
--    changes nothing for the Evidence already held. Idempotent: only added where missing.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

-- Who prepares a meeting: the people who can record one (absence_meetings insert policies):
-- Company Admin, the branch's Manager or Supervisor lead, the person's own supervisor, and on call.
create or replace function public.can_prepare_absence_meeting(p_person_id uuid)
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
         or public.is_person_supervisor(pe.id)
         or public.is_company_on_call(pe.company_id) )
  );
$$;
revoke all on function public.can_prepare_absence_meeting(uuid) from public, anon;
grant execute on function public.can_prepare_absence_meeting(uuid) to authenticated;

create table if not exists public.absence_meeting_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  meeting_id uuid references public.absence_meetings(id) on delete cascade,
  stage integer check (stage is null or stage between 1 and 4),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  evidence_id uuid references public.evidence(id) on delete set null,
  drafted_by uuid references public.profiles(id) on delete set null,
  drafted_by_name text,
  drafted_at timestamptz not null default now(),
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists absence_meeting_questions_meeting_uidx
  on public.absence_meeting_questions (meeting_id) where meeting_id is not null;
create unique index if not exists absence_meeting_questions_unbooked_uidx
  on public.absence_meeting_questions (person_id) where meeting_id is null and evidence_id is null;
create index if not exists absence_meeting_questions_person_idx
  on public.absence_meeting_questions (person_id);

drop trigger if exists absence_meeting_questions_updated_at on public.absence_meeting_questions;
create trigger absence_meeting_questions_updated_at
  before update on public.absence_meeting_questions
  for each row execute function public.set_updated_at();

alter table public.absence_meeting_questions enable row level security;
revoke all on public.absence_meeting_questions from anon;
revoke truncate, references, trigger, delete on public.absence_meeting_questions from authenticated;

drop policy if exists absence_meeting_questions_select on public.absence_meeting_questions;
create policy absence_meeting_questions_select on public.absence_meeting_questions
  for select to authenticated
  using (public.can_prepare_absence_meeting(person_id));

drop policy if exists absence_meeting_questions_insert on public.absence_meeting_questions;
create policy absence_meeting_questions_insert on public.absence_meeting_questions
  for insert to authenticated
  with check (
    public.can_prepare_absence_meeting(person_id)
    and evidence_id is null
    and exists (
      select 1 from public.people pe
      where pe.id = absence_meeting_questions.person_id
        and pe.company_id = absence_meeting_questions.company_id
    )
    and ( meeting_id is null
       or exists (
            select 1 from public.absence_meetings m
            where m.id = absence_meeting_questions.meeting_id
              and m.person_id = absence_meeting_questions.person_id
              and m.company_id = absence_meeting_questions.company_id
              and m.evidence_id is null ) )
  );

drop policy if exists absence_meeting_questions_update on public.absence_meeting_questions;
create policy absence_meeting_questions_update on public.absence_meeting_questions
  for update to authenticated
  using (public.can_prepare_absence_meeting(person_id))
  with check (
    public.can_prepare_absence_meeting(person_id)
    and ( meeting_id is null
       or exists (
            select 1 from public.absence_meetings m
            where m.id = absence_meeting_questions.meeting_id
              and m.person_id = absence_meeting_questions.person_id
              and m.company_id = absence_meeting_questions.company_id ) )
  );

-- ---------------------------------------------------------------------------------------------
-- 2. The form field.
-- ---------------------------------------------------------------------------------------------
create or replace function pg_temp.add_meeting_questions(schema jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(schema, '{sections}', coalesce((
    select jsonb_agg(
      case when s->>'title' = 'Summary of Discussion' and s ? 'fields'
        then jsonb_set(s, '{fields}',
          jsonb_build_array(jsonb_build_object(
            'key', 'meeting_questions',
            'type', 'long_text',
            'label', 'Questions asked and answers',
            'help', 'Filled in for you when the questions are drafted for this meeting. Otherwise, note the main questions you asked and what they said.',
            'required', false))
          || (s->'fields'))
        else s end
      order by so)
    from jsonb_array_elements(schema->'sections') with ordinality sec(s, so)), '[]'::jsonb))
$$;

update public.form_versions fv
set schema = pg_temp.add_meeting_questions(fv.schema)
from public.forms f
where f.id = fv.form_id
  and f.key = 'absence_management_meeting'
  and fv.schema @? '$.sections[*] ? (@.title == "Summary of Discussion")'
  and not (fv.schema @? '$.sections[*].fields[*] ? (@.key == "meeting_questions")');

update public.form_templates
set schema = pg_temp.add_meeting_questions(schema), updated_at = now()
where key = 'absence_management_meeting'
  and schema @? '$.sections[*] ? (@.title == "Summary of Discussion")'
  and not (schema @? '$.sections[*].fields[*] ? (@.key == "meeting_questions")');
