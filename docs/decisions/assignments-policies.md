# Assignments policies

> BCC assignments, the policy library, signed policies, per-policy signing rules, written/pasted policies, the signed copy, standing policies for new starters and the briefing emails (0133/0135/0136/0137/0138)

Team Member logins increment 2, BUILT 2026-07-26/27. See [staff-logins](staff-logins.md) for increment 1, [briefings](briefings.md) for the department and [policy-signing-ux](policy-signing-ux.md) for the phone-first signing screen.

**Tables:** `company_policies` (current version, title, source, body, per-policy signing rules, assign_to_new_starters), `company_policy_versions` (every version's document AND wording, kept for good), `assignments`, `policy_config` (only the REMEMBERED DEFAULTS for the next policy added).

**POLICIES ARE SIGNED, NOT TICKED (0135).** The acknowledgement form carries a drawn `signature` and a typed `signature_typed`; `lib/assignments/signing.ts` filters the RENDER to the chosen mode, so the stored form and server validation never diverge. Requiredness is enforced in the action. A drawn signature is a PNG stored as an evidence FILE (kind 'signature').

**SIGNING RULES ARE PER POLICY (0137).** `signature_mode` and `reassign_on_new_version` live on the policy (nullable = follow the default); `policy_config` is only the remembered default, rewritten whenever a policy is added or its signing changed. Every read goes through `getEffectivePolicyRules(companyId, policyId)`.

**"ASK ME EACH TIME" IS REAL SINCE 2026-07-27.** It used to behave exactly like 'never' (the asking half was never built — Phil: "that option is currently a lie"). Now saving a version under 'ask' reports how many hold the old wording, and `reassignPolicyToEveryone` is a confirmed action on each policy row, also useful under 'never'.

**WRITTEN OR PASTED POLICIES (0136).** `source` = 'upload' | 'text'. `lib/policies/text.ts` parses the paste into BLOCKS (never HTML). **The PDF is rendered ON DEMAND from the frozen wording** (`lib/policies/render.ts`), never served from the file saved that day — that was the bug behind "the text format on the bullet points is still an issue": a frozen render can never receive a parser fix. Editing always creates the NEXT VERSION.

**POLICIES ARE PDF ONLY (2026-07-27).** Accept attributes plus a server-side `pdfOnly()` on both upload paths. A Word file cannot be rendered by the phone reader nor stamped by pdf-lib, so accepting one produced a policy nobody could read and a signed copy that was only a signature page.

**THE SIGNED COPY replaced the certificate.** `/api/assignments/[id]/certificate` returns the DOCUMENT with one signature page appended (pdf-lib), loading the wording/file for the VERSION SIGNED so a later edit cannot rewrite history. `certificate.tsx` is deleted.

**WHO HAS SIGNED, LIVE.** `/api/briefings/report?policy=<id>` (or `?form=`) renders a PDF on every press — counts, everyone who signed with dates, everyone outstanding with days late — stored nowhere, stamped "Correct at <time>". Phil: Evidence used to open ONE person's acknowledgement, "which answers a question nobody asks". Reachable from the grouped Completed list and from each policy row in Settings.

**STANDING POLICIES FOR NEW STARTERS (0138).** `company_policies.assign_to_new_starters`, honoured by BOTH "add a person" and the importer via `lib/assignments/new-starters.ts` (service role, deduplicated, best effort). DEFAULT FALSE and false for existing policies, because it silently sends documents to people. Closes the gap where policies only ever reach whoever existed the day they were sent.

**BRIEFING EMAILS — all three PROVEN LIVE (briefing_sent 2026-07-26, the two chases via the 07:00 cron on 2026-07-27).** `lib/notifications/briefings.ts`: `briefing_sent:<assignmentId>` on send; `briefing_chase:<personId>:<date>` the person's own daily reminder (no due date = never chased); `briefing_outstanding:<profileId>:<date>` Managers/Admins, OVERDUE only, Admins company-wide and Managers by branchIds.

**GOTCHA, Resend rate limits REQUESTS not recipients:** `sendEmailBatch` posts up to 100 per call. Never loop sendEmail over a company.

**GOTCHA, demo addresses, TWO doors:** `isSendableAddress` blocks RFC 2606 reserved and demo domains for briefing emails AND (since 2026-07-27) for INVITES — guarded inside createAndSendInvite/resendStaffInviteByEmail, not in the callers. A demo row is reported as a skip, never a failure. 18 of Acme's 41 people are @example.com. Note "AA AA" carries testytesy@gmtest.com, which is NOT reserved and will bounce.

**GOTCHA, partial unique index:** `assignments_open_idx` is unique on (person_id, coalesce(form_id, policy_id)) WHERE status='assigned'. ON CONFLICT cannot infer a PARTIAL index (42P10) — select, filter, then plain-insert (both assignItems and the new-starter path).

**GOTCHA, upload size:** Server Actions accept a 4MB body, so uploads are capped at 3MB.

**RLS shape:** staff see a policy and its versions ONLY when assigned to them, and only their own assignments. Managers see their branch, company-wide roles see all; policy writes are Admin.

**Follow-ons:** no SMS for briefings (email only). Everything else on the old follow-on list is now built.

Related: [staff-logins](staff-logins.md) [briefings](briefings.md) [policy-signing-ux](policy-signing-ux.md) [phase2-decisions](phase2-decisions.md)
