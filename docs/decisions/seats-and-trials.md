# Seats and trials

> Phil's rule, 2026-08-20: a CUSTOMER is never refused a seat (say what it costs, never block); a TRIAL is the exception because they are not a customer yet — 1 branch, 2 invites + the Admin. Read before adding any limit, gate or nag about seats, branches or billing.

## The rule, in Phil's words (2026-08-20)

> **"The trial is the exception because they are not a customer yet."**

Two opposite behaviours, and which one applies is decided by that sentence:

- **A paying customer is NEVER blocked.** A compliance tool must not refuse to add the manager who
  has to sign something off. It says what the next seat costs and lets them get on with it.
  `lib/billing/seat-notice.ts` (pure, 6 tests).
- **A trial IS limited**, because for somebody still deciding the limit is the offer.
  `lib/billing/trial-limits.ts` (pure, 7 tests). **Every refusal names the way out.** Adding a
  card removes the limits entirely and the seat NOTICE takes over from the seat LIMIT.

## What a trial is

- Founder picks **Trial days** on Create a company (default **14**, **0 = no trial**). It writes
  `trial_started_at` + `trial_ends_at` — the same single column the existing lock reads
  (`companies.trial_ends_at`; the Stripe webhook clears it on subscribe).
- **One branch**, and **two invites PLUS the Admin** — three logins (Phil confirmed the reading).
- The invite limit counts **accepted AND pending** invitations, or ten invites landing tomorrow
  would walk past it. The branch limit sits on the FOUNDER's Add a branch, because that is where
  branches come from.
- The Admin is told **at first login**, not three days from the end: the banner runs for the whole
  trial and says payment details are needed to carry on, "nothing is charged until you add them".

## What was wrong before (DEF-015, found by Phil doing it for real)

He added 6 office users to a 4-user Business tenant with 2 branches (1 included) and **nothing
said a word**: no notice at the point of invite, and no subscription ever asked for, because
founder-created companies got **no trial clock at all** (only the self-serve path set one). The
figures existed on Settings > Billing and nowhere else. Fixed: seat notice above the invite form,
a dashboard bar for an Admin when billing is not set up (never in support mode, never on Black),
and the stale "billing arrives in a later phase" copy on Settings > Branches.

**Seats are charged on ACTIVE users**, so a pending invitation is not a charge — every message
about cost must distinguish "what you pay now" from "what you will pay when they accept".

## Not retrospective

Thistle Care Ltd predates the trial model, has NULL trial dates, and is the paying pilot — it is
unaffected, as is every other company with NULL trial dates.

## Still open (Phil's call, not bugs)

- Whether a founder-created company with **no trial** should ever lapse if it never subscribes.
- **No Terms of Service, no subscription agreement, and no DPA exist anywhere in the product** —
  only the privacy notice, and nothing at checkout asks anyone to accept anything. The **DPA is
  the sharp one**: BCC processes special-category data on behalf of the provider, so UK GDPR
  Article 28 requires a written processor contract. Drafting them was offered and deferred while
  the product work was done.

Related: [stripe-prices](stripe-prices.md) [branch-billing](branch-billing.md) [tier-changes](tier-changes.md) [self-serve-trial](self-serve-trial.md)
[company-deletion](company-deletion.md)
