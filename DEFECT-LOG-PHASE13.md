# Phase 13 — Operation Thistle: defect log

Every defect real use exposes, logged as it happens. The rule for this phase (Phil,
2026-08-18): **fix the PRODUCT, not the tenant.** No Thistle special-casing, no hand-patched
rows — if something can only be put right with hand-written SQL, the defect is in the product.

And the standing rule for judging a fix: **look at the artefact, not the code.** Nothing moves
to PROVEN on the strength of `tsc`, a passing test or a green deploy. It moves when the screen,
the row, the file or the third party's own dashboard has been looked at.

| Status | Meaning |
|---|---|
| OPEN | Found, not yet fixed |
| FIXED | Code changed and deployed, NOT yet proven on the artefact |
| PROVEN | Verified on the real screen / row / file / Stripe dashboard |

---

## DEF-001 — "Suspend" and "Archive" did nothing at all  ·  PROVEN

**Found** 2026-08-18, reading the guards while designing company deletion.

`companies.status` was written by the founder console (`setCompanyStatus`), printed as a pill on
two screens, and **read by no guard anywhere in the product**. `requireCompany` checked the
user's own profile status and the trial clock and nothing else. So suspending a company moved a
word on a screen: every one of its users carried on signing in and working exactly as before.

Severity is higher than it looks. Suspension is the lever you pull when a customer stops paying,
or when something has gone wrong and access needs to stop — and the founder would have believed
it had stopped. A control that says it cuts off access and does not is worse than no control.

**Fix:** `companyIsLocked` (pure, unit tested, `lib/companies/deletion.ts`) →
`isCompanyLocked` (`lib/billing/trial-gate.ts`) → checked in `requireCompany` **before** the
trial gate, because a shut company is shut whether or not its trial has time left. A read that
fails reads as `active`, so a database blip can never lock a working company out. Locked users
land on `/company-closed`.

**PROVEN LIVE 2026-08-19**, on a real user's screen and in both directions. Chrome was signed in
as **Bev Admin** (Bevan Care Ltd). Bevan was set to `suspended` → reloading `/people` landed her
on **"This account is closed"**, mid-session, without signing out. Bevan set back to `active` →
reload → straight back into her Compliance register. Before today the first half would have done
nothing at all. Bevan was left exactly as it was found.

---

## DEF-002 — A company could not be deleted, anywhere  ·  PROVEN (both halves)

**Found** 2026-08-18, when Phil asked for the two test companies to be removed.

There was no delete path in the product at all — not in the founder console, not in settings.
The only way to remove a company was hand-written SQL, which by this phase's governing rule
makes it a product gap rather than a data job. It is also a **UK GDPR gap**: a customer who
leaves, or who exercises the right to erasure, has to be erasable through the product.

Worse, a plain `DELETE FROM companies` would not have erased them. Sixty-two tables CASCADE, but
**five do not — `profiles`, `audit_log`, `sms_opt_outs`, `stripe_events` and `trial_requests` all
SET NULL** — so the logins, the staff names and emails in the audit trail, the mobile numbers on
the STOP list and the Stripe payloads would all have been left floating with nothing to say
whose they were. The **53 storage objects** (evidence PDFs, signed policies, absence policies)
would have survived untouched, exactly like the "anonymised record that kept a full PDF of
itself" found in August.

**Proof that the orphan hazard is real, not theoretical:** `ppdavies+bcctest@gmail.com` is a live
profile in the database with `company_id` NULL and role `team_member` — left behind by an
earlier removal.

**Fix (migration 0209 + `lib/companies/`):** a two-stage delete agreed by popup.

