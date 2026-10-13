# Tickets

> Phil's spec (2026-10-08) for the Tickets app in BCC: office users raise problems or feature requests to the founder, RAG rated, founder SMS and Founder console tile. Read before touching tickets.

- [stated] Built now, in the current phase, in Be Care Compliant only (this session/project is BCC only).
- [stated] A "Ticket" app sits in the sidebar under Settings, for office users from Supervisor up.
- [stated] First dropdown: "Report a problem" or "Request a new feature".
- [stated] Problem: pick a department from the ones in their own sidebar, then that department's sub sections (e.g. People: Compliance, Training, Holiday, Absence; Service Users: Compliance, Outcomes, Satisfaction); subject; description ("give as much information as possible"); up to a couple of screenshots.
- [stated] Feature: subject greyed placeholder "What should it be called?", description placeholder "Give as much information as possible", and a required acknowledgement: "I understand that adding this feature may be chargeable. If so, we will come back to you with a quote."
- [stated] Both carry a RAG rating: red = urgent response, amber = can wait over 24 hours, green = can take up to five days.
- [stated] Founder gets an SMS when a ticket is raised, naming the company and the rating; Founder dashboard has a Tickets tile.
- [stated] Company can follow status and replies (popup choice).
- [stated] Visibility: Admin, managers and RI see all their company's tickets; everyone else sees only their own.

## Ticket numbers and one email (Phil, 2026-10-13; migration 0453)

- **Numbers per company, no gaps.** Each company numbers its own tickets from 1. The number is taken
  from a per company counter (`support_ticket_counters`) inside the same transaction as the
  insert, after every check, so a refused save or a rolled back test never uses one up. Taking it
  locks the company's counter row, so two tickets raised together queue and never share a number.
  Unique per company (`support_tickets_company_number_key`).
- **Thistle renumbered** 1 to 6 in the order raised (was 3, 4, 5, 6, 7, 14), next 7, each ticket's
  old number kept in its audit history. Done separately, on Phil's go.
- **One save, one email.** The founder's reply box has the status beside it. One press saves the
  reply and the status together (`founder_update_support_ticket`) and sends one email that says
  both. Words only: one email with the reply. Status only: one short email (popup: "Yes, one
  short email"). Nothing changed: refused, no email.
- **Statuses stay Open, In progress, Resolved** (popup: no Closed).
- **A customer's reply on a Resolved ticket reopens it to In progress** (popup). The founder gets
  one notice saying so; the customer is not emailed (they wrote it).
- **Every email to the customer is recorded** (audit `ticket.emailed`): to whom, the subject,
  whether it went or why not.
- **A number is never reused** (Phil, 2026-10-13: "the next ticket shouldn't be ticket one. It
  should be counted in order of the tickets that are already there"). Removing tickets does not
  wind the counter back: Bevan's test tickets 1 to 3 were removed and its next ticket is 4. Only a
  ticket that never saved (refused or rolled back) gives its number back.

## Live updates (Phil, 2026-10-13; migration 0454)

- **What updates live.** The Founder Tickets list, the Founder ticket page, and the company's own
  Tickets list and ticket pages. A new ticket, a status change or a reply appears without a refresh.
  The Founder list toasts "New ticket from [company]". Conversations stay oldest at the top, newest
  at the bottom, scrolled to the latest.
- **How.** The same Broadcast route as every live screen (0418, components/realtime-refresh.tsx),
  with its poll fallback and its settling of bursts. The nudge carries no ticket content.
- **Channels.** Ticket nudges go to "founder" (the founder only) and to "tickets:<company>". That
  channel is joined only by an active login of that company in a Tickets role (Supervisor and up,
  Recruiter, On Call), never a carer, Senior or Viewer. It is not the company channel every login
  may join (audit F141). Its rule also checks each message's own channel (F142; Phil popup: the
  ticket channel only, the shared rule unchanged).
- **Rights (F146; Phil popup "Yes, as part of this").** Signed out users have nothing on the three
  ticket tables; signed in users can only read. Every write goes through the ticket functions.
- **F155** (0419 never applied) is parked as THE LIST 57 (Phil popup).

