# Help requests during testing

> Standing rule from Phil (2026-07-12, upset): a help request inside a test popup must halt testing and get a real visible walkthrough, never another popup. Extended 2026-08-19: 'talk me through it' means HE presses the button, not that Claude narrates while doing it

During Phase 6 testing Phil answered popups with "this doesnt make sense to me", "tell me how to test this, talk me through it", "i dont know what you are talking about". Claude kept issuing popups and wrote the walkthroughs as plain between-tool-call text, which the UI summarised away, so Phil never saw the help he asked for. He called the responses unacceptable.

**Why:** Popup answers that are questions or confusion are HELP REQUESTS, not test results. And text written between tool calls is summarised, so instructions sent that way effectively never reach him.

**How to apply:** (1) If a popup answer contains a question, confusion, or "talk me through it", STOP the test sequence and reply with a complete, simple, numbered walkthrough. (2) Any instructions or content Phil must read that is emitted between tool calls MUST go through send_user_message so it renders verbatim. (3) Only after he confirms he has done the steps (or asks to move on) does the next Pass/Fail popup appear. (4) Prefer tests Claude can run itself (DB queries, Vercel checks, live cron runs) over asking Phil to drive Terminal.

## Extended 2026-08-19 — "talk me through it" = HE drives

Phil said "founder signed in, talk me through it" about deleting a company. Claude read that as
"narrate while you do it", walked through each step AND pressed the buttons, and deleted Acme
itself. Phil: **"i didnt want you to delete it, i want you to talk me through it so i could
delete it."**

**Why it matters beyond the manners:** the point of a live test is that the control works under
HIS hand on HIS screen — a founder who has never pressed the button has not tested it. Claude
pressing it proves only that Claude can.

**How to apply:** when Phil asks to be talked through anything, Claude writes the numbered steps
(via send_user_message, starting from wherever he actually is — ask or check the screen) and
then TOUCHES NOTHING. Verify afterwards, from the database, the bucket and the third party's own
screen. If Claude thinks it should press something to save time, ask by popup first. Recovery
when it goes wrong: own it plainly, say what is now true including anything the undo does NOT
undo (restoring the deleted company did not bring its Stripe subscription back), and offer the
way back.

Related: [phase6-built](../decisions/phase6-built.md) [company-deletion](../decisions/company-deletion.md) [look-at-the-artefact](look-at-the-artefact.md)
