# Policy signing ux

> BCC — reading and signing a policy on a phone (the DocuSign pattern), the pdf.js reader, the read gate and its two failures, the signed copy, and the signature pad bugs

**MOST TEAM MEMBERS USE A PHONE.** Phil, 2026-07-26: "rember, mot peple will us their phone to log into the tm portal". Judge every Team Member screen on an iPhone first.

**The pattern, copied from DocuSign / Adobe Acrobat Sign** (Phil asked directly how they do it, after calling two buttons clunky): the document fills the screen; they render pages themselves rather than embedding a PDF; ONE sticky bar at the bottom whose LABEL is the state; signing happens in a sheet over the document; finish is blocked until the required parts are done.

**Our build:** `components/staff/policy-reader.tsx` (pdf.js, a canvas per page) or `components/staff/policy-text.tsx` (written policies, as a reflowing web page) inside `components/staff/read-and-sign.tsx` (full screen portal, sticky bar, signing sheet). The tick and signature go through the shared FormRenderer, validator and acknowledgePolicy action, so the Evidence is identical to every other form.

**THE READ GATE — Phil's ruling, and it broke twice. Read this before touching it:**
- The rule: the Sign bar stays LOCKED until they reach the end. DocuSign does not gate; we do, because "how do you know they read it" deserves better than a tick box.
- v1 watched a sentinel at the foot of the document (IntersectionObserver). Wrong twice over: the panel keeps React state when closed and reopened, so one unlock lasted the session; and pdf.js renders pages progressively, so "the bottom" arrived while later pages were blank.
- v2 measured the panel's own scroll position but did it on the first frame, before layout, when scrollHeight == clientHeight — so it read "nothing to scroll" and unlocked instantly.
- v3 (live, verified): ignore a container under 40px; only trust a "shorter than the screen" measurement once the layout has SETTLED (600ms) and the document is fully rendered (`onRendered` from the reader); reset on every open; always show the progress bar.
- **LESSON: Phil found v2 as "i cant see a % bar" — the bar only rendered while locked, so its ABSENCE was the only symptom. A gate that can only be observed by its own absence is untestable. Always render the state.**

**pdf.js decisions:** `pdfjs-dist@4.10.38` LEGACY build (the modern one needs `Promise.withResolvers`, absent on iOS 16); worker bundled with `new URL(..., import.meta.url)`, never a CDN; rendered at container width x devicePixelRatio capped at 2; dynamic import inside useEffect so it never evaluates during SSR or the build.

**THE POLICY FILE ROUTE IS A PROXY, not a redirect** (`app/api/policies/[id]/file`): it streams the bytes from our own origin, so pdf.js never makes a cross-origin fetch at the mercy of bucket CORS and the signed URL never reaches the browser. Still audited as policy.opened.

**THE SIGNED COPY REPLACED THE CERTIFICATE (2026-07-27).** Phil: "why dont we just generate the pdf of the document they signed, with the date, time and signature?" `lib/assignments/signed-copy.ts` (pdf-lib, approved) appends ONE signature page to the document — name, London date and time, version, drawn or typed signature, reference — and the route serves "<title> - signed.pdf". It loads the file for the VERSION THEY SIGNED from company_policy_versions, so a later edit cannot rewrite history. A file pdf-lib cannot parse (.doc/.docx) falls back to a standalone signature page. `lib/assignments/certificate.tsx` is deleted.

**TWO SIGNATURE PAD BUGS, both app-wide (every signature field, not just policies):**
1. **Finger offset.** The canvas is a fixed 480x160 internally but stretches to its container; the pointer handler used raw CSS pixels, so on any phone the ink landed up and left of the finger. `point()` now scales by canvas.width/rect.width.
2. **WHITE INK ON TRANSPARENT.** Phil: "why is the signature colour white, that is what it is saving as." It looked right in the dark dialog and vanished on the white paper of the certificate. The pad is now WHITE PAPER with DARK INK (#0d1d4b), refilled on Clear. Rule: never colour ink to match the app theme. Signatures captured before this fix are effectively blank.

**POLICY DOCUMENTS MUST NOT CARRY A TICK BOX OR SIGNATURE LINE.** Phil: "people will try and click the box and sign on the line". The document is reading material; the tick and signature belong to the app.

**PASTE PARSER, sentence case headings:** the first version needed half the words capitalised, so "1. Purpose" was a heading and "2. Who it applies to" was not. Care policies head sections in sentence case; the test is now length (<60 chars, <=9 words) plus no sentence punctuation. Verified against Phil's real pasted policy.

**TM PORTAL LAYOUT:** "Policies I have signed" and "Forms I have sent in" are matching COLLAPSED sections (`components/staff/my-section.tsx`); open briefings stay expanded.

Related: [assignments-policies](assignments-policies.md) [briefings](briefings.md)
