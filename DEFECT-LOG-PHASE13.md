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

**Refined twice more, same evening (Phil): "for RM there should be an option for all branches but
not default", then "have all branch option for all roles."** So **every role that picks a branch**
is offered **All branches** in the picker, never preselected.

**What it means depends on the role, and that difference is the whole job:**

- **Company wide (Registered Manager)** — nothing is written. They already reach every branch
  through `is_company_wide`.
- **Scoped (Branch Manager, Supervisor, On Call, Viewer)** — a `user_branches` row is written for
  **every active branch**, because for them reach IS those rows. Writing nothing would have handed
  a Branch Manager an account that could see **nothing at all** — the exact opposite of what the
  words on the form say. One row is marked primary (it drives the branch auto-fill on Add person),
  preferring an operational branch over the office team row, because that is where her people are.

**Original wording of this correction:** So the Registered Manager's branch picker now carries **All branches** as an option
sitting beside the real branches, and the picker still opens on "Choose a branch" — they pick
deliberately, one way or the other. Nobody else is offered it, and the server refuses an
`all` posted by a role that may not choose it, so a hand-crafted form cannot mint an unscoped
account.

The invite form shows a flat **"All branches"** (no picker) for the Admin and the RI, the action
refuses to trust a branch posted with those two, and no `user_branches` row is written for them —
nor for an RM who chooses All branches.

**A trap avoided while fixing it:** the Edit form's "Current line manager (no longer listed)"
fallback compared against the UNFILTERED list. Narrowing eligibility would have dropped an
existing RI-as-manager off the options — and this select's own history is that a value missing
from its options silently saves as **None**. It now compares against the filtered list.

**The RI keeps everything else**: sees every branch, conducts absence meetings, is bookable on the
Planner, authors the Reg 73 visit report.

---

## DEF-015 — A company can run over its allowance, with no subscription, and nothing ever says so  ·  FIXED (not yet proven)

**Found by Phil 2026-08-20**, doing the real thing: *"i have added 6 office team members and with
myself as admin, that is 7, so far i have not setup the subscription or had any challenge about
paying for extra seats or branches."*

Read off the database: Thistle Care Ltd, **Business** (4 users, 1 branch included), **1 active +
6 invited** billable users, **2 operational branches**, `subscription_status` **null**.

**Three separate holes, and only the third is arguably deliberate:**

1. **Nothing is said at the point of action.** The invite form takes a fifth, tenth or fiftieth
   user without a word. The figures existed on **Settings → Billing** and nowhere else, so the
   only way to learn was to open a page you had no reason to open. Branches, by contrast, already
   warned ("£7.50 per branch per month is added… tell the customer before you add one") — so half
   the product had a conscience.
2. **Nothing ever asks for a subscription.** `trial_ends_at` is NULL on a founder-created company
   (only the self-serve trial path sets it), so the lapse gate never fires. A tenant can run
   **indefinitely, free, over allowance**, and the overage is visible only to the founder.
3. **There is no seat GATE** — and there should not be. A compliance tool must never refuse to add
   the manager who has to sign something off. "We will not stop you" is right; "we will not tell
   you" was not.

**Fix:**

