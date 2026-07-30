-- 0157_reg73_visits
-- Regulation 73 (RISCA Wales) Responsible Individual branch visit reports.
-- One row per RI visit to a branch: draft while editing, submitted once signed.
-- The whole form (yes/no + narrative fields) lives in `data` jsonb; `prefill` is the
-- snapshot of the auto-pulled site data at generation time (for audit + reference).
-- The next visit auto-fills "previous actions and their status" from the last
-- submitted visit for that branch. Per branch, so Cardiff and Newport are distinct.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.reg73_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  reference text,
  ri_name text,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  data jsonb not null default '{}'::jsonb,
  prefill jsonb not null default '{}'::jsonb,
  signature_path text,
  submitted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reg73_visits_company_idx on public.reg73_visits (company_id);
create index if not exists reg73_visits_branch_idx on public.reg73_visits (branch_id, submitted_at desc nulls last);

alter table public.reg73_visits enable row level security;

-- Read: any company member (the app narrows the view to RI / managers / admins).
create policy reg73_visits_select on public.reg73_visits
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

-- Write: platform admin, company admin, or a Responsible Individual / Registered
-- Manager in this company. The profiles subquery only ever reads the caller's own
-- row (id = auth.uid()), which profiles RLS permits.
create policy reg73_visits_write on public.reg73_visits
  for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = reg73_visits.company_id
        and p.role in ('registered_individual', 'registered_manager')
    )
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = reg73_visits.company_id
        and p.role in ('registered_individual', 'registered_manager')
    )
  );
