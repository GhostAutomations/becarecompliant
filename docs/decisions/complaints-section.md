# Complaints section

> BCC Complaints = agreed Additions item: third top-level section, case-lifecycle model; PERMANENT rule 2026-07-25: the Type field alone decides the formal flow

Complaints section = agreed **Additions** item (Phil popups 2026-07-11), logged in PHASES.md Phase 10. A THIRD top-level section beside People and Service Users.

Vocabulary (confirmed): section "Complaints", one record = a "Complaint", collection = "Complaints register".

Model (confirmed): **case with an Open / In Progress / Closed status lifecycle**, NOT the recurring Check/RAG/recurrence model. A complaint is a one-off case with dates (raised, occurred, acknowledged, investigation completed, outcome). A hybrid (optional due-dated acknowledge/respond items showing RAG) was offered and NOT taken; revisit only if Phil wants overdue-response alerts.

PERMANENT RULE (Phil popup 2026-07-25, verified live same day): **the Type field (Formal/Informal) ALONE decides whether a case gets the formal investigation + response flow** (response deadline from complaints_config, investigation/response forms). The Complaint/Concern category (Concern, Complaint, Minor Complaint, Audit Identification) does NOT gate it. Never revert isFormalComplaint to the old "concern_type='Complaint' AND Formal" rule. Implemented in lib/complaints/logic.ts (single-arg isFormalComplaint), both actions call sites, and the drill-in page; informal copy reads "This case is informal, so a formal investigation and response are not required". Migration 0124 backfilled response_due for open Formal cases in other categories. Still to test cold (in PHASES.md Final Testing): editing a case's Type from Formal to Informal clears the deadline, and Informal to Formal derives one.

The three complaint forms already in the founder library (complaints_concerns, cardiff_complaint_response, newport_complaint_response) are this section's forms and attach as Evidence; on build, repoint their population from the interim 'service_users' to a new 'complaints' value. GDPR: complaints can hold special-category SU data, apply the same isolation + read-audit rigour as Service Users.

COMPLAINTS ABOUT TEAM MEMBERS (Phil asked 2026-09-15, built + tested live same day, migration 0271). A complaint can name one or more team members (`complaint_people` join table, picker narrowed to the complaint's branch). `complaints.upheld` is recorded only when the case is CLOSED ("Yes, upheld" / "No, not upheld" / not decided). The team member's record gets a Complaints tile: count, `describeCounts` wording ("1 upheld, 2 not upheld, 1 still open"), and a View link to /people/[id]/complaints which lists ONLY that person's complaints. Fairness rules Phil's design protects: a complaint not upheld is still listed so the record is complete but never shows as a bare count; "not decided" is never treated as "not upheld"; the tile's number only colours on UPHELD (1 = amber, 2+ = red, otherwise plain). Visible only to roles that can already open Complaints. Pure logic in lib/complaints/person-complaints.ts (9 tests).

DEF-020 (found by live test 2026-09-15, fixed same day): a complaint could name team members and show on their record, but the COMPLAINT itself never displayed who it named. Case detail now has a "Team members named" cell beside Related service user, each name a link to their record, "None" when empty. Another case of [look-at-the-artefact](../process/look-at-the-artefact.md) - code and tests were green throughout.

Related: [phase5-built](phase5-built.md) [project-state](project-state.md) [phase3-decisions](phase3-decisions.md) [phase4-built](phase4-built.md)
