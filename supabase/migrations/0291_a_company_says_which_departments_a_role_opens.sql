-- 0291_a_company_says_which_departments_a_role_opens
--
-- Phil, 2026-09-17: "Maybe in settings we need user access and select what each role sees. What a
-- role is added, that role gets a tiles with call departments / views, if they are ticked, that
-- role gets access to it."
--
-- WHAT IS STORED, AND WHY SO LITTLE. Only a deliberate switching OFF. Absence means on, so a
-- department added to the product next month is available to every role inside its ceiling from
-- the day it ships, instead of silently off for every company that already existed until somebody
-- notices. The ceiling itself — the most a role could EVER have — stays in code
-- (lib/auth/module-catalogue.ts), where it is pure and unit tested, and a row here can only
-- narrow beneath it.
--
-- THIS TABLE IS NOT A SECURITY BOUNDARY, and is not written as if it were. RLS still decides who
-- may read what; these rows decide which departments a company chooses to put in front of a role.
-- That is the whole reason this feature does not require the policies to be rewritten: a
-- mis-click hides a page, it cannot expose a record.
--
-- Nothing is inserted. Every company starts with every department on for every role its ceiling
-- allows, which is exactly what they have today, so this migration changes no behaviour.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.company_role_modules (
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null,
  module_key  text not null,
  disabled_at timestamptz not null default now(),
  disabled_by uuid references public.profiles(id) on delete set null,
  primary key (company_id, role, module_key)
);

comment on table public.company_role_modules is
  'One row per department a company has switched OFF for a role. Absence means on. The ceiling of what a role could ever have lives in lib/auth/module-catalogue.ts; a row here can only narrow beneath it, never widen past it.';

create index if not exists company_role_modules_company_idx
  on public.company_role_modules (company_id);

alter table public.company_role_modules enable row level security;

-- Everybody in the company READS it: the nav has to know what to hide for the person looking at
-- it, and a policy that only let Admins read would mean the nav could not be built for anybody
-- else. There is nothing sensitive in a row: it names a department and a role, not a record.
drop policy if exists company_role_modules_select on public.company_role_modules;
create policy company_role_modules_select on public.company_role_modules
  for select using (is_company_member(company_id));

-- Company Admins WRITE it (Phil, asked and answered 2026-09-17). The Registered roles see the
-- screen read only: it decides who reaches safeguarding records, and that is an owner's decision.
drop policy if exists company_role_modules_write on public.company_role_modules;
create policy company_role_modules_write on public.company_role_modules
  for all
  using (is_platform_admin() or is_company_admin(company_id))
  with check (is_platform_admin() or is_company_admin(company_id));
