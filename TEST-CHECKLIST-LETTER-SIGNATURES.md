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
| L1 | Profile panel: "My signature" for an office role (Bev Admin); not for a Senior or the Founder | PASS for the Admin (12 Oct: the link shows for Thistle's Admin and for Bev Admin). Senior and Founder: see L9 and the code (the panel link and the page use the same six role rule as the database) |
| L2 | My signature: upload a PNG or JPEG, green Saved, the image shows | PASS (Bev Admin: a PNG uploaded, Saving then green Saved, the image shown with Saved 12 October 2026 and Remove) |
| L3 | My signature: draw and save, green Saved, the drawing shows | PASS (Bev Admin: drawn in the box, green Saved, the drawing shown) |
| L4 | Book meeting (Bevan test person): the four choices, a saved one picked first; the PDF preview shows the signature above the signer's name and job title; Sign now draws into the preview; No signature puts the person holding the meeting back in the sign off | PASS (ZZ Stage One, Stage 2, held by ZZ Test Supervisor: uploaded picked first; preview showed the upload above Bev Admin, Admin while Held by stayed ZZ Test Supervisor; drawn redrew; No signature put ZZ Test Supervisor, Supervisor back; Sign now with nothing drawn said "Draw your signature in the box, or choose another option." and kept the save buttons off; once drawn the preview showed it) |
| L5 | Save to history: the kept letter PDF carries the signature; audit `signature.used` | PASS (Save to history with the upload: the kept letter PDF, opened from its record, shows the signature above Bev Admin, Admin; audit "Signed the absence meeting invitation with their saved uploaded signature") |
| L6 | Outcome letter: the final look shows the signature, a changed choice redraws it; Save to file and Approve and keep carry it; audit `signature.used` | PASS (ZZ Stage One C, Stage 4 drafted letter: the final look showed the upload, choosing drawn redrew it; Approve and send kept it as not emailed (test company); the kept PDF shows the drawn signature; audit "Signed the absence meeting outcome letter with their saved drawn signature". Save to file not pressed: it downloads to the computer and runs the same signing and audit) |
| L7 | Rearrange: the letter preview shows the signature and the new letter carries it | PASS (letter: the rearranged PDF carries the drawn signature. Audit: first try wrote no row for a kept but not emailed letter; fixed and pushed; retested, rearranged to 11:00, audit "Signed the rearranged absence meeting invitation with their saved uploaded signature" against the new letter. Rearranging to the same slot keeps no new letter, by design, and logs no use) |
| L8 | After applying: the same privacy checks as the dry run pass on the live tables | PASS (12 Oct, after applying, rolled back: own row and file kept and seen; writing for the Admin refused; the Admin and the Founder saw and changed nothing; the Founder and a Senior could not keep one) |
| L9 | Founder in support mode: no My signature link, the page says it is not available, no signing choice on letters | Not tested |
| L10 | Remove a saved signature: gone from the page, its file gone from storage | PASS (Bev Admin removed the drawn signature: the page says None saved yet, its row and file are gone from the database and storage, the uploaded one untouched; audit "Removed their drawn signature". Replacing earlier left no old file behind) |
| L11 | Phone width: My signature and the signing choice fit with no sideways scroll | Not tested |
| L12 | A letter kept before today is unchanged (same file and hash) | PASS (Bevan invitation kept 9 Oct: the file served today hashes to the stored pdf_sha256) |
| L14 | The signature choice in the narrow Rearrange box: the options stack, no name running under its picture (found testing L7, fixed) | PASS (after the push: the four options stack in the Rearrange box, each name beside its picture) |
| L13 | Test meetings, letters and signatures tidied away or noted | Not tested |
