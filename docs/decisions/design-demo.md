# Design demo

> REVIVED + SHIPPED 2026-07-25. Phil asked fresh to make the real app look like the crisp navy+gold demo, Acme only. Now LIVE on production (main) for Acme via companies.ui_theme='navy' (everyone else 'classic', migration 0123_ui_theme_flag). Ongoing critique/polish. Details below; original demo history further down.

## SHIPPED to real app (2026-07-25) — Acme-only "navy" theme, LIVE on production

Phil gave the explicit fresh ask ("make Acme look like the demo"), wants it ON the live www.becarecompliant.com for Acme only (not a preview). Built on branch `acme-navy` off main, merged to `main`, deploys to prod. Gating: `companies.ui_theme` text ('classic' default, Acme='navy'); migration `supabase/migrations/0123_ui_theme_flag.sql` (column already applied via execute_sql). App reads it in `app/(app)/layout.tsx` → `themeClass='theme-navy'` on the shell + `navy` bool.

What shipped (all Acme-gated):
- **Theme (globals.css, unlayered `.theme-navy` block):** flattens glassy surfaces (glass-card/app-tile/section-card/topbar/sidebar-gradient) to flat navy-900 panels + hairline borders, no blur/shadow; pills borderless dark tints (pill-green/amber/red/neutral); rag-cells dark tints not pastel; compact matrix rows.
- **Chrome:** `components/navy-nav.tsx` (client) = far-left 56px icon rail (department icons via NavIcon + vertical company name + user initials) + collapsible drawer flyout. Rail icon click opens drawer on that dept (no nav), stays while hovering rail/drawer, closes on nav click / mouse-leave (debounced). Rail icons `position:absolute`, JS-aligned to each dept's drawer row (`.navy-ric[data-href]` ↔ `.navy-wi.parent[data-href]`); drawer `padding-top:54px` so aligned icons clear the logo. layout.tsx renders NavyNav when navy, hides the gradient `<aside>`.
- **Matrices:** one-branch-at-a-time gold pill switcher (`.navy-branchbtn`) on People matrix (register-matrix.tsx) and Service Users (service-user-register.tsx, which already filtered one branch). Components detect theme client-side via `document.querySelector('.theme-navy')` in a useEffect (no prop threading).
- **Training (training-matrix.tsx):** under navy, one-off Done/Not done render as ✓/✕; sub-labels ("Expired"/"Due soon") suppressed so rows are uniform height; a person with any expired course gets a red-shaded name cell + red name (`.training-expired`).
- **Nav consistency (all companies):** Service Users now has a "Compliance" sub-department (href /service-users) mirroring People; SU main matrix view title changed to "Compliance" (VIEW_META.main.title).

Standing rules for this work: keep everything Acme-only behind the flag; work on branch off main then merge; give Phil ONE git block with SEMICOLONS (git commit with `&&` skips push on a no-op commit — bit us repeatedly). iCloud repo: bash `git`/greps HANG (file materialization) — use the Read/Edit/Grep/Glob file tools, not bash, for the repo. Verify prod deploys with the Vercel MCP (list_deployments, project prj_eGEI0ICcSHIIKWc4qR29XaBjk6Aa, team team_96YpBBhKikgVGZXKMGz725mJ).

---

Started 2026-07-24. Phil is wary BCC looks generic/vibe-coded and wants it to stand out. Explicitly said DO NOT build design into the app this phase, only throwaway concept pages.

Journey of taste (what he rejected/liked):
- Rejected 3 palette-only variants (same layout recoloured) and an editorial/pastel direction as "vibe code look".
- Showed him monday.com (his own Thistle workspace, dark): he likes the colourful grouped **status board** (full-cell RAG colours, group colour bands, workspace rail) but "looks like a direct copy" and wanted OUR content in cells.
- Muted/rounded-chip version = "gone back to vibe code look" (softening was wrong).
- WINNER = **"crisp" style**: flat colour, hairline 1px grid, sharp corners, tight IBM Plex Mono dates, high contrast, near-black chrome + one gold accent, RAG cells = light tint fill + 2px colour top-keyline + mono date + tiny uppercase label. Light default felt "too white" so base is a light **graphite** (#E4E6EB) with white sheets floating on it. Also built a crisp DARK variant (near-black, colour washes). Offer both as a per-user toggle; pick default later.

Hard content rules he enforced: use the REAL register columns, don't invent. People matrix (Acme = four_supervisions) columns in order: Carer, Status, Start date, Manual Handling, Med Competency, DBS, Enhanced DBS, RTW Expiry, RTW Limits, Probation Due/Actual/Status/Ext, Spot Check Due, Recent Spot Check, Sup 1-4 Due+Done (each its own column), Audit. NO "Overall" column (I invented one, he caught it). NO Training column in the matrix (Training is its own dept). SU columns: Service User, SSID, Status, Package start, Setup Due/Done, Review 1-4 Due/Done, Planned Review, Review Status, Audit.

Concept files live in outputs/bcc-concepts/ (register-crisp-light/dark.html are the reference) and the full clickable site in **outputs/bcc-demo-site/index.html** (single self-contained SPA, light/dark toggle, nav across Dashboard, People+record, Service Users, Training, Holidays, Absence, Outcomes, Satisfaction, Complaints, Planner, On Call, Invoicing, Reports, Readiness).

Hosting decision (popup): **Git repo + subdomain**. Plan = new GitHub repo with these files → import to Vercel (framework Other) → Settings/Domains add demo.becarecompliant.com (auto DNS since domain is in this Vercel acct) → turn off Deployment Protection so it opens without a Vercel login. README.md in the folder has the click-by-click.

Vercel gotcha: my Vercel MCP token can create a NEW project's FIRST deploy only (403 on any further prod/preview deploy to an existing project), and can't change domains/DNS/protection. So a stable evolving demo MUST go via Git (Phil pushes) not my direct deploys. A throwaway prod deploy went up at bcc-crisp-demo-ghostautomations.vercel.app but it's gated behind Vercel Authentication (Deployment Protection) so it shows a Vercel login until that's turned off.

NEXT when Phil's ready: he stands up the repo+subdomain (or asks me to walk him through live), then when he approves the crisp look we port it into the real app's globals.css + components as its own phase (NOT done yet).
