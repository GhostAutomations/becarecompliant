-- 0317_migrated_history_goes_with_the_record_it_belongs_to
--
-- Found while building Delete person (DEF-040), before it shipped rather than after.
--
-- migrated_completions has no foreign key to people: like Evidence, it finds a record through
-- record_type and record_id. So deleting a person does NOT take their migrated history with
-- them, and the delete has to do it by hand. It could not: the table had exactly one policy,
-- a select. A delete against it would have removed nothing, returned no error, and left rows
-- about a person who no longer exists feeding the on time report.
--
-- A DELETE NOBODY CAN PERFORM AND NOBODY IS TOLD ABOUT is the worst shape of all, and it is the
-- one RLS produces for free: a refused delete is not an error, it is zero rows.
--
-- Company Admins only, which is who may delete a person (people_delete says the same thing).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists migrated_completions_delete on public.migrated_completions;
create policy migrated_completions_delete on public.migrated_completions
  for delete using (
    is_platform_admin() or is_company_admin(company_id)
  );
