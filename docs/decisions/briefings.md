# Briefings

> BCC vocabulary — "Briefings" is the department for policies to sign and forms to complete (was Assignments, promoted out of People 2026-07-26); includes the audience rules, icon rule, and the 2026-08-11 catalogue/holiday/identity hardening

**CONFIRMED VOCABULARY, 2026-07-26: the department is called BRIEFINGS.** Use this word, never "Assignments", in UI, copy, docs or chat.

Phil: "i didnt want to create a sub department called assignments. i want it to be its own department, i want it to have a better name than assignments something catchy". Chosen by popup over Issued, Read and Sign, and Handbook.

**Why it works:** a briefing is something you send the team and expect back, so one word covers both a policy to read and sign AND a form to complete, and it reads naturally from both sides. A Manager **sends one out**; a Team Member sees **My briefings**. "Brief the team on the new medication policy" is already how a registered manager talks.

**Ruled out before asking (both would have been mistakes):**
- **Sign Off** collides with the existing supervision sign-off chain ([permission-boundaries](permission-boundaries.md)).
- Anything with **board** breaks the standing terminology rule (Record, Register, Check, Form, Evidence; never "item" or "board").

**Shape:** own top-level department at `/briefings`, own nav icon, Manager and above, sitting between Complaints and On Call. NOT under People. The old `/people/assignments` route was removed. Taking a briefing back is **Withdraw**, not Cancel. The Person record shows a **Briefings** panel with a **Send one** link.

**AUDIENCE, 2026-07-26.** Phil: "there also needs to be a select all option for who is it for, so i can select the whole company or i can select a whole branch as depending on the local authourity, they may need to issue different docs per branch". So "Who is it for?" is three explicit choices, Everyone / A whole branch / Chosen people, not a checkbox list with a hidden select-all. **Everyone and A whole branch are resolved on the SERVER** from the register (never from hidden inputs), so the browser cannot widen the audience and RLS still decides reach: a Branch Manager's "everyone" is their own branch. Leavers and archived records are always excluded, and re-sending is safe because anyone with it still open is skipped. Recorded in the audit metadata as scope + branch_id. Branch-level issuing exists because different local authorities require different documents.

**Icon = a PEN signing a line**, 2026-07-26. My first attempt was a document with lines, which Phil spotted as near-identical to Invoicing: "briefings has the same icon as invoicing, i think it needs to be an envelope or even better, a pen for brifings". Standing lesson for `components/nav-icon.tsx`: BCC already has four document-shaped icons (invoicing, reports, forms, submissions), so a new department must not be another sheet of paper. Check the existing set before drawing.

**Internals unchanged:** the DB table is still `assignments`, and lib/assignments/* keeps its name. That is deliberate and invisible to customers; do not churn the schema for a label.

## HARDENING 2026-08-11 (Phase 10v2 — the three Briefings bugs from the 08-10 live run)

**1. Catalogue is now an ALLOWLIST (was: every form). SECURITY.** `listAssignableForms` used to offer every active people-form minus only `policy_acknowledgement`, so an Admin could brief a carer their OWN Supervision / Appraisal / Audit / Probation / competency form to fill in about themselves, filing self-marked Evidence on their record. Fixed with `lib/assignments/briefable.ts` — an allowlist (`BRIEFABLE_FORM_KEYS`, currently only `holiday_requests`; `isBriefableFormKey()`), modelled on [public-forms-built](public-forms-built.md)'s config, so a NEW form is never briefable by accident. Enforced in BOTH places: the picker (`listAssignableForms` filters by it) AND the write path (`assignItems` looks up the form's key + company and rejects a non-briefable or cross-company form even from a forged POST). 17 unit tests in `briefable.test.ts`. To make more forms briefable later, add the key. Commit 534762f.

**2. A Holiday briefing now creates a REAL holiday request (was: Evidence only).** `completeAssignedForm` filed Evidence + closed the assignment but never created a `holiday_requests` row or told approvers — only the public path and in-app `requestHoliday` did. Now, when the briefed form key is `holiday_requests`, it validates start/end dates, then AFTER `complete_assignment` closes the briefing it inserts a pending `holiday_requests` row (person_id, branch, requested_by=user, requester_name, request_evidence_id) and calls `notifyHolidayRequested`. Placed after close so a failure can't duplicate on retry; surfaced not swallowed. Verified live end-to-end 2026-08-11 (the test Company Admin sent → the test carer completed via /my → pending request in her holidays + 2 approver emails + assignment completed). See [holidays-absence](holidays-absence.md).

**3. Identity fields preseeded (fixed 2026-08-10, commit a662a6d).** `seedIdentityAnswers` fills name/email into the briefing completion; `briefingRenderSchema` drops the identity questions from the shown form (so the Holiday briefing shows only its date questions). Confirmed live 2026-08-11.

**Test document:** a fake one page policy (Mobile Phones and Social Media, clearly marked TEST DOCUMENT, with tick box, signature and date on the page) lives in the iCloud "Be Care Compliant" folder for issuing tests. It has to be added through Settings, Policies by hand: the policy bytes live in the private evidence bucket and only the service role key can write there, and that key is in Vercel only, never in .env.local, so a policy row can NOT be seeded by SQL alone.

Related: [assignments-policies](assignments-policies.md) [staff-logins](staff-logins.md) [holidays-absence](holidays-absence.md) [the-list](the-list.md)
