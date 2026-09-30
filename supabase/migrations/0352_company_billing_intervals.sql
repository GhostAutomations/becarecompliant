-- 0352: Annual billing (Phil, 2026-09-30). A company's plan is paid monthly or yearly, and on
-- Annual its extras (extra users and branches) yearly with the plan or monthly by card, all on
-- the same Stripe subscription. The seat, branch and plan syncs and the nightly reconcile read
-- these to pick the right Stripe price. Written from the subscription's metadata by the Stripe
-- webhook. Null (every subscription before Annual) means monthly.
alter table public.company_billing
  add column if not exists billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year')),
  add column if not exists extras_interval text
    check (extras_interval is null or extras_interval in ('month', 'year'));
