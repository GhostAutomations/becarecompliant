-- 0111_framework_readiness_snapshots
-- Daily readiness score per requirement, so the Inspection Readiness view can show
-- a trend. Upserted once per London day by the page (RLS: company members read and
-- write their own company's snapshots). Applied to ref bgrtcvyjuwopunpnudeu only.

create table if not exists public.framework_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  regulator text not null,
  requirement_code text not null,
  score int,
  captured_on date not null default (now() at time zone 'Europe/London')::date,
  created_at timestamptz not null default now(),
  unique (company_id, regulator, requirement_code, captured_on)
);

create index framework_readiness_snapshots_company_idx
  on public.framework_readiness_snapshots (company_id, captured_on);

alter table public.framework_readiness_snapshots enable row level security;

create policy framework_readiness_snapshots_select on public.framework_readiness_snapshots
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

create policy framework_readiness_snapshots_write on public.framework_readiness_snapshots
  for all to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id))
  with check (public.is_platform_admin() or public.is_company_member(company_id));
