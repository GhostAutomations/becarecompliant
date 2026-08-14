-- =============================================================================
-- 0185 — a new company's staff do not start life 100% non-compliant.
--
-- All 33 seeded training courses were mandatory, so the day a customer opens the Training
-- register every carer is red against every course and the PQS figure starts at zero. That is
-- not a compliance signal, it is a wall — and it is what made Charlotte's /my screen a column
-- of 33 "Out of date" rows for courses nobody had ever recorded (2026-08-11).
--
-- Phil, 2026-08-14: seed a CORE SET as mandatory and leave the rest available but not counted.
-- The 14 below are the ones a UK domiciliary provider is expected to hold for every carer;
-- the other 19 are real training a company may well require, but requiring them is the
-- company's decision, not ours. `mandatory` is editable per course in the course config, so
-- nothing here is a ceiling.
--
-- TEMPLATES ONLY. Existing companies, including Acme, are untouched: this changes what a NEW
-- company is seeded with. Re-running is safe.
-- =============================================================================

update public.training_course_templates
set mandatory = false
where name not in (
  'Welcome to the Company Policy & Procedures',
  'Role of the Care Worker',
  'Safeguarding of Vulnerable Adults',
  'Manual Handling Theory',
  'Manual Handling Passport (AWMHP)',
  'Medication L2',
  'Infection Control',
  'Fire Training',
  'Food Safety',
  'Health and Safety',
  'First Aid Awareness',
  'Consent',
  'Deprivation of Liberty',
  'Information Governance, Record Keeping'
);

-- And make sure the core fourteen ARE mandatory, so the rule is stated in one place and this
-- migration is the whole truth rather than half of it.
update public.training_course_templates
set mandatory = true
where name in (
  'Welcome to the Company Policy & Procedures',
  'Role of the Care Worker',
  'Safeguarding of Vulnerable Adults',
  'Manual Handling Theory',
  'Manual Handling Passport (AWMHP)',
  'Medication L2',
  'Infection Control',
  'Fire Training',
  'Food Safety',
  'Health and Safety',
  'First Aid Awareness',
  'Consent',
  'Deprivation of Liberty',
  'Information Governance, Record Keeping'
);
