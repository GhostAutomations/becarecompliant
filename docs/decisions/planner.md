# Planner

> Planner department (Additions): book any check or ad-hoc task to a conductor + date; My Planner, month Whiteboard, record panel. Times and double-booking enforced in the DB (0179/0180). A booked conductor can see that one carer (0183), which also closed a privilege escalation in the insert policy.

Planner = top-level Pro department for booking compliance tasks (any People/Service User check, or ad-hoc) to a CONDUCTOR on a date/time. Agreed via popups (Phil, 2026-07-22): booking from a due check OR ad-hoc; lands on the conductor's planner; any check bookable; shown on the subject's record; whiteboard is a MONTH CALENDAR; branch+role scoped; Pro-and-above.

## 2026-08-14 — a booked conductor can see who they are booked with (0183)

**Item 14 Phase C, the fixture left on 12 August:** the test Manager manages Cardiff1 and Newport1 and
was booked to supervise **a carer in Caerphilly**.

**No leak** — proved as the test Manager: 28 people visible (his two branches), the Caerphilly carer's row unreadable, the
booking readable because he is the conductor. **But the booking was useless**: the list said
"Supervision · **Ad-hoc** · Caerphilly" (a lie — it has a named subject) and Complete check dumped
him on a 28-record register that does not contain her, with no message. Supervision-4 shape: the
server refuses correctly and the screen says nothing.

**Phil's call:** being booked to conduct a check IS the authorisation to see that person — that
person only, while the booking is live.

**AND THAT WOULD HAVE BEEN A PRIVILEGE ESCALATION.** `planner_bookings_insert` validates
`is_branch_manager(branch_id)` — the BOOKING's branch — and **nothing ever checked that the
SUBJECT belongs to it**. Proved: as the test Manager, an insert with branch_id = Cardiff1 and
subject_person_id = a Caerphilly carer was ACCEPTED. Harmless while conductors saw nothing; with
the grant it would have meant "book yourself onto anyone, then read their record".

0183 does both halves:

- **A BEFORE trigger makes branch_id FOLLOW the subject.** RLS WITH CHECK is evaluated on the row
  AFTER before-triggers, so the escalating insert is rewritten to Caerphilly and then refused.
  **Deriving beats validating** — the two can never disagree again. No existing row disagreed.
- **`is_booked_conductor_for_person` / `_for_service_user`**: `status = 'planned'` (completing or
  cancelling takes the visibility away) AND **`created_by is distinct from auth.uid()`** — you
  cannot grant yourself sight of somebody by booking yourself onto them. Costs nothing real:
  anyone booking their own branch's carer can already see them.
- Added as **ADDITIVE policies** (the 0079 pattern), so no existing policy was rewritten and no
  clause could be lost in transcription. `can_complete_person_check` and
  `can_complete_service_user_check` gained the predicate, or the grant would be decoration.

**Verified after**: the test Manager sees 30 people not 42; only 2 of Caerphilly's 14 (a person, not a
branch); can complete the Caerphilly carer's check but not another Caerphilly carer's; the escalating insert is
now refused; an ADMIN booking the test Manager onto a Caerphilly carer still works. On screen the row now
reads "Supervision · [carer] · Caerphilly" and Complete check reaches the real form. **The
"Ad-hoc" mislabel fixed itself** — it was only ever a symptom of the invisible name.

**FOLLOW-ON, NOT FIXED:** `canManage` on the person record page is a ROLE check
(`MANAGE_ROLES.includes(profile.role)`), not per-record, so a manager viewing a record outside
their branches — newly possible — is offered "Manage record" and Complete buttons whose writes
RLS refuses. Not a leak, not data loss: a button that cannot work. Wants role AND
`can_manage_person(id)`.

## 2026-09-15 — the planner in Outlook (0272), and what it dragged out

Phil asked for office members' planner bookings to appear in their own Outlook. Three routes were
offered: a SUBSCRIBED ICS FEED, a calendar invite email per booking, or a full Microsoft Graph
integration. He first picked Graph, then said "lets do the microsoft subscribed route for now".

**What was built (0272).** `planner_calendar_feeds`: one row per PROFILE (bookings land on
`conductor_profile_id`, which is a login, so the feed belongs on the profile, not on `people`).
Token = 32 random bytes hex. Route `/calendar/<token>/planner.ics`, in PUBLIC_PATHS because
Outlook is never signed in. Its own page at `/planner/calendar`, reached from an "Outlook" button
on the Planner. Pure writer in `lib/planner/ics.ts` (21 tests): Europe/London VTIMEZONE carried in
the file rather than converting to UTC ourselves, 75-OCTET folding (bytes, not characters), stable
UID = booking id so a moved booking updates instead of doubling.

**The token is a password, and the design follows from that.** Possession of the URL is the whole
authentication. So: row readable only by its owner (no admin exception — it is a credential, not a
record); token never written to the audit log; rotating it IS the revoke and is one button away;
every filter in `loadFeedByToken` derives from the token, nothing from the request. Titles carry
INITIALS only ("Supervision - Z.T.P. (Cardiff)"), Phil's choice, and booking NOTES are omitted
entirely. Cancelled bookings drop out of the diary, completed ones stay (also his choice).

**Each appointment deep-links to the job**, via the same `bookingHref` the Planner list uses, so
the two can never drift. The link goes in DESCRIPTION, not only in URL:, because Outlook does not
surface the URL property in most views.