1. **Delete** — the company is locked out immediately (DEF-001's gate), any live Stripe
   subscription is cancelled **immediately, no refund, no proration**
   (`cancelSubscriptionNow`), and a **tombstone** row is written to `company_deletions`
   recording who deleted it, when, what it held and what happened to the subscription. The
   tombstone deliberately has **no foreign key** to `companies`: a record that cascades away
   with the thing it records is not a record.
2. **Purge** — 30 days later (nightly, on the 02:30 cron) or on demand via **Purge now**: the
   storage objects go first *while the rows that name them still exist*, then the auth users,
   then the five SET NULL tables, then the company itself. It then **counts what is left** —
   rows and bucket objects — and writes that onto the tombstone. A leftover is reported as an
   error, and the cron answers **500**, because "nothing was due" and "this has been broken for
   months" must never look the same from the outside.

Restore is available for the whole grace period; it says plainly that the subscription does not
come back.

**PROVEN LIVE 2026-08-19 — the DELETE half, twice, once by Claude and once by Phil.**

- The panel refuses to arm until the typed name matches; the button sits dead grey and then turns
  red. Deleting wrote `status = deleted`, `purge_after = 18 September 2026`, and a tombstone
  carrying the full inventory (42 people · 24 service users · 346 evidence · 358 checks · 13
  invoices · 4 branches · 11 logins · 1,083 audit rows).
- **Stripe's own dashboard read "Cancelled", ended 19 Aug 21:18** — the third party's screen, not
  our row. The customer still reads "Acme Care Company", so the August rename fix held.
- **Restore was exercised for real** (Claude deleted it in error while Phil had asked to be
  walked through it; the grace period is exactly what made that survivable). Everything came
  back — 42 people, 346 evidence, 53 files, 11 logins — and the tombstone was marked restored so
  it can never trigger a purge. The audit trail reads Deleted → Restored → Subscription
  cancelled → Deleted, which is what an audit trail is for.

**THE PURGE HALF PROVEN LIVE 2026-08-19, on a throwaway company built for the purpose.**

`Purge Test Ltd` was created through the founder console, its Admin invite was accepted for real
(branded email → set password), a service user was added, and a **Setup check was completed on a
phone with a finger-drawn signature**. Opening the evidence PDF then wrote a **9,284-byte file two
folders deep** in the private bucket (`<company>/<evidence>/render/evidence.pdf`) — deliberately
the nested case a naive purge would miss.

Phil then pressed Delete, then **Purge now**. Thirteen seconds later, checked directly against the
database and the storage table:

| What | Before | After |
|---|---|---|
| Company row | 1 | **0** |
| Files in the bucket | 1 (nested) | **0** |
| Profiles | 1 | **0** |
| `auth.users` login | 1 | **0** |
| Service users / evidence / forms / branches / audit rows | 1 / 1 / 20 / 2 / 13 | **0 / 0 / 0 / 0 / 0** |

The tombstone survived with both sets of figures — what the company held, and what the purge
actually removed (`{logins: 1, storage:evidence: 1, audit_log: 14, company: 1, stray_profiles: 0}`)
— and `purge_error` is null, meaning the post-purge recount found nothing left behind.

**Acme is still deleted-not-purged**, due to be erased by the nightly cron on 18 September. The
cron path (as opposed to the button) is therefore still unproven, but it calls the same function
with `by: "cron"`. Phil chose (2026-08-19) to let the 30-day clock
run rather than press Purge now, so the erasure code is deployed and unexercised, and is next due
to run **unattended, on the 02:30 cron, on 18 September 2026**. Nothing proves the storage purge,
the auth-user deletion or the leftover count until then. **Prove it before that date on a
throwaway company** (create one, delete it, Purge now, then read the bucket prefix, `auth.users`
and the tombstone's `purge_counts`), or the first real run is an unattended one on a company
holding 346 evidence records.

---

## DEF-003 — A company created through the founder console has no regulator  ·  CONFIRMED (Thistle blocker)

**Spotted** 2026-08-18 in the data, not yet proven on the screen.

`Bevan Care Ltd`, created through the founder console on 17 Aug, has `regulator` NULL and
`framework_enabled` false. A UK care company answers to CQC or CIW; a tenant that states neither
cannot have its inspection framework, and several screens key off the regulator (the dashboard
score once defaulted to the wrong one, which is already a fixed defect).

**CONFIRMED on the screen 2026-08-19**, by creating a company the way a customer would be created.
The **Create a company** form asks for name, slug, tier, first branch and the first Admin. **There
is no regulator field on it.** "Purge Test Ltd" came out of it with `regulator` NULL, exactly like
Bevan.

**And it cannot be set anywhere afterwards.** `companies.regulator` is READ in the dashboard
compliance score, Inspection Readiness, Reg 73, Reg 80, the incidents screen and the privacy
notice — and **written by nothing in the application**: not the create form, not Settings, not the
founder company page. Acme reads `ciw` only because a migration set it by hand.

**Why this is a Thistle blocker.** Thistle is a Welsh provider answering to CIW. Provisioned
today it would be a company the product believes has no regulator, and the only way to correct it
would be hand-written SQL against one tenant's row — which this phase's governing rule defines as
a defect, not a fix. It also has form: the dashboard score once defaulted to CQC while everything
else defaulted to CIW, and that was a real defect fixed in July.

**Fix:** regulator belongs on the Create a company form (required, CQC or CIW — there is no third
answer for a UK care provider), and editable afterwards by the founder. Consider the same
question for `framework_enabled`, which is also false on every company but Acme.

---

## DEF-004 — A deleted company still prints a monthly charge  ·  OPEN

**Found** 2026-08-19 on the founder Companies list, immediately after deleting Acme.

Acme's row reads **"Cancelled · Monthly: £76.50/mo"** while carrying a red `deleted` pill. The
Committed monthly revenue figure at the top of the page correctly says £0.00/mo, so the total is
right and the row contradicts it. A row that quotes a monthly charge for a company that is gone,
next to a pill saying it is gone, is the kind of number somebody repeats in a meeting.

Bevan shows the same shape from the other direction — "No subscription · Monthly: £49.00/mo" —
so the figure is really "what this tier would cost", printed as though it were what they pay.

**Fix:** the row should show what is actually being charged, or nothing at all, for any company
without a live subscription. Not fixed mid-flow; logged here.

---

## DEF-005 — A brand-new company cannot add its first person  ·  OPEN

**Found** 2026-08-19, doing the first thing any new customer does.

On **Add a person**, "Line manager" is a **required** field whose dropdown is populated from the
company's own users. On a company created minutes ago there are none — the first Admin has been
invited but has not accepted — so the dropdown contains only "Please choose", and pressing **Add
person** produces the browser's own bubble, *"Please select an item in the list"*. There is no way
through it. Everything else on the form was filled correctly.

So the true sequence is: create company → Admin accepts the invite → *then* staff can be added.
That may be a perfectly reasonable rule, but **nothing anywhere says it**, and the first thing a
new customer will try is to put their staff in. What they meet is a form that refuses with a
browser tooltip and no explanation.

**Fix (either is defensible, one of them is required):** allow the first person to be added with
no line manager while the company has no eligible users, or say so on the form — an empty state on
the Line manager field explaining that somebody has to accept their invite first, with a link to
Settings > Users. What must not stand is a required dropdown with nothing in it.

**Watch for the same shape elsewhere:** Supervisors on that form already say "No supervisors in
this company yet" and carry on, which is exactly the treatment Line manager needs.

---

## DEF-006 — Support mode can create records but cannot complete a check, and says so badly  ·  OPEN

**Found** 2026-08-19, managing as Purge Test Ltd from the founder console.

As the founder in support mode: adding a service user **worked**. Opening that service user's
Setup check, filling it in and pressing **Complete and save evidence** was refused with a red
**"Not a member of this company"** under the button.

**The refusal itself may well be right** — evidence is a signed compliance record, and a record
signed by the founder impersonating a manager is arguably worse than no record. But three things
are wrong with how it lands:

1. The check tiles offer a **Complete** button that support mode can never use.
2. The form fills in, submits, and only then refuses — after the work.
3. **"Not a member of this company" is not true from the reader's point of view.** The banner at
   the top of that very page says "Managing as Purge Test Ltd". The message needs to name the real
   rule: evidence must be completed by somebody who works there.

Same shape as the Supervision 4 dead end fixed in August: a form that fills, submits and refuses
with nothing to act on. Either hide Complete in support mode, or say plainly why it is refused.

---

## DEF-007 — Purging a company ends on a 404  ·  FIXED (not yet re-proven)

**Found 2026-08-19 by Phil, in the same press that proved DEF-002.** Everything worked — the
company, its file, its login and its records were all correctly erased in thirteen seconds — and
what he saw was **"404 page not found"**.

The cause: the button lives on `/founder/companies/[id]`. The action deletes that company, then
`revalidatePath` re-rendered that very route, which correctly called `notFound()` for a company
that no longer exists. The client-side `redirectTo` never got a chance, because the current route
has to render once before the client navigates.

**This is the failure mode this project keeps meeting from the other direction**: the code was
right, the data was right, the database proved every row had gone — and the screen told the
founder the product was broken. A 404 after an irreversible action is also the worst possible
moment for one, because the honest reading is "did that work?".

**Fix:** revalidate the LIST, never the dead page, and leave by a server-side `redirect()` to
`/founder/companies` instead of returning `redirectTo`. A redirect with no query string is safe
(the Next 15 hooks bug this codebase has already paid for is specific to query strings).

**To re-prove:** purge one more throwaway company and confirm it lands on the Companies list with
the company gone, no 404.
