# Rota and Visits module (beta), Phase 14 part 1 (Phil, 2026-10-15)

Kickoff: `ROTA-VISITS-KICKOFF-PROMPT.md`. Scope doc (Claude Docs): "Rota and Visits add-on scope",
15 Oct 2026. Rota, planning, location, care plans, care notes and the MAR. Out of scope: invoicing
and payroll. Planday and CarePlanner are the capability reference: copy capabilities from public
information, never their screens, wording or templates.

## Standing rules for the module

- Bevan (test company) only, behind a per company Founder switch, off for every other company.
- Additive only: new tables, functions and routes. No existing table, view, policy, trigger,
  function or the realtime publication is altered without asking Phil first.
- No new query on any existing page when the module is off; the switch rides in the company row
  the app already loads (`lib/companies/row.ts` embeds `company_modules`).
- No new table in the `supabase_realtime` publication (live updates use Broadcast); no new
  triggers on busy existing tables.
- Every module table: company_id (and branch_id where it applies), RLS through the helpers and
  `company_module_on(company_id, 'rota_visits')`, foreign keys indexed.
- One stage at a time; Phil approves each stage before the next.
- Not on any price plan; no billing work without asking Phil.

## The module switch (0487)

- `company_modules (company_id, module, enabled)`; no row means off.
- `set_company_module` (SECURITY DEFINER) refuses anyone but the Founder; the table has no write
  policy. Founder console, company page, Modules card; every change audit logged
  (`company.module_on` / `company.module_off`).
- Off hides everything and deletes nothing; on again brings it all back.
- Guard for every route and action: `requireRotaOffice()` / `rotaModuleOn()` in
  `lib/rota/access.ts`. Off, or a role outside the office roles: Not Found.
- Rota department roles (Stage 0): Founder, Company Admin, Responsible Individual, Registered
  Manager, Branch Manager, Supervisor (`lib/rota/roles.ts`). Carers use the carer portal. Recruiter
  and Viewer left out until a stage needs them (ask Phil: a new permission edge).

## The 15 Stage 0 decisions (popups, 2026-10-15)

1. PHASES.md: the first part of Phase 14 (New Dawn), started now on Bevan only. Phil: "I want to
   do it now." The old "do not start until Thistle signs off" line is overridden for this module.
2. Vocabulary: **Rota, Shift, Visit, Run, Clock in, Clock out**. Never "check in" (Check already
   means a compliance requirement).
3. Compliance on a rota assignment:
   - 3a. **DBS** red or missing: the save is refused UNLESS the person's DBS Pending Risk
     Assessment (the existing form on the DBS card) is stored AND it is a double up visit or
     shift alongside a carer with a clear DBS. No manager override. `[stated]` "no dbs must have
     a risk assesmnt and only work on a double run".
   - 3b. **Right to Work** missing or expired: refused, no override.
   - 3c. **Mandatory training** red: saves with a warning, logged, shown in the Compliance on the
     rota report.
4. Outside the home's radius at clock in: allowed; the carer picks a reason; the visit is flagged.
   Never blocks care.
5. Default home radius: 200 m, editable per home.
6. Proof of arrival, first release: GPS plus QR code, plus NFC on Android Chrome. iPhone Safari
   has no Web NFC (caniuse.com/webnfc, checked 2026-10-15). Passcode by text for carers without
   a smartphone (Stage 3).
7. Late alert: 15 minutes after the visit start, once per visit, to the branch office (Managers
   and Supervisors) and whoever is on Out of Hours at that moment.
8. Routing: **our own OpenRouteService server** (OpenStreetMap data), with postcodes.io for
   postcode map points. Server to be priced, with setup steps for Phil, before Stage 8; added to
   the DPA subprocessor list only after Phil approves. Ruled out (research 2026-10-15):
   - Google Maps Platform: terms forbid storing distance and duration (Maps service terms s.19.3,
     s.5), so no postcode pair cache; Google is a controller, not our processor.
   - Mapbox: terms forbid caching Navigation results and automated lookups (product terms
     s.2.10.1, s.1.9); processed in the US.
   - Hosted OpenRouteService: free, but its terms ban personal data and there is no uptime promise.
   Until Stage 8, travel uses stored postcodes with no live routing.
9. Mileage: each company sets its rate, default 55p a mile (HMRC approved rate for cars and vans
   2026 to 27: 55p for the first 10,000 business miles, 25p after, GOV.UK). Home to first visit and
   last visit to home excluded by default (switchable).
10. Raw clock in positions (latitude, longitude, accuracy): deleted after 12 months by a nightly
    job; the visit record is kept as Evidence.
11. The MAR comes **complete in this build** (Stage 6), Bevan test data only. `[stated]` "i want it
    complete in this build".
