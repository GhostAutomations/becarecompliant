# Test checklist: Return to Work questions by text (migration 0331)

Phil, 2026-09-25: the drafted questions stay on the Return to Work (no more AI credits), the
person who drafted them checks them and sends a text, the employee signs in to their portal and
answers every question, and the answers come back for a Supervisor or above to check, change
after a phone call if needed, and record.

## Database (rolled back probe, scripts/rtw-questions-probe.sql): PASS 2026-09-25
1. Company Admin can create and read the saved questions. PASS
2. The employee cannot read the table directly (0 rows). PASS
3. The employee cannot see a draft that has not been sent (null). PASS
4. Once sent, the employee reads their own questions, without the manager's summary. PASS
5. My area lists it as waiting (1). PASS
6. Another employee cannot read or answer it ("could not be found"). PASS
7. Answers are refused when one is missing, blank, not Yes or No, or not one of the choices. PASS
8. Valid answers are saved and trimmed; a second submit changes nothing ("already"). PASS
9. The branch Supervisor sees the answers. PASS
10. Nobody can delete the row; a signed out caller cannot call the functions. PASS

## Live (after deploy)
R1. Draft it for me on a Return to Work: questions appear and are saved; close and reopen, the
    same questions are there and no second AI credit is used.
R2. Reword a question and remove one, then Send to (name) by text: the text arrives from
    07886 077200 with a link.
R3. The dashboard tile and the Absence page show "Questions sent".
R4. Tap the link signed out: the login page, then straight to the questions after signing in.
R5. Leave a question blank and send: it says which one needs an answer. Answer them all: thank you.
R6. The dashboard tile shows "Answers in" without a refresh.
R7. Open the Return to Work: the answers are filled in with the "answered through their portal"
    note. Change one answer and save.
R8. The Evidence shows the note naming who answered and which answer was changed, by whom.
R9. The link now says the answers were sent; My area no longer lists it.
