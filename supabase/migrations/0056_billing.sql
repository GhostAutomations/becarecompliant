-- ===========================================================================
-- 0056 — Billing & tiers (Phase 7)
--
-- Three tables, all written ONLY by the service-role client (Checkout/Portal
-- server actions, the Stripe webhook, the Diamond usage cron). No insert/
-- update/delete policies: reads are scoped to the Company Admin (own company)
-- and the Founder, exactly like usage_events / notification_log / audit_log.
--
--   company_billing        : one row per company linking it to its Stripe
--                            Customer + Subscription and caching the live
--                            subscription state for display + seat sync.
--   stripe_events          : webhook idempotency spine. Every delivered event
--                            claims its id (PK) FIRST; a duplicate delivery
--                            loses the race with 23505 and is skipped, then the
--                            row is settled processed/failed. Mirrors the
--                            notification_log claim-then-settle pattern.
--   billing_usage_runs     : Diamond usage-invoicing idempotency. One row per
--                            company per closed calendar month per kind, so the
--                            month-end cron can never double-bill usage.
--
-- Applied to ref bgrtcvyjuwopunpnudeu (becarecompliant) ONLY.
-- Money is always pence integers; no floats anywhere in billing.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- company_billing
-- ---------------------------------------------------------------------------
create table if not exists public.company_billing (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- Stripe Customer for this company (one Customer per company). Created lazily
  -- when the Admin first starts Checkout, or on the first webhook.
  stripe_customer_id text unique,
  -- The active/most-recent Subscription. Null for Diamond (usage only) and
  -- Black (free, no Stripe objects), or before the Admin subscribes.
  stripe_subscription_id text unique,
  -- Raw Stripe subscription status: active, trialing, past_due, canceled,
  -- incomplete, incomplete_expired, unpaid. Null = no subscription.
  subscription_status text,
  -- The tier the current subscription was created for (snapshot for display /
  -- reconciliation). companies.tier stays the source of truth for gating.
  billed_tier text,
  -- Extra seats currently reflected on the per-seat price quantity in Stripe
  -- (= max(0, active users − 4)). Kept in sync by lib/billing/stripe-sync.ts.
  seat_quantity integer not null default 0,
  -- End of the current paid period (from Stripe), for display.
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_billing_set_updated_at
  before update on public.company_billing
  for each row execute function public.set_updated_at();

alter table public.company_billing enable row level security;

-- Reads: Founder everywhere, Company Admin for their own company. No write
-- policies: only the service role (server actions / webhook) writes.
create policy company_billing_select on public.company_billing
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- stripe_events — webhook idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_events (
  -- Stripe event id (evt_...). PK gives us free dedupe: the second delivery of
  -- the same event fails the insert with 23505 and the handler skips.
  id text primary key,
  type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed', 'skipped')),
  company_id uuid references public.companies(id) on delete set null,
  error text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_events_company_idx on public.stripe_events (company_id, received_at desc);

alter table public.stripe_events enable row level security;

-- Founder-only read (platform diagnostics / error console). Service role writes.
create policy stripe_events_select on public.stripe_events
  for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- billing_usage_runs — Diamond usage-invoicing idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.billing_usage_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- First day of the billed calendar month (Europe/London), e.g. 2026-06-01.
  period_month date not null,
  kind text not null check (kind in ('sms', 'ai')),
  units numeric not null default 0,
  amount_pence integer not null default 0,
  stripe_invoice_item_id text,
  created_at timestamptz not null default now()
);

-- One invoice line per company per month per kind: the unique index makes the
-- cron idempotent (a re-run loses with 23505 and skips).
create unique index billing_usage_runs_unique_idx
  on public.billing_usage_runs (company_id, period_month, kind);

alter table public.billing_usage_runs enable row level security;

create policy billing_usage_runs_select on public.billing_usage_runs
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));
