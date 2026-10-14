# Test checklist: Homepage refresh, 2026-10-14

Branch `homepage-refresh`, on its Vercel preview link (NOT becarecompliant.com). Decision:
`docs/decisions/homepage-scenes.md`. Run one at a time, on the Mac and then on the phone.

| # | Check | Result |
|---|-------|--------|
| H0 | Claude's own checks: typecheck, 1,975 unit tests and the build pass; no sideways scroll at 1440 or 390 wide; all four stories play to the end; with reduced motion nothing moves and the final picture shows; at a mid range phone's speed (4x slower CPU) the lead story runs at 60 frames a second with no slow frames | PASS (Claude, local production build) |
| H1 | Lighthouse mobile, before and after: Performance no lower and at least 90, Accessibility at least 95, CLS under 0.05 | PASS (before 98, 99, 99; after 99, 99, 99; Accessibility 100 both; CLS 0 both) |
| H2 | Mac: the hero matrix looks like the real People register (same column names, red, amber and green pills, done dates green or amber) and does not move | Not tested |
| H3 | Mac: scroll to "Checks that keep themselves up to date". It plays once: the form appears, Supervision 2 goes from red to done with today's date in amber, Supervision 3 appears in green, Overdue goes 3 to 2, Riverside goes to On track. Replay plays it again | Not tested |
| H4 | Mac: the Evidence story (audit lines appear one by one) and the OneDrive story (the PDF appears in the Supervision 2 folder) each play once, with Replay | Not tested |
| H5 | Mac: "Everything your service runs on" shows the Return to Work story beside "Your staff, looked after", then three cards; Pro lines carry a Pro chip and the note explains it | Not tested |
| H6 | Mac: the testimonial band is gone; the Security audit card reads "nobody in your company can alter or delete"; nothing else in Security, Pricing, FAQ or the hero text has changed | Not tested |
| H7 | Phone: the hero shows Carer and Supervision 2 Due and Done, nothing runs off the side, and each story plays as it comes into view | Not tested |
| H8 | Phone (optional): with Reduce Motion on (Settings, Accessibility, Motion), the stories show their finished picture and nothing moves | Not tested |

The app screens are not part of this test: no app file changed, and the shared stylesheet only
lost classes the old homepage preview used and gained classes the app does not use (see the job
report, "Nothing else changed"). Signing in on a preview link would also count as your one desktop
session.
