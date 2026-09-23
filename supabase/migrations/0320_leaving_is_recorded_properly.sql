-- 0320: leaving is recorded properly (DEF-058).
--
-- Phil, 2026-09-23, after making Mohammad a leaver: the app stamped today as the leaving date with
-- no way to say otherwise, his login stayed open, and nothing was asked about why he went. Agreed
-- by popup: a leaving date that may be past, today or future (they stay active until 23:59 of it),
-- their login closed when it takes effect, and REQUIRED answers: reason, would you re-employ,
-- moving to a competitor, and six scores out of ten.
--
-- One row per leaving, not per person: somebody can leave, come back and leave again, and the
-- answers about the first time are still what a reference request years later needs.
--   applied_at   set when they actually became a leaver (at once, or by the nightly run after a
--                today or future date)
--   cancelled_at set when a planned leaving was called off before it happened
--   rejoined_at  set when a leaver was put back to Active
-- A row with none of the three is a planned leaving still to come.
--
-- Scores about a named member of staff are personal data about their conduct. Read and written by
-- the same people who may change a Person's status (Company Admin, Branch lead), never by a Team
-- Member and never by the person themselves.

create table if not exists public.person_leavings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  leaving_date date not null,
  reason text not null check (reason in ('resigned','dismissed','end_of_contract','failed_probation','retired','other')),
  reason_other text,
  re_employ boolean not null,
  competitor text not null check (competitor in ('yes','no','unknown')),
  competitor_name text,
  score_attitude smallint not null check (score_attitude between 1 and 10),
  score_attendance smallint not null check (score_attendance between 1 and 10),
  score_lateness smallint not null check (score_lateness between 1 and 10),
  score_professionalism smallint not null check (score_professionalism between 1 and 10),
  score_privacy smallint not null check (score_privacy between 1 and 10),
  score_teamwork smallint not null check (score_teamwork between 1 and 10),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  applied_at timestamptz,
  cancelled_at timestamptz,
  rejoined_at timestamptz,
  check (reason <> 'other' or coalesce(btrim(reason_other), '') <> ''),
  check (competitor <> 'yes' or coalesce(btrim(competitor_name), '') <> '')
);

create index if not exists person_leavings_person_idx on public.person_leavings (person_id, recorded_at desc);
-- The nightly run looks for planned leavings whose day has passed.
create index if not exists person_leavings_pending_idx on public.person_leavings (leaving_date)
  where applied_at is null and cancelled_at is null;
-- At most one planned leaving per person at a time.
create unique index if not exists person_leavings_one_pending on public.person_leavings (person_id)
  where applied_at is null and cancelled_at is null;

alter table public.person_leavings enable row level security;

create policy person_leavings_select on public.person_leavings for select using (
  exists (
    select 1 from public.people pe
    where pe.id = person_leavings.person_id
      and pe.company_id = person_leavings.company_id
      and (public.is_platform_admin() or public.is_company_admin(pe.company_id) or public.is_branch_lead(pe.branch_id))
  )
);

create policy person_leavings_insert on public.person_leavings for insert with check (
  exists (
    select 1 from public.people pe
    where pe.id = person_leavings.person_id
      and pe.company_id = person_leavings.company_id
      and (public.is_company_admin(pe.company_id) or public.is_branch_lead(pe.branch_id))
  )
);

create policy person_leavings_update on public.person_leavings for update using (
  exists (
    select 1 from public.people pe
    where pe.id = person_leavings.person_id
      and pe.company_id = person_leavings.company_id
      and (public.is_company_admin(pe.company_id) or public.is_branch_lead(pe.branch_id))
  )
) with check (
  exists (
    select 1 from public.people pe
    where pe.id = person_leavings.person_id
      and pe.company_id = person_leavings.company_id
      and (public.is_company_admin(pe.company_id) or public.is_branch_lead(pe.branch_id))
  )
);

revoke all on public.person_leavings from anon;
grant select, insert, update on public.person_leavings to authenticated;
