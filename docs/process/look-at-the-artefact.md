# Look at the artefact

> STANDING RULE from 2026-08-11: eleven defects across three sessions, none visible in the code, unit tests and tsc green through every one. The specific checks that actually find them.

**Rule: before calling anything done, look at the ARTEFACT it produces, not the code that
produces it.**

Why: on 2026-08-11, five items were built and eight real defects were found. **Seven were in
work Claude had just written and was about to call finished. Unit tests and `tsc` passed
cleanly through every single one.** Not one was visible by reading the code. Two more came on
2026-08-12 and two more on 2026-08-13 — eleven now, and the pattern has never once broken.

| What was wrong | What found it |
|---|---|
| A blank second page on a regulator's PDF | Rendering the pages and LOOKING at them |
| A cron returning 200 on a totally failed run | Checking the database rows, not the status |
| An "anonymised" record keeping a full PDF of itself | Listing `storage.objects` |
| A retention clock that silently failed to stop | Reading the rows AFTER the screen said "Saved" |
| `column reference is ambiguous` (the function had NEVER worked) | Calling it with real rows |
| A dashboard inventing two non-compliant staff | Reading the assignment rows behind the number |
| A carer's screen accusing her of 33 lapsed courses | Logging in AS HER |
| Supervision 4 impossible to complete | Trying to complete it |
| The founder able to read whistleblowing disclosures | Phil asking who can see this |
| Two dropdowns rendering as "1" and "0" — the time unreadable | Phil's screenshot; the accessibility tree reported the options happily |
| A Stripe customer still named after the company's OLD name, on every future invoice | Opening the customer in the Stripe dashboard |
| The founder console reporting £69.00/mo while Stripe billed £84.00 | Reading the tile next to the Stripe subscription |

## How to apply

1. **A document is not done until its pages have been rendered and viewed.** Byte counts,
   embedded-image counts and "the code passes the schema" are not evidence. If the viewer
   cannot be screenshotted, fetch the file and paint it onto a canvas with pdf.js — and say
   out loud that the rig is a rig, because a low-scale canvas render looks soft and Phil
   reasonably asked "that pdf looks fuzzy". Put the page back afterwards.
2. **A background job is not done until the rows it should have changed are checked.** A 200
   proves the route ran, nothing more. **Make the route return 500 on a failed run**, or
   "nothing was due" and "broken for months" look identical for ever. That is exactly how the
   retention rule sat dead since Phase 2.
3. **Anything that deletes is not done until the STORE is listed.** Rows can say purged while
   the objects survive. Ask what objects the thing owns, including ones nothing in the
   database points at (a cached render is named by convention only).
4. **"Saved" is a claim, not a result.** Re-read the rows. A swallowed error and a successful
   no-op look the same from the UI. Never return `{ updated: 0 }` on an error — return the
   error and let the caller log it.
5. **A number on a dashboard is not done until the rows behind it are read.** "66%, two people
   behind", with a real name and a real policy, was completely wrong. Plausible is not correct.
6. **A screen built for a role is not done until it is seen AS that role.** The RLS was right,
   the data was right, and the page still accused a carer of 33 lapsed courses because the
   wording was keyed on the colour instead of the state. Ask Phil to log in; he is willing,
   and it takes him a minute.
7. **RLS boundaries can be tested without a login**, and should be: `set local role
   authenticated; set local request.jwt.claims = '{"sub":"<profile id>"}'` then count what
   that user can select and try an update. Confirm the fixture is not empty first, or a pass
   proves nothing (the first attempt returned 0 rows because the person had no records).
8. **Anything that writes to a third party is not done until that third party's own screen is
   read.** Our row saying `stripe_customer_id` is set proves the id, not the record. The
   customer was called "Thistle Care Wales" for a month, and it would have printed on the
   first real invoice. The same trick tests destructive database work safely: wrap the call in
   `begin; … rollback;` with the founder's JWT claims set, and every refusal path can be proved
   against production data without changing a row.
9. **When two screens quote the same number, one of them is already wrong or soon will be.**
   The customer billing page and the founder console both totalled a subscription. Adding
   branches to one and not the other was not a bug anybody could see in either file. Collapse
   them into one rule with REQUIRED inputs, so the next charge breaks the build instead of a
   screen.

10. [stated] **Run the Supabase security advisor after EVERY migration applied, and stop before
   the push block if it shows any ERROR** (Phil, 2026-09-24: "Yes, every migration"). Why:
   DEF-073. 0223 (4 Sep) silently dropped security_invoker from person_absence_summary, so it
   ignored RLS and anon could read it for three weeks. The 17 Aug pen test was right on the day
   (advisor 0 ERROR); nothing re-ran it. lib/db/views-read-as-caller.test.ts now guards views,
   but only views. The existing WARN/INFO lints (search_path on old helpers, no-policy tables
   used only by the service role, anon-executable definer RPCs that self-gate) are known; judge
   only what is NEW since the last run.

## The counterweight

None of this means slow down or gold-plate. Every one of these was found in minutes once the
right thing was looked at. The expensive part was never the checking; it was the two rounds of
"built, deployed, and wrong" that happened when it was skipped.

Related: [tracking-drift](tracking-drift.md) [the-list](../decisions/the-list.md) [retention](../decisions/retention.md) [photo-evidence-pdf](../decisions/photo-evidence-pdf.md) [branch-billing](../decisions/branch-billing.md)
