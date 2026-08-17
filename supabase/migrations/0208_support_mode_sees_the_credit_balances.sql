-- 0208: support mode sees the credit balances.
--
-- The founder dashboard in a manage-as session said "n/a" for SMS Left and AI credits
-- Left where the company's own Admin sees real numbers. cac_select and csc_select were
-- the two accidental exceptions to the standard posture that every tenant table also
-- grants is_platform_admin() (whistleblowing_reports is the one DELIBERATE exception,
-- migration 0177, and is untouched here).

alter policy cac_select on public.company_ai_credits
  using (is_company_member(company_id) or is_platform_admin());

alter policy csc_select on public.company_sms_credits
  using (is_company_member(company_id) or is_platform_admin());
