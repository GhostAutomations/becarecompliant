-- 0140_letter_template_reset
-- 0139 deliberately gave company_letter_templates no delete policy ("wording is never
-- removed, only superseded"). Putting a letter back to the STANDARD wording is the one
-- legitimate delete: removing the company's row makes the letter read from the packaged
-- default again, so later improvements to that default reach them.
--
-- The VERSION HISTORY stays undeletable, so resetting still leaves a full record of
-- what the company had and when. Company Admin only, same as editing.

drop policy if exists company_letter_templates_delete on public.company_letter_templates;
create policy company_letter_templates_delete on public.company_letter_templates
  for delete using (is_platform_admin() or is_company_admin(company_id));
