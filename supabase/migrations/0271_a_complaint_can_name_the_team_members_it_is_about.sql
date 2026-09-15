-- Be Care Compliant — a complaint can name the team members it is about.
--
-- Phil, 2026-09-15: when a complaint is raised, if it is about a team member, be able to
-- select that staff member; their record then carries a tile showing how many complaints
-- they have had, which opens THEIR complaints and not the company's.
--
-- TWO DECISIONS WORTH KNOWING, both Phil's:
--
-- 1. A complaint may name SEVERAL people. A badly handled visit can involve two carers, and
--    forcing a choice means the second one is never recorded. Hence a join table rather than
--    a column on complaints.
--
-- 2. Whether the complaint was UPHELD is recorded separately from the count. A complaint
--    investigated and not upheld still appears on the person's record, because five
--    dismissed complaints is a pattern somebody should see, but it is never presented as a
--    bare number: the tile reads "3 complaints, 1 upheld". A care worker cleared three times
--    must not look worse than one nobody ever complained about, and a count that hides its
--    outcomes is exactly the thing that gets challenged at a tribunal.
--
-- `upheld` is null until somebody decides, which is the honest state for an open complaint
-- and for the ones logged before this existed. Null is NOT "not upheld".

create table if not exists complaint_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  complaint_id uuid not null references complaints(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (complaint_id, person_id)
);

comment on table complaint_people is
  'The team members a complaint is about. Many to many: one complaint may name several people, and a person may appear on several complaints.';

create index if not exists complaint_people_person_idx on complaint_people (person_id);
create index if not exists complaint_people_complaint_idx on complaint_people (complaint_id);

alter table complaints
  add column if not exists upheld boolean;

comment on column complaints.upheld is
  'Was the complaint upheld? Null until decided, and null is not the same as false: an open complaint has no finding yet. Used to split the count on a person''s record so a cleared complaint is never shown as a bare mark against them.';

alter table complaint_people enable row level security;

-- Exactly the reach complaints themselves have, and no wider. Complaints about staff are HR
-- sensitive: Phil's rule is that the tile is seen only by people who can already open the
-- Complaints section, so the two audiences cannot drift apart.
create policy complaint_people_select on complaint_people for select
  using (
    is_platform_admin()
    or is_company_admin(company_id)
    or is_company_on_call(company_id)
    or exists (
      select 1 from complaints c
      where c.id = complaint_people.complaint_id and is_branch_manager(c.branch_id)
    )
  );

create policy complaint_people_insert on complaint_people for insert
  with check (
    is_platform_admin()
    or is_company_admin(company_id)
    or is_company_on_call(company_id)
    or exists (
      select 1 from complaints c
      where c.id = complaint_people.complaint_id and is_branch_manager(c.branch_id)
    )
  );

create policy complaint_people_delete on complaint_people for delete
  using (
    is_platform_admin()
    or is_company_admin(company_id)
    or is_company_on_call(company_id)
    or exists (
      select 1 from complaints c
      where c.id = complaint_people.complaint_id and is_branch_manager(c.branch_id)
    )
  );
