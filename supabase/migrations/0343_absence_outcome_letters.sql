-- 0343_absence_outcome_letters
-- Phil, 2026-09-29 (Absence round 2, item 3): once a meeting is saved, AI drafts the outcome
-- letter for approval. Agreed by popup: offered straight after Save meeting and from an "Outcome
-- letter" button on the meeting until one is sent; the AI writes the middle from the meeting record
-- and the company's fixed wording (Settings, Letters, absence_meeting_outcome) wraps it; the email
-- carries the letter AND a PDF copy, and the PDF is kept on the meeting; an employee with no email
-- address gets a PDF only, marked not emailed, to print and hand over.
--
-- ONE LETTER PER RECORDED MEETING (meeting_id unique). The AI draft is saved the moment it is
-- written, so reopening costs no second credit. Once sent (or kept as not emailed) the letter is
-- final: the update policy only lets a draft, or a send that failed, change. What was sent is kept
-- whole in letter_text, and the PDF lives in the private evidence bucket next to the meeting's
-- Evidence ({company}/{evidence}/outcome-letter.pdf), so it follows that Evidence's retention.
--
-- WHO: the people who prepare and record meetings (can_prepare_absence_meeting, 0342). Not the
-- employee: they receive the letter itself.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create table if not exists public.absence_outcome_letters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  meeting_id uuid not null unique references public.absence_meetings(id) on delete cascade,
  evidence_id uuid references public.evidence(id) on delete set null,
  status text not null default 'drafted'
    check (status in ('drafted', 'sent', 'not_emailed', 'send_failed')),
  draft_body text,
  drafted_by uuid references public.profiles(id) on delete set null,
  drafted_by_name text,
  drafted_at timestamptz,
  approved_body text,
  subject text,
  letter_text text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  emailed_to text,
  emailed_at timestamptz,
  email_error text,
  pdf_path text,
  pdf_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists absence_outcome_letters_person_idx on public.absence_outcome_letters (person_id);
create index if not exists absence_outcome_letters_company_idx on public.absence_outcome_letters (company_id, status);

drop trigger if exists absence_outcome_letters_updated_at on public.absence_outcome_letters;
create trigger absence_outcome_letters_updated_at
  before update on public.absence_outcome_letters
  for each row execute function public.set_updated_at();

alter table public.absence_outcome_letters enable row level security;
revoke all on public.absence_outcome_letters from anon;
revoke truncate, references, trigger, delete on public.absence_outcome_letters from authenticated;

drop policy if exists absence_outcome_letters_select on public.absence_outcome_letters;
create policy absence_outcome_letters_select on public.absence_outcome_letters
  for select to authenticated
  using (public.can_prepare_absence_meeting(person_id));

drop policy if exists absence_outcome_letters_insert on public.absence_outcome_letters;
create policy absence_outcome_letters_insert on public.absence_outcome_letters
  for insert to authenticated
  with check (
    public.can_prepare_absence_meeting(person_id)
    and status = 'drafted'
    and exists (
      select 1 from public.absence_meetings m
      where m.id = absence_outcome_letters.meeting_id
        and m.person_id = absence_outcome_letters.person_id
        and m.company_id = absence_outcome_letters.company_id
        and m.evidence_id is not null
        and m.evidence_id is not distinct from absence_outcome_letters.evidence_id )
  );

-- A letter that has gone (sent, or kept as not emailed) never changes again.
drop policy if exists absence_outcome_letters_update on public.absence_outcome_letters;
create policy absence_outcome_letters_update on public.absence_outcome_letters
  for update to authenticated
  using (public.can_prepare_absence_meeting(person_id) and status in ('drafted', 'send_failed'))
  with check (public.can_prepare_absence_meeting(person_id));
