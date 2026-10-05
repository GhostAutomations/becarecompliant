# Test checklist: a corrected email takes the unused login with it (2026-10-05)

Phil: Lauren Morgan (Thistle, Newport People record; her supervisor login lauren@thistlecarewales.co.uk is a separate account) had her personal email misspelt (lauranmorganx@icloud.com). It was "changed in Manage record and saved", but Send still went to the old address.

Found: (1) the record still held the old address and there was no person.updated audit row, so the Save details button of that form was not the one pressed (Manage record has several forms, each with its own Save); (2) even when the email does save, the login, its profile and the pending invite keep their own copy of the old address, and Send then found no invite at the new address and sent nothing.

Fix: Save details now (a) refuses to say Saved when the database changed nothing, and (b) when the email changed and the person's login has never been used, moves the login, its profile and the pending invite to the new address, and says so under the button. A login already in use is left alone and the message says so. An address that already has a login is refused (one account per email).

| # | Check | Result |
|---|-------|--------|
| E1 | Lauren Morgan (Newport): correct the personal email, press Save details: message says the invite now goes to the new address | PASS (Phil, 18:40: corrected to laurenmorganx@icloud.com with Save details) |
| E2 | Database: her profile, auth login and pending invite all hold the new address; audit invite.email_corrected | PASS (record, profile, auth login and pending invite all laurenmorganx@icloud.com; audit invite.email_corrected then person.updated) |
| E3 | Send invite on her record: the email goes to the new address | PASS (18:41 invite.resent to laurenmorganx@icloud.com) |
| E4 | Someone who already signs in: changing their personal email leaves their login alone, message says so | PASS (Bevan, ZZ TEST Senior, active login: record changed, login and auth stayed ppdavies+senior@, message said so; restored. Follow up fixed: restoring the old address no longer shows that message) |
| E5 | An address that already belongs to another login is refused with a clear message | PASS (Bevan, ZZ Audit Walk Person, unused login: ppdavies+senior@ refused as already having a login, invite and login unchanged; restored) |
