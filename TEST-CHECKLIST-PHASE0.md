# Phase 0 Test Checklist — Foundations & Design System

Run as popups, one check at a time (Pass / Fail / Not tested). Anything Not tested is logged into Final Testing in PHASES.md.

## Design sign-off

1. Login screen: deep navy gradient, gold accents, glass card, brand mark. Feels like a JCN sibling.
2. Canonical controls on the dashboard preview: input, select (custom navy chevron), textarea, checkbox (gold tick), radio (gold dot), slider (gold thumb). Gold focus ring on every control.
3. Glass cards: bg-white/70 + blur + white border on the soft gradient background, no plain white boxes anywhere.
4. Buttons: solid gold primary with navy text, solid red destructive, outline and ghost variants.
5. RAG pills readable on glass cards: green/amber/red, distinct from the gold brand accent.
6. Dashboard shell: frosted topbar, gradient navy sidebar (desktop), app-grid tiles for People and Service Users.
7. Mobile: bottom dock navigation appears under 768px, sidebar hidden, screens usable one-handed.
8. Empty states: dashboard RAG strip shows zeros with explanation; People and Service Users show clear empty states naming the phase they arrive in.

## Behaviour

9. Sign in with correct credentials lands on /dashboard with your name and Founder pill in the topbar.
10. Wrong password shows "Email or password is incorrect." with no page crash.
11. Signed out: visiting /dashboard, /people or /service-users redirects to /login.
12. Signed in: visiting /login bounces to /dashboard.
13. Sign out button returns to /login and /dashboard is no longer reachable.
14. Single-session: sign in on a second browser; the first browser's next navigation lands on /login with "You've been signed out because your account was signed in elsewhere."

## Logged to Final Testing if not run now

- Single-session enforcement live test (14)
- Canonical controls cross-browser (Safari macOS + iOS, Chrome, Firefox)
- RAG pill WCAG AA contrast measurement on frosted background
- Middleware redirect matrix including /api/webhooks/* public paths
