# Rota and Visits: offline recording design (Stage 0, for Phil's approval before Stage 3)

How a carer's phone records clock ins, task outcomes, notes and doses with no signal, and sends
them later without duplicates. The carer app is the installable web app (Phase 14 decision,
2026-08-13), built in this Next.js codebase. Status: DESIGN, not built.

## The shape in one line

Every tap is saved on the phone first as an event with its own id, then sent to the server when
there is signal; the server keeps each id once, so sending the same event twice changes nothing.

## 1. Before the visit: what the phone keeps

- When the app is opened with signal, it downloads the carer's own day: their visits and shifts,
  each home's map point and radius, the tasks per visit, the doses due per visit, a short care
  plan summary, and their own Medication Competency expiry date.
- Kept in the phone's browser storage (IndexedDB) for that carer only. Refreshed whenever there is
  signal. Older days are removed.
- The app itself (screens and code) is cached by a service worker, so it opens with no signal.
- The app asks the browser to keep its storage (persistent storage) so it is not cleared to free
  space. To be confirmed on iPhone and Android in Stage 3.

## 2. At the tap: saved on the phone first

- Each action becomes an event: clock in, clock out, task outcome, note, dose outcome, handover note.
- Each event carries:
  - an event id made on the phone (a random UUID), the de-duplication key;
  - the carer, the visit or shift, the device;
  - the phone's time, and a running number per device (to keep order);
  - for clock in and out: position, GPS accuracy, distance from the home (GPS works with no
    mobile data; it is only slower to fix);
  - the content (outcome, reason, note text, dose result).
- It is written to an outbox on the phone straight away. The carer sees "Saved on this phone" and
  can carry on. Nothing waits for signal. Care is never blocked.

## 3. Sending: the outbox

- The app sends the outbox, oldest first, in small batches, through one server function, whenever
  there is signal: when the app opens, when it comes back to the front, when signal returns, and
  every 30 seconds while open.
- Background sending while the app is closed is not relied on (the Background Sync feature is not
  available in iPhone Safari; to be confirmed in Stage 3).
- Each send also carries the phone's clock at that moment, so the server can work out how far the
  phone's clock is out.

## 4. The server: each event once, never lost

- Every module table that takes phone events has a unique event id column. The server inserts
  with "if this id is already here, do nothing", and answers per event: Accepted, Already had it,
  or Refused (with the reason).
- The phone removes an event only when the server says Accepted or Already had it. A refused
  event stays on the phone, shown to the carer, and is also sent to the office as a problem to
  look at. Nothing is dropped silently.
- So: a send that times out, a double tap, two sends at once, or the same event sent again a week
  later, all end with exactly one record.
- Records are append only: nothing a carer sends ever overwrites an earlier record. A correction
  to a note is a new note (Stage 5 rule).

## 5. Times and clocks

- Every record keeps both times: the phone's time (when it happened) and the server time (when it
  arrived), plus a "recorded offline" mark when they are far apart.
- From the clock sent with each batch, the server works out how far the phone's clock is out and
  stores the corrected time too. More than 5 minutes out: flagged for the office.
- Punctuality reports use the corrected time; the raw times stay as evidence.

## 6. When the world changed while the phone was offline

- Visit moved to another carer: the event is still accepted (the care happened) and flagged for
  the office.
- Clock out arrives without a clock in: accepted and flagged.
- Two carers on a double up both record the same dose: the first to reach the server is the
  record; the second is kept and flagged as "already recorded by" for the office to review. Never
  a silent second dose record.
- Medication Competency: the phone stops recording if the cached expiry date has passed (decision
  14: sees doses, cannot record). The server checks again against the date at the phone's time;
  if they disagree, the record is kept and flagged.
- Visit cancelled meanwhile: accepted and flagged.

## 7. Sign in, sessions and security

- Events are sent under the carer's own sign in; the server checks the event's carer is the
  person signed in.
- If the session ends (signed in on another phone, signed out, expired), unsent events stay on
  the phone and are sent when the same carer signs in again on that phone. They are never sent
  under someone else's sign in. Signing in as someone else on the same phone keeps the first
  carer's unsent events locked away until they sign back in, and warns the office.
- What is on the phone is special category data: only today's run is cached; it is cleared at
  sign out once the outbox is empty, and old days are removed. The company's mobile phone policy
  requires a screen lock. (Browser storage is protected by the phone's own encryption; extra
  in-app encryption adds little because its key would sit on the same phone.)

## 8. What people see

- Carer: a small banner, "3 records waiting to send", and each waiting record marked as such.
- Office (Stage 7 live attendance): each carer's "last sent" time, and records that arrived late
  or offline marked as such.
- If a carer's phone holds unsent records for over 2 hours during working time, the office is
  told.

## 9. Paper fallback

- A printable rota and MAR for each carer every evening (Stage 6), for a dead phone.

## 10. Tests (Stage 3)

- Unit: the outbox (resend, double send, out of order, partial failure) never makes a duplicate;
  the clock correction maths; the refused event stays on the phone.
- On real phones, iPhone Safari and Android Chrome, in flight mode: clock in, tasks, note, dose,
  clock out, then signal back; exactly one of each on the server, in order, with both times.
