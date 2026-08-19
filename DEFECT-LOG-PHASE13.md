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

## DEF-003 — A company created through the founder console has no regulator  ·  PROVEN

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

## DEF-004 — A deleted company still prints a monthly charge  ·  PROVEN

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

## DEF-005 — A brand-new company cannot add its first person  ·  PROVEN

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

## DEF-006 — Support mode can create records but cannot complete a check, and says so badly  ·  PROVEN

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

## DEF-007 — Purging a company ends on a 404  ·  PROVEN

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

---

# Fixes shipped 2026-08-19 (evening)

**DEF-003 — regulator.** Required on **Create a company** (CIW Wales / CQC England, with no
default: defaulting it would silently measure a Welsh provider against CQC's key questions and
look like a working product until an inspector read the report). Refused server-side as well as
in the form. The founder company page now **states the regulator** — "not set" in red when it is
missing — and carries a control to change it, with an audit row (`company.regulator_changed`).
Chosen founder-only, not a customer setting (Phil, 2026-08-19): it decides what every readiness
figure and statutory report on that tenant is measured against.

*Note:* Bevan Care Ltd still has no regulator. It is a test company, and the new control is now
the way to set it.

**DEF-005 — the first person.** The rule stands, because Phil's onboarding order is the right one:
the first Admin accepts, they set up the office team, then people and service users. What changed
is the dead end. When there is nobody to pick, the Line manager field is no longer a required
empty dropdown — it explains that the office team has to be invited first and links to Settings,
Users, exactly as Supervisors already does. The server refusal names the same fix rather than
returning a raw constraint error. **Verified in the code that this window is narrow**: the
dropdown lists Admins, Responsible Individual, Registered Manager, managers and supervisors, so
it fills as soon as the first Admin accepts.

**DEF-006 — support mode.** Complete buttons no longer render while managing as a company (People
records, Service User records, the reviews panel and the DBS / Right to Work / Probation "Record"
buttons, which write evidence too). All three complete routes refuse server-side with a shared
`SupportModeNotice` that says why: evidence is signed by whoever completed it and has to be
somebody who works there, or an inspector is told a member of staff did something they never did.

**DEF-004 — the contradictory monthly figure.** A company with no live subscription now reads
"Monthly: nothing charged", with the tier price shown greyed as what they *would* pay if they
subscribed. The live-subscription test matches the MRR tile exactly (`active`, `trialing`,
`past_due`), so the row and the page total can no longer disagree.

**ALL FIVE PROVEN LIVE, 2026-08-19**, on a throwaway company (`Regulator Test Ltd`, created,
exercised and purged inside twenty minutes):

- **DEF-003**: the form refused to create without a regulator; created with CIW and the row came
  out `regulator = 'ciw'`; the company page printed **"Regulator: CIW"**; changing it to CQC and
  back both saved and both wrote audit rows (*"Set regulator from ciw to cqc"*, *"Set regulator
  from cqc to ciw"*).
- **DEF-005**: Add a person on the fresh tenant showed the explanation and the Settings link where
  the dead required dropdown used to be.
- **DEF-006**: on a service user added in support mode, **no Complete button rendered anywhere** —
  not on the check tiles, not on the Care Plan Review panel — and typing the complete URL directly
  produced the "Support mode cannot complete a check" page instead of the form.
- **DEF-004**: every row on the Companies list now reads *"Monthly: nothing charged (£49.00/mo if
  they subscribe)"*, including the deleted Acme, and agrees with the £0.00/mo page total.
- **DEF-007**: Delete then **Purge now** landed on the **Companies list** with the company gone.
  **No 404.** The database confirms the erasure: company row, files, service users and audit rows
  all zero, `purge_error` null.

One thing the run could not exercise through the UI: the **server-side** regulator refusal. The
browser's own `required` stops the form first, so the guard behind it is proved by unit-level
reasoning only. That is the right order (both should exist), but it is worth saying out loud.

---

## DEF-008 — A company that never subscribed is told its subscription was cancelled  ·  FIXED (not yet re-proven)

**Found 2026-08-19** while proving the others. `Regulator Test Ltd` never had a subscription — no
card, no Stripe customer, nothing. Deleting it produced: *"Nobody at Regulator Test Ltd can sign
in, **and their subscription was cancelled when they were deleted**"*, and then *"Restoring them
brings the records back; it does not bring the subscription back."*

Both sentences are about a subscription that never existed. Small, and exactly the class this
project keeps finding: **a screen stating a fact it does not have.** On a real customer it is
worse than untidy — a founder reading it would believe billing had been settled when nothing was
ever billed.

**Fix:** the panel is told whether there was a subscription, and says only what is true of that
company. No subscription: *"Nobody at X can sign in."* and *"Restoring them brings the records
back exactly as they were."*

---

