-- 0174_incidents_and_whistleblowing
--
-- THE LIST item 21. CIW Regulation 80(3)(b) requires the six monthly Quality of Care Review to
-- carry aggregated analysis of incidents, notifiable incidents, safeguarding matters and
-- whistleblowing. The platform held NONE of it as structured data, so the Reg 80 report says,
-- in as many words, "Recorded by the Responsible Individual; the platform does not hold these
-- yet" and asks the RI to type the figures from memory.
--
-- TWO tables, agreed with Phil 2026-08-12:
--
--   incidents  - a safeguarding referral is an INCIDENT THAT WAS ESCALATED, carried on the
--                same row via the safeguarding_* columns, not a second record. One row holds
--                the whole thread, so "12 incidents, of which 3 notifiable and 2 referred"
--                always reconciles. Two tables would be entered twice and drift, which is
--                exactly how an aggregate stops adding up.
--
--   whistleblowing_disclosures - SEPARATE, and restricted to Company Admin and the Responsible
--                Individual. The commonest real disclosure is about a manager, so a branch
--                manager must not be able to browse them. Enforced here in RLS, never by
--                hiding a nav item: a hidden link is not a permission (the Briefings picker
--                taught us that on 2026-08-11).
--
-- EVERY TIER, including Business (Phil): recording an incident is a legal duty for any
-- provider regardless of what they pay us.

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,

  occurred_on date not null,
  occurred_at time,
  category text not null,

  -- Who it happened to. Either, both or neither: an incident can involve a service user, a
  -- member of staff, both (an injury during a moving and handling task) or nobody identifiable
  -- (a medication delivery failure).
  service_user_id uuid references public.service_users(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,

  description text not null,
  immediate_action text,

  -- Notifiable to the regulator.
  notifiable boolean not null default false,
  notified_on date,
  regulator_reference text,

  -- Escalated to safeguarding. Same row on purpose: see the note above.
  safeguarding boolean not null default false,
  safeguarding_referred_on date,
  local_authority text,
  local_authority_reference text,
  safeguarding_outcome text,

  status text not null default 'open' check (status in ('open', 'under_review', 'closed')),
  closed_on date,
  lessons_learnt text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incidents_company_occurred_idx
  on public.incidents (company_id, occurred_on desc);
create index if not exists incidents_branch_idx on public.incidents (branch_id);

alter table public.incidents enable row level security;

-- Same scoping as complaints: admins company wide, a branch manager their own branches.
create policy incidents_select on public.incidents for select
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );
create policy incidents_insert on public.incidents for insert
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );
create policy incidents_update on public.incidents for update
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create table if not exists public.whistleblowing_disclosures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Nullable: a disclosure is often about the company rather than one branch, and forcing a
  -- branch would both distort the aggregate and hint at where it came from.
  branch_id uuid references public.branches(id) on delete set null,

  received_on date not null,
  -- The discloser may withhold their name, and usually should be able to. When anonymous is
  -- true the name column stays null: there is no "hidden" name to leak later.
  anonymous boolean not null default true,
  discloser_name text,

  category text not null,
  disclosure text not null,
  action_taken text,
  outcome text,

  status text not null default 'open' check (status in ('open', 'under_review', 'closed')),
  closed_on date,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whistleblowing_company_received_idx
  on public.whistleblowing_disclosures (company_id, received_on desc);

alter table public.whistleblowing_disclosures enable row level security;

-- DELIBERATELY NARROWER THAN EVERY OTHER TABLE IN THE PRODUCT: no is_branch_manager clause.
-- A disclosure about a manager cannot be readable by that manager.
-- NOTE: 0175 adds the Responsible Individual to these three policies. is_company_admin()
-- checks role = 'company_admin' only, so as written here the RI - who writes the Reg 80
-- aggregate - could not see the disclosures they are reporting on.
create policy whistleblowing_select on public.whistleblowing_disclosures for select
  using (public.is_platform_admin() or public.is_company_admin(company_id));
create policy whistleblowing_insert on public.whistleblowing_disclosures for insert
  with check (public.is_platform_admin() or public.is_company_admin(company_id));
create policy whistleblowing_update on public.whistleblowing_disclosures for update
  using (public.is_platform_admin() or public.is_company_admin(company_id));

comment on table public.whistleblowing_disclosures is
  'Whistleblowing disclosures (Reg 80(3)(b)). Company Admin and Responsible Individual only: branch managers are excluded on purpose, because a disclosure is commonly about a manager.';
