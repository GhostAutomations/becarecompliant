# Audit 2026 10 decisions

> Phil's standing decisions from the October 2026 security and bug audit (popups 3 to 4 Oct) that apply to future BCC work, e.g. dash rule scope, who counts in Readiness, support mode and Evidence.

- [stated] No-dash rule scope (R1): a lone dash in an empty table cell or field is allowed; dashes used as punctuation in sentences are not.
- [stated] "Whiteboard" stays as the Planner page name despite containing a banned word (R2).
- [stated] One counting rule (B4): staff on maternity leave or long term sick, and Service Users in hospital, count everywhere (registers, dashboard, Readiness); inspectors take the reason into account.
- [stated] Support mode (S4): Evidence stays company only, never filed by the Founder; record edits, settings, users and forms stay open in support mode, audit tagged.
- [stated] Supervisors and Recruiters see and send the Carer login for people in their own branch (B2).
- [stated] Settings, Users: "Active users" counts active logins only (W3); each training percentage is labelled with what it measures rather than unified (W4).
- [stated] 2026-10-04: frustrated at pasting SQL himself ("you have access to supabase"); wants migrations applied directly when the session allows it.
- [stated] 2026-10-11 (popup, second audit of 10 Oct, report SECURITY-AUDIT-2026-10-10.md in BCC Documents): fix the cross-company group first (F1 to F4, F6, F12, F14, F15, F19, F41, F51, with F74 for the clock change); ask about the remaining Medium and Low findings one area at a time later, never all at once.
- [built] 2026-10-11 (0443): a company owned row never moves to another company, and every link it holds stays inside its own company; every stored file path starts with its row's company id. A migration that adds a company owned table ends with `select public.install_company_link_triggers();`, and code checks `pathInCompany` (lib/storage/company-path.ts) before it signs or reads a stored file.
