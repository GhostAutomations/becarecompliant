-- 0354: the deal a founder sets up for a company, and the company's own word for "branch"
-- (Phil, 2026-09-30, by popup).
--
-- company_deals: one row per company, written only by the founder. It fixes what the Company
-- Admin sees on the agreement's Order (extra users, extra branches, Monthly or Annual, how the
-- extras are paid) and any special prices agreed in negotiation: the plan price, the extra user
-- price, and the extra branch price, flat or two-step (the first N extra branches at one price,
-- the rest at another). Null prices mean the normal list price. Annual is still ten months for
-- twelve on whatever price is set. stripe_price_ids holds the Stripe prices made for this
-- company's special prices, keyed like "plan:year", so they are made once and reused.
--
-- companies.branch_word / branch_word_plural: the company's own word for a branch, e.g. House and
-- Houses. Null means "branch". Founder-only, like the plan (guard trigger below).

create table if not exists public.company_deals (
  company_id uuid primary key references public.companies(id) on delete cascade,
  billing_option text check (billing_option in ('monthly', 'annual')),
  extras_billing text check (extras_billing in ('monthly', 'yearly')),
  extra_users integer not null default 0 check (extra_users between 0 and 500),
  extra_branches integer not null default 0 check (extra_branches between 0 and 50),
  plan_price_pence integer check (plan_price_pence is null or plan_price_pence between 0 and 10000000),
  seat_price_pence integer check (seat_price_pence is null or seat_price_pence between 0 and 1000000),
  branch_price_pence integer check (branch_price_pence is null or branch_price_pence between 0 and 1000000),
  branch_step_after integer check (branch_step_after is null or branch_step_after between 1 and 49),
  branch_step_price_pence integer check (branch_step_price_pence is null or branch_step_price_pence between 0 and 1000000),
  onboarding_fee_pence integer check (onboarding_fee_pence is null or onboarding_fee_pence between 0 and 10000000),
  stripe_price_ids jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- A two-step price needs both halves, and a first price to step from.
  constraint company_deals_step_complete check (
    (branch_step_after is null and branch_step_price_pence is null)
    or (branch_step_after is not null and branch_step_price_pence is not null and branch_price_pence is not null)
  ),
  -- Monthly plans pay their extras monthly; only Annual has the choice.
  constraint company_deals_extras_interval check (
    extras_billing is null or billing_option = 'annual' or extras_billing = 'monthly'
  )
);

comment on table public.company_deals is
  'Founder-set deal for a company: fixes the Order (extra users and branches, Monthly or Annual) and holds any special prices. Null price = list price.';

alter table public.company_deals enable row level security;

drop policy if exists company_deals_select on public.company_deals;
create policy company_deals_select on public.company_deals
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));

drop policy if exists company_deals_founder_write on public.company_deals;
create policy company_deals_founder_write on public.company_deals
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop trigger if exists company_deals_set_updated_at on public.company_deals;
create trigger company_deals_set_updated_at
  before update on public.company_deals
  for each row execute function public.set_updated_at();

alter table public.companies
  add column if not exists branch_word text check (branch_word is null or char_length(branch_word) between 1 and 30),
  add column if not exists branch_word_plural text check (branch_word_plural is null or char_length(branch_word_plural) between 1 and 30);

comment on column public.companies.branch_word is 'Founder-set. The company''s own word for a branch, e.g. House. Null = Branch.';
comment on column public.companies.branch_word_plural is 'Founder-set. Plural of branch_word, e.g. Houses. Null = Branches.';

create or replace function public.companies_guard_founder_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  -- name_key is NOT checked: it is generated from name, and a BEFORE trigger sees a generated
  -- column as null, so comparing it refused every update (found by the 0346 probe).
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
     or new.framework_enabled is distinct from old.framework_enabled
     or new.agreement_required is distinct from old.agreement_required
     or new.is_test is distinct from old.is_test
     or new.branch_word is distinct from old.branch_word
     or new.branch_word_plural is distinct from old.branch_word_plural then
    raise exception 'Only Be Care Compliant can change your plan, trial or account status.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
