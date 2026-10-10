# Staff logins

> BCC Team Member logins — reversal 2026-07-26, agreed design, built and part-tested live (0131-0134), the free-seat rule, the four-places rule, what is left

**REVERSAL, 2026-07-26.** Phil reversed the long-standing "Team Members will NOT have app accounts" decision (see [public-forms](public-forms.md), [public-forms-built](public-forms-built.md)). Team Members WILL have logins. Asked A (link existing logins) or B (give Team Members logins), he answered **"b"**.

**Public forms are HIDDEN, not deleted.** `PUBLIC_FORMS_ENABLED = false` in lib/public-forms/flag.ts. Tables, RPCs, queue and the /f/<code> page all remain; flipping the flag restores everything with no migration. Same pattern as CUSTOM_COLUMNS_ENABLED.

**Agreed design (popup 2026-07-26):**
- Role shown as **"Team Member"**, keyed **`staff`**. Chosen over renaming: the old `team_member` key (the read-only Viewer) is baked into 5 live RLS policies including people_select plus is_branch_team_member, so renaming it for a label was the riskiest option.
- **Policies = uploaded documents**, read and acknowledged, the tick stored as Evidence. See [assignments-policies](assignments-policies.md).
- **Assignment = per person plus bulk.** No rules engine by job title (offered, not taken).
- **Provisioning, Phil's words:** "they get an invite when thier email is entered on add a person or when the bulk upload is completed". Automatic, never a manager chore.

**THE FREE-SEAT RULE (permanent, and it bit twice).** Staff logins are FREE: a 60 carer agency would otherwise read as 54 extra seats at £5 = £270/month on top of the plan. 0131 excluded staff from `company_active_user_count` (the customer's Billing screen), but FOUR other counts still counted every active profile: `getActiveSeatCount` in lib/billing/stripe-sync.ts (the quantity actually PUSHED TO STRIPE), the founder home, founder revenue, founder companies list, and the company drill-in. So the invoice and the screen would have disagreed. Now centralised: **`NON_BILLABLE_ROLES` + `isBillableSeat(role)` in lib/billing/seats.ts**, used by every count including Stripe. STANDING RULE: every seat count goes through isBillableSeat.

**THE FOUR-PLACES RULE.** Adding a role means FOUR edits, and missing any one fails the Vercel type check after compiling cleanly: the DB check constraints (profiles + invites), `Role` in lib/nav.ts, `InviteRole` in lib/invites.ts, and the `Profile` role union in **lib/auth/guards.ts** (the one that caught us).

**MY OWN MISTAKE, 2026-07-26:** I rebuilt lib/invites.ts from the STAGED copy after already editing it in-session, and the uploads mount served the pre-edit bytes, silently reverting the staff role and breaking the build. Never rebuild a repo file from its staged snapshot once edited this session: edit the working copy or re-stage first. See `cowork-sandbox-limits` (not carried over).

**BUILT 2026-07-26, migrations 0131-0134:**
- 0131 role + free seats + invites_insert widened so a **Branch Manager can create staff invites for their own branch** + evidence_select excludes staff from their own record's Evidence (absence meeting minutes and probation reviews live there; they keep their own submissions via author_id).
- 0132 the requester can amend their OWN holiday while pending.
- 0133 assignments and policies ([assignments-policies](assignments-policies.md)).
- 0134 `person_login_status(person_id)`: profiles_select and invites_select are COMPANY ADMIN only, so a Branch Manager could not see whether a carer had a login. This returns just those few facts to anyone who can manage the Person, rather than widening those policies.
- App: lib/staff/{invite,data,actions}.ts, components/staff/{my-holidays,assigned-to-me}.tsx, app/(app)/my/page.tsx (the only page a staff login has), nav gives 'staff' one "My area" entry, createPerson and the bulk import auto-invite, and the Person record shows the login state (Active / Invited with date + Send it again / No login + Invite them / No email) plus their assignments.
- Settings > Users: two half-width **dropdowns** side by side, Active users and Passive users, names and emails INSIDE the panel, clicking a name opens their popup. Phil rejected three earlier attempts (cards, slim header, select-styled button that still listed below it) before this one.

**PASSED LIVE 2026-07-26** on a real address (a test person created with a real inbox): person created with 6 checks, invite created with role staff and email_sent true, profile created as role staff status invited, people.profile_id linked immediately, billable seats unchanged at 3.

**Still to do:** assignment due reminders on the daily digest; a bulk invite built for a real onboarding (list who will be emailed, confirm, do NOT fire silently); a guard so demo addresses (18 of Acme's people are @example.com) never get real invites and bounce; staff redirects on the remaining top-level pages (RLS already returns them nothing, so UX not exposure); and the full live checklists in PHASES.md Phase 11.

Related: [assignments-policies](assignments-policies.md) [public-forms-built](public-forms-built.md) [roles-overhaul](roles-overhaul.md) [phase7-decisions](phase7-decisions.md) [holidays-absence](holidays-absence.md)
