# Rtw form v2 spec

> Return to Work form v2 — FULLY SPECIFIED AND DECIDED 2026-07-27, ready to build with no further questions for Phil; item 1 on [the-list](the-list.md)

## STATUS: decided and ready to build. Do NOT ask Phil anything before starting.

Every open question was closed on 2026-07-27 and the two risky mechanisms were
investigated in code. Trust the findings below rather than re-deriving them. Phil is
waiting on the build, not on a conversation.

Build order suggestion: the re-bake routine first (item 3, the only real machinery),
then the new form version, then the presets, then review and log.

### 1. Questions become real FIELDS, not one text box

Phil: "all the text goes in to one box, how about creating the questions as fields so
they can be seen clearly and completed clearly, there will be text field, multiple
option and yes no, plus any other needed."

Standard Return to Work questions as schema fields of mixed types (short_text,
long_text, single_select, yes_no — `yes_no` exists from the Phase 5 Wave 2 field set).
Suggested set: doctor seen, fit note provided, medication likely to affect work or
driving, outstanding medical appointments, work related (exists), anything at work
making it worse, what support would help, fit to return (exists), adjustments needed
(exists, conditional).

**DECIDED — what the AI still drafts:** keep `absence_summary` as an AI draft, and
replace `suggested_questions` with a small "anything else worth asking about this
absence" box. The AI ADDS to the standard set rather than replacing it. Update the
system prompt in `lib/absence/rtw-actions.ts` to match (it currently asks for SUMMARY and
QUESTIONS sections).

### 2. Trigger point: REMOVE it

Remove `trigger_reached` entirely. `deriveAbsenceStatus` already knows the stage and
Bradford score, so asking a manager to tick it is asking them to restate what the app
knows, and it can only ever disagree. Show the derived state as read-only context in the
dialog if it is wanted at all.

### 3. Interview conducted by — DECIDED: real dropdown, done properly

**Phil chose the full build by popup 2026-07-27**, over a prefilled text box and over
bake-now-fix-later. His reasoning accepted: a dropdown that quietly goes stale is worse
than a text box, and a stale name on an employment record matters at an appeal.

**Why a render-time injection does NOT work (investigated, do not retry it):**
`lib/form-validate.ts` ~line 152 validates `single_select` server side with
`allowed.includes(String(value))` and returns "Choose one of the options." The
authoritative check reads the STORED published schema, so options injected only in the
browser are rejected on save.

**So:** bake the company's user list into the `conducted_by` field options in every
company form copy, exactly as migration 0076 (`form_branch_field_options`) does for
branches — read that migration first, it is the template — AND add a small re-bake
routine called whenever a user is added, disabled, deleted or renamed, so the list
cannot rot. Reuse `listMeetingConductors(companyId)` for the list.

**Bonus:** the same routine fixes the branch field's existing rot, since 0076 baked
branches once and nothing re-bakes them either. Wire both while you are in there.

### 4. Completed over the phone changes whose signature is captured

**INVESTIGATED: a checkbox CAN drive `visibleWhen`.** `isFieldVisible` does
`String(controlling)`, so `true` becomes `"true"` and `in: ["true"]` matches.

**The trap:** `if (controlling == null) return false`. An untouched checkbox is
`undefined`, so a field with `in: ["false"]` is HIDDEN until someone clicks the box —
which would hide the employee signature by default. **Fix: preset
`completed_over_phone: false` in presetAnswers so it is never undefined.** With that,
Phil's checkbox design works exactly as asked; the single_select fallback is NOT needed.

Two signature fields: `employee_signature` (`in: ["false"]`) and
`interviewer_signature` (`in: ["true"]`, labelled so it is obvious the interviewer is
signing to confirm a phone conversation).

### 5. Interview date autofills to today

Preset with the day it is being completed, still editable. Same presetAnswers mechanism
as the checkbox default.

## Where the current version lives

Migrations 0142 (absence_events columns + trigger) and 0143 (the v1 form) shipped
2026-07-27. The form is seeded per company from a master template, so v2 follows the
same pattern as migration 0141 did for the absence meeting outcome: update
`form_templates`, then publish a new version for each company copy whose latest
published schema lacks a marker field. UI lives in `components/absence/absence-view.tsx`
(the Return to Work section) and `lib/absence/rtw-actions.ts`.

Related: [the-list](the-list.md) [letters-rtw](letters-rtw.md) [holidays-absence](holidays-absence.md)
