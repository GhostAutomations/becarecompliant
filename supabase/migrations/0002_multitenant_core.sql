-- 0002_multitenant_core
-- Phase 1: branch assignment, invite-only onboarding, append-only audit log,
-- seat counting, and the RLS helpers/policies for the agreed permission
-- boundaries (Supervisor = assigned caseload; user admin = Company Admin only).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Which branches a user is assigned to. Managers can hold several rows;
-- Supervisors and Team Members hold one. Company Admin + Platform Admin see all
-- branches implicitly (they are not represented as rows here).
create table public.user_branches (
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create index user_branches_branch_id_idx on public.user_branches (branch_id);

-- Invite-only onboarding. One row per invited user (there is no public signup).
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  email text not null,
  full_name text not null default '',
  role text not null
    check (role in ('company_admin', 'manager', 'supervisor', 'team_member')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  last_sent_at timestamptz not null default now(),
  resend_count int not null default 0
);

create index invites_company_id_idx on public.invites (company_id);
-- At most one pending invite per email per company.
create unique index invites_pending_email_uidx
  on public.invites (company_id, lower(email))
  where status = 'pending';

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function public.set_updated_at();

-- Append-only audit log. Written server-side via the service-role client
-- (writeAudit helper); never updated or deleted through the API.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index audit_log_company_created_idx
  on public.audit_log (company_id, created_at desc);
create index audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- RLS helper functions (security definer, search_path pinned)
-- ---------------------------------------------------------------------------

-- Is the current user a Manager in company cid?
create or replace function public.is_company_manager(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.role = 'manager'
      and p.status = 'active'
  );
$$;

-- Is the current user allowed to see branch bid?
-- True if assigned to it, or a Company Admin of its company, or Platform Admin.
create or replace function public.is_branch_member(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.user_branches ub
      where ub.user_id = auth.uid() and ub.branch_id = bid
    )
    or exists (
      select 1 from public.branches b
      where b.id = bid
        and (public.is_company_admin(b.company_id) or public.is_platform_admin())
    );
$$;

-- Active, non-platform user count for a company (a "seat"). Guarded so it never
-- leaks counts across tenants: returns null unless the caller belongs to cid.
create or replace function public.company_active_user_count(cid uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.is_company_member(cid) or public.is_platform_admin() then (
      select count(*)::int from public.profiles p
      where p.company_id = cid
        and p.status = 'active'
        and p.role <> 'platform_admin'
    )
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.user_branches enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;

-- user_branches -------------------------------------------------------------
-- Read: your own assignments, or an Admin of the branch's company, or Platform.
create policy user_branches_select on public.user_branches
  for select using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.branches b
      where b.id = branch_id and public.is_company_admin(b.company_id)
    )
  );

-- Write: user admin is Company Admin only (or Platform Admin).
create policy user_branches_insert on public.user_branches
  for insert with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.branches b
      where b.id = branch_id and public.is_company_admin(b.company_id)
    )
  );

create policy user_branches_delete on public.user_branches
  for delete using (
    public.is_platform_admin()
    or exists (
      select 1 from public.branches b
      where b.id = branch_id and public.is_company_admin(b.company_id)
    )
  );

-- invites -------------------------------------------------------------------
-- Only Company Admins (own company) and the Platform Admin manage invites.
create policy invites_select on public.invites
  for select using (
    public.is_company_admin(company_id) or public.is_platform_admin()
  );

-- Insert: Platform Admin may invite anyone (incl. company_admin, the founder-led
-- first Admin). A Company Admin may invite only non-admin roles into their company.
create policy invites_insert on public.invites
  for insert with check (
    public.is_platform_admin()
    or (
      public.is_company_admin(company_id)
      and role in ('manager', 'supervisor', 'team_member')
    )
  );

create policy invites_update on public.invites
  for update
  using (public.is_company_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_admin(company_id) or public.is_platform_admin());

create policy invites_delete on public.invites
  for delete using (
    public.is_company_admin(company_id) or public.is_platform_admin()
  );

-- audit_log -----------------------------------------------------------------
-- Read: Company Admins (own company) and Platform Admin. No insert/update/delete
-- policies: rows are written only by the service-role client (writeAudit), which
-- bypasses RLS, keeping the log append-only from the application's perspective.
create policy audit_log_select on public.audit_log
  for select using (
    (company_id is not null and public.is_company_admin(company_id))
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers.
-- ---------------------------------------------------------------------------

alter table public.user_branches replica identity full;
alter table public.invites replica identity full;
alter table public.audit_log replica identity full;
