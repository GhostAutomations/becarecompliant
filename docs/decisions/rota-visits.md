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
