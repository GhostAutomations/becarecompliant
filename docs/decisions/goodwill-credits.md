# Goodwill credits (Phil, 2026-10-14)

The Founder can give a company extra SMS credits, AI credits or both, as goodwill or a promotion,
from the Founder console tile "Goodwill credits" (`/founder/goodwill`).

## What Phil decided

- **How often:** one off, weekly or monthly, from a start date (today by default, never in the
  past). Weekly and monthly run for a number of times OR until an end date (a grant due ON the end
  date is given).
- **Dates (Europe/London):** weekly is the start date then every 7 days. Monthly is the same day
  each month; a day the month lacks becomes its last day (31 Oct, 30 Nov, 31 Dec, 31 Jan, 28 Feb),
  and 29 Feb in a leap year.
- **Never expire.** Goodwill is added to the balance like a top up. The monthly allowance ADDS to
  the balance too, so nothing wipes it. Spending uses the one balance as before.
- **Reason** (Complaint goodwill, Sign up deal, Promotion, Other) and **private note** are the
  Founder's only. The company never sees either.
- **What the company sees:** a "Credits added" list on Billing (Admin only, as Billing is), the last
  12 additions to either balance, newest first: "+200 SMS credits, goodwill from Be Care
  Compliant", "+2,000 SMS credits, monthly allowance", "+100 AI credits, top up". Phil chose this by
  popup ("A short Credits added list on Billing"). Spends, refunds and adjustments are not listed.
- **Stop early:** the Stop button on a running grant. Credits already given stay.
- **Founder only, in the database:** `create_goodwill_grant` and `stop_goodwill_grant` are SECURITY
  DEFINER and refuse anyone but the platform admin; `grant_due_goodwill` is service role only (the
  cron). The two tables are readable by the Founder only and writable through those functions only.
- **Audit:** every grant created, every credit given and every stop is written to audit_log inside
  the same database transaction. The private note is never copied into the audit log.

## How it works (0472)

- `goodwill_grants` (the plan) and `goodwill_grant_periods` (one row per credit given, unique on
  grant and period number). Giving a period claims its row first, so running the job twice, or two
  runs at once, never gives twice.
- Each credit given is a ledger row (`sms_credit_ledger` / `ai_credit_ledger`) with reason
  `goodwill` and ref `goodwill:<grant id>:<period number>`, added through the existing
  `grant_sms_credits` / `grant_ai_credits`.
- A grant that starts today is given straight away when it is created. Every other period is given
  by the daily cron `/api/cron/goodwill-credits` (00:15 UTC, after midnight in London all year),
  which also catches up any missed day. Fails closed without CRON_SECRET, 500 on a failed run.
- A deleted company is given nothing more and is not offered on the form.
- The schedule is mirrored in `lib/billing/goodwill-schedule.ts` (the summary sentence, the next
  date, the form checks) and pinned by its unit tests.
