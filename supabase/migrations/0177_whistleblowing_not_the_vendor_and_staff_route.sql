-- 0177_whistleblowing_not_the_vendor_and_staff_route
--
-- TWO changes, both from Phil on 2026-08-12 after he looked at what I had built.
--
-- 1. THE VENDOR CANNOT READ DISCLOSURES.
--
--    0174 gave whistleblowing_disclosures the same is_platform_admin() clause every other
--    table has, out of habit rather than decision. It is not support mode doing it: RLS
--    reads the real auth.uid(), so the founder could read every tenant's disclosures with
--    no cookie and no trace of having entered the company. Phil's decision was "Company
--    Admin and Responsible Individual only", and a software vendor is neither.
--
--    This is the ONE table in the product with no founder clause, and that is the point.
--    A carer disclosing that their manager is falsifying call logs has not agreed to
--    Be Care Compliant reading it.
--
--    Proven after applying, by impersonation: the founder profile sees 0 rows while
--    is_platform_admin() still returns true, and the Company Admin still sees them.
--
-- 2. A ROUTE FOR THE PERSON ACTUALLY RAISING THE CONCERN.
--
--    Until now the register could only be filled in by the Admin or the Responsible
--    Individual, typing up what somebody told them. The people most likely to have
--    something to disclose had no way in at all.
--
--    raise_whistleblowing_concern() is SECURITY DEFINER because a Team Member has, and must
--    keep, NO privilege on this table: they can call this function and nothing else. They
--    cannot read the register, cannot read their own submission back, and cannot tell from
--    the product whether anybody has looked at it.
--
--    WHEN THE DISCLOSURE IS ANONYMOUS, created_by IS NULL. Not hidden, not filtered out of a
--    view - absent. A created_by we simply do not render is a name waiting to surface in an
--    export, a backup or the next screen somebody writes without thinking.

drop policy if exists whistleblowing_select on public.whistleblowing_disclosures;
create policy whistleblowing_select on public.whistleblowing_disclosures
  for select using (
    public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  );

drop policy if exists whistleblowing_insert on public.whistleblowing_disclosures;
create policy whistleblowing_insert on public.whistleblowing_disclosures
  for insert with check (
    public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  );

drop policy if exists whistleblowing_update on public.whistleblowing_disclosures;
create policy whistleblowing_update on public.whistleblowing_disclosures
  for update using (
    public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  ) with check (
    public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  );

comment on table public.whistleblowing_disclosures is
  'Whistleblowing disclosures (Reg 80(3)(b)). Company Admin and Responsible Individual ONLY. Deliberately the one table with no is_platform_admin() clause: the vendor cannot read these. Staff submit through raise_whistleblowing_concern() and can never read the register.';

create or replace function public.raise_whistleblowing_concern(
  p_category text,
  p_disclosure text,
  p_named boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
  v_name text;
  v_named boolean := coalesce(p_named, false);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to raise a concern.';
  end if;

  select p.company_id, p.full_name
    into v_company, v_name
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  if v_company is null then
    raise exception 'Your login is not attached to a company.';
  end if;

  if coalesce(btrim(p_disclosure), '') = '' then
    raise exception 'Please describe the concern.';
  end if;

  insert into public.whistleblowing_disclosures (
    company_id,
    branch_id,
    received_on,
    anonymous,
    discloser_name,
    category,
    disclosure,
    status,
    created_by
  ) values (
    v_company,
    -- DELIBERATELY NULL, even though we know their branch. On a branch of six, naming it
    -- narrows the discloser to six people. The Admin can add it later if it is needed and
    -- does not give anybody away.
    null,
    (now() at time zone 'Europe/London')::date,
    not v_named,
    case when v_named then v_name else null end,
    coalesce(nullif(btrim(p_category), ''), 'Other'),
    btrim(p_disclosure),
    'open',
    -- The whole point. Anonymous means the row does not know who wrote it.
    case when v_named then auth.uid() else null end
  );
end;
$$;

comment on function public.raise_whistleblowing_concern(text, text, boolean) is
  'Lets any signed-in member of staff raise a whistleblowing concern without holding any privilege on whistleblowing_disclosures. created_by is NULL when the disclosure is anonymous.';

revoke all on function public.raise_whistleblowing_concern(text, text, boolean) from public;
revoke all on function public.raise_whistleblowing_concern(text, text, boolean) from anon;
grant execute on function public.raise_whistleblowing_concern(text, text, boolean) to authenticated;
grant execute on function public.raise_whistleblowing_concern(text, text, boolean) to service_role;
