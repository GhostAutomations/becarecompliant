# Letters rtw

> Editable company letter templates, the absence meeting Outcome section, and AI Return to Work — built and DEPLOYED GREEN 2026-07-27, migrations 0139-0143; live testing still outstanding

Built 2026-07-27 in one batch after Phil said "lets build them all". All four scope
questions were answered by ONE popup, and he took every recommendation.

**STATUS: built green and pushed 2026-07-27.** Migrations 0139-0143 applied to
bgrtcvyjuwopunpnudeu. NOT live tested yet — the test steps are in PHASES.md under Phase
11 Final Testing.

## Editable formal letter templates (0139 + 0140)

**Why:** the absence meeting invitation went out under the CARE COMPANY's name with
wording hard coded in `bookAbsenceMeeting`. It is a formal step in a capability process
naming the stage and the right to be accompanied, and every provider has wording their
own HR adviser approved.

**Phil chose:** every letter absence sends, built as a GENERAL letters system so
probation and disciplinary letters can be added later without rework, seeded with only
the absence set so there are no empty screens.

- `company_letter_templates` + `company_letter_template_versions`. Wording is kept
  FOREVER: a letter already sent went out under the wording live at the time and a
  process can be challenged months later. Read = any company member (the sender runs as
  the Manager booking the meeting), write = Company Admin only.
- **0140 exists because 0139 deliberately had no delete policy.** Putting a letter back
  to the standard wording is the one legitimate delete: removing the row makes it read
  from the packaged default again so later improvements reach that company. History
  stays undeletable. The reset action counts the delete, because an RLS refusal returns
  zero rows and NO error.
- `lib/letters/letters.ts` is PURE so the client editor can import it. **Bodies are
  PLAIN TEXT with {{placeholders}}, escaped and rendered to HTML at send time — an Admin
  never authors raw HTML.** That would break the email shell and open an injection path
  into mail we send on their behalf. Unknown tokens are left exactly as typed so a
  mistake shows in the preview rather than vanishing from a legal letter.
- Four letters: `absence_meeting_invite_employee`, `absence_meeting_invite_conductor`,
  `absence_meeting_rearranged` (a paragraph inside the other two, so NO subject of its
  own — the save action special-cases that), `absence_meeting_cancelled`. Defaults are
  EXACTLY the previous wording, so turning it on changed nothing.
- Settings > Letters: collapsible per letter, clickable placeholder chips that insert at
  the cursor, live preview using the SAME merge the sender uses.
- GOTCHA fixed in review: `values` is shared across both invitations, so the conductor's
  copy was rendering `{{recipient_name}}` as the EMPLOYEE. It now overrides
  recipient_name per recipient.

## Absence meeting Outcome (0141)

The meeting form recorded details, attendance review, discussion and minutes but NO
OUTCOME — the worst gap in an absence file, since at appeal the question is always what
was decided, what they were asked to improve, by when, and whether they were told they
could appeal. Version 5 adds: outcome (required), warning issued, warning live until
(`visibleWhen` only once a warning is chosen), improvement targets, review date, and
"Outcome and right of appeal explained to the employee".

**Phil chose it ON the existing form** (one form, one Evidence record) and deliberately
NOT driving the absence stage, because the stage is already auto derived and overriding
it from here would fight that logic.

GOTCHA: `VisibleWhen` is `{ field: string; in: string[] }` — there is NO `notEquals`.
Caught before applying.

## AI Return to Work (0142 + 0143)

Phil's standing rule: a Return to Work happens after EVERY absence at EVERY stage, so
the SYSTEM raises it. `rtw_due_date` + `rtw_evidence_id` live on `absence_events`
(exactly one per absence, no new table). **A TRIGGER sets the due date to
return-or-end-date plus 3**, so it fires for the bulk importer and any future write path
too, not just the action that happens to set the date today. Existing ended absences
backfilled (4 outstanding on Acme at build time). Outstanding = due date set and
evidence null, with a partial index matching that exact filter.

- `return_to_work` master form seeded to every company: "Prepared for you" (AI drafted
  summary + questions, editable), the absence, the conversation, support and next steps,
  confirmation ending with the employee's signature.
- AI goes through the existing `runAi`, so one credit is spent and REFUNDED by runAi if
  the call fails. The system prompt forbids diagnosing, speculating about a medical
  cause, or suggesting an outcome or disciplinary action: it prepares the manager, it
  does not decide. **Nothing is stored until the manager completes the form**, so a
  draft they dislike costs a credit and leaves no trace on the employee's file.
- `components/forms/form-evidence-dialog.tsx` gained a REUSABLE `aiDraft` prop (action,
  label, hint, extraFields) that merges returned values into the answers and remounts
  the renderer via a `key` bump. Any future AI assisted form gets this free.
- `ActionState` gained an optional `data?: Record<string,string>` for handing values
  back to a form. Presentational only, never trusted on the way back in.

## Worth knowing

**This project has NO ESLint configured at all** — no eslint dep, no config, no lint
script. `next build` prints "No ESLint configuration detected" and skips linting, and
tsconfig has `strict` but NOT `noUnusedLocals`. So tsc via `next build` is the ONLY
gate, and unused imports cannot red a build here. Established by the review subagent
2026-07-27. Still worth keeping imports clean, but do not treat it as a build risk.

**iCloud leaves stale `.git/index.lock` files.** It happened twice on 2026-07-27,
failing a commit with "Another git process seems to be running". device_bash CANNOT
delete it (Operation not permitted), so Phil has to run `rm -f .git/index.lock` himself.
Worth putting at the front of any commit block for this repo.

Related: [holidays-absence](holidays-absence.md) [tracking-drift](../process/tracking-drift.md) [phase2-decisions](phase2-decisions.md)
