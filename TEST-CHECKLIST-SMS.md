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
| S2 | Bevan: one Return to Work text to the Founder's mobile: one credit, usage units 1, SID recorded, cost recorded later, short link opens the questions after sign in | PASS (balance 4,015 to 4,014, ledger equal; usage units 1, length 122, SID recorded; one text on Phil's phone, link to sign in, Phil 2026-10-15; an Admin following it gets "switched off" because the page is the employee's; unknown code shows "This link has expired". Cost fills at the next morning job. Test absence, questions and link deleted after, Gethin's mobile back to empty) |
| S3 | Bevan: a forced failure gives the credit back | PASS by rolled back proof of the exact calls the code makes (4,014, spend 4,013, refund 4,014, ledger equal each step). A live Twilio refusal cannot be forced from a test company without changing the live Twilio settings |
| S4 | Founder console: the five top tiles on one line, the same height; the Twilio tile with the live balance and credits held (no checked time or Refresh, Phil 2026-10-15); console no slower | PASS (Phil 2026-10-15: five tiles at 78 px, £25.42, 1,991 credits held). Timing: whole site slower at the time of the check (sign in 761 ms, Usage 525 ms against 214); the console's gap over Usage 90 ms against 140 at baseline, so no slowdown from the change |
| S5 | Every SMS figure the same on the dashboard tile, Billing, Settings Usage, Founder console and Founder usage | PASS. Bevan: dashboard 1 Sent, Unlimited; Billing Unlimited texts; Settings Usage 1 message, 1 segment; Founder usage 1 event, 1 segment; ledger 4,014 = balance. Founder console Usage 19 SMS = Thistle 18 + Bevan 1 |
| S6 | Thistle dashboard: SMS tile reads Unlimited | PASS (checked in Chrome in support mode: 9 Sent, Unlimited in green) |

Not tested live: the overdue chaser (the morning job needs its secret, and a test company's chaser would go to managers, who are not the Founder's mobile, so it is skipped). Its wording is proven by the unit tests.
