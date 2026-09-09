-- 0257_every_new_company_starts_with_funding_options
-- The default funding set has to arrive with the company, whichever door the company came
-- through: the founder console, trial provisioning, or whatever creates a company next.
--
-- Patching each creation path is how the tier gap happened - companies.tier was written by
-- creation and trial provisioning and by nothing else, and every later way of making a company
-- would have missed it. A trigger on the table is the one place every caller must go through,
-- the same reasoning as apply_person_checks for job titles.
--
-- Three defaults, matching seed_company_funding_options: Local Authority, NHS Continuing
-- Healthcare, Private. An admin ticks the rest in Settings > Service Users.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.default_company_funding_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.company_funding_options (company_id, option_key)
  select new.id, k
  from unnest(array['local_authority', 'nhs_chc', 'private']) as k
  on conflict do nothing;
  return new;
end;
$fn$;

drop trigger if exists companies_default_funding_options on public.companies;
create trigger companies_default_funding_options
  after insert on public.companies
  for each row execute function public.default_company_funding_options();
