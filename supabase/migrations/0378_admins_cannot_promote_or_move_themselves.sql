-- 0378: close audit findings S1, S2 and S3 (AUDIT-2026-10.md, 3 Oct 2026).
--
-- S1. A Company Admin could make themselves Founder: the profiles_update policy lets anyone update
--     their own row, and enforce_profile_protected_fields let a Company Admin change role and
--     company on ANY row of their company, their own included. Setting role = 'platform_admin'
--     with company_id = null passed the platform_admin_has_no_company constraint. Proved in a
--     rolled back transaction as Bevan's Admin: is_platform_admin() became true and Thistle's
--     people and Service Users were readable.
-- S2. The same gap let a Company Admin move their own login into another company (company_id =
--     the other company's id) and become its Admin.
--
-- The rule now:
--   * No session (service role, the invite and demo code, migrations): unchanged, allowed.
--   * The Founder: unchanged, allowed.
--   * Nobody else may change company_id. Ever. Company moves are the invite code's job and it runs
--     as the service role (lib/invites.ts), as does the demo code (lib/demo/manage.ts).
--   * Nobody else may give anyone the platform_admin role.
--   * Nobody may change their OWN role or status. The screens already refuse it
--     (settings/actions.ts: "You cannot change your own status here", "You cannot edit your own
--     account here"); the welcome page activates the login through the service role.
--   * A Company Admin may still change the role and status of other people in their company.
--
-- S3. Storage policy evidence_objects_select let every member of a company (carers, Viewers, On
--     Call, Seniors) list and download every object in the company's evidence folder: rendered
--     Evidence PDFs, fit notes, paper uploads, outcome letters. Proved: a Thistle carer could list
--     three Evidence PDFs whose rows RLS hides from them. Every read of this bucket in the app
--     goes through the service role (lib/evidence/storage.ts, care-plan.ts, training/storage.ts,
--     assignments/storage.ts, invoicing/logo.ts, sar/build.ts, the fit note route) and browsers
--     only upload through signed upload tokens, which need no select policy. So the policy goes:
--     the bucket is now service role only, like record-updates and subject-access already are.

create or replace function public.enforce_profile_protected_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service role / direct SQL (no JWT): auth.uid() is null.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Only Be Care Compliant can move a login to another company.'
      using errcode = '42501';
  end if;

  if new.role = 'platform_admin' and old.role is distinct from 'platform_admin' then
    raise exception 'Not allowed to change role, company or status'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role or new.status is distinct from old.status then
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or status.'
        using errcode = '42501';
    end if;
    if not (old.company_id is not null and public.is_company_admin(old.company_id)) then
      raise exception 'Not allowed to change role, company or status'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists evidence_objects_select on storage.objects;
