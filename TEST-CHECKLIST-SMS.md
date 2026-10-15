# Test checklist: SMS one segment, credits, Twilio balance, 2026-10-15

Phil's job. Migration 0486. Decision: `docs/decisions/sms-one-segment.md`.

Baseline: Thistle 9 texts, 18 segments this month, balance 3,991 (ledger 1,991), AI 998 (950); Bevan
4,015 (matches), 0 texts in Oct (3 texts, 6 segments in Sep); Demo 100, 0 texts. Every usage row 2
segments and no cost. billing_usage_runs empty. Founder console 354 ms, Usage 214 ms, Goodwill 230 ms
(median of 10). Texts before: RTW "Hi {first}, {company} would like you to answer a few questions
before your Return to Work meeting. Please sign in to answer them: https://www.becarecompliant.com/my/return-to-work/{id}";
chaser "Be Care Compliant: {n} compliance checks are {d} or more days overdue at {company}. Please
sign in to review."; ticket (four lines, with the link); trial request (one line).

| # | Check | Result |
|---|-------|--------|
| S0 | Unit tests: GSM 7 or not, folding, extension characters, the 160 limit, a long company name, accents and an emoji in a name, the refuse path, every text fits, no dashes; the Twilio colours | PASS (lib/sms/segments.test.ts 12, lib/sms/balance-tone.test.ts 1) |
| S1 | Rolled back proof of 0486: Thistle 1,991 and 950; every balance equals its ledger; spend, refund, top up (twice with one reference: once), monthly grant again (nothing); a direct balance change refused | PASS (before applying) |
| S2 | Bevan: one Return to Work text to the Founder's mobile: one credit, usage units 1, SID recorded, cost recorded later, short link opens the questions after sign in | |
| S3 | Bevan: a forced failure gives the credit back | |
| S4 | Founder console: the Twilio tile with the live balance, checked time and Refresh; console no slower | |
| S5 | Every SMS figure the same on the dashboard tile, Billing, Settings Usage, Founder console and Founder usage | |
| S6 | Thistle dashboard: SMS tile reads Unlimited | |
