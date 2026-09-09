-- 0258_a_company_says_which_funding_it_invoices_itself
-- Phil, 2026-09-09: "if they tick an option, on the right have a greyed out box; if something
-- is ticked the greyed box becomes active so you can check it, and if checked then when the
-- funding option is selected in the setup visit they will be added to private invoicing."
--
-- 0256 let a company say which funding types it ACCEPTS. This lets it say which of those it
-- INVOICES ITSELF, which is a different question and not one the product can answer for them:
-- some agencies bill the health board direct for Continuing Healthcare and some are paid
-- through a framework; a direct payment is invoiced to the individual by one agency and
-- handled by a broker for another.
--
-- So the two-checkbox row is exactly right, and the second box can only be reachable once the
-- first is ticked: "we invoice this ourselves" is meaningless about funding we do not take.
--
-- This REPLACES the hard-coded list in lib/invoicing/setup-billing.ts, which shipped earlier
-- today with private and nhs_chc in it. Existing companies are backfilled to exactly that, so
-- nothing changes behaviour on the way through.
--
-- payer_type moves onto the catalogue at the same time. Whether the payer is a person or an
-- organisation is a property of the funding type, not something to decide with an `if` on a
-- key inside the app: a council, a health board and a charity are organisations however many
-- companies tick them.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.funding_option_catalogue
  add column if not exists payer_type text not null default 'organisation'
    check (payer_type in ('person', 'organisation'));

update public.funding_option_catalogue set payer_type = 'person'
 where key in ('la_direct_payment', 'nhs_chc_direct_payment', 'private', 'compensation_or_cop');

update public.funding_option_catalogue set payer_type = 'organisation'
 where key in ('local_authority', 'nhs_chc', 'joint_funded', 'section_117',
               'childrens_continuing_care', 'charity_or_grant');

alter table public.company_funding_options
  add column if not exists bills_privately boolean not null default false;

-- Backfill to the behaviour that shipped this morning, so nothing changes underneath anyone.
update public.company_funding_options
   set bills_privately = true
 where option_key in ('private', 'nhs_chc');

-- New companies start the same way: they accept three, and invoice two of them themselves.
create or replace function public.default_company_funding_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.company_funding_options (company_id, option_key, bills_privately)
  values (new.id, 'local_authority', false),
         (new.id, 'nhs_chc', true),
         (new.id, 'private', true)
  on conflict do nothing;
  return new;
end;
$fn$;

create or replace function public.seed_company_funding_options(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_funding_options: not authorised for company %', cid;
  end if;

  if exists (select 1 from public.company_funding_options where company_id = cid) then
    return 0;
  end if;

  insert into public.company_funding_options (company_id, option_key, bills_privately)
  values (cid, 'local_authority', false),
         (cid, 'nhs_chc', true),
         (cid, 'private', true);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.seed_company_funding_options(uuid) from public;
revoke all on function public.seed_company_funding_options(uuid) from anon;
grant execute on function public.seed_company_funding_options(uuid) to authenticated;
grant execute on function public.seed_company_funding_options(uuid) to service_role;
