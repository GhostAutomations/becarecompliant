-- 0209 — a company can be deleted, and it actually goes.
--
-- Until now nothing in the product could remove a company. The founder console could suspend
-- or archive one (and, as it turns out, neither did anything at all: companies.status was
-- written and displayed and never once read by a guard), but the rows, the files in the
-- buckets, the logins in auth.users and the Stripe subscription all stayed exactly where they
-- were. That is a gap with a name: a customer who leaves, or who exercises a UK GDPR erasure
-- request, has to be erasable through the product rather than by hand-written SQL.
--
-- The shape agreed with Phil on 2026-08-18:
--   * Deleting is a TWO STAGE act. Stage one hides the company, locks every one of its logins
--     out and cancels Stripe immediately. Stage two, thirty days later (or on demand from the
--     founder console), purges it for real: rows, storage objects, auth users and the audit
--     trail.
--   * ONE TOMBSTONE ROW SURVIVES. company_deletions records what was deleted, by whom, when,
--     what it contained and what happened to the subscription — so an erasure request is
--     genuinely satisfied while the deletion itself can still be proved and accounted for.
--
-- The tombstone deliberately has NO foreign key to companies. A record that cascades away
-- with the thing it is a record of is not a record.

-- ---------------------------------------------------------------------------
-- 1. companies gains a 'deleted' status and the grace clock
-- ---------------------------------------------------------------------------

alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies
  add constraint companies_status_check
  check (status = any (array['active'::text, 'suspended'::text, 'archived'::text, 'deleted'::text]));

alter table public.companies add column if not exists deleted_at timestamptz;
alter table public.companies add column if not exists purge_after timestamptz;

comment on column public.companies.deleted_at is
  'When the founder deleted this company. Access is locked from this moment; the data survives until purge_after.';
comment on column public.companies.purge_after is
  'When the nightly purge may erase this company for real. Set to deleted_at + 30 days.';

-- The purge job asks one question every night: is anything due? Answer it from an index that
-- only carries deleted companies, so the cost does not grow with the customer base.
create index if not exists companies_purge_after_idx
  on public.companies (purge_after)
  where status = 'deleted';

-- ---------------------------------------------------------------------------
-- 2. The tombstone
-- ---------------------------------------------------------------------------

create table if not exists public.company_deletions (
  id uuid primary key default gen_random_uuid(),
  -- NOT a foreign key, on purpose. See the header.
  company_id uuid not null,
  company_name text not null,
  company_slug text,
  tier text,
  regulator text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_by_email text,
  purge_after timestamptz not null,
  purged_at timestamptz,
  purged_by text check (purged_by is null or purged_by = any (array['founder'::text, 'cron'::text])),
  restored_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_cancelled boolean not null default false,
  stripe_note text,
  -- What the company held at the moment of deletion, and what the purge actually removed.
  -- Two counts, not one: "we deleted 42 people" and "42 people rows were removed" are
  -- different claims, and only the second is evidence.
  counts jsonb not null default '{}'::jsonb,
  purge_counts jsonb,
  purge_error text,
  created_at timestamptz not null default now()
);

create index if not exists company_deletions_company_idx on public.company_deletions (company_id);
create index if not exists company_deletions_open_idx on public.company_deletions (purge_after)
  where purged_at is null and restored_at is null;

alter table public.company_deletions enable row level security;

-- Readable by the founder only. Nothing else has a policy, so nothing else can write here:
-- the tombstone is written by the service role inside the delete and purge paths, which is
-- what keeps it from being editable by the person whose deletion it records.
drop policy if exists company_deletions_select on public.company_deletions;
create policy company_deletions_select on public.company_deletions
  for select to authenticated
  using (public.is_platform_admin());