- `lib/billing/seat-notice.ts` — pure, 6 tests, including one named for this exact case (1 active,
  6 invited, 4 included, no subscription → *"3 extra users… £15.00 a month… billing is not set up
  yet, so nothing is being charged"*).
- **Settings → Users** carries that line above the invite form. It is careful about a distinction
  the old screens blurred: **seats are charged on ACTIVE users**, so a pending invitation is not a
  charge — the notice says what it *will* cost when accepted, not what it costs now.
- **The dashboard** shows a "Billing is not set up, and you are using N more users and N more
  branches than your plan includes" bar — **Admins only**, never in a support session, never on
  Black. A manager mid-audit is not the person to tell, and a founder-granted free tenant should
  never be asked for a card.
- The stale Settings → Branches copy ("this arrives with billing in a later phase") now states the
  real £7.50.

**Deliberately NOT done:** no seat gate, and no trial clock forced onto founder-created tenants.
Whether a provisioned company should eventually lapse if it never subscribes is a commercial
decision, not a bug fix — **open for Phil**.

---

## Trial model for founder-created companies (Phil, 2026-08-20)  ·  BUILT (not yet proven)

Not a defect — a decision, taken while looking at DEF-015. Phil: *"when founder adds a company, he
can choose the number of trial days, when an admin first logins in to a founder setup company,
they should be told it is a trial, and that payment details are required. for a trial on one
branch and 2 invites should be sent, we want them to trial the product and get a taster, if they
want to add more seats or branches, they need to sign up and commit."*

**Built:**

- **Trial days on Create a company**, default 14, 0 for none. It writes `trial_started_at` and
  `trial_ends_at` — the same single column the existing lock reads, so nothing new decides access.
- **A trial is one branch and two colleagues besides the Admin** (`lib/billing/trial-limits.ts`,
  pure, 7 tests). Enforced on the invite form (counting **accepted AND pending** — ten invitations
  that all land tomorrow would otherwise sail past the limit) and on the founder's Add a branch,
  which is where branches actually come from.
- **Told from the FIRST login**, not three days from the end: the banner now runs for the whole
  trial, saying what it covers and that payment details are needed to carry on, with "nothing is
  charged until you add them". The sharper last-three-days wording is unchanged.

**THIS IS THE ONE PLACE THE PRODUCT SAYS NO ABOUT SEATS, and it is deliberate.** Everywhere else
the rule is the opposite (DEF-015): a compliance tool must never refuse to add the manager who has
to sign something off.

**Phil ratified the principle in one line, 2026-08-20, and it is the test for anything like this
in future: "the trial is the exception because they are not a customer yet."** A customer is never
blocked from running their service properly, whatever the invoice ends up saying; somebody still
deciding is a different case, because for them the limit IS the offer.

**Every refusal names the way out**, and the moment a card is added the limits vanish and the seat
NOTICE takes over from the seat LIMIT. **Confirmed by Phil: two invites PLUS the Admin** — three
logins on a trial.

**Not applied retrospectively.** Thistle Care Ltd has no trial dates (it was created before this
existed) and is unaffected — it is the pilot and is going to subscribe for real. Existing tenants
with NULL trial dates keep behaving exactly as they did.

---

## DEF-016 — The trial seat limit counted the Admin twice  ·  FIXED (found by testing the fix that introduced it)

**Found 2026-08-20**, an hour after building the trial limits, by running them on a real throwaway
company rather than trusting the unit tests.

A fresh trial (`Trial Test Ltd`, 14 days, Admin invited and not yet accepted) refused the **second**
colleague, not the third:

> A trial includes you and 2 colleagues, and you have used all 3.

**Why:** every pending invitation ALSO has a profile row with `status = 'invited'` —
`createAndSendInvite` promotes the profile as part of sending. The call site counted profiles that
were "not disabled" (which includes `invited`) **and** pending invites, so the Admin was counted
once as a profile and once as an invitation. One seat too tight, on every trial, from the first
invite.

The pure rule was right; the caller fed it the wrong numbers — which is exactly the kind of thing
green unit tests sail straight past, and exactly why this phase judges things on the artefact.

**Fix:** count **ACTIVE** profiles only, and let pending invitations account for everyone who has
not accepted. A test now pins the case: a fresh trial with two outstanding invitations (the Admin
and one colleague) must still allow the second colleague, and refuse the third.

**Re-proved live on the artefact, 2026-08-20, on the same throwaway (`Trial Test Ltd`, 14-day
trial, Admin invited and not accepted, one colleague already invited):**

- Second colleague — **accepted**: *"Trial Colleague Two has been added. Nothing has been emailed
  — press Send invite below when you are ready."*
- Third colleague — **refused, naming the way out**: *"A trial includes you and 2 colleagues, and
  you have used all 3. Add a card to invite the rest of your team — everything you have set up so
  far stays exactly as it is."*
- Database after: exactly **3 invites** (Admin + 2 colleagues) and **3 profiles**, and **no row of
  any kind** for the refused third address. The refusal wrote nothing.

The throwaway was then deleted and purged from the founder console: `purge_error` null, 3 logins
removed, 0 leftover profiles / invites / audit rows, and the platform is back to **Thistle Care Ltd
and Bevan Care Ltd**.

---

## DEF-017 — A trial request could wait six days and nothing chased it  ·  FIXED (found by a real customer, not by testing)

**Found 2026-09-02**, on returning to the platform after ten days away.

**Livity Care Ltd** (Sean Kuuya, interested in Pro, team of 10) and **Clareege Ltd** (Ade
Odumosu) both asked for a trial through the website on **27 August**. On 2 September both were
still `status = 'new'`, and Phil had received nothing at phil.davies@outlook.com.

**This is the worst defect of the phase so far**, and not because of the code. Everything else in
this log was found by testing. This one was found by two real care companies trying to hand over
money and getting silence for six days.

**What was actually wrong.** The alert email was not missing — `submitTrialRequest` has emailed
the platform admin since it was written. It was **fire and forget**:

- nothing recorded that the alert left,
- nothing recorded why it did not,
- nothing ever tried again.

So the one event on this platform that costs real money when it is late was the only one with no
proof of delivery and no chase. The product chases a registered manager about an overdue
supervision every single day without fail; it was not chasing its own founder about a customer.
Whether that particular send was rejected by Resend or filed as junk by Outlook is still unknown —
**and being unknown is the defect**.

**The fix, in four parts (migration 0211):**

1. **The attempt is a fact on the row.** `founder_alerted_at`, `founder_alert_error`,
   `founder_chased_at`, `founder_chase_count`. A send that fails writes the provider's own words.
   A deployment with no email configured, or no platform admin with an address, records exactly
   that instead of passing as a quiet success.
2. **The console never claims delivery it cannot prove.** No timestamp means it says *"No alert
   recorded — you may never have been told about this one"*, in amber, on the request itself.
   The three requests that predate this say so explicitly rather than leaving a NULL a future
   reader could mistake for "never attempted".
3. **A daily chase** (`/api/cron/trial-chase`, 07:00 London via the same double-schedule gate the
   digest uses). One digest email while anything is still New, wording that gets blunter with
   age, and it carries the delivery state of the original alert so a first email that never
   arrived is visible rather than repeated. It only stamps when something actually left — a chase
   that failed to send is tried again tomorrow, which is the precise mistake being fixed.
   Marking a request Contacted, Provisioned or Declined stops it, and every chase says so.
4. **Waiting time on screen.** "Received 27 Aug" reads identically on day one and day six. Each
   New request now carries a pill — neutral, amber past 4 hours, red past 24 — and the founder
   console tile names the oldest wait.

`lib/founder/trial-alerts.ts`, pure, 10 tests. The one that matters: **an unrecorded alert is
never presented as delivered.**

**Still to confirm on the artefact:** whether Resend accepted the 27 August send at all. The
chase itself is the test — the first run emails phil.davies@outlook.com, and if that lands, the
provider path works and the original was either rejected or junked.

**PROVED ON THE ARTEFACT, 2026-09-03, unattended and without anybody pressing anything.**

The 06:00 UTC run (07:00 London) sent the chase; the 07:00 UTC run skipped it as already chased
today, which is the double-schedule gate working. Phil received the email. In the database all
three requests carry `founder_chased_at = 2026-09-03 06:01:20+00` and `founder_chase_count = 1`.

**And it answered the open question.** Resend reaches phil.davies@outlook.com — the same address,
the same sending domain, the same provider path. So the 27 August alert was either rejected by
Resend or filed as junk by Outlook; the mail path itself is sound. That is worth knowing before
the first paying customer depends on an email from this product, and it is only knowable because
the delivery outcome is now recorded rather than hoped for.

DEF-017 is **CLOSED**.

---

## DEF-018 — A received email lost its body, and said nothing about it  ·  PARTLY FIXED (needs an API key change)

**Found 2026-09-03**, on the first real message through the new founder inbox — an hour after
building it.

The message stored perfectly: sender, subject, message id, and a reply from the console that
landed in the right thread in Outlook. **`body_text` and `body_html` were both null.**

**Cause: `RESEND_API_KEY` has "Sending access".** Reading a received email needs **Full access**.
The inbound webhook carries metadata only — no body, no headers — so the content always arrives
on a second call, and that call was refused.

**But the permission is not the defect.** The defect is that a refused fetch left a silent NULL
that reads exactly like an email somebody sent with only a subject line. Phil said as much
himself: *"i didnt put a content in the message just a subject so it might be my fault."* He was
being fair to the software, and the software had given him no way to tell. He then sent a second
message WITH content; it arrived at 13:04 and stored with a null body too, which settled it.

**This is DEF-017 repeating inside the feature built to fix DEF-017.** An attempt whose outcome
is not recorded is an attempt nobody can trust. I wrote `console.error` and returned null — a log
line nobody reads is not a record.

**Fixed in the product (migration 0213):**

- `body_error` and `body_fetched_at` on `founder_emails`. A failure stores the provider's own
  words, and a 401 or 403 appends the actual fix: *"the API key needs Full access, not Sending
  access, to read received mail."*
- The screen distinguishes three states that used to look identical: text we have, **content we
  could not collect** (in amber, with the reason), and a genuinely empty message.
- **A "Collect the content" button** on any message missing its text, and a nightly backfill on
  the retention cron. Both matter because Resend keeps received mail for **30 days on every plan**
  — a body never collected stops existing.

**Still needed from Phil, and only he can do it:** create a Full access API key and replace
`RESEND_API_KEY` in Vercel. Until then bodies keep failing — but now they say so.

---

## DEF-019 — Every write in the founder inbox failed, and blamed the message  ·  FIXED

**Found 2026-09-04** by Phil pressing Delete: *"when i am in inbox and press delete, i get a red
message, saying it could not be found."*

Nothing was missing. `founder_emails` (0212) was created with a SELECT policy and deliberately
nothing else — a customer's email must not be editable by any tenant, and the only writer was
meant to be the platform itself. Then I wrote the actions against the ordinary user client. Every
update matched zero rows: **Delete, Restore, Mark as Read, Erase and Empty Deleted, all of them**,
not just the one he pressed.

**Fixed** by using the service-role client in those five actions, after `requirePlatformAdmin()`,
which is exactly how the company purge works. The guard is then the whole of the protection, and
that is the design — not a shortcut around RLS.

**The one thing that worked properly was the error handling.** Because every action checks the
affected row count, an RLS no-op surfaced as a refusal on screen instead of a button that flashed
"Saved" and did nothing. The message was wrong — "could not be found" described the symptom, not
the cause — but the failure was visible, which is the only reason it was found in a minute rather
than the first time a real customer email needed deleting.

**The pattern worth naming, because it is now three for three today:** DEF-017 (an unrecorded
send), DEF-018 (an unrecorded fetch) and this one are all the same shape — an operation whose
outcome was assumed rather than checked. The cure is the same each time: report what actually
happened to the row.


---

## DEF-020 — A "use server" file exported three constants, and Vercel would not build  ·  FIXED

**Found 2026-09-19**, Phil: *"thats red in vercel."*

`lib/incidents/report-actions.ts` is a `"use server"` module, and it exported the three incident
form keys alongside its actions. Such a module may export async functions and nothing else. `tsc`
does not know that rule, so the type check passed locally and the BUILD failed. The keys moved to
`lib/incidents/form-keys.ts`, which is a plain module.

**The lesson, recorded because it will happen again:** a green `npx tsc --noEmit` is not a green
build. Anything added to a `"use server"` file has to be an async function.

---

## DEF-021 — The incident report contradicted itself, and asked the reporter the office's questions  ·  FIXED

**Found 2026-09-19** by Phil filling the new form in: type of event and kind of event were two
free-standing lists, so "Accident" could be filed with "Abuse or allegation of abuse".

- The kind is now **four questions, one per type of event** (0303), each shown only for its own
  type, so the kinds on offer are the kinds that fit. `incidents.event_type` stores the type.
- **Service user** and **staff** were free text. They are type-ahead lookups now: the service user
  scoped to the branch chosen on the form, staff company-wide and **as many as were involved**
  (`incident_people`). A record_lookup field gained `multiple` and `scopeField` for this.
- Reading those lists needs the service role, deliberately and only for this form: a carer on the
  team portal can see neither register under RLS and would be handed two empty boxes.
- **Immediate action** was a field on the record nobody was asked for. It is on the form, required.
- **Notifiable** and **safeguarding** were ticks nobody was asked about. They are a "For the
  office" section: office staff must answer both, the team portal never sees them, and the server
  drops them if they are posted anyway (Phil: *"the office staff need to decide"*).

---

## DEF-022 — AI drafted investigation questions were pasted into the box as raw JSON  ·  FIXED

**Found 2026-09-19**: pressing "Draft the lines of enquiry" filled the field with `{"questions":
[{"label": ...`.

The prompt asked the model for `label`; `toAiQuestions` reads `question`. Every question was
dropped, and the fallback — *the prose still helps, so put it in the field* — pasted the JSON.
The prompt now asks for `question`, the parser accepts either, and unusable JSON returns "The
questions could not be read. Press the button again." rather than a box of braces.

---

## DEF-023 — Readiness scored the whole company against nothing at all  ·  FIXED

**Found 2026-09-19**, Phil: the dashboard said *"Nothing is mapped to score yet."*

`seed_requirement_map()` (0154) is called by `provision_company()`. The founder's **Create company**
screen does not use it: it inserts the company and seeds forms and checks itself. Every company
made that way — Thistle and Bevan — had **no mapping at all**, so the score measured nothing.

- 0304 teaches the default mapping the checks added since (Health Check, One to One, Lead the
  Leader) and tells the two Audits apart by population, backfills every company, and **seeds the
  map from a trigger** on `check_definitions` insert and on a company's regulator changing. No
  screen can leave a company unscored again.
- 0307 adds complaints and incidents as sources (CIW: complaints to Leadership and Management,
  incidents to Well-being; CQC: Responsive and Safe), scored on **how they were handled** — the
  deadlines met — never on how many there were.

---

## DEF-024 — Twelve finished Setup Visits were reported overdue on Readiness  ·  FIXED

**Found 2026-09-19** on the Readiness page: Robert Owen's setup, due 03/02/2021 and **done**
25/01/2021, was listed as outstanding, and the same for eleven others.

The daily report learnt on 2026-09-18 that a one-off with a completion is settled
(`reportableCheck`). The readiness roll-up never did. 0305 gives the RPC the same rule and
`getFrameworkItems`/`framework/ai.ts` call `reportableCheck` directly. Care and Support went from
13 overdue to 1 the moment it was applied.

---

## DEF-025 — The one compliance score was a figure nobody is ever judged on  ·  CHANGED BY DECISION

**2026-09-19.** Phil asked how CIW would score it. CIW's framework (March 2025) rates **each theme
separately, by an inspector's judgement, with no overall rating**, and has exactly one fixed rule:
an open **Priority Action Notice** makes its theme *Requires significant improvement*.

- The dashboard tile is now **CIW / CQC readiness**: each theme with our own status (On track /
  Attention / Action needed) and the reason. No averaged percentage, and a theme nothing feeds is
  not shown (Environment is not rated for a domiciliary service).
- `inspection_notices` (0306) records Priority Action Notices and Areas for Improvement against a
  theme, with the date they are due to be put right. The PAN rule is honoured exactly; an Area for
  Improvement raises a theme to Attention at most, because CIW says a theme with one can still be
  good.
- The six-month on time figure is averaged **by items that fell due**, not by check type. One late
  Medication Competency was weighing as much as 27 Care Plan Reviews.

---

## DEF-026 — The on time rate was 0% for a check that happens monthly  ·  FIXED (data)

**Found 2026-09-19**, Phil: *"There would be more than 7 spot checks done in 6 months, it would be
6 x the number of staff."* Exactly. The migration brought across **only the latest spot check per
carer**, so the engine could see 7 cycles, every one of them late, and nothing else.

The history was read off Thistle's Monday board and imported for the 13 staff in BCC — 86 dates,
each with the deadline it was measured against. Spot checks on time over six months went from 0%
to about 61%. Five missing supervisions were found the same way.

**The product gap this exposed, still to build:** the import screen only creates NEW staff. There
is no way to add history to a record that already exists, which is why this had to be done as a
data load rather than through the product.

---

## DEF-027 — A failed spot check was treated as a whole cycle done  ·  FIXED

**2026-09-19**, Phil: *"If a spot check is failed a new one should be done within 7 days."*

The failed visit counts as done — it happened — but the next one is due in a week. The rule is
written on the question itself (`retestWithin` on "Has the carer passed the spot check?", 0308),
not in code about spot checks, so it is part of the form for every company and any other form can
use it. `lib/forms/retest.ts` is the whole rule and it is unit tested.

---

## DEF-028 — A Supervisor could not add a carer, or a service user  ·  FIXED

**2026-09-21**, Phil: *"supervisor and above need to be able to add people, service users and
update training."* Training was already hers (0294). Both registers were not: `people_*` and
`service_users_*` asked `is_branch_manager` for select, insert AND update, so a Supervisor saw
only the records assigned to her and could create neither.

Adding the insert alone would have been worse than useless — she would have saved a carer and
watched the record leave her own register, because the SELECT was the narrower rule.

**0309 introduces `is_branch_lead(bid)`** — a Manager or a Supervisor assigned to that branch —
and every policy for the two registers and what hangs off them (checks, trackers, training
register, care plan, outcomes, assignments, evidence and its files, migrated history) now asks
that one question instead of naming roles. Widening or narrowing who runs a branch is one edit.

**Her reach is her own branches and not one further**, which is the same rule as before; what
changed is which roles count as running a branch. **Deliberately not widened:** invoicing,
absence, holidays, invites and the public enquiry inbox.

**In the app**, the same list had been copied into NINE page files. They now import
`REGISTER_ROLES` from `lib/auth/module-roles.ts`, and `canManageRecord` / `canManageAnything`
follow `branchScopedRole`, so the screen and the policy say the same thing about a Supervisor —
which is the whole purpose of manage-scope.ts, and the fault it was written for in the first place.

---

## DEF-029 — A new role: the Recruiter  ·  BUILT

**2026-09-21**, Phil: *"i need to create a recruiter role"*, and, asked what it may do and what it
must not see: *"same as a supervisor"*, reaching the **whole company** rather than assigned
branches. Recruiting is central; a recruiter takes a starter on for whichever branch needs them.

**Defined once, in the database.** 0310 makes `is_branch_supervisor(bid)` answer true for a
Supervisor assigned to that branch OR a **Recruiter anywhere in that branch's company**. Every
policy that already ORs it — complaints, incidents, planner, the training register, evidence, and
through `is_branch_lead` (0309) the two registers and everything under them — covers a Recruiter
without being edited. The alternative was naming one more role in some thirty policies, which is
the mistake this project has paid for twice.

**In the app**: the role is in the unions, the nav, the module ceiling (so a company can untick
departments for it in Settings, User access), the invite and role-change pickers, and
manage-scope, where she is deliberately NOT in COMPANY_WIDE — that set transcribes
`is_company_wide()`, which she is not, so a policy with no branch clause still refuses her. She
counts as a paid seat like any other active login.

**Deliberately not given, one line each if Phil wants them:** the on call rota, invoicing, the
daily digest, and being choosable as the Supervisor who conducts a carer's supervision — a
recruiter is not their supervisor.

---

## DEF-030 — Two Settings tiles asking the same question, both open at once  ·  DONE

**2026-09-21**, Phil: *"in settings we have Users and Invites then another call User Access ...
i think we should join those 2 settings together and lets have things minimised inside so its not
all open and messy."*

Users and invites and User access were the same subject from two directions: who is in the
company, and what their role opens. They are now **Settings, Users and access**, one page of
folded sections, every one closed until it is wanted, with the count on the heading so a section
says what is in it without being opened: Invite a person, Allowed email domains, Pending invites,
Active users, Team Member logins, Role access, Team portal forms.

`/settings/access` redirects rather than 404s, because it is in browser histories and bookmarks.
The fold is a plain `<details>`: no JavaScript, keyboard and screen readers behave, and the
browser's own Find on Page still opens a closed section.

**Asked for at the same time and NOT built yet:** creating a role from Settings. Phil chose "both,
in that order", so custom roles are the next piece: a company names a role, picks the built-in
role it starts from, and unticks what it must not reach. Narrowing only — a tick can never GRANT
past the built-in role, because every policy in the database names roles, and a setting that
appeared to widen one would be a lie the database would refuse.

---

## DEF-031 — A Supervisor pressing Add person: "new row violates row-level security policy"  ·  FIXED

**2026-09-21**, the first time a Supervisor used what DEF-028 gave her. Adding a carer writes TWO
rows: `people`, and a `person_trackers` row holding the DBS, right to work and probation dates.
0309 widened the registers and everything that READS off a record, and missed the two little write
helpers underneath — `can_manage_person` and `can_manage_service_user` — which still asked
`is_branch_manager`. So the insert got half way and was refused.

0311 points both helpers at `is_branch_lead`, the question everything else now asks. That also
covers person_assignments and service_user_assignments, which are written through the same two.

**The lesson, and it is the same one as DEF-023:** widening a permission means following the WHOLE
write path, not the table the screen is named after. The grep that finds them is for the helper
functions, not for the policy names.

---

## DEF-032 — Holiday and Absence ticked for a Supervisor, refused by the database  ·  FIXED

**2026-09-21**, Phil: *"They need access to this, if the boxes are checked in the access tiles
they should be able to do it. I don't want to have to keep coming back to fix things. This looks
bad when Thistle is reporting issues."*

He is right, and it was the same fault for the fourth time (DEF-023, DEF-028, DEF-031). The
ceiling in `lib/auth/module-catalogue.ts` has said for weeks that a Supervisor opens Holiday and
Absence. The policies underneath let her write only for a carer on her own CASELOAD
(`is_person_supervisor`), so recording a sickness for anybody else in her branch was refused
*after* she had filled the form in.

**0312** puts Absence and Holiday on `is_branch_lead` — Manager, Supervisor and, since 0310,
Recruiter — which is the question the two registers already ask: `absence_events`
select/insert/update, `absence_meetings` select/insert/update/delete, `can_manage_holiday`, and
`holiday_requests_select`. The caseload clauses stay, so a Supervisor keeps her own people
wherever they sit, and a meeting with Evidence against it is still never deleted.

**What deliberately did NOT move, and is ticked that way too, so the screen and the policy agree:**
Invoicing, Readiness, Reports, Whistleblowing, Settings and inviting a user. Money, the
regulator's return, and who may log in.

---

## DEF-033 — The thing that stops this being a fifth time  ·  BUILT

Four defects of one shape, every one found by a person filling in a form and being told no.
Reading the policies is how they were missed four times, so the fix is not more reading.

**`scripts/access-probe.sql`** signs in as a real Supervisor — as `authenticated`, carrying her
user id, exactly as the browser does — and TRIES each thing her tiles promise: add a person, open
a tracker on someone off her caseload, record training, book someone else's holiday, record a
sickness, book the return to work meeting, add a service user, raise a complaint, write up an
incident, send a briefing, log an out of hours call, book a Planner visit, submit a Check through
`submit_evidence`. Every attempt runs in its own exception block and a sentinel exception is
raised the moment the statement succeeds, so nothing survives: the worst it can do is bump a
sequence, and it is safe against live. It also tries three things she must NOT have — Invoicing,
Whistleblowing, inviting a user — because a probe that only ever expects "allowed" would pass with
RLS switched off altogether. A read of an empty table reports "nothing to judge by" rather than a
false pass.

**`lib/auth/access-probe-coverage.test.ts`** is the part that cannot be forgotten: add a
department to the ceiling for a branch scoped role and `npm test` fails until the probe has an
attempt for it.

**Run against Thistle, 2026-09-21.** Supervisor (Chloe): 18 judgeable attempts, all as the tiles
promise. Recruiter (Lucy): one mismatch, below.

---

## DEF-034 — A Recruiter offered on the Planner who could not be given the visit  ·  FIXED

Found by the probe rather than by Thistle, which is the point of it. The Planner's "who is doing
it" list has named Recruiters since 0310 (`CONDUCTOR_ROLES` in `lib/planner/data.ts`), and the
trigger underneath refused them: *"A task can only be given to somebody who carries checks out: an
Admin, a Registered role, a Manager or a Supervisor."* A name in a dropdown that cannot be chosen
is the same defect as a ticked box that does nothing.

**0313** adds the Recruiter to `is_company_conductor`. Phil, twice, on what a Recruiter is: *"same
as a supervisor"* — and a Supervisor conducts.

**Not changed, and not an oversight:** who may hold a formal ABSENCE meeting stays with Managers
and Admins. The screen there offers exactly who the code accepts, so nothing is promised and then
refused, and a stage meeting that can end in a warning is a Manager's to hold.

---

## DEF-035 — A company could not make a role of its own  ·  BUILT

**2026-09-21**, Phil: *"lets add the roles to users and access, called that setting tile Roles,
users and access."* The second half of what he asked for that morning ("both, in that order"):
the two Settings screens joined first, now a company naming its own role.

The Recruiter is why it had to exist. He asked for one role and it took a code change, a
migration and a deploy. Nobody outside this repo could have done it.

**WHAT A CUSTOM ROLE IS: a named narrowing of a built-in one.** A company names it, picks the
built-in role it copies, and unticks departments it must not open. The person carries the
BUILT-IN role in `profiles.role` — which is what every policy reads and what decides their branch
reach — and the custom role beside it, for its name and for what it takes away.

**WHY IT CANNOT GRANT.** Every policy in this database names roles. "Care Coordinator" is a name
the database has never heard of, so somebody carrying only that would be refused everywhere.
Narrowing needs no policy to change; widening would mean every policy reading a table instead of
naming a role — the security model rewritten, not a settings screen. Phil chose narrowing knowing
that (asked and answered, 2026-09-21), and it is written into 0314 and into
`lib/auth/custom-roles.ts` so the next person to wonder finds the answer rather than the gap.

**0314**: `company_roles` (name, the role it copies, one name per company however it is
capitalised), `company_role_modules_off` (absence means on, exactly as 0291),
`profiles.company_role_id` and `invites.company_role_id` — both ON DELETE RESTRICT — and a
trigger that refuses a pair that disagrees, so a person's screen and a person's permissions can
never come from two different places.

**The screen** is now **Roles, users and access**, with Roles as its first section, because a
role has to exist before somebody can be invited onto it. The same tile of tick boxes serves a
built-in role and a company's own, so there is one way to answer the question rather than two,
and a company's own role carries a rename and a delete underneath it.

**Three answers Phil gave, and what each one is in the code:**

- *Narrowing only* — `COPYABLE_ROLES`, and the base role's ceiling applied again server side in
  `saveCompanyRoleModules`.
- *The name shows everywhere* — `displayRoleLabel`, used on the user list, the pending invites,
  the role pill in the header and the invitation email itself. The built-in role it copies is
  shown only in Settings, in brackets, where somebody is deciding about roles rather than about
  a person.
- *Refuse to delete a role in use* — counted and named in `deleteRefusal`, and refused by the
  database as well, which is the half that cannot be forgotten.

**What is deliberately not editable:** the role a custom role copies. Changing it would change
what everybody on that role can reach, from a control that looks like a rename.

**Found while building it, and fixed in the same commit:** the user editor has offered "Team
Member" in its role list for months while the check behind it used `INVITABLE_ROLES`, which does
not contain `staff` — so saving any change to a carer's login came back *"Choose a valid role."*
An option offered and then refused is the same defect as a ticked box that does nothing
(DEF-032). `EDITABLE_ROLES` is the invitable list plus the carer login, and the editor now builds
its list from the same source the invite form uses.

**Proved against the live database**, rolled back afterwards: an Admin can make a role; the same
name twice is refused; a department can be switched off; a Supervisor's role given to a Manager
is refused by the trigger; given to a Supervisor it is allowed; and deleting a role somebody is
on is refused.

---

## DEF-036 — Add a person assumed everybody was a new starter  ·  BUILT

**2026-09-21**, Phil: *"in people we have add a person, this assumes that it is always a new
person, i want an option on the add a person page, tick it and all the column names are visible
with boxes for the required data to be added, along with the current boxes that are on add a
person, then when the add person button is pressed, it adds them to the matrix with all the data
just entered."*

Somebody joining a company that already runs has a history: a DBS from two years ago, three
supervisions, a spot check last month. Add a person could only make a new starter, so that
history had to be loaded by hand — which is literally what happened to Thistle's 86 spot checks
(DEF-024), and why "the import screen cannot add history to existing staff" has been on the list
since.

**THE TICK: "They already work here."** Hidden until it is ticked, because most adds really are
new starters and twenty empty date boxes in front of somebody adding their first carer is a worse
screen for the common case. Ticked, it shows their documents — DBS, Enhanced DBS, RTW expiry and
limits, probation end due, end actual, status and extension — and a "when was it last done" box
for every recurring check, in the order the matrix draws its columns and under the names that
company has given them. Filling it in is reading across a row of their own register.

**Supervisions are asked one at a time**, because that is what a supervision cycle is: three
deadlines in a year, not three names for one thing. Each is stored with the slot it occupied,
which is what lets the register draw a carer's history where it actually happened.

**Every date goes through `seed_migrated_completion`, the same call the bulk import uses**, so a
carer typed in one at a time and a carer loaded from a spreadsheet are identical in the database:
completions stored as history, the newest one moving the check on, none carrying evidence because
none of them happened in here. One difference, deliberately: the NEXT DUE DATE IS CALCULATED
rather than copied. An import reproduces a history a spreadsheet already describes, including
what comes next; a person typed in has no spreadsheet behind them, so what comes next is what
this company's own cycle says, counted from the last time it was done. Historical completions are
stored with NO due date — we were told when each one happened, not when it was due, and inventing
one would tell the on time report that a supervision done in March was late against a deadline
nobody ever set.

**Three answers Phil gave:** all the columns, done dates only (a due date follows from a
completion and the cycle, so asking for both invites two answers to one question); a blank box
means never done and that check schedules itself as it does for a new starter; and the panel goes
on Add a person only for now — existing records still cannot be back-filled from a screen.

**0315, and it was found before a customer found it.** `seed_migrated_completion` asked for a
Company Admin, which was right when only an import used it. Add a person is open to Managers,
Supervisors and Recruiters (0309, 0311), so a Supervisor ticking the box would have filled the
whole form in and been refused at the last step — DEF-032 all over again. It now also accepts
`is_branch_lead(branch)`, the same question the People register asks of whoever is adding the
record. Somebody who may create the carer, set their DBS date and complete their checks is not
made more powerful by being allowed to say when the last one happened. `scripts/access-probe.sql`
has a new attempt for it, so it cannot drift back.

**A history that does not save is said out loud.** The record exists by then, so the action names
what could not be written and tells them not to press Add person again. Redirecting to a record
with an empty matrix row would look exactly like a clean add — which is how twelve people were
imported with none of their dates on 2026-09-16.

**Proved against the live database as Thistle's Supervisor, rolled back afterwards:** she adds
the person, her checks are applied, her history is recorded (0315), four completions stored, the
supervision moves to last done 21/06 and next due 09/09, the spot check to 30/08 and 27/09, and
all three supervisions still know which one they were.

---

## DEF-037 — A Supervisor adding a carer could not create that carer's login  ·  FIXED

**2026-09-21**, Phil, of a carer added that morning: *"fix the below, we are not sending logins
yet."*

The audit row for the add says it outright:

    "staff_invite": { "ok": false,
                      "error": "new row violates row-level security policy for table \"invites\"" }

Hayley is a Supervisor. She added the carer, which 0309 and 0311 allow. Adding somebody with an
email also creates their Team Member login, and `invites_insert` let a BRANCH MANAGER write a
staff invite but not a Supervisor. So the auth account was created, the invites row was refused,
and what was left behind was an account belonging to no company, a carer with no login, and
nothing at all on the screen to say so.

**The fifth of this shape** — DEF-023, 028, 031, 032 — and the first one the access probe did not
catch, because the probe asks whether a Supervisor can invite a USER, and the right answer to
that is still no. A carer's own login is a different question that lives in the same table.

**0316** splits the two properly. `role = 'staff'` — a carer's own area: their training, their
checks, raising a concern, free of charge — is now written by whoever may add that carer in that
branch (`is_branch_lead`, the same question the register asks). Inviting somebody who READS other
people's records — a Manager, a Supervisor, a Recruiter — stays with Company Admins on the
Settings screen, exactly as before.

**And the Recruiter had never been added to the Admin's list** when the role was created (0310).
Settings offered "Recruiter" in the invite dropdown and the database refused it. Found one line
away from the fault above, while reading the policy.

**`lib/staff/actions.ts`** had its own Manager-and-above list for the Invite them button on a
record, so the Supervisor could not press the button to put it right either. It now uses
`REGISTER_ROLES` — whoever may add the carer may give them their login — which is the list the
policy underneath agrees with.

**The silence is fixed too.** A failed login went into the audit metadata and nowhere else. Add a
person now redirects to `?login=failed` and the record carries an amber strip: the person was
added, nothing was emailed, press Invite them, and tell us if it refuses twice rather than adding
them again.

**Proved as Hayley against the live database, rolled back:** she creates a carer login (allowed),
she invites a Branch Manager (refused, as it should be), and an Admin invites a Recruiter
(allowed, where it was refused before).

**Left behind by the original fault, and cleaned up:** one `profiles` row and one auth account
with no company on them, for the carer Phil asked to delete. Deleted with her.

---

## DEF-038 — The daily report said what was due, never whether anybody was going  ·  BUILT

**2026-09-22**, Phil: *"on the daily email add a 4th column to the right of date, call it
something like planner, scheduled, planned - if it is not planned in, have a red X if it is
planned in, have the name of the person doing it and the date, you will need to widen the tile in
the email so it isnt squashed, this needs to be done for people and serivce user emails."*

Four care plan reviews due in a fortnight reads like a problem when three of them are already
booked in, and reads like nothing at all when none of them are. The report has always answered
"what is due" and never the question a manager asks next.

**The column.** Booked: the conductor's name and the date, on two lines so a quarter-width column
does not break "Hayley Davies" across three. Not booked: a red cross. **The cross is a character
and not an image** — Outlook and Gmail block remote images by default, and an icon that fails to
load is a blank cell reading as "planned", the exact opposite of what it means.

**Only what is still to happen counts:** status `planned`, dated today or later. A visit booked
for last Tuesday that never happened is not an answer to a deadline, and drawing it would say the
job was covered when it is not. Where a check is booked more than once the EARLIEST wins: a
manager reading "due 24/09" wants the next time somebody is going out, not the last.

**The match is on the record and the check's NAME**, not on ids, and that is deliberate: the row
comes from `person_check_status` while the booking hangs off a task row. The name is what both
agree on and what the reader sees in the Task column, so a match they can see is a match we can
explain. Compared case and space insensitively (`lib/notifications/planned.ts`, eight tests).

**Reading the diary is four small indexed reads, not one clever join.** A booking carries its
checks as TASK rows, so the join would be booking → tasks → instances → definitions → conductor,
four embeds deep with two different foreign keys into `check_instances` to disambiguate. Both the
task shape and the older booking-level `check_instance_id` are read, so neither kind of booking
is invisible.

**The card is 680px wide for these two emails only** (`maxWidth` on the shell, default 520).
Every other email — invites, calendar invitations, holiday notices — is untouched.

**A booking whose conductor has left** still shows as booked, with the date and the word Booked
rather than a name. It IS in the diary; showing a cross would be a lie about the harder half.

**Spaced out the same day** (Phil, 2026-09-22: *"i like them maybe space the columns out a little
more"*). The gutter went from 8px to 18px and the rows from 7px to 10px of air. The real fix was
the overdue date, though: "43 days overdue · 10/08/2026" on one unwrappable line was far wider
than any other cell, so it stretched the Date column and squeezed the names beside it. Stacked on
two lines, every column keeps the width its heading claims.

---

## DEF-039 — A DBS renewal date that never changed colour  ·  FIXED

**2026-09-22.** Found while reading Thistle's data for something else, not reported by anybody —
which is the point: nobody would have reported it until a certificate had already lapsed.

The People matrix draws two DBS columns. The first is the date on the certificate, a fact. The
second is the RENEWAL date, a deadline — and it was drawn exactly like the fact beside it: plain
text that never went amber and never went red. Right to Work expiry colours. Probation colours.
Supervision, appraisal, spot checks, audits all colour. The one column an inspector always asks
to see did not.

Thistle's earliest runs out in December 2027, so nothing has lapsed yet. The first one to come
round would have passed in silence.

**NINETY DAYS, NOT FOURTEEN** (Phil, asked and answered 2026-09-22). Every other date column here
ambers at a fortnight, which is right for a supervision you can book on Tuesday. A DBS takes six
to eight weeks to come back, so a fortnight's warning is a deadline nobody can meet: by the time
the cell changed colour the certificate would already be going to lapse. `DBS_AMBER_DAYS = 90`.

**A company can change it** by giving itself a check definition keyed `dbs_renewal` and setting
its amber days, exactly as Right to Work and Probation already work. The ninety is only the
fallback. Phil chose settable over fixed, so there is nothing new to learn: it is the pattern
already on the screen.

**The certificate date stays plain**, deliberately. It happened, it cannot come due, and
colouring it would say something about it that is not true.

**WHAT THIS DOES NOT DO, and it is the bigger half.** Nothing CHASES a tracker date. The daily
reports read `person_check_status`, which is check instances; `rtw_expiry_date` and
`enhanced_dbs_date` appear in no email, no export and no inspection pack. So a DBS now goes amber
on a screen somebody has to open. Right to Work has always had the same gap and nobody has
noticed because nobody has lapsed yet. That is its own defect and it is Phil's to schedule.

**And then chased, the same day** (Phil, 2026-09-22: *"Should appear on the people email as well
when amber"*). He is right that a colour on a screen somebody has to open is half a fix. DBS
renewals now ride in the People report.

**A SECTION OF THEIR OWN, and that is the point.** The two sections above it are headed "overdue"
and "due in the next 14 days". A DBS ambers at NINETY, because that is how long one takes to come
back, so a renewal due in eighty days under a fourteen day heading would make the heading a lie.
"DBS renewals coming up" and "DBS renewals overdue" cost four lines and tell the truth. Nothing is
drawn at all when none are due: a manager with no DBS coming up should not read a line about DBS
every morning for a year.

**The window is the company's own**, read from a `dbs_renewal` definition where they have given
themselves one and falling back to ninety — the identical rule the register colours by, so the
email and the screen can never disagree about what amber means.

**The Planned cell is blank, not a cross.** A DBS is an application to a third party, not a visit
somebody goes out on. A red cross against it would be answering a question nobody asked.

**Leavers are dropped.** A DBS belonging to somebody who has left is nobody's problem.

**Right to Work still has the identical gap** and is not fixed here: it colours on the register
and appears in no email. Said out loud rather than quietly widened, because Phil decides what is
in a phase.

---

## DEF-040 — There was no way to delete a person  ·  BUILT

**2026-09-22**, Phil's pick from the list. The product had Leaver and Archive, which are both
right for somebody who has left and both wrong for a record created by mistake — a duplicate, a
typo, somebody added to the wrong company. Removing the one carer added in error that morning
took hand written SQL, and by the rule this phase runs on, anything that can only be put right
with SQL is a defect.

**ONLY A CLEAN RECORD** (Phil, asked and answered). A carer's supervisions, spot checks and
safeguarding evidence are records CIW expects the provider to hold. Deleting somebody who has any
of that is destroying evidence, and no confirmation dialog makes that acceptable. Delete is
refused the moment anything exists against them, and the refusal NAMES what is in the way — "2
completed checks and a holiday request" tells a manager at once that this is a real person with a
history, not a mistake. A retention hold refuses on its own, whatever else is true.

**ADMINS ONLY** (his choice too). A Supervisor who adds somebody by mistake asks an Admin. One
more person looks at it before a record disappears, which is worth the friction on the only
irreversible control on the record.

**WHAT DELIBERATELY DOES NOT COUNT**, because counting it would mean nobody could ever be
deleted: the checks applied to every new starter automatically, the standing policies handed to
every new starter unless one has been signed, the tracker row a trigger creates, and history
typed into "They already work here" at the moment of creation. That last one is a judgement:
typed history carries NO evidence — nobody signed anything, there is no form and no PDF — and it
was typed in the same breath as the record it belongs to. Refusing to delete a record because of
dates somebody mistyped into it while creating it would recreate the problem this fixes. A
completion recorded AFTERWARDS, through a check, is evidence and does block.

**0317, AND IT WAS FOUND BEFORE IT SHIPPED.** `migrated_completions` has no foreign key to
people — like Evidence it finds a record through record_type and record_id — so the delete has to
remove that history by hand. It could not: the table had exactly one policy, a select. The delete
would have removed nothing, returned no error, and left rows about a person who no longer exists
feeding the on time report. **A refused delete is not an error under RLS, it is zero rows**, which
is the worst shape a failure can take. Now an Admin can remove it, matching who may delete the
person.

**The login goes with the record.** A Team Member account belongs to the person, not the company;
left behind it is an account attached to nobody, which is the orphan that made re-adding this
morning's carer confusing (DEF-037).

**Typing the name is not theatre.** Everything else on the Manage panel is reversible. The record
being deleted and the record somebody meant to delete are, by definition, hard to tell apart when
a duplicate has just been added.

**Proved on the live database, rolled back:** an Admin adds a record; a Supervisor's delete is
refused; the Admin's succeeds; migrated history is removable. Thistle's register is untouched.


---

## DEF-041 - Training could be recorded as completed on a date that has not happened

**Where it came from.** Two rows on Thistle's live register: Asim Riaz showing Safeguarding
completed 21/12/2026 and Mohammad Mahbubul Islam showing it completed 31/01/2027. Neither date
has happened. Nothing in the app invented them. The training import reads a RENEWAL date, because
that is the date a registered manager keeps a matrix in, and works the completion back from the
course's own renewal period. Safeguarding renews every twelve months, so a board carrying a
renewal in December 2027 is asserting a completion in December 2026. The import copied the board
faithfully and the board was wrong.

**Why it is the worst kind of wrong.** A future completion does not look like an error. It looks
like a green tick. The matrix shows compliant, the digest says nothing, and the carer is in fact
untrained until the day the spreadsheet claims. An inspector reading the evidence pack sees a date
in the future next to a tick.

**The rule, agreed by popup 2026-09-22: the impossible one, not "beyond the course period".**
On the import the two are the same thing, because the cell holds a renewal date and the completion
is always derived: a renewal further out than the period can only mean a completion that has not
happened. On the cell dialog they are NOT the same. A manager types both dates there, and a course
configured at twelve months can properly carry a three year certificate; refusing that would
destroy the override the dialog deliberately offers ("a date that arrives is taken as given",
because courses get re-accredited early). What cannot be argued with is a completion in the
future, so that is what is refused.

**One rule, one place, three doors.** `impossibleTrainingDate` in `lib/training/renewal.ts`, the
importless pure module, judged by nine tests including both real Thistle rows and the boundary
either side of it. Wired into every path that can write a training date:

- the training import preview, per cell, naming the course and both dates on the row before a
  single record is written,
- `saveTraining`, the cell dialog, before it reads or writes anything,
- `saveTrainingBulk`, the "record for several carers" dialog, on the one completion date it
  collects.

**Deliberately not judged: the booking date.** Booking a carer onto next month's course is the
normal case and lives in its own column, invisible to the status rule.

**The two live rows are left alone.** They are item 6, the Monday board is the source and Phil
corrects it there first. This is the guard that stops the next one arriving.

**No migration.** Nothing about the schema was wrong.

**Not yet proved in the browser.** The logic is covered by tests and the three call sites are
traced, but no file has been uploaded and no dialog submitted against the deployed build. Test
checklist to run after deploy: import a file with a renewal date more than the course period out
(refused on the preview, message names the derived completion); import a one off course column
with a future date (refused); cell dialog with a future completion (refused); cell dialog with a
past completion and a renewal date three years out on a twelve month course (ALLOWED, the
override still works); cancel a booking by clearing the date on a record with no dates (still
works, the guard does not touch it); bulk record with a future date (refused).


---

## DEF-042 - The carer card showed the DBS certificate date and nothing about the renewal

**What Phil asked for.** "2 show both", then "i meant all dbs dates". The Compliance Summary card
carried one line called DBS holding the date on the certificate, and said nothing at all about
when that certificate runs out. The renewal date is the one an inspector asks for and the one
Thistle's board keeps.

**Both lines now.** "DBS" keeps the certificate date and is drawn plainly, exactly as on the
matrix: it happened, it cannot come due, and colouring it would say something untrue about it.
"DBS renewal" carries the Enhanced DBS date and colours like every other deadline on the card,
amber at ninety days because that is how long a DBS takes to come back, red once past. Agreed by
popup: it counts towards the card's colour, so an expired DBS turns the card red and lifts that
carer to the top of the board. The amber window is read with the SAME expression the register
uses (`defByKey["dbs_renewal"]?.amber_days ?? DBS_AMBER_DAYS`), so the card and the matrix cannot
colour one carer's DBS differently.

**TWO REAL DEFECTS FOUND WHILE DOING IT**, both caused by a fact being treated as a deadline.

1. **The "due in N days" filter matched every carer holding a DBS.** It asks whether any line's
   date falls within N days, and a certificate issued in 2023 is inside every window there is.
   Pick "due in 7 days" on Thistle and all fourteen came back. The filter has not narrowed
   anything since the board shipped.
2. **The "in date out of scheduled" count read one short for everybody.** The certificate date
   was in the denominator and, being a fact, never turned green, so it was never in the numerator.

`CardLine` now carries `fact`, `dueWithin`, `lineDueWithin` and the score all skip it, and five
tests pin it. Nobody would have found either of these by reading the code; they show the moment
you use the screen.

**What Thistle sees today.** All fourteen renewal dates are green (earliest 10/12/2027), so no
card changes colour. Every card's in date count goes UP by one, which is the second defect being
corrected, and the due in N days filter starts actually filtering.

**Service Users unchanged.** They hold no DBS.

**Also corrected here: six em dashes** in the hints under the document boxes on Add a person,
shipped 2026-09-21 against the standing no dashes rule. A test now fails if one comes back.

**No migration. Not yet proved in the browser:** open the Compliance Summary, confirm two DBS
lines on a card, confirm the certificate date is white and the renewal date coloured, confirm the
in date count moved up by one, and confirm "due in 7 days" now returns a short list rather than
everybody.


---

## DEF-043 - Delete person's "type the name first" guard stopped a mouse and nothing else

**Found in browser testing, 2026-09-22 (TEST-CHECKLIST-PHASE13.md, check 3.3).** On a throwaway
record on Bevan, with the confirmation box EMPTY: focus the Delete this record button, press
Enter, and "Are you sure?" opened. One more Enter would have deleted the record.

**Why.** The arming was a class, `pointer-events-none`, which greys the button out and stops
clicks. It does not disable the button, so the keyboard walked straight past it. And the server
never saw the typed name at all: the form sent only the person id. The guard lived entirely in
the page's styling, on the one control in the product that destroys a record.

**Fixed in both places.**

- **The server refuses** unless `confirm_name` comes with the request and matches the record,
  checked before anything is counted or read. No route to the button, and no hand built request,
  can skip it now.
- **The button is really disabled** until the name matches, through a new opt in `disabled` prop
  on the shared ActionForm, which stops mouse, keyboard and anything else. Every other form in the
  app is untouched.
- **One rule, one function.** `nameConfirmed` in `lib/people/deletable.ts` decides it for both
  the button and the action, so they cannot disagree. Forgiving of case and stray spaces, nothing
  else. Four tests.

**Deliberately not in this change** (Phil's popup, 2026-09-22): the pale card colours, the empty
booking row that blocks a delete, and the dashes and "1 records" copy. All still queued.

**Retest after deploy:** type nothing, Tab to the button, press Enter: nothing happens. Type the
name: the button arms and the delete works.


---

## DEF-044 - RAG colours on the carer card were too pale to tell apart

**Found in browser testing, 2026-09-22.** On the Compliance Summary, Taiye's overdue spot check
(17 Sep) looked exactly like her in date manual handling. The card coloured its dates and stage
chips with the `-soft` tokens, which are 100 level tints built as pill BACKGROUNDS for light
surfaces: red rgb(254,226,226), green rgb(209,250,229). As text on a navy card both read as white.

**Fixed.** New `.rag-text-green/amber/red` in globals.css carrying the register's own pill colours
(#43d99a, #f5bd6a, #f18196), and the chips use the register's `.rag-cell-*` directly. One carer is
now the same red on the card as on the matrix. The tokens themselves are untouched, because they
are correct where they are used as backgrounds.

**Not changed, noted for Phil:** the same pale tint is used as text in other places, most visibly
the "in date / due soon / expired" counts across the top of the Training matrix. Banners and error
messages use it too, with a coloured border that carries the meaning.

## DEF-045 - A cancelled booking left an empty row that blocked Delete person

**Found in browser testing, 2026-09-22.** Book a carer onto a course, cancel the booking, and a
row stays behind: not_done, no dates, no booking, no certificate. Delete person counted every
training row, so it refused with "2 training records against it, so deleting it would destroy
evidence an inspector may ask for" when one of them held nothing at all.

**Fixed.** `trainingRowHoldsSomething` in lib/people/deletable.ts says what a real row is: completed
(a one off imported as "Completed" has no dates and is still real), or any date, or a certificate.
The count uses the same rule as a PostgREST filter kept beside it, and a test holds the two
together. The empty rows cascade with the person.

## DEF-046 - Dashes in customer copy, and "1 records"

**Fixed:** the Add a person intro, the "Don't send their login yet" tickbox, the Delete this record
explanation (written 2026-09-22, against the standing rule), the import page's "Every check is a
pair" line, and the bulk training dialog's "1 records".


---

## DEF-047 - The daily report rows now read on one line

**Phil, 2026-09-23, looking at the Bevan preview:** "make the tile wider as i want all info on one
line, the date is under the days overdue".

**Changed, agreed by popup (date first):** the report card is 880px wide instead of 680, and every
row reads across on one line on a desktop.

- Overdue Date cell: "04/02/2026, 231 days overdue", the date in plain text and the lateness in
  the section colour, bold from seven days, as before.
- Planned cell: "Gabbie Thomas, 25/09/2026" on one line, never broken across lines.
- Columns rebalanced: Name 24%, Task 20%, Date 30%, Planned 26%.
- Both the People and the Service User reports, and the DBS sections, which share the table.

**Agreed trade off:** a phone narrower than the card scrolls a long row sideways a little instead
of wrapping it.

**Checked by rendering the real template:** Bevan's live data, and Thistle's two real Planner
bookings for the Planned column. Nothing was sent. The 7am email is the proof on a real inbox.


---

## DEF-048 - The user popup went stale after Enable or Disable this login

**Found in testing, 2026-09-23.** Press "Disable this login" and the database changed, the list
behind refreshed, and the popup still said "active" with the Disable button still showing. The
same the other way round. A manager would press it again and undo what they had just done.

**Fixed.** The dropdown held a copy of the person taken when their name was clicked. It now holds
the id and reads the person from the live list on every render, so the refreshed status, the right
button and the new "User enabled" / "User disabled" confirmation all show at once.

## DEF-049 - No way back in after a forgotten password

**Found in testing, 2026-09-23**, when the Founder could not sign in as his own test Manager: there
was no "Forgot password" on the sign in page and no reset an Admin could send. A locked out
manager could only get back in through the Founder in the Supabase dashboard.

**Built, both routes agreed by popup:**

- **"Forgot your password?"** on the sign in page, to /login/forgot. One answer for every outcome,
  so the form cannot be used to learn who has an account.
- **"Send password reset"** for Admins in the user popup and on Team Member logins, which IS told
  what happened (sent, already sent in the last 10 minutes, switched off, not accepted yet).
- **One door, lib/auth/password-reset.ts.** A Supabase recovery token put into our own
  /auth/confirm link, sent through Resend with the branded button, exactly like invitations.
  Only a live account gets one: an open invitation has its own resend, and a switched off login
  stays off. One per account per 10 minutes, throttled on the audit trail so it holds for the
  Founder's account too. Missing email configuration is logged and told to the Admin, never
  silent.
- **/login/reset** sets the new password (same rule as an invitation: 8 or more, typed twice) and,
  as agreed, **signs them out everywhere else**: Supabase revokes the other refresh tokens and the
  app's own session slots are cleared to this one, so the other device is turned away on its next
  page.
- A used or expired reset link lands on the forgot page saying so, not on "no access".
- Audited both ends: password.reset_sent and password.reset_completed.

Rules in lib/auth/password-reset-rules.ts, six tests.

## DEF-050 - Training matrix counts in the pale colours

The in date, due soon and expired counts across the top of the Training matrix used the same pale
-soft tints DEF-044 took off the carer cards. Now the register's colours.


---

## DEF-051 - The new password page worked for any signed in session

**Found reading the logs while checking the reset test, 2026-09-23.** /login/reset only asked
"is somebody signed in?". So anybody at an unlocked, signed in computer could open it, set a new
password without knowing the old one, and (by DEF-049's own design) sign the real owner out
everywhere. A takeover in two clicks, caught before it reached a customer.

**Fixed.** The page and the action both require the session to have come from a reset link in
the last 15 minutes: Supabase records that in the token's amr claim as method "recovery" with a
timestamp, read only after getUser has checked the same token. An ordinary session sent to the
page lands on "That reset link has expired" with a box to ask for a new one. One test.

**Must be proved live:** a real reset from an email still reaches the form and saves. If the amr
method were not "recovery", every genuine reset would be refused, so this is tested straight after
deploy, not assumed.


---

## DEF-052 - Signing out on one device signed the person out of both

**Phil, 2026-09-23:** "i signed in on mac, then on iphone, signed out of iphone and both mac and
iphone signed out". He had seen it earlier in the night too.

**Cause.** Supabase's auth.signOut() with no argument uses scope "global": it ends every session
the person has. Harmless while BCC allowed one session; since 0273 (2026-09-15) allowed one computer
and one phone, it quietly undid that decision in two places:

- **The Sign out button** ended the person's other device too.
- **Eviction** was worse. The session turned away for being displaced signed out GLOBALLY, so a
  second phone signing in made the old phone's next click end the new phone AND the computer.

**Fixed.** The Sign out button, eviction, a failed session claim and the reset page's turn away
all end only their own session (scope "local"). A switched off login is still ended everywhere,
now explicitly (scope "global"). The new password keeps "others".

**Cannot come back:** lib/auth/signout-scope.test.ts fails npm test if any auth.signOut() in the
app has no scope.

**Retest after deploy:** Mac and iPhone signed in as the same person; sign out on the iPhone, the
Mac stays in. Then sign the iPhone back in: the Mac stays in.


---

## DEF-053 - Opening a reset email signed the person into the app before they set a password

**Phil, 2026-09-23:** "when you do reset password, when you click back to sign in, it took me to
the dash on the iphone". He had signed out first. The audit trail shows it: reset requested at
07:43:20, the email link claimed a phone session at 07:43:40, no password was ever set. Tapping
the link had signed him fully in, so "Back to sign in" found a signed in person and sent him to the
dashboard. Anybody who abandoned the reset form was simply in the app.

**Fixed, agreed by popup (the link only opens the reset form):**

- A session made by a reset link can do one thing. requireUser sends it to /login/reset from every
  app page, and the middleware shows the sign in page, not the dashboard, for "Back to sign in".
- Saving the new password ends every session including the reset one, and lands on sign in with
  "Your password has been changed, and you have been signed out everywhere." They sign in fresh,
  which is also when a phone offers to save the new password.
- Tapping a reset link no longer takes a session slot, so it cannot sign out the person's real
  phone or computer before they have changed anything.
- One edge safe token reader (atob, not Buffer) shared by the middleware, the guard, the page and
  the action. Two tests.

**Also confirmed from the same data:** the Mac (07:42:29) and the iPhone (07:43:40) held a computer
slot and a phone slot at the same time, so one computer plus one phone now holds (DEF-052).


---

## DEF-054 - The 10 minute wait between reset emails

**Phil, 2026-09-23:** "i dont like the 10 minute wait", then "no wait for admins, 2 mins for
everyone else but they need to be told that on the screen other wise they will keep checking email
and requestiong more".

**Changed.**

- An Admin's "Send password reset" in Settings is never held back.
- The public "Forgot your password?" form waits 2 minutes between emails to the same account (was
  10), so it still cannot be used to fill somebody's inbox.
- The screen says so. The answer now reads "It can take a minute or two to arrive, so check your
  junk folder too. You can ask for another link in 2 minutes." with a live countdown, and "Send
  another link" appears only when the wait is over. The same answer and countdown show whatever
  address was typed, so the page still does not reveal who has an account.


---

## DEF-055 - The Supervisor digest stacked every row onto three lines

**Phil, 2026-09-23**, with screenshots of the 7am emails: "One line?". The People report had gone
to one line a row that morning (DEF-047); the Supervisor digest had not. Each row was the name
with "Person, Swansea" under it, and "Overdue" with the date under that.

**Changed (agreed by popup: match the People report).**

- Same 880 wide card and the same four columns as the People report: Name, Task, Date, Planned.
- One line a row. Overdue rows read "17/09/2026, 6 days overdue"; due soon rows read the date.
- Planned shows who is booked and when, or a red cross, read from the same diary lookup the People
  and Service User reports use, so the three emails cannot disagree.
- The branch is said once, in a small grey heading above its rows ("Cardiff, People", "Cardiff,
  Service Users"), instead of under every name.
- Sections "Overdue" and "Due soon", sorted branch, then People before Service Users, then oldest
  date first.


---

## DEF-056 - No way to put a Check done on paper, or an existing record's past history, into the app

**Phil, 2026-09-23** (item 4, back-fill history on an existing record): "lets create an upload
button where evidence can be uploaded, this will be handy if anything ever has to be completed on
paper and can be uploaded as evidence", then "it should only be active for admin".

**Agreed by popup:** on the Complete page; dated the day it was done on paper (may be past); the
newest completion moves the due date, an older one goes into the history and moves nothing; a file
is required; People and Service Users.

**Built.**

- Complete page, Admins only: a slim bar "Done on paper? Upload it instead". It swaps the Form for
  the date it was done, which supervision (or Health Check week) where that matters, and the pages
  (PDF or photos, up to 10, 20 MB each).
- Pages go from the browser straight into the private evidence bucket on single use signed upload
  links (a request to the app stops at 4.5 MB, a phone photo can be more). The server reads each
  page back, records its real size and fingerprint, and files the Evidence through
  submit_paper_evidence (migration 0318), which refuses anybody who is not a Company Admin,
  archived records, leavers, the Setup Visit, future dates and pages from outside the upload.
- The Check moves on through the SAME scheduling code as a Form completed on screen: the
  People and Service User scheduling was lifted out of completeCheck into
  lib/people/advance-check.ts and lib/service-users/advance-check.ts and both doors call it.
- The paper date is the completion date everywhere: the matrix slots, Last completed, the
  Evidence list on the record (with a "Paper copy" pill, newest first by that date), the on time
  figures in the PQS and reporting exports, and the Evidence screen and PDF ("Completed on paper
  on ...", "Uploaded by", "Uploaded at").
- Pages uploaded and never filed (tab closed half way) are removed by the nightly retention run a
  day later.

**Not carried by a paper copy, by design:** satisfaction answers (a paper review adds nothing to
the satisfaction score rather than a zero), and the Setup Visit (its answers are the care package
and invoicing, so it stays an in app Form).
