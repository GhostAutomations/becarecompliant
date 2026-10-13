# Test checklist: Service User Audit percentages up to 125, 2026-10-13

Phil's decision: publish version 2 (audit F128). Migration 0455 (template, Bevan, Demo); 0456
(Thistle, on Phil's go). Decision: `docs/decisions/audit-check.md`.

| # | Check | Result |
|---|-------|--------|
| A1 | Inventory before: every audit and audit_su version and template with the two fields and its max | DONE: audit (People) v1 at 125 for Bevan, Demo, Thistle and the template; audit_su v1 at 100 for Bevan (63 Evidence), Demo (121), Thistle (14) and the template; no other form or function has the fields |
| A2 | Dry run of 0455: Bevan and Demo get v2 at 125/125, v1 byte for byte unchanged, v1 and v2 differ only in those two limits; template v2 at 125; Thistle untouched; Evidence count unchanged; People Audit untouched | PASS (rolled back) |
| A3 | PQS, Readiness and Reg 80 do not read these answers (they count completed audits), so a value over 100 moves no figure | DONE by reading the code (lib/export/on-time.ts, lib/framework, lib/reg80/prefill.ts: audit completions only) |
| A4 | Bevan live: a Service User Audit with 108% saves | PASS (0455 applied, advisor unchanged. Chrome as Bev Admin, ZZ TEST Service User Two, Audit with ECM: the boxes show max 125; 108% average call duration saved; Evidence on version 2 with 108, its own snapshot max 125) |
| A5 | Bevan live: 125% saves | PASS (125% on both calls attended and average call duration saved) |
| A6 | Bevan live: 126% refused with a clear message, what was typed kept | PASS (126%: the box refused "Value must be less than or equal to 125" and the form did not save; with the box limit removed in the page the server refused "Please correct these answers: Average call duration (%) (must be 125 or less)."; 126 stayed in the box, nothing saved) |
| A7 | Bevan live: the People Audit behaves as before (125 saves, 126 refused) | PASS (People Audit on a Bevan person: both boxes max 125; 108 and 125 accepted, 126 refused the same way; still version 1 with its 68 Evidence) |
| A8 | Thistle (on Phil's go): v2 at 125, v1 and its 14 Evidence untouched | PASS (Phil's go by popup; 0456 applied, advisor unchanged: Thistle's Service User Audit now version 2 at 125/125; version 1 byte for byte unchanged (same fingerprint before and after) with its 15 Evidence, one more than this morning because Thistle completed an audit today) |
