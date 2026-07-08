# Phase 2 — Forms engine & evidence: test checklist

Run as popups, one check at a time (Pass / Fail / Not tested). Anything marked
Not tested is logged into Phase 11 (Final Testing) in PHASES.md.

Prerequisite before the deploy-dependent checks can run: `npm install` (adds
@react-pdf/renderer), code pushed and deployed to Vercel, migration 0003 applied
(done), and SUPABASE_SERVICE_ROLE_KEY set (the sb_secret_ key) so the evidence
bucket uploads and signed URLs work.

Most of the evidence write path (renderer, PDF, submit, signed URLs, download
audit, anonymisation) has NO submission UI in Phase 2, by design: the complete
a form to satisfy a check loop, and its screens, land in Phase 3 (People) and
Phase 4 (Service Users). Those checks are logged to Final Testing to run cold
when the submission UI exists.

## Verified now (by the agent, no deploy needed)

1. [PASS] Migration 0003 applied to ref bgrtcvyjuwopunpnudeu only (0001 + 0002 + 0003), siblings untouched.
2. [PASS] 8 master templates seeded (4 people: supervision, appraisal, spot_check, competency_assessment; 4 service_users: care_plan_review, risk_assessment, mar_audit, consent_review).
3. [PASS] Seeding is idempotent: re-running left Thistle Care Wales at exactly 8 forms / 8 versions, no duplicates.
4. [PASS] Shared validator unit tests (14/14): required, conditional visibleWhen (hidden field never required), cleanAnswers strips hidden answers, number min, required checkbox must be ticked, multi_select option membership, date format, invalid option rejected, heading never errors.
5. [PASS] Security advisor: all new tables (form_templates, forms, form_versions, evidence, evidence_files) have RLS enabled with policies; no missing-RLS findings. (SECURITY DEFINER RPC lints are expected and each RPC has an internal auth guard.)
6. [PASS] Typecheck clean except the expected "Cannot find module '@react-pdf/renderer'" until npm install.

## To test after deploy (founder path exists this phase)

7. [PASS live 2026-07-08] Create a new company as Founder seeds the Team, first Branch, AND 8 starter forms; note reads "8 starter forms were added". Verified in DB: company "Phase 2 Test" = 8 forms (4 people, 4 service users), 8 versions. (Note: a company created during the build window ran old code and got 0 forms; timing, not a bug.)
8. Re-running seeding for an existing company (or creating, then reusing) never duplicates forms (idempotency verified by agent in SQL; live re-seed has no UI trigger yet, so not retested live).
9. [PASS live 2026-07-08] company.created audit row includes forms_seeded: "8" in its metadata (verified in DB).
10. A Company Admin can read their own company's forms and form_versions; a member of another company cannot (cross-tenant RLS on forms/form_versions/evidence). Needs two tenants + real user sessions: NOT TESTED, logged to Final Testing.
11. form_templates is readable only by the Founder (platform_admin), never by a company member. Needs a real company-member session: NOT TESTED, logged to Final Testing.

## To test cold in Phase 3/4 (needs the submission UI)

12. Complete a seeded form against a record: submit_evidence inserts exactly one immutable evidence row with the answers snapshot, the pinned form_version_id, and the embedded schema_snapshot.
13. The branded PDF is generated at submission, stored in the private evidence bucket, and its pdf_sha256 + pdf_bytes are recorded on the row.
14. Evidence answers exclude any field hidden by conditional logic at submit time (cleanAnswers on the server).
15. Evidence cannot be updated or deleted via the API (no UPDATE/DELETE policy); only submit_evidence / anonymise_evidence RPCs mutate it.
16. Re-submitting with the same evidenceId does not create a duplicate row (idempotent retry returns duplicate: true).
17. submit_evidence rejects a caller who is not a member of the form's company, and (when a branch is given) not a member of that branch.
18. Downloading evidence yields a signed URL that expires after 5 minutes, and each download writes an evidence.downloaded audit row.
19. The evidence bucket is private: a direct unsigned object URL is not accessible.
20. Signature capture stores a PNG data URL in the answer and uploads it as a signature attachment; file_upload stores the file to the bucket with its sha256.
21. anonymise_evidence (Admin/Platform only) blanks answers + author + PDF, flags files purged, removes the storage objects, and writes evidence.anonymised.
22. backfillRetentionForRecord sets retention_until to end of care + 8 years for a leaver/discharged record's evidence.
23. Renderer live behaviour: every v1 field type renders with the canonical controls, conditional fields show/hide live, required markers show, validation errors render under the right field, on mobile too.

## Regression

24. Existing Phase 0/1 flows (login, founder company create + invite, dashboard, Settings) still work; typecheck + next build succeed on Phil's machine after npm install.
