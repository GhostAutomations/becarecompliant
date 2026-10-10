# Freedom

> Freedom = the care-management expansion, PROMOTED 2026-08-13 to Phase 14 / Operation New Dawn (Nourish scheduling + Birdie care recording/eMAR); locked decisions incl. £249 pricing, the staff-app decision change to installable web app first, route/cost/grant analysis, roadmap doc location

**PROMOTED 2026-08-13.** Freedom is no longer a standalone 2027 doc: it IS **Phase 14, Operation
New Dawn** in PHASES.md, and `FREEDOM-2027-ROADMAP.md` is now its detailed design. The July
decision that nothing entered PHASES.md until BCC v1 shipped is superseded. See
[operations](operations.md). **Nothing in it starts until Operation Thistle (Phase 13) has signed off.**

Freedom (codename) = expansion of BCC into full care management: Nourish Empower-style
planning/scheduling + Birdie-style care plans/recording/tasks/eMAR. The carer WEB view ships
first; the store apps are the later ambition.

IMPORTANT corrections from Phil (2026-07-27, later in session): (1) Phil does NOT own a care
agency — he SUBCONTRACTS to **Thistle Care Ltd** (the reason the test company was renamed
"Thistle"→Acme: freeing the name for them as a real tenant — which is exactly what **Operation
Thistle, Phase 13** now is); earlier "run it in our own care company" framing is wrong. (2) Be
Care Compliant will be incorporated as a NEW company by Phil (not a product inside an existing
business). (3) Phil can base himself/the company in Cardiff OR the Vale of Glamorgan — he
confirmed he LIVES in the Vale and is on the electoral register there.

Decisions (Phil popup 2026-07-27, with two updated 2026-08-13):
- Home care (domiciliary) FIRST; residential later. **Unchanged.**
- ~~Mobile = React Native + Expo (+ PowerSync offline sync, one codebase for both stores).~~
  **CHANGED 2026-08-13: the staff app is an installable WEB app first** — a mobile web app the
  carer opens in Safari or Chrome and adds to their home screen. No store accounts, no review
  cycles, shipped from the Next.js codebase that already exists. Freedom itself already called
  the carer web view "the floor, not the fallback". Native returns as its own later phase; the
  two things it would buy are dependable OFFLINE recording and BACKGROUND LOCATION for call
  monitoring, and those are the reasons to revisit it — not before.
- Team = Phil + Claude at BCC cadence + a contracted Clinical Safety Officer for eMAR when
  selling at scale. **Unchanged, and an NHS-standards requirement rather than a choice.**
- ~~STANDALONE DOC ONLY — do not log it in PHASES.md.~~ **SUPERSEDED 2026-08-13**, see the top.
- **FREEDOM PRICING (Phil, 2026-07-27): once Freedom is live, £249/month base, plus extra
  branches, plus extra users, plus AI credits (same extras pattern as today; included quantities
  TBD), plus SMS charged at 10p per message (Phil raised from an initial 6p after margin
  discussion — Twilio UK outbound ≈ $0.056 (~4.4p), so 10p ≈ 5.6p margin, in line with the 8–12p
  market band). The current £49/£69 public plans reflect current features only.**

**Five reports named by Phil, 2026-08-13**, all of which only become possible once calls are
recorded: call **duration** against plan (both cut short and run over), **earliness** (arriving
too early — as much a dignity and safeguarding issue as lateness, and the one nobody reports on),
**lateness**, **note quality** (whether what was written is worth anything, not merely that
something was written), and **medication competency** joined to what the carer actually recorded
on the MAR, so the competency check stops being a form and becomes evidence.

Roadmap doc: `FREEDOM-2027-ROADMAP.md` in the Be Care Compliant folder root (feature map from
both products, F0–F11 phase plan, three-clocks timeline, costs, risks, 2026 prep list). Pricing
added to F11 row + billing reuse row 2026-07-27 (SMS updated to 10p same day). A header block
added 2026-08-13 records the promotion, the staff-app change and the five reports. The body still
contains the pre-correction cost/route framing and still says three apps — offer to revise if
Phil wants.

Key plan facts:
- Same repo + same Supabase project — Freedom is new departments inside BCC, not a sister
  product; a visit = join of one Person (carer) + one Service User.
- MODS/DAPB4102-shaped schema from day one (9 categories, ~405 terms; certification now mandatory
  for the NHS assured DSCR list — existing-supplier deadline passed 1 July 2026).
- Meds from NHS dm+d (free via TRUD). eMAR scope = record-don't-decide (no dose
  calculation/clinical advice → stays health IT, not a medical device).
- Commercial-at-scale calendar: kickoff Jan 2027 → web launchable Q1 → stores + eMAR with pilots
  Q2–Q3 → full 3-app launch Q4 2027. Build ~3–5 mo, proving ~2–3 mo; full trust stack ≈ £15–30k
  (CSO package from ~£5k / retainer ~£999/mo e.g. DigiSafe; pen test £3–6k; CE+ micro ≈ £1.5k).
- Mobile session policy MUST be decided in F0 (BCC single-session kick vs carer signed in on
  phone + web — same trap as the On Call crashes). **Still true, and now more urgent**: a web
  staff app hits the single-session rule immediately.

