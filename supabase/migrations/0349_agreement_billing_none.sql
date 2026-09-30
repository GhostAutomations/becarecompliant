-- 0349: a Black account is never billed, so its Order records no billing option (Phil, 2026-09-30,
-- testing A9: the accept screen asked a Black account Monthly or Annual). "none" joins the two
-- billing options; the accept action sets it from the plan, never from the form.
alter table public.agreement_acceptances drop constraint agreement_acceptances_billing_option_check;
alter table public.agreement_acceptances
  add constraint agreement_acceptances_billing_option_check
  check (billing_option in ('monthly', 'annual', 'none'));
