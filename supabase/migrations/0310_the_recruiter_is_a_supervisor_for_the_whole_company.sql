-- 0310_the_recruiter_is_a_supervisor_for_the_whole_company
--
-- Phil, 2026-09-21: "i need to create a recruiter role", and, asked what it may do and what it may
-- not see: "same as a supervisor", reaching the WHOLE COMPANY rather than assigned branches.
-- Recruiting is central: a recruiter takes a new starter on for whichever branch needs them.
--
-- HOW, AND WHY IT IS ONE EDIT RATHER THAN THIRTY. A Recruiter is defined as a Supervisor without
-- the branch: `is_branch_supervisor(bid)` now answers true for a Supervisor assigned to that
-- branch OR a Recruiter anywhere in that branch's company. Every policy that already ORs
-- is_branch_supervisor -- complaints, incidents, planner, the training register, evidence, and
-- (through is_branch_lead, 0309) the People and Service User registers and everything hanging off
-- them -- therefore covers a Recruiter without being touched.
--
-- The alternative was adding one more role name to some thirty policies and role lists, which is
-- the mistake this project has already paid for twice: a role let past two gates of three, and a
-- blank page at the end of it.
--
-- NOT GIVEN (say so and they are one line each): the on call rota, invoicing, and being choosable
-- as the supervisor who conducts a carer's supervision -- a recruiter is not their supervisor.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array[
  'platform_admin','company_admin','registered_individual','registered_manager',
  'manager','supervisor','recruiter','team_member','on_call','staff'
]));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check check (role = any (array[
  'company_admin','registered_individual','registered_manager',
  'manager','supervisor','recruiter','team_member','on_call','staff'
]));

/*
 * A RECRUITER IS A SUPERVISOR WITHOUT THE BRANCH.
 *
 * The name stays is_branch_supervisor because thirty policies say it and they all mean the same
 * question: "does this person hold supervisor level rights over this branch?" A Supervisor holds
 * them where she is assigned; a Recruiter holds them across her own company.
 */
create or replace function public.is_branch_supervisor(bid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    join public.user_branches ub on ub.user_id = p.id
    where p.id = auth.uid()
      and p.role = 'supervisor'
      and p.status = 'active'
      and ub.branch_id = bid
  )
  or exists (
    select 1
    from public.profiles p
    join public.branches b on b.id = bid
    where p.id = auth.uid()
      and p.role = 'recruiter'
      and p.status = 'active'
      and p.company_id = b.company_id
  );
$$;
