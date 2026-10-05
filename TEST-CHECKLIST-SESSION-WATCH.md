# Test checklist: an open tab signs itself out when displaced (2026-10-05)

Phil (popup, current phase): Bev was signed in in both Edge and Chrome. The database had already ended the older session (one desktop slot, 0273 and 0381); the old tab only found out on its next click. Phil confirmed that click signed Edge out with the right message. Now an open tab asks /api/session/check when it comes back into view and once a minute while visible.

| # | Check | Result |
|---|-------|--------|
| S1 | Sign Bev in on Edge, then on Chrome. Leave Edge open untouched. Switch to the Edge window: within a few seconds it goes to the sign in page with "You've been signed out because your account was signed in elsewhere" | NOT TESTED |
| S2 | Leave a displaced tab visible without touching it: it signs out within about a minute | NOT TESTED |
| S3 | After signing back in from that page, it returns to the page the tab was on | NOT TESTED |
| S4 | The live tab (Chrome) is never signed out by the check, over several minutes of normal use | NOT TESTED |
| S5 | Phone and computer together (one of each) both stay signed in | NOT TESTED |
