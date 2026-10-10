# Self serve trial

> Item 4c — founder approved trial provisioning AND the trial lapse gate. 0152 + 0153 applied, console and gate BUILT 2026-07-29, none of it run live. Read before touching trials, provisioning, guards or billing gates.

**BUILT 2026-07-29, NOT YET RUN LIVE. Migrations 0152 and 0153 applied.** Item 4c on
[the-list](the-list.md). Test lists are in PHASES.md under "PROVISION FROM A TRIAL REQUEST" and
"THE TRIAL LAPSE GATE".

## The decision, and what it deleted

A stranger NEVER creates a tenant. They request a trial exactly as they do today, the request
lands on the 0151 trial requests screen carrying flags for anything already seen, and Phil
presses Provision once. The system then does company, Office and first Branch, all five seed
catalogues, the Company Admin invite, and starts the 14 day clock **at the press**, not at the
request.

Phil rejected my earlier draft that would have let a verified stranger provision themselves. His
version is better and it deleted a whole layer: no pending signup table, no hashed verification
token, no public provisioning route, and **no service role surface at all**. The Company Admin
invite email is itself the proof the address is real, because a fake one never accepts. It also
means the five `seed_company_*` functions are untouched, where the earlier draft would have had
to loosen the `is_platform_admin()` guard on all five.

Consequence worth remembering: the homepage FAQ already promises "we set the trial up for you,
usually the same working day", and under this design that stays TRUE, so the copy rewrite mostly
falls away.

## The rules

- One trial per email address, for ever, until Phil clears the field.
- One trial per **company** domain. NOT per personal domain. gmail, outlook, icloud, btinternet
  and the rest fall back to the one per address rule, because otherwise the first gmail applicant
  blocks every gmail applicant afterwards. Enforced by writing NULL into `trial_owner_domain` for
  a personal provider, so the partial unique index simply does not constrain it. **The domain rule
  is data, not a branch in TypeScript.** Over-including a domain in PERSONAL_EMAIL_DOMAINS is
  safe; under-including is not.
- Same email or same company domain **blocks** Provision, with a Provision anyway override that
  asks for a reason and writes it to the audit log. Similar company name or repeated phone
  **warns** only.
- Name matching is a normalised key, no extension. "Care Ltd" keys to NULL and never matches, so
  every matching query must test `name_key is not null` first.
- The no touch public route is DROPPED. Revisit later with an auto approve switch.

## What is built

**Provisioning (increment 2).** `lib/founder/trial-matching.ts`; a Seen before panel on
/founder/trial-requests, silent when nothing matches so a flag always means something;
`provisionFromTrialRequest` calling the RPC, rebaking form options, inviting the Company Admin,
writing company.created and trial_request.provisioned, then redirecting to the new company.

**The lapse gate (increment 3).** `lib/billing/trial.ts` (pure, 8 unit tests in
`lib/billing/trial.test.ts`, all 29 project tests pass), `lib/billing/trial-gate.ts` (the DB read,
deduped per request with React `cache()`), the lock itself inside `requireCompany`, an amber bar
in the app layout from three days out, and `/trial-ended` (deliberately OUTSIDE the (app) group so
there is no navigation bouncing back).

**Two things about the gate that must not be undone:**
1. **The lock is one line in `requireCompany`.** Every page, every server action and all nineteen
   tenant export routes reach their company through it, so nothing had to remember anything and a
   new route gates itself. Exactly two callers pass `allowLapsed: true`: the /trial-ended page (or
   it loops) and `startCheckout` / `openBillingPortal` (or the way out of a lapsed trial sits
   behind the lock it exists to clear). The platform_admin early return is ABOVE the check on
   purpose, so managing as a lapsed company still works.
2. **The gate reads `companies.trial_ends_at` and never `company_billing`.** company_billing RLS
   admits only a Company Admin and the founder, so a gate reading the subscription would lock a
   MANAGER out of a company his Admin uses perfectly well. The Stripe webhook now clears
   trial_ends_at when a subscription goes active/trialing/past_due, so a paying company reads
   exactly like one that never had a trial. trial_started_at and trial_owner_email survive as
   history.

**Also fixed on the way past:** `docs/SAVE_BUTTONS.md` was STALE, describing the old persistent
green button. ActionForm has flashed green for about two seconds and reverted since Phase 8.

**Known and accepted:** the gate is a commercial lock on a customer's own data, not a security
boundary. A hand crafted POST to a server action by the lapsed company's own Admin is out of
scope; the UI, the pages and the exports are all closed.

## Migrations

**0152**: `company_name_key()` immutable + generated `name_key` on companies AND trial_requests
(ONE definition, never re-implemented in TypeScript); companies trial columns + two PARTIAL unique
indexes; trial_requests.company_id and match indexes; `provision_company()` doing everything in
ONE transaction, SECURITY DEFINER, guarded by is_platform_admin(), execute revoked from public and
anon.

**0153 fixed two defects in 0152**, both caught by the pre-push diff review:
1. **The override could never have worked.** The checks were skipped on a reason, but the partial
   unique indexes are unconditional and the insert still claimed the keys, so Provision anyway
   would have hit 23505 and rolled the company back. Fix: an override does NOT re-claim the keys,
   so the first company keeps ownership and a third attempt is still blocked.
2. **Typing 0 in the trial days box voided the one trial per address rule.** Ownership was written
   only `when v_days > 0`. Ownership records WHO the company was granted to, not whether a clock
   is running, so it no longer depends on the days.

The two trial indexes are PARTIAL. A partial unique index cannot be used by ON CONFLICT (42P10).

## Still to build

1. The Pro price fix below (Phil's half is in Stripe).
2. Later: the auto approve switch for requests where no flag fired.

## BLOCKER: the Pro price in Stripe is wrong

Phil confirmed 2026-07-29 that **Stripe pricing was never changed when the tiers changed**. Stripe
still holds Business £49, Pro £99, Enterprise £199, while the public pricing page promises Pro at
**£69**. A Company Admin pressing Subscribe on Pro today is charged £99 against a public promise
of £69. That is the actual charge, not a display bug; nobody has hit it only because nobody has
subscribed. TIER_BASE_PENCE agrees with Stripe at 9900, so Settings > Billing also says £99 and
the founder MRR figures are inflated by £30 per Pro company. Stripe Prices are immutable, so the
fix is a NEW £69 recurring GBP Price on the Pro product, STRIPE_PRICE_PRO repointed in Vercel, the
£5 seat / £7.50 branch / £10 AI top up prices confirmed at the same time, then TIER_BASE_PENCE.pro
to 6900. **This now matters more than before: the trial gate makes Subscribe the way out of a
lapse, so the first person to press it is a lapsed customer being overcharged.**

## Also verified in code, not notes

Carer logins really are free: `NON_BILLABLE_ROLES = ["platform_admin", "staff"]`,
`getActiveSeatCount` filters on it before the Stripe quantity, and 0131 rewrote the
`company_active_user_count` SQL to match. The claim in five places on the public site is safe.

Related: [the-list](the-list.md) [phase7-decisions](phase7-decisions.md) [tracking-drift](../process/tracking-drift.md) [staff-logins](staff-logins.md)
[save-button-behaviour](save-button-behaviour.md) `cowork-sandbox-limits` (not carried over)
