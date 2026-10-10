## Phase 14, Operation New Dawn: replacing Care Planner and Birdie (agreed 2026-09-26)

**Goal.** Be Care Compliant becomes the one system for Thistle: planning, notes, MAR and compliance. Wales only for now. Replaces Nourish Care Planner (planning) and Birdie (notes, MAR and the rest).

**Decisions (Phil, 2026-09-26)**
- Planning, MAR and notes are built in one go, not staged.
- Launch at Thistle's Cardiff branch first to test, then Newport.
- New Dawn starts once Operation Thistle has signed off (existing rule).
- The Care Planner API (Nourish Empower, OAuth2: appointments, carers, clients, timesheets, webhooks) is used for a one off import per branch at switchover: clients, carers and visit patterns. No ongoing sync. Newport stays on Care Planner and Birdie until its own switchover.
- Birdie takes its visits from Care Planner, so each branch moves off both on the same day.

**Before building**
- Research what the Welsh regulations (RISCA service provider regulations) and statutory guidance require of care records and medication records, and what Cardiff and Newport councils require for visit monitoring.
- Design offline recording for carers with no signal before the carer app is built (the carer app is an installable web app first).
- Map Thistle's data from Care Planner and Birdie exports for the import.
- Ask Nourish (through Thistle) for API access and whether there is a fee.

**Before Cardiff goes live**
- A few paid hours from a Clinical Safety Officer on the MAR (record, don't decide). DCB0129 is England only, but the risk is the same.
- Cyber Essentials, professional indemnity and cyber insurance, and an independent penetration test (BCC becomes the live care record).
- Paper fallback: printable rota and MAR each evening, plus an out of hours support plan.
- Run alongside Care Planner and Birdie on a small group of service users before switching the branch over.

**Then Newport**, using the same import and switchover checklist once Cardiff is proven.
