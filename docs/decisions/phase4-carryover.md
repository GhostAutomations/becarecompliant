# Phase4 carryover

> Patterns from Phase 3 (People) that Phil wants carried into Phase 4 (Service Users)

Phil (2026-07-09): "remember this for phase 4." The Service User register/section must reuse the live-update pattern built for People:

- Mount RealtimeRefresh on the Service User register (and dashboard). Subscribe UNFILTERED to every table a service-user completion touches: the service_users record table, its check_instances rows, and the SU tracker table (equivalent of person_trackers). Each needs REPLICA IDENTITY FULL and membership in the supabase_realtime publication.
- Realtime is the primary path (sub-second). Keep the short poll fallback (currently 10s in components/realtime-refresh.tsx). A check_instances change already triggers a refresh that re-reads Evidence-derived slots, so Evidence stays OUT of the realtime publication (it's special-category data).

Also carry these Phase 3 standing rules into Phase 4:
- Completion date = the activity date entered on the form (e.g. date of review), not the submit timestamp; it stamps last_completed and anchors the next due. See [phase3-decisions](phase3-decisions.md).
- Never redirect() from a Server Action to a URL with a query string on this stack (Next 15 bug); return ActionState.redirectTo and navigate client-side with router.replace. See [form-renderer-hooks-bug](form-renderer-hooks-bug.md).
- Hold the "Saving…" button state through the client redirect (pending || redirectTo).
