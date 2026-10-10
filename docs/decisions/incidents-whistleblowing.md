# Incidents whistleblowing

> Incidents & Safeguarding and Whistleblowing (0174-0178, 0182) — the two category lists SIGNED OFF by Phil, who can see what, and why anonymous means anonymous in every column. Read before touching either register, the Reg 80 prefill, or their audit entries.

Built 2026-08-12 (THE LIST item 21, migrations 0174 to 0178) because CIW Reg 80(3)(b) wants
aggregated data on incidents, notifiable incidents, safeguarding and whistleblowing, and BCC held
none of it as structured data. Reg 80 now auto-fills from these, and the dashboard tile counts
incidents awaiting action.

## The category lists — SIGNED OFF by Phil, 2026-08-14

Written by Claude, then read and accepted by Phil. **This is no longer an open question; do not
raise it again.** They remain changeable later; per-company category lists (the way register
column terminology works) would be a separate feature, not a defect.

**Incidents & Safeguarding, 19** — Fall · Medication error · Injury to a service user · Injury to
a member of staff · Pressure ulcer · Choking or swallowing difficulty · Behaviour that challenges
· Allegation of abuse or neglect · Missed or late call · Missing person or unexplained absence ·
Death of a service user · Infection or outbreak · Medical emergency or hospital admission ·
Property damage, loss or theft · Data or confidentiality breach · Fire, flood or utility failure ·
Vehicle or road traffic incident · Near miss · Other
(`lib/incidents/types.ts`, `INCIDENT_CATEGORIES`)

**Whistleblowing, 12** — Abuse or neglect of a service user · Unsafe care or poor practice ·
Staffing levels or missed calls · Medication practice · Falsification of records · Financial
impropriety or theft · Bullying, harassment or discrimination · Breach of confidentiality ·
Health and safety · Recruitment or right to work · Concealment of any of the above · Other
(`lib/whistleblowing/types.ts`, `DISCLOSURE_CATEGORIES`)

## Who can see whistleblowing

**The one table in the product with NO `is_platform_admin()` clause.** Phil, 2026-08-12: "why does
the founder see whistle blowing? they should be company access only". Support mode has nothing to
do with it — RLS reads the real `auth.uid()` — so the founder clause was removed from all three
policies in 0177.

Readers are Company Admin and Responsible Individual only, via `is_responsible_individual(cid)`,
a NEW predicate deliberately NOT folded into `is_company_admin()`, which gates most of the
product. Verified 2026-08-14: a supervisor, a Viewer, on_call and staff all see zero rows.

## Anonymous means anonymous in every column

- Staff raise a concern from the Team Member area through
  `raise_whistleblowing_concern(p_category, p_disclosure, p_named)`, SECURITY DEFINER, which
  resolves the company from `auth.uid()`. `branch_id` is deliberately null: a branch plus a date
  narrows a small team to one person.
- **`created_by` is ALWAYS null** (0178). The first version stored it, which was a second copy of
  the discloser's identity — the claim "the name is deleted, not hidden" was false on the staff
  route until that was fixed at both ends, including a backfill.
- **The audit entry carries no category** (Phil, 2026-08-12), because `audit_log` KEEPS its
  founder clause: a category next to a timestamp and an actor is a route back to who disclosed
  what. Rows written before that change were redacted by **0182** — summary and metadata both,
  leaving who/what/when intact. Rewriting an audit log is not done lightly; a confidentiality
  leak in the one log that must not identify a discloser is the case that justifies it.

## Incidents

`needsAction` deliberately counts CLOSED incidents too: closing an incident does not discharge
the duty to notify. `incidents` is in the realtime publication (0176) — the `<RealtimeRefresh>`
subscription had been silently inert. Whistleblowing is deliberately NOT in that publication.

Related: [reg80](reg80.md) [permission-boundaries](permission-boundaries.md) [the-list](the-list.md)