## DEF-009 — An invite silently moves an account out of another company  ·  OPEN (low, but decide before real customers)

**Found 2026-08-19**, checking whether Phil can use his Thistle address as Thistle's first Admin.

`phil@thistlecarewales.co.uk` already exists as an auth user with a profile — invited into **Acme**
as a manager on 29 July, never accepted, never signed in. Acme is now deleted.

`createAndSendInvite` guards against poaching somebody from another company **only when their
status is `active`**:

```
existing.company_id !== p.companyId && existing.status === "active"  →  refused
```

A profile that is merely **`invited`** elsewhere falls straight through, and the promotion a few
lines later **overwrites `company_id` and `role`** — so inviting that address into a second
company silently moves the account, and the first company's pending invite becomes a link into a
company that person is no longer part of. Nobody is told, at either end.

**For Thistle this is harmless and actually convenient**: the dormant Acme invite gets pulled
across to where it belongs. **For real customers it is not**: two agencies inviting the same
peripatetic manager, or a customer inviting an address a rival tenant has pending, would move an
account with no warning and no audit line saying which company it came from.

**Options when it is picked up:** refuse the way an active member is refused; or allow it and say
so plainly (to the inviter, and in the audit row), which is probably right for a sector where
people genuinely do move between agencies.

**Not fixed** — logged deliberately rather than fixed mid-provisioning.

---

## DEF-010 — A user who has run an on-call shift or logged an incident can never be deleted  ·  FIXED for the purge / OPEN for Settings, Users

**Found 2026-08-19**, when purging Acme for real **failed** — and failed safely, refusing to
half-erase the company:

> 2 login(s) could not be deleted, so the company has been left standing rather than half erased:
> ppdavies@gmail.com: {}; ficklephil@me.com: {}

Diagnosed by attempting the delete inside a rolled-back transaction, which named it properly:

```
ERROR: 23514: This shift has been finalised and can no longer be edited.
CONTEXT: PL/pgSQL function on_call_log_finalised_is_locked() line 35
SQL statement "UPDATE ONLY public.on_call_logs SET created_by = NULL WHERE ... = created_by"
```

**Deleting an auth user is not one row.** Around forty tables carry a user reference with
`ON DELETE SET NULL`, so Postgres UPDATES every one of them. An update to a **finalised** on-call
log is refused by the lock trigger from migration 0205, whose allowlist of changeable columns
does not include `created_by`. Four more references are **NO ACTION** and block the delete
outright: `incidents.created_by`, `whistleblowing_disclosures.created_by`, and both
`retention_hold_set_by` columns.

**This is not only a purge problem.** The same thing happens in **Settings → Users → delete a
user**: any manager who has ever finalised an on-call shift, or logged an incident, cannot be
deleted by their own company — and the error they would see is a sentence about a shift.

**Fixed for the purge** by reordering it: the company row (and the four SET-NULL-scoped tables)
now go BEFORE the logins, so the CASCADE removes everything pointing at those users first. The
error reporting was fixed too — an auth error with an empty message printed as `{}`, which told
the reader nothing.

**NOT fixed, and it needs a decision:**

1. The **0205 lock trigger** should tolerate a user reference being NULLed on a finalised log —
   that is not somebody editing a shift, it is an account being removed.
2. The four **NO ACTION** references should probably become SET NULL, with one genuine question
   attached: `whistleblowing_disclosures.created_by` going NULL turns an attributed disclosure
   into an anonymous one. That may be exactly right for erasure, but it is a decision about a
   safeguarding record, not a schema tidy-up.

---

## DEF-011 — A refusal claimed nothing had been erased, when files and logins were already gone  ·  FIXED

**Found 2026-08-19**, reading the counts after Acme was finally purged.

The failed first attempt (DEF-010) reported:

> 2 login(s) could not be deleted, so **the company has been left standing rather than half
> erased**

That sentence was **not true**. By the time it printed, the purge had already deleted **all 53
storage objects** and **nine of the eleven logins**. It aborted before touching any rows, which
is what the guard was for — but storage and auth deletions are not transactional and cannot be
taken back. The proof is in the second run's counts: `storage:evidence: 0` and `logins: 2`, on a
company that had 53 files and 11 logins an hour earlier.

**Why it matters more than the wording suggests:** a founder reading "left standing rather than
half erased" would reasonably conclude the company was intact and try something else — or tell a
customer their data was untouched. It is the same class as every other defect this phase has
found: **a screen stating something it does not know.**

**Fix:** every abort inside the purge now reports what has ALREADY gone and cannot be recovered,
and only claims "no rows were deleted" — which is the one part that is actually true, because the
row deletions all happen after the irreversible steps.

