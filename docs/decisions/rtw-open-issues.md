# Rtw open issues

> Return to Work — two findings from Phil's live test 2026-07-29 that are NOT yet fixed; pick these up first

Phil ran the full Return to Work test on 2026-07-29. Steps 1 to 8, 10, 11 and 13 PASSED,
including the tailored questions genuinely differing between a two day absence and a
ninety nine day leg injury, which was the whole point of the rebuild. Two things left.

## 1. BUG: signature shows "Not provided" on screen but IS in the PDF

Phil ticked "Completed over the phone" and signed. The Evidence PDF correctly reads
"Interviewer signature confirming a conversation held over the phone — Signature
captured". The Evidence detail PAGE for the same record reads **"Not provided"**.

So the signature IS stored; the on-screen renderer is not finding it. Look at
`app/(app)/evidence/[id]/page.tsx` and how it resolves a `signature` field versus how
the PDF renderer (`lib/evidence/pdf`) does. Likely the page checks the answers object
for a value while a signature is stored as an evidence FILE / attachment keyed by the
field, or it is looking at `employee_signature` (the v1/v2 key) rather than the new
`interviewer_signature`. **The two must not disagree: a compliance record that says a
signature is missing on screen and present in the PDF is worse than either alone.**

Cosmetic, same item: the PDF wraps mid-word ("conversa tion"). Check the label width
handling in the PDF renderer.

## 2. Phil wants the remaining fixed sections AI-tailored too

His words on step 9: "'The conversation' tile ... needs to also be ai and relevent to
the absence."

The v3 form keeps four fixed fields — `fit_to_return`, `work_related`,
`adjustments_needed`, `support_agreed` — sitting in "The conversation" and "Support and
next steps". He wants those tailored to the absence as well, not a fixed core.

Design note before building: the same Evidence constraint applies (see
[rtw-ai-questions](rtw-ai-questions.md) — answers must land in fields that exist in the published
schema). The mechanism already built handles this: AI questions render as real controls
and serialise into one `long_text`. So the likely answer is to FOLD these sections into
the same tailored set rather than invent a second mechanism, keeping only what is needed
structurally (fit to return probably has to stay a real field if anything keys off it —
check before removing). Confirm with Phil whether ANY fixed question should survive.

Related: [rtw-ai-questions](rtw-ai-questions.md) [rtw-form-v2-spec](rtw-form-v2-spec.md) [the-list](the-list.md)
