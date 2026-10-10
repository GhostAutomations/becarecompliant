# Phase2 decisions

> BCC Phase 2 (forms engine & evidence) agreed scope decisions from popups 2026-07-08

Phase 2 = Forms engine & evidence. Scope agreed with Phil by popup on 2026-07-08 (all recommendations except templates):

- v1 field types the shared renderer must support (FULL set): short text, long text, number, date, single select, multi select, checkbox, radio, section heading, signature, file upload, plus conditional logic (visibleWhen). Build the renderer complete once.
- Form JSON schema shape: sections then fields. One JSON doc = ordered sections, each with a title and an ordered list of typed fields (key, type, label, required, options, validation, visibleWhen). Conditional logic via visibleWhen.
- Versioning: separate immutable `form_versions` table (form_id, version, schema jsonb, status draft/published/archived). Evidence pins `form_version_id` AND embeds a copy of that version's schema snapshot so evidence renders identically forever.
- Evidence answers: single immutable jsonb snapshot per submission (answers + author + timestamp + form_version_id + schema snapshot). Append-only, NO update/delete via API. Uploaded files in private bucket, referenced by path.
- Starter templates seeded per new company (Phil chose Broader 8, idempotent seeding): Supervision, Appraisal, Care Plan Review, Risk Assessment, MAR (Medication) Audit, Spot Check, Competency Assessment, Consent Review.
- GDPR evidence retention: default minimum 8 years from record end of care (IGA/NHS Records Management Code); anonymise on expiry not hard-delete; hard delete only on verified SAR erasure. SAR export + anonymisation are groundwork this phase, wired fully later.
- Signed URL TTL for evidence file downloads: 5 minutes (300s). Every download audit-logged.
- PDF evidence (Phil mid-phase request 2026-07-08, folded INTO Phase 2): on Form submission the completed form renders to a branded PDF stored immutably in the private bucket as the inspector-facing evidence, PLUS the jsonb answers snapshot is kept (drives RAG/reporting/anonymisation). Append-only: PDF is generated + uploaded FIRST, then the evidence row is inserted in one shot with pdf_path + pdf_sha256 already set (nothing updated after creation). Engine: @react-pdf/renderer (new dependency, Phil approved via recommendation; sandbox can't install so Phil builds/deploys on his machine).
- Master template library lives in a platform-curated `form_templates` table; each new company seeds its own copies via SECURITY DEFINER `seed_company_form_templates(cid)` (idempotent). Founder curates master (Phase 5/9).

Research citations captured: CQC SAF 6 evidence categories / 34 quality statements (still active 2026); CIW 4 themes (well-being, care & support, leadership & management, environment), Wales ratings since Apr 2025; DBS keep <=6 months (outcome only, not certificate); right-to-work employment + 2 years.

Related: [project-state](project-state.md) [brand-decisions](brand-decisions.md) [permission-boundaries](permission-boundaries.md)
