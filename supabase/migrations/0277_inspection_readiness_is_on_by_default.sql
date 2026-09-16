-- Be Care Compliant — Inspection Readiness is on for everybody, not a per-company beta flag.
--
-- Phil, 2026-09-16, looking at his own dashboard: the Compliance score card was explaining that
-- "Inspection Readiness is not switched on for this company, so there is no score to show" — on
-- the live product, to its owner. A flag that is off for every company is not a beta any more,
-- it is a feature nobody has seen, and the most prominent card on the dashboard was spending its
-- space apologising for it.
--
-- BOTH HALVES, or the change does nothing anybody can see: the DEFAULT changes so a company
-- created tomorrow has it, and the EXISTING rows are switched on so the two companies that exist
-- today have it as well. Changing only the default is the usual way this gets half done.
--
-- The column stays, so a company can still be switched off individually if a customer ever wants
-- that. What changes is which way round the question is asked.

alter table companies
  alter column framework_enabled set default true;

update companies
   set framework_enabled = true
 where framework_enabled is distinct from true;

comment on column companies.framework_enabled is
  'Inspection Readiness. ON by default since 2026-09-16: it was a per-company beta that had never been switched on for anyone, so the dashboard was explaining its own absence. Kept as a column so an individual company can still be switched off.';
