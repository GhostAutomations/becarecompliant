-- 0322_a_new_company_can_be_created_again
--
-- DEF-063, found 2026-09-23 while testing DEF-009: Create a company failed with
--   "Company created, but seeding branches failed: new row for relation "branches" violates
--    check constraint "branches_office_address_share_check""
--
-- 0222 (early September) added branches.uses_office_address DEFAULT TRUE, and a check that the
-- office (kind = 'team') can never share an address with itself. Both company creation paths,
-- the founder's Create a company and provision_company (trial provisioning), insert the office
-- row WITHOUT naming the column, so it took the default and broke the check. Since 0222 no
-- company could be created at all. None was: the last one before today was made in August.
--
-- Fixed where every path meets, not in each caller: a trigger sets uses_office_address to false
-- on any office row being inserted, so the founder's action, provision_company and anything
-- added later all get it right. The default stays TRUE for ordinary branches, as 0222 intended.
-- The app also now says false explicitly for the office row.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.branches_office_never_shares()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind = 'team' then
    new.uses_office_address := false;
  end if;
  return new;
end;
$$;

drop trigger if exists branches_office_never_shares on public.branches;
create trigger branches_office_never_shares
  before insert or update of kind on public.branches
  for each row execute function public.branches_office_never_shares();
