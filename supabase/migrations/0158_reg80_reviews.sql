-- 0158_reg80_reviews
-- Regulation 80 (RISCA Wales) six monthly Quality of Care Review reports.
-- One row per review, per branch: draft while editing, submitted once signed.
-- The whole report (narrative + per section actions + data derived boxes + any
-- uploaded images) lives in `data` jsonb; `prefill` is the snapshot of the auto
-- pulled site data at generation time (for audit + reference). The next review auto
-- fills "previous actions and their status" from the last submitted review for that
-- branch. Per branch, so Cardiff and Newport are distinct.
-- Sister to 0157_reg73_visits; same RLS shape.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.reg80_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  reference text,
  ri_name text,
  period_start date,
  period_end date,
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

create index if not exists reg80_reviews_company_idx on public.reg80_reviews (company_id);
create index if not exists reg80_reviews_branch_idx on public.reg80_reviews (branch_id, submitted_at desc nulls last);

alter table public.reg80_reviews enable row level security;

-- Read: any company member (the app narrows the view to RI / managers / admins).
create policy reg80_reviews_select on public.reg80_reviews
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

-- Write: platform admin, company admin, or a Responsible Individual / Registered
-- Manager in this company. The profiles subquery only ever reads the caller's own
-- row (id = auth.uid()), which profiles RLS permits.
create policy reg80_reviews_write on public.reg80_reviews
  for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = reg80_reviews.company_id
        and p.role in ('registered_individual', 'registered_manager')
    )
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = reg80_reviews.company_id
        and p.role in ('registered_individual', 'registered_manager')
    )
  );
