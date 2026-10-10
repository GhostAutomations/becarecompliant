# Email allowlist

> Email domain allowlist (item 2 on [the-list](the-list.md)) — scope corrected by Phil 2026-07-29, it MUST be role aware or it breaks Team Member logins

Opt in, off by default, per company list of allowed email domains. A company with no
domains set behaves exactly as today (any address, gmail/outlook/icloud included), so
small providers are unaffected. Once an Admin adds one or more domains, an invite to an
address outside them is refused, checked BOTH when the invite is created and again when
it is accepted (checking only one leaves a gap).

## THE CORRECTION — Phil, 2026-07-29, before this was built

His words: "for team members that will be on the people matrix, they will only use
personal email addresses as companies wont give work email address out to employee at
carer level. the company email address may only be relevant to supervisor and above."

**So the allowlist MUST be role aware.** Applying it to every invite would mean a company
switching it on to tighten security instantly locks its entire care staff out of the app,
because Team Member logins (role `staff`) go to carers' PERSONAL addresses by design —
that is the whole reason the `staff` role exists as a free non billable seat.

Rule to build: enforce the allowlist for **supervisor and above** (the roles a care
company actually issues a work address to). **Never enforce it on Team Member (`staff`)
invites.**

Open question for Phil when building: does Viewer (`team_member`, read only) sit above or
below the line? His words say "supervisor and above", which puts Viewer outside, but a
Viewer is usually an office person who probably does have a company address. Ask, do not
assume — and whichever way it goes, the Settings copy must SAY which roles it applies to,
or an Admin will reasonably expect it to cover everyone.

Also worth checking at build time: `isSendableAddress` already blocks demo domains on
both briefing emails and invites, so there is an existing place where invite addresses
are validated. Put the allowlist check alongside it rather than inventing a second gate.

Related: [the-list](the-list.md) [staff-logins](staff-logins.md) [roles-overhaul](roles-overhaul.md)
