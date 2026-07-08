# Phase 0 Test Checklist — Foundations & Design System

Run as popups on 2026-07-08 against the live site (www.becarecompliant.com). Result: 14/14 Pass.

Notes from the run:
- Checks 1 to 3 initially failed on tone ("gold too yellow", "too much white"). Fixes: gold scale shifted to the rich amber end, then the app moved to the dark theme (Phil's decision). Re-checks passed.
- Check 9 passed by direct evidence (screenshots of signed-in dashboard with Founder pill).

## Design sign-off

1. Login screen navy + gold, JCN sibling — Pass
2. Canonical controls (input, select, textarea, checkbox, radio, slider) with gold focus — Pass
3. Dark glass surfaces, no flat white — Pass (after dark theme)
4. Buttons: gold primary, red destructive, outline, ghost — Pass
5. RAG pills readable and distinct from brand gold — Pass
6. Shell: dark topbar, gradient sidebar, app-grid — Pass
7. Mobile bottom dock under 768px — Pass
8. Empty states on every screen — Pass

## Behaviour

9. Sign in lands on /dashboard with name + Founder pill — Pass (evidence)
10. Wrong password shows clean error — Pass
11. Signed out: protected paths redirect to /login — Pass
12. Signed in: /login bounces to /dashboard — Pass
13. Sign out ends the session fully — Pass
14. Single-session: second sign-in evicts the first with the exact message — Pass

## Remaining in Final Testing (see PHASES.md)

- Canonical controls cross-browser (Safari macOS + iOS, Chrome, Firefox)
- RAG pill WCAG AA contrast measurement on the dark glass cards
- /api/webhooks/* public-path behaviour (no webhooks exist yet to test)
