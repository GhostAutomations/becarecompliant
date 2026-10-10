---
paths:
  - "app/**/*.tsx"
  - "app/globals.css"
  - "components/**"
  - "lib/ui/**"
  - "lib/use-saved-flash.ts"
  - "lib/nav.ts"
---

# Screens

- Dark theme everywhere: navy gradient background (navy-950 to navy-800), dark glass cards
  (bg-white/10, border-white/10, blur), light text. Never a light background on an app screen
  (rejected twice as "too much white").
- Gold accent at the rich amber end only: #fbbf24, #f59e0b, #d97706, #b45309, nothing lighter.
  Primary buttons are #f59e0b with navy text.
- Form controls are styled only in `app/globals.css`. Never style a control inline. Never
  `border-gray-300` or `hover:bg-gray-*`. Tailwind v4: `@apply` can't reference custom component
  classes, so share bases with grouped selectors.
- RAG pills: emerald-700, amber-700, red-600 on 100 strength soft backgrounds. Readable and
  accessible; status never looks like branding.
- Save buttons: solid gold `btn-primary`; "Saving…" the instant it is pressed; then green
  `btn-saved` reading "Saved", which STAYS until the form is edited again (no timer). Send buttons
  say "Sending…" then "Sent", never "Saving". Errors show beside the button. Server actions return
  ActionState, never void, and check the update count so an RLS no op becomes a visible error.
  Canonical: `components/action-form.tsx`, `lib/use-saved-flash.ts`,
  `components/settings/branch-form.tsx`. Full history: `docs/decisions/save-button-behaviour.md`.
- Dialogs stay open, showing the working state, until the action completes.
- A refused save keeps everything typed: use the shared `submitKeepingTyped`
  (`components/forms/keep-typed.ts`) or `ActionForm` (`components/action-form.tsx`).
- Every page that is not a sidebar destination (`lib/nav.ts`) has a `BackLink`
  (`components/back-link.tsx`) above the title, pointing at its logical parent.
- Every button that spends AI credits carries the gold "AI" chip (`components/ai-icon.tsx`).
- Phone numbers are typed as dialled (07700 900123) and normalised to E.164 on the server.
- Live updates: subscribe unfiltered (RLS scopes the events), keep a poll fallback for when the
  connection is down, and debounce refreshes (`components/realtime-refresh.tsx`).
- New screens mirror a similar existing screen: cards, pills, slide overs, toasts, collapsible
  sections. Data heavy screens stay calm.
- Mobile first: managers and supervisors use this on phones in the field.
- Every new screen has a clear empty state.
- Timelines and chats: oldest at top, newest at bottom, scrolled to the latest.
- No dashes as punctuation in on screen text (a lone dash in an empty cell is fine).
