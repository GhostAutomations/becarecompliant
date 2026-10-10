# Operations

> Phil's naming for the whole programme, 2026-08-13: Operation Launch (phases 0-12), Operation Thistle (phase 13), Operation New Dawn (phase 14 on). Wales only to start. Read before discussing scope, roadmap, pricing reach or what phase anything belongs to.

**Phil, 2026-08-13.** The phases are grouped into three OPERATIONS. A phase belongs to exactly
one. The operation says what the work is FOR, which is the question that settles arguments about
scope.

| Operation | Phases | What it is for |
|---|---|---|
| **Operation Launch** | 0 to 12 | Building and shipping BCC v1. Ends when the marketing site is live and the product can take a paying customer. |
| **Operation Thistle** | 13 | The real Thistle Care runs on the live product. Every defect real use exposes is fixed BEFORE anybody pays. |
| **Operation New Dawn** | 14 onwards | Growing from tracking compliance ABOUT care into recording the care itself. |

Recorded in PHASES.md as banner headings, with a `# WORK LOG` banner separating the dated
running record from actual phase scope.

**WALES ONLY TO START (Phil, 2026-08-13).** See the assurance section at the bottom — this is a
much bigger commercial decision than it sounds, because nearly the whole certification bill is an
England bill.

## Operation Thistle — phase 13

**The real Thistle Care on the real product, before anybody pays.**

Everything through Phase 12 has been tested against **Acme**, a company built for testing by the
two people who built the product. A working agency will do things nobody thought to try. The
cost of learning that from a paying customer is a refund and a reputation, so Thistle is the last
chance to be wrong cheaply.

**Thistle STARTS AS A PAYING CUSTOMER, then moves to Black (free) once the shakedown is over**
(Phil, 2026-08-13). Right way round: a free pilot is a favour and gets treated like one, an
invoice makes both sides serious, and it exercises the billing path a real customer takes rather
than a founder-granted shortcut.

### The gap that decision exposed — BUILT 2026-08-13, see [tier-changes](tier-changes.md)

`companies.tier` was written at creation and by trial provisioning **and by nothing else**, so no
company could ever change plan: **no Business customer could upgrade to Pro** (a launch blocker
hiding in plain sight), Thistle could not be moved to Black without hand-written SQL, and nothing
stopped Stripe charging a company that had been moved to a free tier.

**Now built and live-tested**: a Plan control on the founder company page and Move to Pro on the
customer's own billing page, both going through one shared rule. Moving to Black stops the
subscription at period end; undoing that calls the cancellation off. Downgrades are deliberately
refused until the new total can be shown on screen. Five defects were found by review and one
more by the live test — all of them in money paths, none visible to `tsc` or the tests. The whole
account is in [tier-changes](tier-changes.md).

**Still untested live: Business to Pro**, because Acme is the only company in the database and is
already on Pro. **Watch it on Thistle's first real upgrade.**

### Rest of Phase 13 scope, to agree by popup before starting

A real tenant provisioned through the founder console on the tier it would actually buy (not a
copy of Acme); real staff, service users, training and policies imported through the paths a
customer would use — anything that has to be fixed in SQL is a defect in the IMPORT; real
managers on the register and Planner and real carers in the Team Member area; billing exercised
for real including a branch change and a seat change; a defect log kept as it happens; and **exit
criteria agreed up front** rather than argued afterwards.

Still open for Phil: whether Thistle's data shares the Supabase project with the demo and test
companies (it should, or the thing being tested is not the thing being sold); and what becomes of
Acme once Thistle is real.

## Operation New Dawn — phase 14 onwards

**IS [freedom](freedom.md), promoted.** FREEDOM-2027-ROADMAP.md stopped being a standalone doc on
2026-08-13 and is now Phase 14's detailed design. The July decision that nothing entered
PHASES.md until BCC v1 shipped is superseded.

Carried over unchanged: **home care (domiciliary) first**, residential later.

What Phil named on 2026-08-13:

- **Scheduling calls** in the shape Nourish's planner does it — visit patterns generating
  recurring calls, dragged onto carers and runs, travel time and clash warnings.
- **Tasks, medication, notes** at the point of care in the shape Birdie does it — per-visit task
  lists, MAR charts, notes and observations.
- **A staff app** the carer actually uses on their phone.
- **Five reports**, all of which only become possible once calls are recorded: call **duration**
  against plan (both cut short and run over), **earliness** (arriving too early — as much a
  dignity and safeguarding issue as lateness, and the one nobody reports on), **lateness**, **note
  quality** (whether what was written is worth anything, not merely that something was written),
  and **medication competency** joined to what the carer actually recorded on the MAR, so the
  competency check stops being a form and becomes evidence.

**DECISION CHANGED 2026-08-13: the staff app is an installable WEB app first**, not React Native
+ Expo. A mobile web app the carer opens in Safari or Chrome and adds to their home screen — no
store accounts, no review cycles, shipped from the Next.js codebase that already exists. Freedom
itself already called the carer web view "the floor, not the fallback". Native returns as its own
later phase; the two things it would buy are dependable offline recording and background location
for call monitoring.

**Nothing in New Dawn starts until Operation Thistle has signed off.**

## Wales only to start — what it actually changes

Verified 2026-08-13. Nearly the whole assurance bill is an ENGLAND bill:

- **DCB0129**, the clinical risk management standard that requires a named **Clinical Safety
  Officer**, is an NHS **England** information standard under the Health and Social Care Act 2012.
  It is what NHS England procurement checks. It does not bind a supplier selling to a Welsh
  domiciliary agency.
- The **assured DSCR list** and MODS/DAPB4102 certification are an NHS England procurement and
  funding gate, not a licence. Wales has no equivalent scheme; **CIW regulates PROVIDERS, not
  software vendors.**
- So DTAC evidence, the assured list, Cyber Essentials Plus and a pen test can all wait until BCC
  sells into England. Most of the £15–30k trust stack is DEFERRED, not avoided.

**What Wales-only does NOT remove is the reason the CSO existed.** If BCC records that a carer
gave a medicine and the record is wrong, "no English standard applied to us" is not a defence to
the provider, their insurer, or a coroner. The CSO stays in scope for the **medication module
specifically**, but the timing moves: needed before eMAR goes live on real service users, not at
Phase 14 kickoff. Everything else in New Dawn — scheduling, calls, tasks, notes, the five reports
— carries no such requirement at all.

**Not yet confirmed, worth checking before eMAR is built rather than after:** whether Digital
Health and Care Wales publishes its own patient-safety information standards mirroring DCB0129,
and whether Welsh local authorities ask for clinical safety evidence in domiciliary tenders. The
England position was confirmed on 2026-08-13; the Welsh one was not.

Related: [tier-changes](tier-changes.md) [freedom](freedom.md) [the-list](the-list.md) [project-state](project-state.md)
[stripe-prices](stripe-prices.md) [look-at-the-artefact](../process/look-at-the-artefact.md)