**Acme is now fully purged** (2026-08-19): company row, 53 files, 42 people, 24 service users,
346 evidence records, 1,084 audit rows, 19 Stripe events and all 11 logins — gone, with
`purge_error` null and the tombstone holding the record. `phil@thistlecarewales.co.uk` went with
it, so that address is now completely free for Thistle.

---

## DEF-012 — A company cannot be renamed  ·  FIXED (not yet proven)

**Found 2026-08-19**, when Thistle Care LTD was created with the wrong capitalisation and there
was nowhere in the product to correct it.

`companies.name` was written at creation and by nothing else — no founder control, no customer
setting. That name prints on **every evidence PDF**, on the **statutory reports**, and through the
Stripe customer on **every invoice and card statement**. Care agencies rebrand, merge and get
bought; a name that can only be changed by hand-written SQL is a gap, not a nicety.

It also has form: **Acme spent a month invoicing as "Thistle Care Wales"** after being renamed,
because nothing pushed the new name to Stripe.

**Fix:** a Company name control on the founder company page, with an audit row
(`company.renamed`, recording from and to), which **also updates the Stripe customer immediately**
rather than waiting for the next billing touch. The **slug is deliberately left alone** — it is in
URLs people have bookmarked and in nothing a customer reads.

---

## DEF-013 — Deleting or purging a company leaves the founder still "managing as" it  ·  OPEN (low)

**Found 2026-08-19**, immediately after purging Invite Test Ltd.

Support mode is held in a signed cookie carrying a company id. Purging that company erased the
row, but the cookie stayed — so the founder went on browsing with the support banner up, now
reading **"Managing as this company"** instead of a name, because there is no company left to
name. Every page continued to render as a tenant that does not exist.

Nothing dangerous follows (RLS has nothing to return, and the founder is the only person who can
hold the cookie), but it is a screen in a state that cannot be true, and the wording gives it
away rather than the product noticing.

**Fix:** clear the manage-as cookie when the company it points at is deleted or purged, and have
`applyManageAs` drop a cookie whose company no longer exists rather than shadowing the founder
into a ghost tenant. **Not fixed** — logged.

---

## DEF-014 — The invite form forced a branch on roles that run every branch, and the two Line manager lists disagreed  ·  FIXED (not yet proven)

**Raised by Phil 2026-08-19** while inviting Thistle's office team: *"for a registered manager some
companies will have them run all branches, and for responsible individual they are kind of a
passive role, see all type thing but no one reports into them."*

Both were right, and checking the code found a third thing neither of us had said out loud.

**1. The branch field contradicted the permissions.** `is_company_wide` covers Company Admin,
**Responsible Individual and Registered Manager** — all three reach every branch in RLS whatever
is picked. The invite form nevertheless **required** a branch and wrote it as their primary
branch, so screens showed an RI as belonging to Cardiff and an RM who runs the lot as belonging
to one site. Only `company_admin` was excluded from the `user_branches` write; the two Registered
roles were not.

**2. The two Line manager lists disagreed with each other.** Add a person filtered to `manager`
and `company_admin` — so a **Registered Manager could not be chosen as anybody's line manager**.
The Edit form on the record offered **every** supervisory user — so the **RI could be**. One
carer could therefore have a line manager the other screen would never have offered.

**Fix:** one shared rule in `lib/people/roles.ts` (pure, 5 tests): a line manager is a Company
Admin, a **Registered Manager** or a Branch Manager — never the **RI** (nobody reports into them)
and never a Supervisor (assigned separately, further down the same form). Both screens use it.

**Corrected the same evening, by Phil:** *"Registered Manager may not manage all branches so all
should not be default for this role."* CIW registers a manager against a service, and plenty of
providers run one RM per registered service. So the no-branch list is **not** the company-wide
list: only the **Company Admin and the Responsible Individual** skip the branch picker. A
**Registered Manager picks a branch like anybody else**, and it is recorded as their base.

**Say this out loud, because the form now implies something the database does not enforce:** an RM
is still **company wide in RLS** (`is_company_wide`), so the branch chosen for them is their base,
not a limit on what they can reach. Genuinely scoping an RM to one service is a permissions
change — `is_company_wide`, the `manage-scope` transcription beside it, the notification recipient
normalisation and the readiness scope all read that rule — and it is NOT done. **Open question for
Phil.**

The invite form shows **"All branches"** for the Admin and the RI instead of a required picker,
the action refuses to trust a branch posted with those two, and no `user_branches` row is written
for them.

**A trap avoided while fixing it:** the Edit form's "Current line manager (no longer listed)"
fallback compared against the UNFILTERED list. Narrowing eligibility would have dropped an
existing RI-as-manager off the options — and this select's own history is that a value missing
from its options silently saves as **None**. It now compares against the filtered list.

**The RI keeps everything else**: sees every branch, conducts absence meetings, is bookable on the
Planner, authors the Reg 73 visit report.