12. Speech to text: left out for now. Carers can use their phone keyboard's own dictation.
13. Date of birth and GP practice: added to **every company's** Service User record, in the
    **Manage record panel only, not as register matrix columns** (`[stated]` "it should not go on
    the matrix, it should be in the manage record area"). Optional fields. Built with the MAR in
    Stage 6. Agreed exception to "Thistle sees no difference": two new optional columns on
    service_users and two new fields in Manage record.
14. A carer without an in date Medication Competency check sees the doses due but cannot record
    them ("call the office"); the office is alerted if the dose then goes unrecorded.
15. AI features (care plan from setup audio, MAR from label photos): later, after the hand built
    versions work and the clinical review is done.

## Still to come before real use

- Clinical Safety Officer review and the Welsh record keeping research before any real service
  user is recorded (shown in the beta banner on the Rota page).
- DPIA and staff notice for location recording, completed by each company (templates in
  `~/Projects/BCC Documents/Rota and Visits/`).

## Stage 1 decisions: rota for shifts (popups, 2026-10-15)

1. Who edits, publishes and approves: Admin, Responsible Individual and Registered Manager on every
   branch; Branch Managers and Supervisors on their own branches (the same list approves open
   shift requests and records swaps and handovers).
2. Draft, then Publish: the office builds a week in draft and presses Publish; carers see only
   published shifts. Publish texts each affected carer once; a later change to a published shift
   texts that carer once more.
3. Availability is recorded by the **office only** (weekly pattern plus dates someone cannot work).
   Approved holiday, absence, parental leave and long term sick are unavailable automatically.
   Nobody is rostered while unavailable (refused).
4. Working time: four warnings, never a block (GOV.UK, checked 2026-10-15): over 48 hours a week
   averaged over 17 weeks; under 11 hours rest between working days; a shift over 6 hours with no
   20 minute break; no 24 hours off in the week (or 48 in the fortnight). A "Signed the 48 hour opt
   out" tick per person, set **once** by the office and kept (`[stated]` "they should only have to
   tick the 48 opt out once, as they will sign the opt out"), silences the weekly hours warning;
   the office unticks it only if the person withdraws.
5. Open shifts show in the carer's app to request (office approves); no automatic text. The office
   can **pick carers and text them the shift** (`[stated]` "office staff can select carers to text
   and offer the shift out"). One credit per text.
6. Carers do **not** see colleagues' shifts. Swaps and handovers are recorded by the office on the
   rota (no swap requests from carers). A carer sees only their own published shifts and open
   shifts in their branch.
7. Reading of the DBS rule (Stage 0, 3a) on a shift: the person's latest DBS Pending Risk
   Assessment must say they may start (decision "start", review not missed), and the shift must
   need two or more people with another person on it whose DBS is clear. Someone on the adults'
   barred list (DBS Disclosure Risk Assessment) is always refused. Removing the last clear DBS
   colleague from such a shift is refused.

## Stage 2 decisions: visits and runs (popups, 2026-10-15)

1. Visits are built on the existing weekly **Care Schedule** (`care_plan_entries`, which Invoicing
   bills from), not a second pattern list. Each call gets a start time stored alongside it
   (`rota_call_times`); the Care Schedule itself is not altered.
2. Tasks per visit come in Stage 4 (care plan on the forms engine), not Stage 2.
3. Hospital or respite: visits from the day they went are **Paused** (greyed, not sent, not counted
   late or missed) and keep their carers; back to Active, they resume with the same carers.
   Worked out from the service user's status, so nothing is stored or changed on service_users.
4. New permission, agreed: a carer sees the **name, address and time** of their own published
   visits only, nothing else about the service user.
5. Visits follow the shifts rule: draft until the week is published; one Publish covers shifts and
   visits; a change to a published visit texts the carer.
6. Visits are made **4 weeks ahead**, nightly and straight after a start time changes; never
   duplicated; allocated or published visits are never overwritten (a schedule change flags them
   for the office instead).
7. Per service user: **preferred carers** (rank higher) and **not to send** (refused, reason shown),
   kept by the office.
8. "Nearest" until Stage 8: **straight line miles** from postcode map points looked up once through
   postcodes.io (only postcodes sent; bulk lookup up to 100 per request) and stored per postcode.
   Carers' postcodes are read from their home address text.

## Stage 3 decisions: clock in and out with location (popups, 2026-10-16)

1. The offline recording design (`docs/project/rota-offline-design.md`) is **approved** as written:
   every tap saved on the phone first with its own id, sent when there is signal, kept once by
   the server, refusals kept on the phone and shown to the office.
2. A home's map point starts from its postcode and can be set **both** ways: by dragging a pin on
   a map in the office, and by pressing "Set from where I am standing" at the home.
3. The map is **our own map file** (a UK basemap built from OpenStreetMap data by Protomaps,
   stored in our own storage, OpenStreetMap credited on the map) shown with a free open source
   map library. Phil approved the new library with this choice. No map supplier, no monthly fee.
   Ruled out (checked 2026-10-16): OpenStreetMap's public tiles (policy: commercial access "may be
   withdrawn at any point", no SLA, operations.osmfoundation.org/policies/tiles) and MapTiler
   ($30 a month Flex, a new subprocessor, maptiler.com/cloud/pricing).
4. A **shift** clock in is checked against its **branch office**: each branch has its own map
   point and radius, set the same two ways as a home; outside it asks for a reason and flags.
5. Carers without a smartphone clock in **by text**: each home has a short code on its printed
   sheet; the carer texts `IN <code>` or `OUT <code>` from their own mobile to our Twilio number,
   handled as a new branch of the existing inbound text route; a reply confirms it (one text).
6. Outside the radius, the carer picks one of: **GPS is wrong, I am at the home** / **Met the
   service user elsewhere (appointment or outing)** / **Poor signal** / **Other** (typed reason).
   The visit is flagged; care is never blocked.
7. Setting a point (map or "from where I am standing") is for **office roles only** (Supervisor,
   Manager, Registered Manager, RI, Admin, Founder). Carers cannot move a point. Every change is
   recorded.
8. Accuracy worse than the place's radius, or no position: the clock in saves and is marked
   **Location unclear**. A QR code (or NFC sticker) scan at the home counts as proof instead.
9. A missed clock in or out can be **added by the office with a reason**: marked "Added by the
   office", shows who, never replaces anything the carer recorded.
10. Clock in opens **30 minutes before** the start. Late is always allowed (Stage 7 marks it late).
    A carer clocks in only to their own published visits and shifts.
11. The map file is the **full detail UK map** (zoom 15, 3.0 GB; Phil chose it over the 1.5 GB
    version, 2026-10-16), measured with the official go-pmtiles tool from the 15 October 2026
    Protomaps build, stored as `uk.pmtiles` in the private `maps` bucket (0495) and read through a
    one hour signed link. Libraries: MapLibre GL 6.11.2, pmtiles 4.5.0, @protomaps/basemaps 5.7.2.
    Fonts and icons are kept in `public/map` (SIL Open Font License; MIT icons). Supabase Pro
    includes 100 GB of storage (supabase.com/pricing, checked 2026-10-16), so no extra cost.
12. On My area, today's and tomorrow's visits and shifts open Clock in when tapped, and before
    Clock in opens the visit shows a greyed "Clock in opens at" button (Phil's phone test: tapping
    a visit seemed to do nothing).
13. **Map supplier changed to Mapbox** (Phil's popup, 2026-10-16, after seeing Nourish use Mapbox
    with OpenStreetMap for its pin map). Replaces decision 3 (our own map file): in the screen test
    our own file worked but the first look at an area took up to half a minute, because Supabase is
    slow the first time it sends each piece of a 3 GB file. Shown through MapLibre, Mapbox bills
    per map square (raster tiles: about 200,000 a month free, third party summaries checked
    2026-10-16; a map open uses about 20 to 40), so free at our use. Street style (streets-v12),
    like Nourish's. Shown through MapLibre, which Mapbox documents (docs.mapbox.com, Use Mapbox APIs in
    MapLibre GL JS), so no new library. Mapbox stores and serves from the US (AWS) and offers a DPA
    with the EU Standard Contractual Clauses (mapbox.com/legal). Its public map token is meant to
    be public and is restricted to our web addresses. The 3 GB map file and its tile server are
    removed once Mapbox works (Phil deletes the file; I never delete data).
14. **Before Rota and Visits goes live for any real customer**: Mapbox and postcodes.io are added
    to Annex 3 of the Data Processing Agreement (lib/legal/text.ts), and every Company Admin is told
    at least 30 days before (DPA clause 6.2). Until then the module stays on Bevan only.
15. **Map supplier changed again, to Apple Maps (MapKit JS)** (Phil's popups, 2026-10-16, after
    Norton blocked Mapbox's real sign up page, `account.mapbox.com`, as "phishing" on its SafeWeb
    list; I checked the page holds Mapbox's own `*.mapbox.com` certificate). Replaces decision 13.
    Phil chose Apple **knowing that Apple is not our processor**: Apple handles map data under its
    own privacy policy and offers no data processing agreement for MapKit JS (apple.com/legal,
    Apple Maps Terms of Use, checked 2026-10-16), the same position that ruled Google out. Free up
    to 250,000 map views and 25,000 service calls a day with an Apple Developer Program membership
    ($99 a year, developer.apple.com/programs). Our server makes a short lived map pass (ES256
    token, origin limited to becarecompliant.com) from Phil's Maps ID key, kept only in Vercel.
    MapKit JS needs WebAssembly and its CDN in the Content Security Policy: allowed on the office
    Clock in page only. Decision 14 now reads Apple (not Mapbox) and postcodes.io: before real use,
    tell every Company Admin 30 days ahead, and say in the DPA and privacy information that home
    pins viewed on the map go to Apple under Apple's own terms.
16. The map pin opens about **2 km across** around the home (Phil, 2026-10-16: "start a bit more
    zoomed out so they can get a better idea where they are"), not about 700 m; the whole UK when
    a place has no point yet.
17. A QR code or NFC scan whose phone position is accurate (within the place's radius) but outside
    the radius is still kept as proof and is **flagged to the office** as "Scanned away from the
    home", with the distance (Phil's popup, 2026-10-16, after his own test scanned a sheet on a
    computer screen 54 km away). Migration 0496.

## Stage 4 decisions: care plan tasks (popups, 2026-10-16)

1. Stage 4 adds **tasks per call**; the uploaded care plan document stays the written care plan.
   No new written care plan form (Phil's choice over the bigger build).
2. Tasks are set **per call** in the Care Schedule (the morning call can differ from the evening
   one); a call's list can be copied to other calls.
3. **Key tasks**: at clock out the carer is asked to give each key task an outcome first (done,
   refused or not needed with a reason). Any outcome counts, so care is never blocked; it works
   with no signal.
4. **Who sets tasks**: the same people who manage the care plan today (Admin, RI, Registered
   Manager, Manager, Supervisor, Recruiter, in their branches). Every change is kept as a version.
5. **Where**: under each call on the service user's **Care plan** page, shown only when the
   company has Rota and Visits on.
6. **Reasons** when a task is refused or not needed (Phil: "as detailed as possible"): Service user
   declined; Asleep and did not want to be woken; Unwell; Not at home; In hospital; Away (respite
   or with family); Already done earlier; Done by family or a friend; Done by another professional
   (district nurse, GP, another agency); Not needed today; No supplies or food in the house;
   Equipment missing or faulty; Unsafe to do (risk to the service user or carer); Not enough time
   on the visit; Other (typed).
7. **Starter task list** (Phil: "more detailed and add custom tasks"), grouped Personal care, Food
   and drink, Moving around, Health and wellbeing, Home and safety, Out and about, Evening and
   night, exactly as shown to Phil (lib/rota/tasks.ts). Medicines and prescribed creams are left
   out: they belong to the MAR (Stage 6). The office can add **custom tasks** to the company's list,
   available for all its service users.
8. **A second tap on Done saves nothing** (Phil, after his phone test made six Done records): on
   the carer's phone, tapping Done on a task that already says Done does nothing. Changing Done to
   Not done, or back, still saves as normal, and the latest outcome counts.

## Stage 5 decisions: care notes (popups, 2026-10-16)

1. **Own note store**, not the Evidence table (using Evidence would mean changing the shared
   filing function every company uses, and carers could not read their notes back). Same rules as
   Evidence: author and time stamped (phone time and server time), never edited or deleted by
   anyone, kept 8 years.
2. **One Visit record per visit** (Phil: "everything that's recorded from the time they click clock
   in"): clock in (time, how: GPS, QR, NFC, text or office, and where), every task outcome with its
   reason and time, the written notes, clock out (time, how, where), and any flags (sent late with
   no signal, phone clock wrong, outside the area with the reason). A PDF is made at clock out; a
   later note or correction makes an updated PDF beside it and the first is kept.
3. **Cloud copy** when the company has a cloud drive connected: the service user's folder, then
   Care notes, then the year, the month, the day, one Visit record PDF per visit.
4. **Location in the Visit record:** the result and the distance, never the map position (for
   example "inside the home's area, 12 m away, accurate to 5 m"; "outside, 340 m away, reason: met
   the service user elsewhere"). The exact position stays in the app and is still deleted after 12
   months (Stage 3 decision 10), because nothing can be deleted from a company's own drive.
5. **Clock out asks for a note** when the visit has none; the carer can write one or clock out
   anyway, and the office sees "No note" on the visit.
6. **Earlier notes on the carer's phone:** the notes for that service user from the **last 48
   hours** (Phil's choice over "last 3 notes"), from any carer, shown on the carer's own visit card
   only (visits from yesterday to tomorrow). Every view is logged. The office sees every note for
   its branches. **Changed by Phil after his phone test (decision 14): 24 hours.**
7. **Handover note:** a note ticked "For the next carer", highlighted at the top of the next visits
   to that service user for 3 days. **Changed by Phil after his phone test (decision 14): the tick is
   "Pin Note (48hrs)" and pins for 48 hours.** The office sees it too. ("Handover" elsewhere still means the
   On Call shift log and moving a shift to another carer.)
8. **Corrections:** "Correct this note" makes a new note linked to the old one. The old note stays,
   marked "Corrected at HH:MM"; the correction says "Correction to the HH:MM note". Only the author
   can correct their own note.
9. **Raise a concern** (Phil: the carer clicks Raise a concern, enters what it is, picks from the
   incident types, the supervisor is notified the way they are about a completed Care Plan Review,
   then decides whether an incident form is needed). Built in full in Stage 5: a new row in
   Settings, Notifications, "Concern raised in a care note", shown only when Rota and Visits is on;
   Supervisors start with it on for Recent activity; a Concerns list for the office with "Start an
   incident form" filled in from the concern. Safeguarding stays the office's decision on the
   incident. The changes to the existing Notifications grid are shown to Phil before they are built.
10. **Office view:** each visit on the Visits page shows its notes; the service user's record gets a
    "Care notes" page (Visit records newest first, filter by date, print as PDF). Every view is
    logged.
11. Notes, corrections and concerns are phone events under the approved offline design (event id
    made on the phone, sent once, refusals kept for the office).
12. **Changes to the existing Notifications feature, approved by Phil:** the notification stores
    also accept a "concern raised" type and a link to the concern (each person told once per
    concern); Settings, Notifications gets a "Rota and Visits" band with one row, "Concern raised in
    a care note", shown only when the module is on; the Recent activity tile shows "Concern raised
    for [service user] by [carer]" and opens the concern. Supervisors of the service user's branch
    start with it on for Recent activity, Email off. Concern emails follow the test company rule
    (none for Bevan). Existing check notifications are unchanged.
13. **Rota dropdowns A to Z** (Phil, after his phone test: "all the drop-down options need to be in
    alphabetical order"; popup "Every rota dropdown"): the concern types, the task reasons, the clock
    in reasons and the Care plan task picker (its groups, the tasks in each, and the company's own
    tasks) are shown A to Z, with "Other" always last. Only Rota and Visits lists change; the
    incident form's own lists are untouched. The carer picker keeps its recommended order.
14. **Earlier notes and pinned notes** (Phil, after his phone test, 2026-10-16: what is the point of
    the tick, when the next carer should see the notes anyway): every note for the service user
    from the **last 24 hours** shows on the carer's visit card (was 48 hours, decision 6), folded
    under "Notes from the last 24 hours". The tick is renamed **"Pin Note (48hrs)"** (Phil's words):
    a pinned note shows at the top in amber, "Pinned notes", for **48 hours** (was 3 days, decision
    7), so a must read is not missed. Unticked notes still reach the next carer. (The column stays
    for_next_carer; only the words and the times change.)

## Stage 5b decisions: timeline views (popups, 2026-10-16)

Phil showed four views from another system and asked for the same capabilities before the MAR
(built in our own style and words, never their screens; no real names from the screenshots).

1. **Built now, as Stage 5b**, before Stage 6 (MAR).
2. **Four views:** the service user's Care Schedule week (Monday to Sunday down the side, a 24 hour
   line across, each call a block, today highlighted); the service user's rota this week (the same
   line, which carer is booked into each call, with clock in and out once done); Carer day (every
   carer working that day down the side, their visits across the day, late or early clock ins, a
   red line for now); Service user day (every service user with visits that day, grouped by
   branch, the carers coming to them, a red line for now).
3. **Where:** Carer day and Service user day are two new Rota tabs beside Visits; the two service
   user week views are on the service user's record, beside Care notes.
4. **Tap and drag** (Phil: "both"): tapping a block opens that visit; on Carer day a visit can be
   dragged onto another carer's row, or from Unassigned onto a carer, with the same rules as Move
   (DBS and Right to Work block, training warns, clashes and leave checked, a confirm first, the
   carers texted when published), and dragged along the line to change its time.
5. **Time change by dragging:** the start time only, same length, same day, in 5 minute steps.
6. **Locked** once a carer has clocked in.
7. **The changed visit keeps its time** when the Care Schedule changes later: it shows "Time changed
   from HH:MM", and a Care Schedule change flags it "Schedule changed" for the office instead of
   overwriting it. Invoices are worked out from the Care Schedule, so a one off change does not
   alter an invoice.
8. **Texts:** the carers on a published visit get the same "your rota has changed" text as Move
   (test companies text only Founder mobiles, as now).

## Stage 6 decisions: the MAR (popups, 2026-10-17)

Facts checked 2026-10-17: NICE NG67 1.5.5 (a MAR includes the person's name, date of birth and any
other identifier such as NHS number; the medicine's name, formulation and strength; how often or
when; the route; the GP practice; any stop or review date; instructions and known allergies) and
1.5.2 (record the support for each medicine on every occasion, taken or declined); Welsh
Regulation 58 (SI 2017/1264: safe storage and administration, sufficient supply, ordering,
recording, handling, disposal, regular audits); dm+d on NHS TRUD under the Open Government Licence
for TRUD, open TRUD account required, released every Monday (release 10.1.0, 12 Oct 2026).

1. **Medicines list:** our own copy of the NHS dm+d, fetched every Monday from TRUD with Phil's
   free TRUD account key (in Vercel, never in chat). Fast search; works if the NHS service is down.
2. **Dose times are linked to the Care Schedule calls**, as tasks are (Stage 4): a medicine is
   given at chosen calls; the carer sees it on that call's visit. "When required" medicines show at
   every visit and are recorded only when given.
3. **Support per medicine:** prompt, assist or give (NICE separates reminding from giving). Shown
   with the dose and printed on the MAR chart.
4. **Second check:** a different office login, Supervisor or above, checks a MAR before it goes
   live, and every change to a live MAR again. Until then carers see "MAR not checked yet, call the
   office".
5. **Dose outcomes:** Given; Refused (reasons list); Not available (reasons list); Other (typed).
   A refused or not available dose tells the office at once. No dose sums, no clinical advice.
6. **Missed and late doses:** a dose not recorded shows red on the office's MAR and Visits page now;
   refused and not available tell the office through Settings, Notifications at once. The timed
   alert to the office and Out of Hours for doses never recorded comes in Stage 7 with the late
   visit alert.
7. **NHS number and known allergies** join date of birth and GP practice in **every company's**
   Manage record (Phil's choice over module only; extends Stage 0 decision 13). Four optional
   columns on service_users and four fields in Manage record; Thistle sees them too. GDPR: NHS
   number and allergies are special category health data, held under the existing service user
   RLS and audit; the MAR and its PDF read them from there.
8. **Simple stock:** quantity received per medicine; each dose given takes off its stated quantity;
   a warning when fewer than 7 days are left; counts corrected with a reason.
9. **Printing:** a monthly MAR chart PDF per service user (medicines down, days across, each dose
   time a box with what was recorded, a code key, blank boxes for writing in by hand) and a weekly
   rota PDF per branch (each carer's visits by day).
10. **Time sensitive flag** per medicine: red on the carer's phone, the office MAR and the
    timelines; Stage 7's alert treats a late visit with one as urgent.
11. **When required medicines:** the carer sees the label instructions and when it was last given
    (time and quantity). The app works nothing out; the carer follows the label and calls the
    office if unsure.
12. **In date Medication Competency:** the carer's own People record has a completed Medication
    Competency check (key `competency`) that is not past its due date. Missing or overdue: the
    carer sees the doses and "You cannot record doses yet, call the office" (Stage 0 decision 14).
13. Bevan test data only. The beta banner on every MAR screen says the Clinical Safety Officer
    review and the Welsh record keeping research must be done before any real service user uses
    it (New Dawn rule).

How decision 9 and 10 were built (2026-10-17, for Phil to confirm at his screen check):

- **MAR chart cells**, as on a paper MAR: the carer's initials when given (green), R, N or O when
  not given (amber, the reasons listed under the grid), X when due and not recorded (red), a grey
  empty box when due later (to write in by hand if the phones are down), blank when not due. The
  month prints in two halves, 1 to 16 and 17 to the end, on A4 landscape. The grid uses each
  medicine's current version; a stopped medicine is due only until the day it was stopped.
- **Weekly rota PDF**: one section a carer, A to Z, with their visits by day and time, the other
  carer named on a double up, drafts and time sensitive medicines marked; then the visits still
  needing a carer. Linked from the Rota week page ("Print the visits (PDF)").
- **The office Visits page** shows each carer's medicines under their visit (Given, Refused and so
  on with the time; "Not recorded" in red once they clock out) and a red "Time sensitive
  medicine" pill on the visit. The **Visit record PDF** gains a Medicines section (each dose, and
  any due medicine nobody recorded).
- **Timelines** (carer day, service user day, the record's week): a visit with a time sensitive
  medicine due has a red ring, with "Time sensitive medicine" in the key.

Phil, 2026-10-17, for the next push:

- **The NHS list load lives in the Founder area.** The dm+d list is one central copy for every
  company, refreshed by the Monday cron. The Founder's load button and the last load date move to
  a section of the Founder page; the MAR page only says which release is in use. Care companies
  never load it.
- **Service user record tiles in one row:** Care plan, Care notes, Week timeline, MAR and Personal
  outcomes side by side on a computer or tablet (a fifth of the width each); two to a row on a
  phone.
- **Label photo for the second check** (Phil's popups, 2026-10-17, built in Stage 6): whoever adds
  or changes a medicine attaches a photo of the pharmacy label or prescription; the second checker
  compares the entry against it. Required, unless the person adding it gives a reason (for example
  the label is unreadable), which the checker and the MAR show. The photo is health data: private
  storage under the company, short lived signed links, every view audit logged.
- **The MAR page is live** (Phil, 2026-10-17: a manager waiting with the page open should see each
  medicine arrive): it pushes in medicine, stock and dose changes without a reload, through the
  shared live refresh and the broadcast the MAR tables already send.
- **MAR layout** (Phil's popups, 2026-10-17): a medicine waiting for its check shows the label
  photo inside its card, beside the details and the Check button (above them on a phone; click to
  open full size). Live medicines are compact tiles: one to a row on a phone, two on a tablet,
  three on a laptop, four on a wide screen; a medicine being changed opens across the row.
- **Waiting cards, revised** (Phil, 2026-10-17, after seeing it): three to a row on a laptop, every
  card the same height, the photo in a fixed box beside the details; clicking it opens the photo
  large in a popup with the details and Checked: make it live pinned underneath.
- **Send back** (Phil's popups, 2026-10-17, 0505): the second checker has Checked: make it live and
  Send back with a reason. A sent back medicine stays waiting (carers still call the office), turns
  amber with who sent it back and why, and cannot be checked until the person who set it uses
  Correct and resend (the form filled in, the photo kept unless they take a new one). Only the
  person who set it can Withdraw. The person who set it gets a Recent activity notice "Medicine sent
  back for a correction" that opens the MAR, in the app only. Approved change to Notifications:
  user_notifications accepts the event 'mar_sent_back'; nothing else in it changed.
- **Correct and resend opens in a popup** (Phil, 2026-10-17, after watching it): the card keeps its
  size; the popup shows why it was sent back and the form, with the label photo shown up to 256px
  tall (also when a new photo is taken).
- **Card colours and uniform tiles** (Phil's popups, 2026-10-17): a sent back medicine is a red card
  with a red Sent back pill and the reason; one back for a recheck is a gold card with a Recheck
  pill and the earlier reason. Every waiting card and every medicine tile is the same height; so
  Change, Stock and Stop open in popups (replacing "a medicine being changed opens across the row").
  The button that takes a medicine off the MAR stays "Stop", now a pill like Change and Stock.
- **Clock in page order** (Phil's popup, 2026-10-17): the visit the carer is clocked in to, else the
  next one not yet done, is first and open; then the other visits still to do, earliest first; then
  those done, newest first. All but the first fold to one line (time, name, clock state) that opens
  when tapped. This page only; timelines elsewhere keep oldest first.
- **My area and Care split on the phone** (Phil, 2026-10-17, to be done before the module closes):
  the carer's bottom menu bar gets two tabs. My area is everything it was before the module (the
  carer's own checks, training and so on); Care is everything about delivering care (Clock in, the
  visits, tasks, notes, doses). No crossover between the two.
- **Location must be allowed** (Phil's popups, 2026-10-17; replaces Stage 3 decision 8 for a refused
  location): a carer who refuses location, or whose phone has none, cannot clock in or out by GPS,
  and a QR or sticker scan does not stand in for it; the phone says to turn location on or call
  the office (who can add the time with a reason). Location allowed but no fix or poor accuracy
  still saves as Location unclear. Carers with no smartphone keep the text clock in. Enforced on
  the phone; the server cannot see the phone's permission, so a clock with no position still saves
  as Location unclear there.
- **Clock in first** (Phil, 2026-10-17: "must clock in to complete tasks, make notes and give
  meds"): the Clock in button is at the top of the visit card; tasks and medicines appear, and notes
  can be written, only once clocked in (earlier notes and pinned notes can still be read before).
  Clock out is at the bottom.
- **Location prompts** (Phil, 2026-10-17): Safari asks for location at each clock unless the site
  is set to Allow; a website cannot keep it on. For the planned app, location permission is given
  once and must stay on (as Birdie does). Note for the app build.
- **My area and Care, built** (Phil's popups, 2026-10-17): where the company has Rota and Visits,
  carers (Team Member) and Seniors get a Care tab beside My area in the bottom bar. Care (the page
  at /clock, so QR codes and the offline copy keep working) has Clock in and today's visits at the
  top, then the carer's visits and shifts for the next four weeks and the open shifts to ask for.
  My area is exactly what it was before the module. A carer signs in to Care.

## Stage 7 decisions: live attendance and alerts (popups, 2026-10-17)

1. **Late:** no clock in 15 minutes after the start (Stage 0 decision 7). A double up is late while
   any carer on it has not clocked in; a visit with no carer is late too.
2. **Missed:** no clock in 30 minutes after the visit's end (Phil's choice over "by the end time").
3. **Overrunning:** clocked in and not clocked out 15 minutes after the planned end. Shown on the
   Today tab; no alert.
4. **Alerts in the app only, no texts**, set in Settings, Notifications (Phil: "put this in the
   notifications settings"): rows Visit late, Visit missed and Dose not recorded in the Rota and
   Visits band, on in the app by default for the branch's Managers and Supervisors and for whoever
   is on Out of Hours at that moment; email off by default (and never for test companies). Once
   per visit for each kind. Paused, draft and cancelled visits never alert.
5. **Dose not recorded:** checked at clock out. A due dose recorded neither way tells the same
   people once for that visit; a time sensitive medicine marks the alert urgent, and a late visit
   with a time sensitive medicine due is urgent too.
6. **Today tab** under Rota: counts at the top (late, missed, overrunning, not done), each visit
   with its status and carers, updating by itself; tap opens the visit on the Visits page, ringed.
7. **Map on Today:** each carer's last clock in or out today as a dot beside the home's point;
   office roles only, today only, nothing new stored. The Visit record stays result and distance.
8. **Approved changes to Notifications:** user_notifications accepts visit_late, visit_missed and
   dose_not_recorded, and gains a visit column (empty for every other notice) so a notice opens its
   visit ringed and can show urgent. Nothing else in Notifications changes.
9. Housekeeping in the same migration: indexes on the branch column of 12 module tables (and the
   MAR's sent back by), flagged by the performance advisor.
10. **Alerts tab** under Rota (Phil, 2026-10-17): every late, missed and dose not recorded alert,
    open ones first, with who was told and when. Each alert must be **cleared down by a Supervisor
    or above**, picking a reason (A to Z, Other last with a typed reason). Late or missed: Carer
    arrived late; Carer forgot to clock in, visit happened; Covered by another carer; Service user
    cancelled or not at home; Service user in hospital; Visit moved by the office; Other. Dose not
    recorded: Carer forgot to record, dose given; Dose not given, reason told to the office;
    Medicine stopped or changed; Other. The reason, who cleared it and when stay as the record.
11. notification_preferences also accepts the three new events, so the Settings rows can be saved
    (part of the approved Settings rows in decision 4).
12. **To ask after Stage 7** (Phil, 2026-10-17): call cancellations and how cancellation is set up.

## Call cancellations (Phil's popups, 2026-10-17, after Stage 7; not built yet)

1. The office can cancel **one visit**, **every visit for a service user over a date range**, or
   **one call over a date range** (the other calls stay).
2. Cancelling picks a reason, A to Z with Other last (typed): Carer unavailable, no cover found;
   Family cancelled; Office error; Service user cancelled; Service user deceased; Service user in
   hospital; Service user in respite; Visit moved to another time; Other. The reason shows on the
   Visits page and in reports.
3. **Short notice**, set per company in Settings, Rota: a notice period (default 24 hours) and
   whether a short notice cancellation is still charged and still paid; each cancellation inside the
   period is marked Short notice for Invoicing and pay.
4. The carer is told by **text and on the Care tab** (a text for a published visit, the Founder's
   mobile only for test companies; the visit shows Cancelled on their Care tab for the rest of the
   day).

## Stage 7b decisions: Rota settings and cancellations (Phil, 2026-10-17)

5. **Settings gets a Rota section** holding every rota option agreed so far (clock in window,
   late and missed timings, radius default, and so on) and a **Cancellations** part.
6. **Cancellation rules belong to the funder (council or health board), with a branch default** for
   anyone whose funder has no rule (e.g. private clients). A rule has: the notice period (e.g. 48
   hours), how long a short notice cancellation is still charged (e.g. Newport 48 hours, Cardiff
   two weeks to hold the bed), and how long the carer is still paid.
7. **Funders:** each company keeps a list of funders, and **every company's** service user Manage
   record gets a Funder field from that list (Phil's choice over module only).
8. **Short or sufficient notice is worked out**: the office enters when they were told; less than
   the rule's notice period before the first cancelled call is short notice. Shown before saving.
9. **Reasons can be charged or paid** only where set: by default Service user in hospital, Service
   user in respite, Service user cancelled and Family cancelled; never Carer unavailable, Office
   error, Visit moved or Deceased unless a company changes it. Reasons differ by company, so the list
   is kept in Settings, Rota with those settings per reason.
10. **Cancelling** picks the reason, a start date and an end date or open ended. The system cancels
   the calls in that time, charges for the rule's period if short notice and the reason allows it,
   pays the carer for the rule's period, and restarts the calls: after the end date, or, open ended
   for hospital or respite, when the office records the person is home (using the existing hospital
   and respite record, which also pauses checks), with the same carers if they are free.
11. Built now as **Stage 7b**, before Stage 8.
12. **Charging:** a chargeable short notice cancellation goes on the next invoice as "Short notice
    cancellation" for service users the company invoices itself, and into a Chargeable
    cancellations report (Stage 9) for councils that pay through their own systems.
13. **Carer pay** for cancelled visits: the rule keeps the pay period; how pay is recorded is parked
    (THE LIST 62).
14. **Settings, Rota options** each company can change (Phil's popup): alert timings (late after
    15 minutes, missed 30 minutes after the end, overrunning 15 minutes after the end), clock in
    rules (opens 30 minutes before, default home radius 200 m), notes and MAR (earlier notes 24
    hours, pinned notes 48 hours, low stock warning 7 days). Location required stays fixed (on).
15. **Settings, Rota (built, part 2a, 0509):** one set of options per company, not per branch
    (decision 14 says each company). A company that has saved nothing uses the defaults, so nothing
    changes until a Company Admin saves. Ranges: late 5 to 120 minutes, missed 0 to 240, overrunning
    5 to 120, Clock in opens 0 to 120 minutes before, radius 25 to 2,000 m, notes 1 to 168 hours, low
    stock 1 to 60 days. The radius applies to homes set up after the change; homes already set keep
    their own (changed on the service user's Clock in page). The page shows only while the module is
    on.
16. **Branch default cancellation rule** (Phil's popup, 2026-10-17): every branch starts with **48
    hours** notice, **48 hours** still charged and **48 hours** carer still paid, changeable per branch
    in Settings, Rota. A funder's own rule, when set, wins over the branch default.
