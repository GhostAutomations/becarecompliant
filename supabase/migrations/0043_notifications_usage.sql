-- 0043_notifications_usage
-- Phase 6 infrastructure (agreed by Phil, popup 2026-07-11):
--   notification_settings : per-company channel switches + chaser thresholds.
--   notification_log      : idempotency + audit for every send (email/SMS).
--                           A re-run or cron retry can never double-send: each
--                           send claims a unique dedupe_key first.
--   usage_events          : per-company SMS + AI metering (Diamond tier depends
--                           on this) + a monthly rollup view.
--   profiles.phone        : SMS escalation needs a number for Managers/Admins.
-- Writes to notification_log and usage_events are service-role only (no insert
-- policies), mirroring audit_log. Reads are Admin/Founder scoped.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- profiles.phone — E.164 recommended (+447...); used only for SMS escalation.
-- ===========================================================================
alter table public.profiles add column if not exists phone text;

-- ===========================================================================
-- notification_settings — one row per company. Email digest is on by default,
-- SMS is opt-in. Chaser thresholds tunable per company (defaults 7/14 days,
-- SMS at 14) per the agreed decisions.
-- ===========================================================================
create table if not exists public.notification_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  email_digest_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  chaser_first_days int not null default 7 check (chaser_first_days > 0),
  chaser_second_days int not null default 14 check (chaser_second_days > 0),
  sms_overdue_days int not null default 14 check (sms_overdue_days > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

create policy notification_settings_select on public.notification_settings
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

create policy notification_settings_insert on public.notification_settings
  for insert to authenticated
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

create policy notification_settings_update on public.notification_settings
  for update to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

-- Seed a row for every existing company (new companies get one in app code on
-- first read; code also treats a missing row as the defaults, so this is belt
-- and braces, and idempotent).
insert into public.notification_settings (company_id)
select id from public.companies
on conflict (company_id) do nothing;

-- ===========================================================================
-- notification_log — append-only send log + idempotency claim. dedupe_key is
-- globally unique and embeds the recipient + period/entity, e.g.
--   digest:<profile_id>:<london_date>
--   chaser7:<instance_id>:<due_date>:<profile_id>
--   sms14:<instance_id>:<due_date>:<phone>
--   holiday_request:<request_id>:<profile_id>
--   holiday_decision:<request_id>
--   su_review:<service_user_id>:<planned_date>:<reviewer_id>
--   absence_meeting:<meeting_id>:<recipient_profile_id>
-- Senders INSERT the claim first (status 'sending'); a unique violation means
-- another run already owns it, so skip. Then they update to sent/failed.
-- ===========================================================================
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  recipient_profile_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('email', 'sms')),
  kind text not null,
  dedupe_key text not null,
  to_address text not null default '',
  subject text not null default '',
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'skipped', 'failed')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index notification_log_dedupe_idx on public.notification_log (dedupe_key);
create index notification_log_company_idx on public.notification_log (company_id, created_at desc);
create index notification_log_kind_idx on public.notification_log (company_id, kind, created_at desc);

alter table public.notification_log enable row level security;

-- Reads: Founder everywhere, Company Admin for their company. No insert/update
-- policies: only the service role (cron/server actions) writes this table.
create policy notification_log_select on public.notification_log
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- usage_events — one row per metered unit of spend (SMS segment batch or AI
-- call). units = SMS segments or AI tokens (see metadata.unit); cost_pence is
-- the estimated cost in pence when known. Service-role writes only.
-- ===========================================================================
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('sms', 'ai')),
  occurred_at timestamptz not null default now(),
  units numeric not null default 1,
  cost_pence numeric,
  ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_company_idx on public.usage_events (company_id, occurred_at desc);
create index usage_events_kind_idx on public.usage_events (company_id, kind, occurred_at desc);

alter table public.usage_events enable row level security;

create policy usage_events_select on public.usage_events
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));

-- Monthly rollup, month bucketed on the Europe/London calendar so a 00:30 UTC
-- send on 1 June does not land in May. security_invoker: RLS on usage_events
-- scopes rows to Admin/Founder.
create or replace view public.usage_monthly
  with (security_invoker = true) as
select
  company_id,
  kind,
  date_trunc('month', occurred_at at time zone 'Europe/London')::date as month,
  count(*)          as event_count,
  sum(units)        as units_sum,
  sum(cost_pence)   as cost_pence_sum
from public.usage_events
group by company_id, kind, date_trunc('month', occurred_at at time zone 'Europe/London')::date;
