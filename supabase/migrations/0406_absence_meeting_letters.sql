-- 0406_absence_meeting_letters
-- Phil, 2026-10-06: Charlotte booked Sarah Harris's Stage 2 absence meeting and the invitation
-- went by email, but nothing of it was kept: a booked meeting has no Evidence until it is
-- recorded, so there was no copy of the letter to download. Agreed by popup: keep a PDF copy of
-- the EMPLOYEE's letter (not the manager's) each time one is sent, the invitation and a
-- rearranged invitation; list it in the person's Evidence history and link it from the meeting
-- line in the Absences tile. A meeting booked before this went live can have its copy rebuilt
-- from the same wording and booking details, marked as made afterwards (rebuilt).
--
-- A copy is FINAL: written once by the server (service role) when the letter goes, never
-- updated or deleted by a user. The meeting link is SET NULL on delete, so cancelling a booking
-- (which deletes the meeting) still leaves the record that the invitation was sent.
-- The PDF lives in the private evidence bucket: {company}/meeting-letters/{id}.pdf.
--
-- WHO reads: the people who prepare and record meetings (can_prepare_absence_meeting, 0342),
-- the same as outcome letters. Not the employee: they received the letter itself.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create table if not exists public.absence_meeting_letters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  meeting_id uuid references public.absence_meetings(id) on delete set null,
  kind text not null check (kind in ('invite', 'rearranged')),
  stage integer,
  meeting_date date,
  meeting_time time,
  subject text not null,
  letter_text text not null,
  emailed_to text,
  send_outcome text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text,
  sent_at timestamptz not null default now(),
  rebuilt boolean not null default false,
  pdf_path text not null,
  pdf_sha256 text not null,
  created_at timestamptz not null default now()
);

create index if not exists absence_meeting_letters_person_idx on public.absence_meeting_letters (person_id, sent_at desc);
create index if not exists absence_meeting_letters_meeting_idx on public.absence_meeting_letters (meeting_id);
create index if not exists absence_meeting_letters_company_idx on public.absence_meeting_letters (company_id);
create index if not exists absence_meeting_letters_branch_idx on public.absence_meeting_letters (branch_id);
create index if not exists absence_meeting_letters_sent_by_idx on public.absence_meeting_letters (sent_by);

alter table public.absence_meeting_letters enable row level security;
revoke all on public.absence_meeting_letters from anon;
revoke insert, update, delete, truncate, references, trigger on public.absence_meeting_letters from authenticated;

drop policy if exists absence_meeting_letters_select on public.absence_meeting_letters;
create policy absence_meeting_letters_select on public.absence_meeting_letters
  for select to authenticated
  using (public.can_prepare_absence_meeting(person_id));
