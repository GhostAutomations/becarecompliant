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
   its branches.
7. **Handover note:** a note ticked "For the next carer", highlighted at the top of the next visits
   to that service user for 3 days. The office sees it too. ("Handover" elsewhere still means the
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
