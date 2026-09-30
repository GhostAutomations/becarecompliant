-- 0353: mark a company as a test company (Phil, 2026-09-30, by popup).
-- A test company's invoices are left off Founder > Invoices, and it is left out of the revenue
-- and MRR totals, so testing billing on companies like Bevan does not look like real money.
-- Founder only: added to companies_guard_founder_columns so a Company Admin cannot set it.

alter table public.companies
  add column if not exists is_test boolean not null default false;

comment on column public.companies.is_test is
  'Founder-set. Test company: its invoices are hidden from Founder > Invoices and it is left out of revenue and MRR totals.';

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
  -- column as null, so comparing it refused every update (found by the 0346 probe). It cannot be
  -- written directly anyway.
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
     or new.is_test is distinct from old.is_test then
    raise exception 'Only Be Care Compliant can change your plan, trial or account status.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
