-- =============================================================================
-- 0182 — take the disclosure CATEGORY back out of the whistleblowing audit trail.
--
-- Phil's decision, 2026-08-12: audit entries for a whistleblowing disclosure carry no
-- category. The code was changed the same day, but the rows written BEFORE that change kept
-- it, in two places: the human summary and the metadata jsonb.
--
-- WHY REWRITE AN AUDIT LOG AT ALL. This log is meant to be immutable, and that is the right
-- default. But a whistleblowing audit entry that names the category, next to a timestamp and
-- an actor, is a route back to who disclosed what — which is the single thing the
-- whistleblowing feature exists to prevent, and the reason this is the one table in the
-- product with no founder access clause (0177) and the reason created_by is always null
-- (0178). Leaving a confidentiality leak in place to preserve the tidiness of a log is the
-- wrong trade. The entry itself is kept: WHO did WHAT and WHEN are untouched, and only the
-- category is removed, so nothing about accountability is lost.
--
-- Deliberately written as a pattern match rather than against two known ids, so it is correct
-- in any environment and safe to run again. It touches whistleblowing rows only.
-- =============================================================================

update public.audit_log
set summary = regexp_replace(summary, '\s*\(.*\)$', ''),
    metadata = metadata - 'category'
where action like 'whistleblowing.%'
  and (summary ~ '\(.*\)$' or metadata ? 'category');
