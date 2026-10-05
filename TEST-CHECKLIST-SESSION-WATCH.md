# Test checklist: an open tab signs itself out when displaced (2026-10-05)

Phil (popup, current phase): Bev was signed in in both Edge and Chrome. The database had already ended the older session (one desktop slot, 0273 and 0381); the old tab only found out on its next click. Phil confirmed that click signed Edge out with the right message. Now an open tab asks /api/session/check when it comes back into view and once a minute while visible.

| # | Check | Result |
|---|-------|--------|
| S1 | Sign Bev in on Edge, then on Chrome. Leave Edge open untouched. Switch to the Edge window: within a few seconds it goes to the sign in page with "You've been signed out because your account was signed in elsewhere" | PASS (13:39: Bev signed in on Edge; my untouched Chrome tab went to /login?reason=signed-out-elsewhere with the message. 13:42 reverse: signed in on Chrome, Edge showed the sign in page with no click) |
| S2 | Leave a displaced tab visible without touching it: it signs out within about a minute | PASS (signed out within about a minute while visible) |
| S3 | After signing back in from that page, it returns to the page the tab was on | PASS (signed back in from that page and landed on the Dashboard it had been on) |
| S4 | The live tab (Chrome) is never signed out by the check, over several minutes of normal use | PASS (live tab: /api/session/check answered ok three times; Chrome stayed signed in while Edge was signed out). Note: tabs opened before the deploy carry the old code and only sign out on their next click |
| S5 | Phone and computer together (one of each) both stay signed in | PASS (13:51 Bev signed in on the phone: mobile slot claimed, the computer slot from 13:41 untouched and still live, Chrome stayed on the Dashboard) |
