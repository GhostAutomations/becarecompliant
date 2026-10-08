# Test checklist: Tickets (0432, 2026-10-08)

Signed in as a company user (not the founder in support mode), e.g. Bev Admin on Bevan.

- T1 Sidebar shows Tickets under Settings; Tickets page shows the empty state and Raise a ticket.
- T2 Report a problem: department list matches the sidebar; choosing People offers its parts (Compliance, Training, Holiday, Absence).
- T3 Raise a red problem with one screenshot: lands on the ticket, screenshot opens.
- T4 Founder SMS arrives naming the company, who raised it, Red and the subject.
- T5 Founder console Tickets tile shows 1 red; the ticket opens with "You were texted at".
- T6 Founder replies: reply shows on the company ticket (oldest at top) and the raiser gets a branded email with a View your ticket button.
- T7 Founder sets In progress then Resolved: status pill changes on both sides; raiser emailed.
- T8 Request a new feature: placeholders "What should it be called?" and "Give as much information as possible."; cannot raise without the chargeable tick.
- T9 Company replies: lands in the Founder inbox and email.
- T10 Visibility: a Supervisor sees only their own tickets; Admin and managers see all (proved in the rolled back probe 2026-10-08, live check optional).

## Results 2026-10-08 (Claude in Chrome, Bev Admin on Bevan, then Founder)
- T1 PASS. T2 PASS (departments matched Bev's sidebar; People offered Compliance, Training, Holiday, Absence).
- T3 PASS (Ticket 1 red problem; screenshot proved on Ticket 2). T5 PASS (tile 1 red, 1 green; "You were texted at 15:53").
- T6 PASS on screen; raiser email not sent because Bevan is a test company (muted by design, message shown). Email on a real company is proved on its first ticket.
- T7 PASS (Resolved pill, same muted email note). T8 PASS (placeholders; refused without the tick, text kept; Ticket 2 raised with screenshot).
- T9 PASS (Founder inbox: "Ticket 1 reply from Bevan Care Ltd"). T10 PASS in rolled back probe.
- T4: Twilio accepted the text at 15:53; arrival on Phil's phone to confirm.