**REFRESH IS THE HONEST LIMIT and is written on the screen.** Outlook ~3h (Microsoft says up to
24), Google 8-24h, Apple honours our `X-PUBLISHED-TTL:PT15M` so iPhone is the fastest. Nothing can
force it. **New Outlook for Mac cannot subscribe by URL at all** — its Add calendar offers "Upload
from file", which imports once and never updates; the page now says so explicitly because Phil
walked straight into it. Subscribing is done in Outlook on the web, which puts the subscription in
the MAILBOX so it syncs to every Outlook. Microsoft's own docs contradict each other on whether
Outlook MOBILE shows it. iPhone native Calendar subscribes to the link directly and works well;
iOS Exchange/ActiveSync only syncs the PRIMARY calendar, so adding the M365 account does NOT bring
it across.

**Two defects this exposed, both wider than calendars:**

1. A deep link into BCC lost its destination at the sign-in wall. `lib/auth/safe-next.ts` (13
   tests) now carries and sanitises it, in middleware AND in the eviction path in `requireUser`.
   Affected every emailed link too, not just calendar ones.
2. Single session made phone links unusable — see [permission-boundaries](permission-boundaries.md) for the two-slot
   rule that replaced it (0273).

**The button is SHARE, and everything lives behind it** (Phil, same day). The page carries the
https link to paste (0272), a QR code (0274 era) and the diagnostics panel. The QR encodes the
**webcal://** form, not https: scanning an https link to a .ics makes a phone DOWNLOAD a one-off
copy instead of subscribing, the same dead end as Outlook's "Upload from file". It is hidden
behind "Show QR code" because it is a password drawn as a picture and care offices are open plan.
Generated server-side as a PNG (`qrcode` npm), since the CSP blocks browser-side QR libraries.

**0274/0275 — the Share page says WHICH calendar last checked.** Phil subscribed in Outlook, a
booking was made five minutes later, Outlook showed nothing for hours. Nothing was broken and
proving that meant reading Vercel logs, which he cannot do. `planner_calendar_feed_clients` now
records client + raw user agent + count, owner-readable only, keyed on a CLOSED five-label set so
an unauthenticated caller cannot grow unbounded rows by varying the agent.

**THE LESSON WORTH CARRYING (0275, a bug I shipped the same day).** The recording was written as
`void recordFetch(...)`. **A serverless function is frozen the moment the response is returned, so
fire-and-forget work after it simply never runs.** The helper did a SELECT before its write, which
guaranteed it was still in flight — nothing was ever written and the panel confidently told Phil
no calendar had fetched while two were. An older `.then()`-style line survived only because a
PostgREST builder dispatches on `.then()`, i.e. by luck. Fix was SHAPE not care: one RPC, AWAITED,
doing both writes inside Postgres, with the count incremented by the database rather than by
read-modify-write. **A panel that is confidently wrong is worse than no panel.**

**CONFIRMED FROM EVIDENCE:** Apple's fetcher sends `macOS/26.6.2 (25G83) dataaccessd/1.0` (iOS
sends the same shape with `iOS/`), and an iPhone subscription propagates to macOS Calendar via
iCloud, so the Mac gets Apple's fast refresh too. **Outlook's real user agent is still unknown** —
the label matches on outlook/microsoft/msoffice as a guess and should be corrected once a real
Outlook fetch lands.

**REMOVE-AND-RE-ADD: DROPPED, do not re-propose.** Phil saw a booking appear after removing and
re-adding the Outlook subscription, and it looked like a way to force a fresh fetch. It rests on
ONE observation and a coincidence fits equally well (Outlook's own three-hourly refresh landing
at that moment). Offered to verify it with the new diagnostics panel first, since writing an
unproven claim on the page would tell people to tear down a working calendar for nothing. Phil,
2026-09-15: "leave it". Nothing added, nothing tested.

## Earlier

- **0179/0180 (2026-08-12)**: booking times validated in the picker (ONE readable dropdown, after
  two clipped boxes rendered as "1" and "0"), in the server action AND a CHECK constraint;
  double bookings refused by three EXCLUDE constraints covering conductor, carer AND service user
  — Phil's follow-up was the important half, since a conductor-only rule still lets a second
  manager book the same carer at the same moment.
- Migrations 0106 (planner_bookings + is_branch_supervisor + RLS) and 0107 (auto-complete trigger
  when the linked check completes). 0108 remembers the Calendar/List choice per user.
- UI: booking form is Department/Branch/Name cascade + check dropdown; conductor defaults to self;
  duration 30. New booking is a popover. Calendar shows only status='planned'.
- **Whiteboard board view** (2026-07-22): off-white board split People|Service Users, to-book
  chips for unbooked checks due in 28 days in four 7-day blocks; clicking books to self.
- **Disabled-check guard** (2026-07-23): a check whose DEFINITION is off was still bookable,
  because the Planner filtered on the instance's `active`, not the definition's.

Model note: `check_kind` stores the DEFINITION NAME at booking time (display label); `title` =
ad-hoc/override. A booking against a check auto-completes when the check completes (DB trigger,
any path).

See [phase6-built](phase6-built.md), [permission-boundaries](permission-boundaries.md), [look-at-the-artefact](../process/look-at-the-artefact.md).
