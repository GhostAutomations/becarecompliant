# Be Care Compliant: AI Assistant — research and options

A starting point for deciding what an AI assistant in Be Care Compliant should be. It covers what we already have to build on, what the market is doing, concrete ways an assistant could help, a recommended shape, and the decisions that are yours to make.

## 1. What we already have to build on

The platform is unusually well suited to a grounded assistant, because the data is already structured, permissioned and audited.

Feature surfaces the assistant could draw on:

- People compliance: supervisions, appraisals, spot checks, DBS and right to work, training, probation, holidays and absence.
- Service Users: care plan reviews, MAR audits, setup, personal outcomes, satisfaction.
- The compliance loop: checks with due dates and RAG status that rolls up check to record to register to branch to company.
- Forms and immutable Evidence, versioned, with author and timestamp.
- Planner and Whiteboard, Complaints, Invoicing, Reports including the Cardiff PQS return, Notifications and daily digests, Bulk import, and a full audit trail.
- Multi branch, five roles, and database enforced isolation (RLS).

AI plumbing that is already live:

- Direct calls to the Anthropic Messages API in two places today: the Complaints module (drafting investigation responses) and Absence (parsing a policy document). Model is configurable via `ANTHROPIC_MODEL` (for example claude-sonnet-5).
- Per company AI usage credits and metering (migration 0087), with AI available on every tier.

The important consequence: an assistant here should not be a generic chatbot. It can read and act through the same permissioned server actions and data helpers the app already uses, so role and branch scoping and the audit trail come for free, and Service User (health) data never leaves its tenant.

## 2. What the market is doing

The consistent theme across UK care software is using AI to close the gap between the documentation providers must produce and the time they have, and to make inspection readiness continuous rather than a scramble. Always with a human in the loop.

- Birdie is rolling out AI assistance inside assessments to cut documentation time while the care professional stays in control at each step.
- Access Group, Unique IQ, Nourish and Log my Care are all positioning around AI and inspection readiness.
- Newer entrants pitch overnight, audit ready packs and gap detection: Audracare's CareBots generate audit ready reports from fragmented data, Semble launched a "CQC Companion" toolkit, and dedicated audit tools help find gaps and assign corrective actions.
- CQC's stance is that it will not stand in the way of AI, but expects it used in service of safe, person centred care, with human oversight and proper governance.

Regulatory reality that shapes the design: care data is special category health data under UK GDPR, which needs an Article 9 condition on top of a lawful basis, and the ICO notes consent is rarely the right basis in health and social care. The ICO's AI guidance is under review following the Data (Use and Access) Act 2025 (in law from 19 June 2025). In practice this means human in the loop, strict tenant and role isolation, audit logging on access, no training on customer data, and processor terms that already sit in your subscription agreement.

## 3. Where an assistant fits Be Care Compliant

Five modes, roughly in order of value against effort.

**A. Ask your compliance (natural language questions over their own data).**
"Are we inspection ready?" "Who is overdue this week?" "Which service users have no care plan review booked?" "Show me everyone whose DBS expires in 60 days." Answers are grounded in their live RAG data, scoped to the user's role and branch. This is the "answer in one glance" promise, made conversational. Effort: medium (tool calling over existing data helpers plus RLS).

**B. Inspection and PQS pack drafting.**
You already compute the PQS return and can export evidence. The assistant writes the narrative around the numbers: "Draft our PQS submission" or "Summarise our supervision compliance for the inspector," which a manager edits and signs off. Effort: medium. High value because the hard part (the data) already exists.

**C. Form and evidence assistance.**
Draft a supervision, appraisal or care plan review from a few bullet points, summarise a completed form, or suggest actions. This mirrors Birdie's assessment assist. Everything stays editable and is versioned as evidence. Effort: medium, with extra care around special category data.

**D. Proactive insight and risk flags.**
A weekly "what needs your attention" narrative in the digest, plus anomaly flags: a carer with repeated late supervisions, a branch trending red, a service user overdue on multiple checks. Effort: medium to high, but a real differentiator.

**E. Extend what already ships.**
Complaints AI responses and Absence policy parsing already exist. The assistant is simply the general version of these, so there is a natural path from point features to a single assistant.

## 4. Recommended shape

- Not a generic chatbot. A grounded, tool using assistant that only ever reads and writes through existing permissioned server actions and data helpers.
- Architecture: an assistant panel calls a server action, which calls the Anthropic Messages API with tool definitions that map to existing library helpers (registers, on time report, bookings, evidence, and so on). Retrieval over structured data first; documents and evidence later.
- Guardrails, all of which fit your existing patterns: read only by default; any write goes through the same confirm and audit path already used elsewhere; never expose cross tenant data; keep special category data in tenant; no model training on customer data; log every AI action; surface cost in the existing credit meter; keep a human in the loop for anything customer facing or evidential.

## 5. Suggested first slice

The smallest thing that is genuinely useful and teaches you the most: a read only "Ask your compliance" panel, scoped to the user's role and branch, answering from the People and Service User registers and RAG data through a handful of tools. Ship it behind a flag, meter it, and watch what people actually ask. Those questions tell you which of modes B to D to build next, rather than guessing now.

## 6. Decisions that are yours

1. Who is it for first: managers and admins (compliance questions and pack drafting), or frontline staff (form drafting)?
2. Read only first, or allowed to take actions (book a check, draft a form) with confirmation?
3. Where does it live: one global side panel, or embedded per module?
4. Which tiers get it (it is already metered), and does it lean on the Diamond usage only model?
5. Data boundary: comfortable for it to read Service User (special category) data from day one, or start People only and add Service Users once the guardrails are proven?

My recommendation if you want a steer: build mode A (read only "Ask your compliance") for managers and admins, People and Service Users both but read only, as one global side panel, behind a flag on Pro and above. It is the lowest risk, reuses everything you have, and turns into modes B to D naturally.

## Sources

- [Birdie: best domiciliary care software 2026](https://www.birdie.care/blog/best-domiciliary-care-software)
- [The Access Group: AI in care regulation and inspection readiness](https://www.theaccessgroup.com/en-gb/blog/hsc-ai-in-care-regulation-meeting-new-standards-of-inspection-readiness/)
- [Unique IQ: CQC AI guidance for home care](https://www.uniqueiq.co.uk/resource/cqc-ai-guidance-home-care/)
- [Audracare: AI audit ready compliance reports](https://audracare.co.uk/insights/ai-audit-ready-compliance-reports/)
- [Digital Health: CQC compliance toolkit for private clinics](https://www.digitalhealth.net/2026/04/cqc-compliance-toolkit-launched-to-support-private-health-clinics/)
- [ICO: guidance on AI and data protection](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/)
- [ICO: rules on special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-rules-on-special-category-data/)
