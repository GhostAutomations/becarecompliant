-- 0084_company_job_titles
-- Company-managed list of staff job titles, used to populate the Job Title
-- dropdown on the Add a Person form. Seeded with common UK care roles on company
-- creation (and backfilled for existing companies below); admins edit the list in
-- Settings > People. Applied to the becarecompliant Supabase project ONLY
-- (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.company_job_titles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, title)
);

create index if not exists company_job_titles_company_idx
  on public.company_job_titles (company_id, sort_order);

alter table public.company_job_titles enable row level security;

-- Any company member may read the list (needed to render the Add Person form);
-- only company admins (or the platform admin) may change it.
create policy cjt_select on public.company_job_titles
  for select to authenticated
  using (public.is_company_member(company_id));
create policy cjt_write on public.company_job_titles
  for all to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_admin(company_id) or public.is_platform_admin());

-- Seed a company's default job-title list (idempotent, skips titles it already
-- has). SECURITY DEFINER so the founder onboarding flow can seed; guarded to the
-- platform admin or the company's own admin.
create or replace function public.seed_company_job_titles(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_job_titles: not authorised for company %', cid;
  end if;

  insert into public.company_job_titles (company_id, title, sort_order)
  select cid, t.title, t.ord
  from (values
    ('Care Assistant', 1),
    ('Senior Care Assistant', 2),
    ('Care Coordinator', 3),
    ('Field Care Supervisor', 4),
    ('Team Leader', 5),
    ('Deputy Manager', 6),
    ('Registered Manager', 7),
    ('Registered Nurse', 8),
    ('Administrator', 9)
  ) as t(title, ord)
  where not exists (
    select 1 from public.company_job_titles c
    where c.company_id = cid and c.title = t.title
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Backfill existing companies with the default list (direct insert, bypasses the
-- admin guard which is only meaningful for the RPC path).
insert into public.company_job_titles (company_id, title, sort_order)
select c.id, t.title, t.ord
from public.companies c
cross join (values
  ('Care Assistant', 1),
  ('Senior Care Assistant', 2),
  ('Care Coordinator', 3),
  ('Field Care Supervisor', 4),
  ('Team Leader', 5),
  ('Deputy Manager', 6),
  ('Registered Manager', 7),
  ('Registered Nurse', 8),
  ('Administrator', 9)
) as t(title, ord)
on conflict (company_id, title) do nothing;
