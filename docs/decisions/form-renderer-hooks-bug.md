# Form renderer hooks bug

> Form completion client crash React

Symptom: completing a Form via the UI (probation, supervision, any check/tracker) showed React minified error #310 ("Rendered more hooks than during the previous render") as a full-page client crash, AFTER the Server Action had already saved evidence + updated data (crash is client-side, during the post-submit transition).

REAL root cause (confirmed 2026-07-09 via de-minified stack + upstream issue): NOT our form code. The minified stack's throwing component `D` is Next.js's own App Router `Router` (client/components/app-router.tsx); the throwing hook is its `const { searchParams, pathname } = useMemo(..., [canonicalUrl])`. This is Next.js 15 bug vercel/next.js#78396 (tracked upstream as facebook/react#33580): calling `redirect()` from next/navigation inside a Server Action desyncs the router's hooks during the transition → #310. Triggered specifically when redirecting to a URL WITH a query string: createPerson redirect()'d to a plain /people/[id] and worked; the completion actions redirect()'d to /people/[id]?completed=... and crashed.

Fix (the community/upstream workaround): do NOT call redirect() in these Server Actions. Return ActionState `{ ok, redirectTo }` and navigate client-side with `useRouter().replace(redirectTo)` in a useEffect. Applied to completeCheck + completeTrackerForm (lib/people/actions.ts) and their client components complete-check.tsx / complete-tracker.tsx. ActionState gained `redirectTo?: string` (lib/forms.ts). createPerson's param-less redirect() was left as-is (works).

STANDING RULE: never `redirect()` from a Server Action to a URL with a query string on this stack (Next 15.5.20 / React 19.2.7). Use `{ redirectTo }` + client `router.replace`. Also fixed a separate real defect in form-renderer.tsx (was calling parent onChange inside the setAnswers updater — impure; now uses a ref + notifies in the handler); good practice but was NOT the crash cause.

Wrong first theory (discarded): I initially blamed conditional `visibleWhen` fields / the impure updater. That was a coincidence — supervision (no conditional) redirects the same way and crashes identically; Phil had only tested probation. See [phase3-decisions](phase3-decisions.md).
