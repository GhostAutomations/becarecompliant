-- 0306_the_regulators_own_notices_are_recorded
--
-- Phil, 2026-09-19, after reading CIW's inspection framework (March 2025) together: CIW rates each
-- theme by an inspector's judgement, with no overall rating and no formula, EXCEPT one fixed rule:
-- if a Priority Action Notice is issued for a theme, that theme "must be rated as Requires
-- significant improvement". An Area for Improvement is recorded but can leave the theme Good.
--
-- Nothing in BCC recorded either, so the one thing that fixes a rating outright was the one thing
-- the readiness view could not see. This is where they are kept: against the theme they were
-- issued under, with the date they are due to be put right and the date they were.
--
-- Readable and writable by the people who can open Readiness: company wide roles and managers.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.inspection_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  regulator text not null check (regulator in ('ciw','cqc')),
  requirement_code text not null,
  kind text not null check (kind in ('priority_action','area_for_improvement')),
  regulation text,
  description text not null,
  issued_on date not null,
  due_by date,
  resolved_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inspection_notices_company_idx on public.inspection_notices(company_id, regulator);

alter table public.inspection_notices enable row level security;

drop policy if exists inspection_notices_select on public.inspection_notices;
create policy inspection_notices_select on public.inspection_notices for select using (
  public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id)
);
drop policy if exists inspection_notices_insert on public.inspection_notices;
create policy inspection_notices_insert on public.inspection_notices for insert with check (
  public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id)
);
drop policy if exists inspection_notices_update on public.inspection_notices;
create policy inspection_notices_update on public.inspection_notices for update using (
  public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id)
) with check (
  public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id)
);
drop policy if exists inspection_notices_delete on public.inspection_notices;
create policy inspection_notices_delete on public.inspection_notices for delete using (
  public.is_platform_admin() or public.is_company_wide(company_id)
);
