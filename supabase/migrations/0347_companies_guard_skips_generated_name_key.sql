-- 0347_companies_guard_skips_generated_name_key
-- Found by the 0346 probe within minutes of applying it: companies.name_key is a GENERATED column
-- (company_name_key(name)), and a BEFORE UPDATE trigger sees a generated column as null in NEW.
-- So "new.name_key is distinct from old.name_key" was true on every update, and the guard refused
-- EVERY companies update by a Company Admin (probation period, invite domains, column labels,
-- rota scope, outcomes months). name_key cannot be written directly anyway, so it is simply not
-- checked. Probed again after: a Company Admin's settings update goes through; tier, trial, status
-- and the agreement switch are still refused; the founder and the server are unaffected.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create or replace function public.companies_guard_founder_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
     or new.agreement_required is distinct from old.agreement_required then
    raise exception 'Only Be Care Compliant can change your plan, trial or account status.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.companies_guard_founder_columns() from public, anon, authenticated;
