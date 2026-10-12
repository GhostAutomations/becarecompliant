# Test checklist: signatures on letters (Job 2 Part A, 2026-10-12)

Phil's decisions: `docs/decisions/letter-signatures.md`. Migration 0446 (`user_signatures`, the
private `signatures` bucket, owner only policies). Letters: the absence meeting invitation (and
rearranged invitation) and the absence meeting outcome letter. Bevan only.

Why there were none: letters were never built to carry one. No office login had a stored signature
and the PDFs drew only "Yours sincerely", the name and the job title.

Local render (12 Oct, before deploying): invitation signed by a Supervisor and outcome signed by an
Admin, the signature between "Yours sincerely" and the name in bold with the job title under it;
the unsigned invitation unchanged.

Dry run of 0446 on the live database, rolled back (12 Oct): the Supervisor kept, saw and removed
their own row and file; writing a row or a file for the Admin was refused; the Admin and the Founder
saw 0 rows and 0 files of the Supervisor's and changed nothing; the Founder and a Senior could not
keep one. Afterwards no table, bucket or policy remained. Applied live 12 Oct; security advisor 0 errors (the two new helper functions join the existing group of functions signed in users may run; each only answers for the caller's own login).

| # | Check | Result |
|---|-------|--------|
| L1 | Profile panel: "My signature" for an office role (Bev Admin); not for a Senior or the Founder | Not tested |
| L2 | My signature: upload a PNG or JPEG, green Saved, the image shows | Not tested |
| L3 | My signature: draw and save, green Saved, the drawing shows | Not tested |
| L4 | Book meeting (Bevan test person): the four choices, a saved one picked first; the PDF preview shows the signature above the signer's name and job title; Sign now draws into the preview; No signature puts the person holding the meeting back in the sign off | Not tested |
| L5 | Save to history: the kept letter PDF carries the signature; audit `signature.used` | Not tested |
| L6 | Outcome letter: the final look shows the signature, a changed choice redraws it; Save to file and Approve and keep carry it; audit `signature.used` | Not tested |
| L7 | Rearrange: the letter preview shows the signature and the new letter carries it | Not tested |
| L8 | After applying: the same privacy checks as the dry run pass on the live tables | PASS (12 Oct, after applying, rolled back: own row and file kept and seen; writing for the Admin refused; the Admin and the Founder saw and changed nothing; the Founder and a Senior could not keep one) |
| L9 | Founder in support mode: no My signature link, the page says it is not available, no signing choice on letters | Not tested |
| L10 | Remove a saved signature: gone from the page, its file gone from storage | Not tested |
| L11 | Phone width: My signature and the signing choice fit with no sideways scroll | Not tested |
| L12 | A letter kept before today is unchanged (same file and hash) | Not tested |
| L13 | Test meetings, letters and signatures tidied away or noted | Not tested |
