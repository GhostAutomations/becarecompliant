-- 0370 — DEF-103 (2 Oct 2026): the database half of 0303 had never been applied.
--
-- 0303 (19 Sep) was written but never reached the live database: incidents.event_type and the
-- incident_people table did not exist, so every incident page returned "Page not found" (the page
-- reads incident_people) and filing an incident report failed (it writes event_type), on every
-- company. Found by Claude testing the demo's Try the AI incident link. Applied 2 Oct with Phil's
-- OK: the table, the column and the three policies only. The incident report FORM changes in 0303
-- (type of event, staff lookup, For the office) were NOT applied: Phil chose to leave every
-- company's incident form as it is for now. Idempotent, so a rebuild that also runs 0303 is safe.

alter table public.incidents add column if not exists event_type text;

create table if not exists public.incident_people (
  incident_id uuid not null references public.incidents(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (incident_id, person_id)
);
create index if not exists incident_people_person_idx on public.incident_people(person_id);
alter table public.incident_people enable row level security;

drop policy if exists incident_people_select on public.incident_people;
create policy incident_people_select on public.incident_people for select using (
  exists (select 1 from public.incidents i where i.id = incident_id)
);
drop policy if exists incident_people_insert on public.incident_people;
create policy incident_people_insert on public.incident_people for insert with check (
  exists (select 1 from public.incidents i
          where i.id = incident_id and i.company_id = incident_people.company_id
            and (public.is_platform_admin() or public.is_company_admin(i.company_id)
                 or public.is_branch_manager(i.branch_id) or public.is_branch_supervisor(i.branch_id)))
);
drop policy if exists incident_people_delete on public.incident_people;
create policy incident_people_delete on public.incident_people for delete using (
  exists (select 1 from public.incidents i
          where i.id = incident_id
            and (public.is_platform_admin() or public.is_company_admin(i.company_id)
                 or public.is_branch_manager(i.branch_id) or public.is_branch_supervisor(i.branch_id)))
);
