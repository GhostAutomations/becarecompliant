-- 0156_clear_readiness_snapshots_after_recalibration
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- WHY. 0154 and 0155 changed HOW a requirement is scored: every check is now mapped rather than
-- one per requirement, switched off definitions no longer count, mandatory training carries a
-- real percentage, and the six month on time rate is a signal. Acme's Care and Support check
-- signal moves from 100 (a single dead Risk Assessment) to 43 (60 of 106 overdue).
--
-- The snapshots written before today were produced by the OLD method. Leaving them would make
-- the dashboard draw "down 30 since 29 Jul" and the readiness page draw a red arrow on every
-- theme, reporting a change of measurement as if the provider's performance had collapsed. A
-- wrong number under a compliance score is worse than no number.
--
-- Snapshots are written every time somebody opens the readiness page, so the trend rebuilds
-- itself from the next visit onwards. Nothing a customer entered is lost: these rows are derived.

delete from public.framework_readiness_snapshots;
