# Brand decisions

> Be Care Compliant brand and design system decisions (standing rules)

Phil chose the **gold accent, same as JCN** (amber-400 family) over teal/sky/violet, on the deep navy base (#081231 / #0d1d4b / #14306b). Maximum family resemblance is intentional.

**Why:** He wants the products to read unmistakably as one family.

Phase 0 sign-off corrections (standing rules): gold must sit at the RICH AMBER end, never light yellow — scale is #fbbf24 / #f59e0b / #d97706 / #b45309, nothing lighter than #fbbf24 anywhere. Primary buttons render #f59e0b with navy text (explicitly passed).

**DARK APP THEME (Phil's Phase 0 decision, supersedes the light glass look):** the entire app is dark — navy gradient background (navy-950 → 900 → 800), dark glass cards bg-white/10 + border-white/10 + blur, light text (white / white-60 / white-50), gold icon chips (bg-gold-400/10 text-gold-400), dark form controls (bg-white/10, white text), dark topbar (bg-navy-950/50). RAG pills stay as light soft chips, they pop on dark. Light glass was rejected twice as "too much white" — never reintroduce light backgrounds on app screens.
**How to apply:** All Be Care Compliant UI uses navy + gold; do not propose alternative accents again. RAG colours are deliberately deeper (emerald-700/amber-700/red-600 with 100-strength soft pill backgrounds) so status never reads as branding. Canonical form controls live in app/globals.css only; Tailwind v4 gotcha: @apply cannot reference custom component classes, use grouped selectors for shared bases (.btn/.pill/.glass-card groups).

**SAVE BUTTON SPEC (full standing rule, Phil corrected this a THIRD time on Settings > Branches 2026-07-12, never violate again). Every save/submit button in the app must:**
1. Be SOLID gold (btn-primary), never btn-outline/btn-ghost (outline is for secondary actions only).
2. Show "Saving…" the INSTANT it is pressed (useActionState pending, inputs disabled).
3. Show "Saved" on success (btn-saved state), reverting to "Save" when the form is edited again (dirty flag on form onChange).
4. Surface errors visibly next to the button. A save must NEVER be silent: server actions return ActionState ({ok}/{error}), never void, and check the update count so RLS no-ops become visible errors.
5. Dialogs stay OPEN with the working state visible until the action completes (no vanishing boxes), and dialog components remount per open so stale success state never insta-closes them.
The canonical implementations are components/settings/branch-form.tsx and components/people/edit-person-form.tsx. Any bare `<form action={serverAction}>` with a void action is a defect. **Why:** bare forms give zero feedback; Phil experiences them as "nothing happens" errors and has now corrected this three times (Absence settings, SMS number rows, Branches).

Also standing (2026-07-12): phone numbers are entered as dialled (07700 900123) and normalised server side to E.164 (+447...), never force users to type +44.

Related: [project-state](project-state.md)

**AI MARK (standing, 2026-09-28):** [stated] every button that uses AI credits carries the AI mark. [stated] A sparkle icon on its own was rejected ("that logo isn't clear that it is AI"); the mark is a small gold "AI" chip before the words (components/ai-icon.tsx, tone "onGold" on solid gold buttons). Any new AI button must use it.
