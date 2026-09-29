-- 0346_agreement_acceptance
-- Phil, 2026-09-29 (Phase 13, "The contract in the app"). Decisions by popup:
--  * The Subscription Agreement and the Data Processing Agreement (both version 1.0) are shown in
--    the app and accepted by a Company Admin before first use. What was accepted, by whom, when and
--    from where is recorded, with the Order (legal name, organisation type, number, address, plan,
--    Monthly or Annual, onboarding fee). A new version asks again.
--  * Only the Company Admin is stopped until they accept. Everyone else carries on.
--  * The supplier details are not filled in yet, so the gate is OFF for everybody until they are
--    (lib/legal/supplier.ts). Before then the founder can switch it on for one company to test it
--    (companies.agreement_required); an acceptance made then is marked is_draft and does not count
--    once the final text is published.
--
-- 1. agreement_acceptances: one row per acceptance, never changed or deleted by anyone signed in.
--    Written only by the server (service role) after it has checked the Company Admin, so the IP
--    address and time on the row are the server's, not whatever a browser chose to send.
--    company_id is SET NULL on purge: clause 17.6 says we keep records of the agreement, and the
--    Order on the row names the customer on its own.
-- 2. companies.agreement_required: the founder's test switch.
-- 3. THE COMPANY ROW'S BILLING AND LIFECYCLE COLUMNS ARE THE FOUNDER'S (found building this, proved
--    by a rolled back probe): companies_update lets a Company Admin update ANY column, so a Company
--    Admin calling the API directly could set their own tier to black, clear their trial end or
--    change their status. A BEFORE UPDATE trigger now refuses a change to those columns from any
--    signed in user who is not the founder. The server's own writes (Stripe webhook, tier change,
--    company deletion) run as the service role, where auth.uid() is null, and are unaffected. No
--    part of the app changes these columns as a Company Admin (checked: every companies update).
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create table if not exists public.agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_by_name text not null,
  accepted_by_email text not null,
  agreement_version text not null,
  dpa_version text not null,
  agreement_sha256 text not null,
  dpa_sha256 text not null,
  is_draft boolean not null default false,
  customer_legal_name text not null check (length(btrim(customer_legal_name)) between 2 and 200),
  organisation_type text not null check (organisation_type in ('limited_company', 'charity', 'partnership', 'sole_trader', 'other')),
  company_number text check (company_number is null or length(company_number) <= 40),
  customer_address text not null check (length(btrim(customer_address)) between 5 and 500),
  plan text not null,
  billing_option text not null check (billing_option in ('monthly', 'annual')),
  onboarding_fee text not null,
  start_date date not null,
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);

create index if not exists agreement_acceptances_company_idx
  on public.agreement_acceptances (company_id, accepted_at desc);

alter table public.agreement_acceptances enable row level security;

drop policy if exists agreement_acceptances_select on public.agreement_acceptances;
create policy agreement_acceptances_select on public.agreement_acceptances
  for select to authenticated
  using (public.is_platform_admin() or (company_id is not null and public.is_company_admin(company_id)));
-- No insert, update or delete policy: nobody signed in writes this table.

revoke all on public.agreement_acceptances from anon;
revoke insert, update, delete on public.agreement_acceptances from authenticated;
grant select on public.agreement_acceptances to authenticated;

alter table public.companies add column if not exists agreement_required boolean not null default false;
comment on column public.companies.agreement_required is
  'Founder test switch (0346): ask this company''s Company Admin to accept the agreement before the final text is published.';

create or replace function public.companies_guard_founder_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- The server's own writes (service role, crons, webhooks) and the founder are not limited here.
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if new.tier is distinct from old.tier
     or new.status is distinct from old.status
     or new.trial_started_at is distinct from old.trial_started_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.trial_owner_email is distinct from old.trial_owner_email
     or new.trial_owner_domain is distinct from old.trial_owner_domain
     or new.provisioned_by is distinct from old.provisioned_by
     or new.deleted_at is distinct from old.deleted_at
     or new.purge_after is distinct from old.purge_after
     or new.slug is distinct from old.slug
     or new.name_key is distinct from old.name_key
     or new.framework_enabled is distinct from old.framework_enabled
     or new.agreement_required is distinct from old.agreement_required then
    raise exception 'Only Be Care Compliant can change your plan, trial or account status.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.companies_guard_founder_columns() from public, anon, authenticated;

drop trigger if exists companies_guard_founder_columns on public.companies;
create trigger companies_guard_founder_columns
  before update on public.companies
  for each row execute function public.companies_guard_founder_columns();
