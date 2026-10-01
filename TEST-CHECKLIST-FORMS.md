# Test checklist: a refused save keeps what was typed (DEF-101)

Standing rule (Phil, 1 Oct 2026): on every form and data entry point, when a save is refused (a
required field missing, a bad value, a duplicate), the message shows and everything already typed
stays. An "add" form still empties after a SUCCESS.

How to test each one: fill in several fields, cause a refusal the browser cannot catch (a value the
server refuses), press save, and check every field still holds what was typed. Then put it right,
save, and check it saved.

## Already safe before DEF-101
- Shared ActionForm (34 screens), Add person, Manage record (DEF-098), Create company (DEF-091),
  check completion and built forms (answers held in the page), Planner booking, record Updates,
  paper evidence upload, question bank.

## Changed in DEF-101 (submit through onSubmit)
Sign in, Forgot password, Reset password, Welcome (set password); Absence meeting response;
Complaints: create, edit, status, response (send and record), initial response (send and record);
Demo survey; Founder: mobile number, library push, training courses (add, edit, remove); Readiness
CIW notices (add, resolve); Incidents: create, edit, status; Invoicing: invoice builder, private
client; Website trial request; On Call: log, rota scope, shift (add, edit, remove); Public forms
(no login); Regulation 73 and 80: report lists and the report forms (Save draft, Save and submit);
Service Users: care plan editor, care plan upload, create, edit, outcomes (add, update and the rest),
satisfaction questions (add, rename, remove, restore); Settings: absence settings, branch rename,
invite, notifications, team member controls; Raise a concern; Training course settings;
Whistleblowing: create, edit, status.

## Live checks
- [ ] FK1 Settings, Invite: an email already in use is refused; name, email, role and branch stay.
- [ ] FK2 Service Users, Add service user: a refused save keeps every field.
- [ ] FK3 Complaints, New complaint: a refused save keeps every field.
- [ ] FK4 Regulation 73 report: Save and submit with no signature is refused; every typed section stays.
- [ ] FK5 Public form (no login): a refused submit keeps the answers.
- [ ] FK6 An add form still empties after a success (Satisfaction: Add a question).
