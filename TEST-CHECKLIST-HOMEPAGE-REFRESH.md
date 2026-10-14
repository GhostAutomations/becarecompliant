# Test checklist: Homepage refresh, 2026-10-14

Branch `homepage-refresh`, on its Vercel preview link (NOT becarecompliant.com). Decision:
`docs/decisions/homepage-scenes.md`. Run one at a time, on the Mac and then on the phone.

| # | Check | Result |
|---|-------|--------|
| H0 | Claude's own checks: typecheck, 1,975 unit tests and the build pass; no sideways scroll at 1440 or 390 wide; all four stories loop and rest on the finished picture when scrolled away; with reduced motion nothing moves and the final picture shows; at a mid range phone's speed (4x slower CPU) the lead story runs at 60 frames a second with no slow frames | PASS (Claude, local production build) |
| H1 | Lighthouse mobile, before and after: Performance no lower and at least 90, Accessibility at least 95, CLS under 0.05 | PASS. Like for like, five runs each, local production builds served with brotli the way Vercel serves them: live homepage 99 x5 (first paint 0.9s), new homepage 99 x5 (first paint 0.9s); Accessibility 100 both; CLS 0 both. Without brotli (Next's own server compresses less well) it was 99 against 98 |
| H2 | Mac: the hero matrix looks like the real People register (same column names, red, amber and green pills, done dates green or amber) and does not move | Not tested |
| H3 | Mac: scroll to "Checks that keep themselves up to date". It plays: the form card appears IN FRONT of the table, Supervision 2 goes from red to done with today's date in amber, Supervision 3 appears in green, Overdue goes 3 to 2, Riverside goes to On track; the form card is gone at the end. After a short pause it fades and plays again, for as long as it is on screen | Not tested |
| H4 | Mac: the Evidence story (audit lines appear one by one) and the OneDrive story (the PDF appears in the Supervision 2 folder) each loop while on screen; scroll away and back and they start again from the beginning | Not tested |
| H4b | Mac: the comparison table has a row "A copy of every completed form in your own SharePoint or OneDrive" with a cross, Limited and a tick | Not tested |
| H4c | Mac: the Pricing page. The Business and Pro "Request a trial" buttons sit on the same line, and both "Onboarding" lines underneath are level; the gap falls under the shorter Pro list. Same on the Annual switch | Not tested |
| H4d | Mac: "Two registers, kept apart" shows the Service User register (Service User, Status, Most Recent Review, New Review Due, Audit), with Gwyn Thomas in Hospital and his checks Paused | Not tested |
| H4e | Mac: the lead story shows four carers and only Ffion's row changes; the dates are around today's date, not October 2026 (check on another day) | Not tested |
| H4f | Mac: one section "What changes for your service" sits under the hero; "Built for care, not bent into shape" is no longer a separate section | Not tested |
| H5 | Mac: "Everything your service runs on" shows the Return to Work story beside "Your staff, looked after", then three cards; Pro lines carry a Pro chip and the note explains it | Not tested |
| H6 | Mac: the testimonial band is gone; the Security audit card reads "nobody in your company can alter or delete"; nothing else in Security, Pricing, FAQ or the hero text has changed | Not tested |
| H7 | Phone: the hero shows Carer and Supervision 2 Due and Done, nothing runs off the side, and each story plays as it comes into view | Not tested |
| H8 | Phone (optional): with Reduce Motion on (Settings, Accessibility, Motion), the stories show their finished picture and nothing moves | Not tested |

The app screens are not part of this test: no app file changed, and the shared stylesheet only
lost classes the old homepage preview used and gained classes the app does not use (see the job
report, "Nothing else changed"). Signing in on a preview link would also count as your one desktop
session.