Route analysis (2026-07-27 Q&A, post-correction):
- FIRST-CUSTOMER route: Thistle Care Ltd = pilot customer #1. **This is now Phase 13, Operation
  Thistle, and it happens BEFORE Freedom rather than as part of it.** Even free, that is supply
  to a third party (their own CIW registration + their service users' data) → day-one basics:
  simple contract + processor DPA, ICO registration for the new co, PI + cyber insurance from
  incorporation, and a few CSO advisory hours (~£99/hr) before eMAR goes live on their people.
  Floor ≈ £1–2k/yr — still nowhere near the £15–30k stack. Upside: real third-party deployment =
  case study + grant evidence + possible first revenue; Phil is embedded there as their
  subcontractor.
- Trust stack (CSO package, DTAC evidence, MODS cert, CE+, pen test, assured list) only needed
  when scaling to strangers / England NHS-funded buyers. No certification is legally required to
  supply care software in Wales OR England — the assured list is an NHS England
  procurement/funding gate, not a licence; Wales has no equivalent scheme at all (CIW regulates
  providers not vendors; DHCW = NHS Wales).
- Natural sequencing: Thistle-first (≈£1–2k) → Welsh providers (no gate; Welsh-language UI a
  differentiator neither Birdie nor Nourish leads with) → England scale-up (buy the trust stack
  then, funded by revenue).
- COPYING BIRDIE/CAREPLANNER (Phil has customer logins via Thistle): copy CAPABILITIES not
  ARTEFACTS. Features/workflows aren't protected (roadmap already maps them); their
  screens/code/text/assessment+template libraries ARE (copyright + database right), and mining
  customer logins to clone breaches standard SaaS terms — legal + small-market blowback. Legit
  login uses: export Thistle's OWN data (feeds the F7 migration importer — best switching weapon)
  + Phil's user knowledge steering specs. Build assessment content from published clinical
  sources, never their screens. Freedom ships in BCC's CRISP design language, not as a lookalike.

Grants/funding (researched 2026-07-27; BCC = new co so the start-up shelf is open):
- Best fit for Freedom R&D: SMART Flexible Innovation Support (£20m Welsh Gov discretionary fund
  via a Business Wales innovation adviser, 03000 6 03000; hub page businesswales.gov.wales
  …/smart-flexible-innovation-support-fis/what-smart-fis). Bundle certification/testing costs
  INSIDE the project budget; viability evidence = BCC already working + roadmap + first customer.
  Claude to draft the Innovation Plan when Phil is ready.
- **Vale Business Start-Up & Early Growth Bursary: up to £7,500 at 80% (20% match), OPEN 7 Jul–31
  Oct 2026 or until allocated, 48-hr panel decision. Requires PERMANENT RESIDENCY in the Vale +
  electoral register + Business Wales registration + business plan + 2-yr cash flow. Phil
  qualifies (Vale resident, on register). Application drafts done — see
  `bcc-bursary-application` (not carried over). DEADLINE-BEARING.**
- Cardiff: Growth Fund (£2.5k–£10k, SPF-linked, run with FOR Cardiff) — council page 404s as of
  27 Jul 2026, likely between rounds; status needs a call to Cardiff business support. Cardiff
  also has starter units/workshops + advice; bigger startup hub scene (e.g. Tramshed Tech).
- Both sit in Cardiff Capital Region — CCR investment funds are equity/loans for scale-ups
  (later, not now). National layer (Business Wales, SMART FIS, Start Up Loans, DBW) identical
  whichever council.
- SBRI Healthcare = 100%-funded development contracts when a fitting digital health/care call
  opens (watch calls).
- Start Up Loans (British Business Bank), from Apr 2026: 7.5% fixed (was 6%), businesses up to 60
  months trading, ~£25k per director — loan not grant, most reliable cash.
- R&D tax relief (~20% merged scheme): hinges on Phil paying himself SALARY not dividends during
  the build — accountant conversation BEFORE incorporation; HMRC scrutinises software claims, the
  offline-sync engine is the defensible R&D core. **Note: an installable web app first weakens
  that particular R&D story, since the hard offline-sync work moves to the later native phase.**
- Grant clocks: apply autumn 2026 so money lands for the Jan 2027 kickoff; start-up scheme
  windows run from incorporation/trading date.

**Name for New Dawn (Phil, 2026-09-28):** [stated] remember "Total Halo" as the name for Project/Operation New Dawn (the all-in-one product). totalhalo.co.uk looked free (no DNS) on 2026-09-28, totalhalo.com is registered by someone else; trade marks not yet checked; nearby clash: Halo Connected Health (UK care records). Not registered or adopted yet. See [brand-positioning](brand-positioning.md).

**Switchover decision (Phil, popup 2026-09-26):**
- [stated] New Dawn replaces Nourish Care Planner and Birdie so BCC is all in one (planning, notes, MAR, compliance), Wales only for now
- [stated] Build planning, MAR and notes in one go (not staged via an API bridge)
- [stated] Launch at Thistle's Cardiff branch first to test, then Newport
- [stated] No preference given on start timing; the existing rule (starts after Operation Thistle signs off) stands
- [stated] Phil asked for this to be added to New Dawn (2026-09-26). Section drafted and saved to Project docs claude/new-dawn/replacing-care-planner-and-birdie.md; PHASES.md Phase 14 still to be updated when the Mac reconnects
- Care Planner API role therefore = one-off data import per branch at switchover, not an ongoing sync; see [thistle-systems](thistle-systems.md)

Why: Phil asked 2026-07-27 to map Freedom (can we build it / how / how long). Verdict: yes — risk
is offline sync correctness + eMAR clinical safety + assurance clocks, not code.

Related: [operations](operations.md), [project-state](project-state.md), `bcc-bursary-application` (not carried over),
[oncall-finalise-verdict](oncall-finalise-verdict.md), [brand-decisions](brand-decisions.md)
