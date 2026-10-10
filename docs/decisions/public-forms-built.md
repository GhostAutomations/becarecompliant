# Public forms built

> BCC public no-login forms BUILT 2026-07-26 (migrations 0126/0127/0128) — short link design, architecture, and Phil's 2026-08-02 decision to leave the whole feature dormant

## DECISION 2026-08-02: LEAVE IT DORMANT. STOP ASKING.

Phil settled Additions item 5: `PUBLIC_FORMS_ENABLED` stays **false**. Nothing deleted, nothing exposed, and it is no longer an open question. **Do not raise switching it on or deleting it again** unless a real customer says their staff will not use logins.

What the decision rested on, verified in the code that day rather than from memory:

- The publishable catalogue holds **exactly ONE form**, holiday request. `/my` already gives a logged in Team Member their holidays to change or withdraw, so the feature is **fully redundant** with the Team Member login route Phil chose instead.
- 1,374 lines across `lib/public-forms/` (7 files), 2 components and 3 pages, plus three ALREADY APPLIED migrations (0126/0127/0128). The tables, the SECURITY DEFINER RPCs and the realtime publication are live in the database.
- The flag closes five doors: both admin pages redirect, the dashboard card is hidden, `/f/<code>` shows a neutral "not available", and `submitPublicForm` itself refuses. There is **no open unauthenticated write path** today.
- Database: **1 link row on Acme, 0 submissions ever.** It has NEVER been live tested, so switching on would not be a flag flip. It would be a flag flip plus a real cold test of a public write path: the rate limit, the enumeration defence and the ambiguous match rule are all correct on paper and have never met the internet.
- The standing cost of keeping it: it must carry on compiling through every future change to the forms engine.

Everything below is the original build record, unchanged.

---

Additions item 1 (public no-account forms for Team Members) BUILT 2026-07-26. Supersedes the "to build" state in [public-forms](public-forms.md).

**Phil's confirmed design (popup + his own steer):**
- v1 form set = HOLIDAY REQUEST only. Absence notification, report a concern and training request were offered and NOT taken.
- Identity = PERSONAL EMAIL only. Phil: "personal email, thats what we ask for on 'add a person'" — that field is labelled "Personal email" on Add a person and stores to `people.work_email`. No surname check, no access code.
- Queue = People > Submissions (new sub-department) + a dashboard "Submissions to link" card.
- Phil mid-build: "i dont want them to have a login, i want a company to be able to create a short link they can publish" → Settings > Public forms, where an Admin CREATES the link, COPIES it, can SWITCH IT OFF and can ISSUE A NEW ONE.

**SHORT LINK (important, revised same day).** The first build used `/f/<company-slug>/<form-key>`; Phil looked at it and said **"thats not a shortlink is it"** — he was right. Migration 0128 adds `public_form_links.code`: a SIX character code from an unambiguous alphabet (`23456789abcdefghjkmnpqrstuvwxyz`, no 0/O/1/l/I), generated app side in `lib/public-forms/actions.ts` with retry on collision. Published URL is now **`/f/<code>`**, one segment, e.g. becarecompliant.com/f/k3m9qa. Regenerating the code instantly kills every copy of the old link. The company name is deliberately no longer in the public URL. A shorter DOMAIN (e.g. bccl.uk, ~23 chars total) was offered as an option and can be added later without changing any of this; a QR code was offered and not taken (would need a new dependency).

**Architecture (why it is safe):**
- `lib/public-forms/config.ts` is a publishable CATALOGUE: only forms listed there can ever go public, so a manager-only form (supervision, complaint investigation) cannot be exposed by accident.
- The row in `public_form_links` existing AND enabled IS the capability. No link, no submission, however the caller arrives.
- `submit_public_form` / `public_form_materialise` / `public_form_rate_ok` are SECURITY DEFINER with pinned search_path and are **service_role only** (verified: anon has EXECUTE on none). The Next.js server action calls them; anon can never reach them directly.
- Unmatched submissions create NO Evidence. The raw answers sit in `public_form_submissions` until a Manager links them, at which point the Evidence and the pending holiday request are created. That keeps immutable Evidence free of spam and avoids ever having to mutate an evidence row's record link.
- An AMBIGUOUS match (two active people sharing an email) is treated as NO match, so a human decides.
- The public page returns the SAME thank you whether or not the email matched: it must never be usable to test who works for a company.
- Rate limit (5 per 10 minutes per caller per form) stores a salted HASH, never an IP (the audit trail is deliberately lean and holds no IPs).
- Identity boxes seed blank free-text name/email questions as PRESETS only; the stored schema is never rewritten (same principle as record-presets and fieldToNameSelect).

**Email loop:** matched → notifyHolidayRequested to approvers immediately. Unmatched → nothing until linked. notifyHolidayDecided gained fallbackEmail/fallbackName, so a public submitter with no profile still gets the approve/decline email, with no CTA button (nowhere to log in).

**Unblocks:** Final Testing F1-F4 holiday emails, which were parked because approvers cannot self-request and Team Members have no logins.

**Not yet live-tested** (Vercel is the compile gate). Full cold checklist is in PHASES.md Phase 11 under "PUBLIC FORMS". The deploy needs `git rm -r "app/f/[slug]"` because the old two-segment route was replaced by `app/f/[code]`.

Related: [public-forms](public-forms.md) [holidays-absence](holidays-absence.md) [project-state](project-state.md) [phase6-built](phase6-built.md) [the-list](the-list.md)
