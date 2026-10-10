# Back navigation

> Standing UI rule — every sub-page needs a clear Back link (BCC)

Standing rule (Phil, 2026-07-09): EVERY page that is not a top-level nav destination must have a clear, visible **Back** link to its logical parent, so the user never has to re-navigate from the sidebar to get back. Applies to all future pages for the rest of the build.

- Use the shared `components/back-link.tsx` (`<BackLink href="..." label="Back to X" />`, renders "← Back to X").
- Put it at the top of the page, above the title.
- Parent = the sensible place the user came from: a record's sub-page (complete a check, complete a tracker form) goes back to the record (`/people/[id]`); create/new and the record itself go back to the register (`/people`); Settings sub-pages go back to `/settings`.
- Top-level pages reachable from the sidebar (Dashboard, People, Service Users, Settings hub) do NOT need a Back link.
- **Why:** Phil hit a dead end completing a Supervision from a carer, having to click People then the carer again to return to the cards. A small breadcrumb link was not obvious enough; use the explicit BackLink.

Related: [phase3-decisions](phase3-decisions.md) [brand-decisions](brand-decisions.md)
